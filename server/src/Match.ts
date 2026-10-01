import {
  BotBrain, CHAR, DT, MAPS, MAX_PLAYERS, MIN_MATCH_PLAYERS, TICK_RATE, finalTimeUpWinner, getMap, mapPool, onHill,
  planMatch, randomIdentity, rng, roundOver, roundTarget, survivorsWithTiebreak, topScorers, type Faller,
  type RoundPlan,
} from '@sp/shared';
import type { MatchSim, SimPlayer } from './MatchSim';
import { PlayerState, ST_ELIMINATED, ST_LOBBY, ST_PLAYING, ST_QUALIFIED, type GameState } from './schema';

export const SECONDS = TICK_RATE;
export const LOBBY_WAIT = 25 * SECONDS;
export const LOBBY_FULL_WAIT = 3 * SECONDS;
export const INTRO = 4 * SECONDS;
export const COUNTDOWN = 3 * SECONDS;
export const RESULTS = 5 * SECONDS;
export const PODIUM = 9 * SECONDS;
/** Tag: a fresh carrier cannot pass the bomb on for this long, nor straight back to whoever gave it for longer. */
const TAG_HOLD = Math.round(0.5 * SECONDS);
const TAG_NO_RETURN = Math.round(1.5 * SECONDS);
/** Top of the warm-up island tower. */
const PODIUM_SPOT: [number, number, number] = [0, 4, 0];

export interface MatchHost {
  /** Tell every client which map is loaded (and when its clock starts / inputs unfreeze). */
  broadcastMap(): void;
  setLocked(locked: boolean): void;
  /** The match is over: quick rooms close, private rooms go back to their lobby. */
  matchOver(): void;
}

export interface MatchOptions {
  quick: boolean;
  seed: number;
}

/**
 * Match flow for one room: lobby -> (intro -> countdown -> playing -> results) x rounds -> podium.
 * Owns the round plan, statuses, qualification and elimination; MatchSim does the physics.
 */
export class Match {
  plan: RoundPlan[] = [];
  roundIndex = -1;
  /** Players still in the match (they play the next round). */
  readonly participants = new Set<string>();
  private fallers: Faller[] = [];
  private finishOrder = 0;
  private target = 0;
  private goTick = 0;
  private botSeq = 0;
  /** Zone rounds: ticks each player has spent in the zone. */
  private readonly zoneTicks = new Map<string, number>();
  /** Tag rounds: when each carrier got the bomb, and from whom. */
  private readonly bombs = new Map<string, { since: number; from: string }>();
  private readonly rand: () => number;
  readonly pool = mapPool(Object.values(MAPS));

  constructor(private readonly state: GameState, private readonly sim: MatchSim, private readonly host: MatchHost,
    private readonly opts: MatchOptions) {
    this.rand = rng(opts.seed);
    sim.events = {
      finish: (p) => this.onFinish(p),
      fell: (p) => this.onFell(p),
      touch: (a, b) => this.onTouch(a, b),
    };
  }

  private get now() {
    return this.sim.tick;
  }

  private player(id: string) {
    return this.state.players.get(id);
  }

  humans(): number {
    let n = 0;
    this.state.players.forEach((p) => { if (!p.bot) n++; });
    return n;
  }

  // ------------------------------------------------------------------ lobby

  /** Back to the waiting island (room creation, and private rooms after a match). */
  enterLobby() {
    this.removeBots();
    this.plan = [];
    this.roundIndex = -1;
    this.participants.clear();
    this.state.phase = 'lobby';
    this.state.phaseEnd = 0;
    this.state.round = 0;
    this.state.rounds = 0;
    this.state.qualify = 0;
    this.state.qualified = 0;
    this.state.winner = '';
    this.sim.loadMap(getMap('lobby'), this.now);
    this.sim.freezeUntil = 0;
    this.state.mapId = 'lobby';
    this.state.roundStart = this.sim.roundStart;
    const ids: string[] = [];
    this.state.players.forEach((p, id) => {
      p.status = ST_LOBBY;
      p.place = 0;
      p.score = 0;
      ids.push(id);
    });
    for (const id of ids) this.placeInLobby(id);
    this.host.setLocked(false);
    this.host.broadcastMap();
  }

  /** Drops a (newly joined) player somewhere on the lobby island. */
  placeInLobby(id: string) {
    const sp = this.sim.players.get(id);
    if (!sp) return;
    const s = this.sim.map.spawn;
    const i = sp.slot;
    const cols = s.cols;
    const x = s.pos[0] + ((i % cols) - (cols - 1) / 2) * s.spacing;
    const z = s.pos[2] - Math.floor(i / cols) * s.spacing;
    sp.state.spawn(x, s.pos[1], z, s.yaw);
    sp.active = true;
    sp.checkpoint = -1;
  }

  onJoin(id: string) {
    if (this.state.phase === 'lobby') this.placeInLobby(id);
  }

  onLeave(id: string) {
    this.participants.delete(id);
  }

  /** Host pressed Start (private rooms) or the lobby timer ran out (quick play). */
  start() {
    if (this.state.phase !== 'lobby' || this.humans() === 0) return;
    this.host.setLocked(true);
    if (this.state.fillBots) this.fillBots(MIN_MATCH_PLAYERS);
    this.participants.clear();
    this.state.players.forEach((p, id) => {
      this.participants.add(id);
      p.score = 0;
    });
    this.plan = planMatch(this.participants.size, this.pool, this.rand, this.state.roundsWanted);
    this.state.rounds = this.plan.length;
    this.roundIndex = -1;
    this.nextRound();
  }

  private fillBots(min: number) {
    const taken = new Set<number>();
    const names = new Set<string>();
    this.state.players.forEach((p) => { taken.add(p.slot); names.add(p.name); });
    while (this.state.players.size < Math.min(min, MAX_PLAYERS)) {
      let slot = 0;
      while (taken.has(slot)) slot++;
      taken.add(slot);
      const id = `bot-${++this.botSeq}`;
      const who = randomIdentity(this.opts.seed * 31 + this.botSeq * 7919);
      let name = who.name;
      while (names.has(name)) name = `${who.name}${Math.floor(this.rand() * 9)}`;
      names.add(name);
      const ps = new PlayerState();
      ps.slot = slot;
      ps.name = name;
      ps.body = who.look.body;
      ps.accent = who.look.accent;
      ps.pattern = who.look.pattern;
      ps.hat = who.look.hat;
      ps.bot = true;
      ps.status = ST_LOBBY;
      this.state.players.set(id, ps);
      this.sim.addPlayer(id, slot, new BotBrain(this.opts.seed + this.botSeq * 101, 0.45 + this.rand() * 0.45));
    }
  }

  private removeBots() {
    const bots: string[] = [];
    this.state.players.forEach((p, id) => { if (p.bot) bots.push(id); });
    for (const id of bots) {
      this.state.players.delete(id);
      this.sim.removePlayer(id);
    }
  }

  // ------------------------------------------------------------------ rounds

  private nextRound() {
    this.roundIndex++;
    const r = this.plan[this.roundIndex];
    const map = getMap(r.mapId);
    this.target = roundTarget(r.qualify, this.participants.size, r.type);
    this.goTick = this.now + INTRO + COUNTDOWN;
    this.sim.loadMap(map, this.goTick);
    this.sim.freezeUntil = this.goTick;
    this.fallers = [];
    this.finishOrder = 0;

    // Shuffle the starting grid.
    const order = [...this.participants];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const sp of this.sim.players.values()) sp.active = false;
    this.sim.spawnAll(order);
    this.zoneTicks.clear();
    this.bombs.clear();
    // Tag: as many bombs as players who must go out. Whoever holds one when the clock stops is eliminated.
    // Crown Thief works the same way round: one crown for every four players, and holding one scores.
    const carriers = new Set(
      r.type === 'tag' ? order.slice(0, Math.max(1, order.length - this.target))
        : map.keep ? order.slice(0, Math.max(1, Math.round(order.length / 4))) : [],
    );
    this.state.players.forEach((p, id) => {
      p.place = 0;
      p.points = 0;
      p.it = carriers.has(id);
      if (p.it) this.bombs.set(id, { since: this.goTick, from: '' });
      if (this.participants.has(id)) p.status = ST_PLAYING;
      else if (p.status !== ST_ELIMINATED) p.status = ST_ELIMINATED;
    });

    this.state.round = this.roundIndex + 1;
    this.state.mapId = map.id;
    this.state.roundStart = this.goTick;
    this.state.qualify = this.target;
    this.state.qualified = 0;
    this.state.phase = 'intro';
    this.state.phaseEnd = this.now + INTRO;
    this.host.broadcastMap();
  }

  private running(): string[] {
    const out: string[] = [];
    for (const id of this.participants) {
      const p = this.player(id);
      if (p && p.status === ST_PLAYING) out.push(id);
    }
    return out;
  }

  private onFinish(sp: SimPlayer) {
    const p = this.player(sp.id);
    const r = this.plan[this.roundIndex];
    if (!p || !r || this.state.phase !== 'playing' || p.status !== ST_PLAYING) return;
    if (r.type === 'final') {
      // Crown finals: first to the crown takes the match.
      this.endRound(r, [sp.id]);
      return;
    }
    if (r.type !== 'race') return;
    p.status = ST_QUALIFIED;
    p.place = ++this.finishOrder;
    this.state.qualified = this.finishOrder;
    sp.active = false;
  }

  /** Returns true when the fall eliminates (survival / final); otherwise the sim respawns the player. */
  private onFell(sp: SimPlayer): boolean {
    const r = this.plan[this.roundIndex];
    // Only survival rounds and last-one-standing finals knock you out for falling.
    const knockout = r && (r.type === 'survival' || (r.type === 'final' && !this.sim.map.finish));
    if (this.state.phase === 'lobby' || !knockout) return false;
    const p = this.player(sp.id);
    if (p && p.status === ST_PLAYING) {
      p.status = ST_ELIMINATED;
      this.fallers.push({ id: sp.id, tick: this.now, y: sp.state.py });
    }
    sp.active = false;
    return true;
  }

  /** Tag: a bomb changes hands when its carrier touches someone who has none. */
  private onTouch(a: SimPlayer, b: SimPlayer) {
    const passing = this.plan[this.roundIndex]?.type === 'tag' || this.sim.map.keep;
    if (this.state.phase !== 'playing' || !passing) return;
    const pa = this.player(a.id), pb = this.player(b.id);
    if (!pa || !pb || pa.it === pb.it || pa.status !== ST_PLAYING || pb.status !== ST_PLAYING) return;
    const [from, to, giver, taker] = pa.it ? [a.id, b.id, pa, pb] : [b.id, a.id, pb, pa];
    const bomb = this.bombs.get(from);
    if (!bomb || this.now - bomb.since < (bomb.from === to ? TAG_NO_RETURN : TAG_HOLD)) return;
    this.bombs.delete(from);
    this.bombs.set(to, { since: this.now, from });
    giver.it = false;
    taker.it = true;
  }

  /** Zone rounds: score everyone standing in the zone. Tag rounds: tell the bots whom to chase or run from. */
  private playModes(r: RoundPlan, running: string[]) {
    if (r.type === 'points') {
      const t = this.sim.worldTick * DT;
      const keep = !!this.sim.map.keep;
      for (const id of running) {
        const s = this.sim.players.get(id)?.state;
        const scoring = keep ? this.player(id)!.it : !!s && onHill(this.sim.map, t, s.px, s.py - CHAR.centerHeight, s.pz);
        if (!scoring) continue;
        const n = (this.zoneTicks.get(id) ?? 0) + 1;
        this.zoneTicks.set(id, n);
        if (n % 3 === 0) this.player(id)!.points = n / 3;
      }
    }
    if (r.type === 'tag' || this.sim.map.keep) {
      // Bomb carriers chase and everyone else runs; with crowns it is the other way round.
      const hunted = !!this.sim.map.keep;
      for (const id of running) {
        const me = this.sim.players.get(id);
        if (!me?.bot) continue;
        const it = this.player(id)!.it;
        let best: SimPlayer | null = null, bestD = Infinity;
        for (const other of running) {
          if (other === id || this.player(other)!.it === it) continue;
          const o = this.sim.players.get(other)!;
          const d = Math.hypot(o.state.px - me.state.px, o.state.pz - me.state.pz);
          if (d < bestD) { bestD = d; best = o; }
        }
        const chase = it !== hunted;
        me.bot.goal = best && (chase || bestD < 12) ? { x: best.state.px, z: best.state.pz, flee: !chase } : null;
      }
    }
  }

  /** Called every server tick, after the simulation step. */
  tick() {
    const st = this.state;
    switch (st.phase) {
      case 'lobby': {
        if (!this.opts.quick) return;
        const humans = this.humans();
        if (humans === 0) { st.phaseEnd = 0; return; }
        if (st.phaseEnd === 0) st.phaseEnd = this.now + LOBBY_WAIT;
        if (st.players.size >= MAX_PLAYERS) st.phaseEnd = Math.min(st.phaseEnd, this.now + LOBBY_FULL_WAIT);
        if (this.now >= st.phaseEnd) this.start();
        return;
      }
      case 'intro':
        if (this.now >= st.phaseEnd) {
          st.phase = 'countdown';
          st.phaseEnd = this.goTick;
        }
        return;
      case 'countdown':
        if (this.now >= st.phaseEnd) {
          st.phase = 'playing';
          st.phaseEnd = this.goTick + Math.round(this.sim.map.timeLimit * SECONDS);
        }
        return;
      case 'playing': {
        const r = this.plan[this.roundIndex];
        const running = this.running();
        this.playModes(r, running);
        if (roundOver({ type: r.type, target: this.target, running: running.length, qualified: this.finishOrder, timeUp: this.now >= st.phaseEnd })) {
          this.endRound(r, running);
        }
        return;
      }
      case 'results':
        if (this.now >= st.phaseEnd) {
          if (st.winner || this.roundIndex >= this.plan.length - 1 || this.participants.size <= 1) this.podium();
          else this.nextRound();
        }
        return;
      case 'podium':
        // The champion keeps celebrating until the curtain falls.
        if (st.winner && (st.phaseEnd - this.now) % 80 === 0) this.sim.emote(st.winner, this.rand() < 0.5 ? 2 : 3);
        if (this.now >= st.phaseEnd) this.host.matchOver();
        return;
    }
  }

  private endRound(r: RoundPlan, running: string[]) {
    const st = this.state;
    let through: string[];
    for (const sp of this.sim.players.values()) if (sp.bot) sp.bot.goal = null;
    if (r.type === 'race') {
      through = [];
      st.players.forEach((p, id) => { if (this.participants.has(id) && p.status === ST_QUALIFIED) through.push(id); });
    } else if (r.type === 'points') {
      through = topScorers(running.map((id) => ({ id, score: this.zoneTicks.get(id) ?? 0 })), this.target);
    } else if (r.type === 'tag') {
      // Everyone without a bomb is through (if somehow nobody is, nobody goes out).
      const safe = running.filter((id) => !this.player(id)!.it);
      through = safe.length ? safe : running;
    } else if (r.type === 'final' && running.length > 1) {
      // Time ran out with several still up: whoever holds the middle of the arena.
      const c = this.sim.map.bot.arena?.center ?? [0, 0, 0];
      const w = finalTimeUpWinner(running.map((id) => {
        const s = this.sim.players.get(id)!.state;
        return { id, distToCenter: Math.hypot(s.px - c[0], s.pz - c[2]) };
      }));
      through = w ? [w] : [];
    } else {
      through = survivorsWithTiebreak(running, this.fallers, this.target);
    }

    const keep = new Set(through);
    st.players.forEach((p, id) => {
      if (!this.participants.has(id)) return;
      if (keep.has(id)) {
        p.status = ST_QUALIFIED;
        p.score++;
      } else {
        p.status = ST_ELIMINATED;
      }
    });
    for (const id of [...this.participants]) if (!keep.has(id)) this.participants.delete(id);
    st.qualified = keep.size;

    const last = this.roundIndex >= this.plan.length - 1;
    if (last || this.participants.size <= 1) st.winner = this.participants.size === 1 ? [...this.participants][0] : '';
    st.phase = 'results';
    st.phaseEnd = this.now + RESULTS;
    // Everyone left on the course stands still while the results show.
    this.sim.freezeUntil = st.phaseEnd + PODIUM;
  }

  /** The champion takes the stage on top of the warm-up island's tower; everyone else watches. */
  private podium() {
    const st = this.state;
    if (!st.winner && this.participants.size === 1) st.winner = [...this.participants][0];
    st.phase = 'podium';
    st.phaseEnd = this.now + PODIUM;
    this.sim.loadMap(getMap('lobby'), this.now);
    this.sim.freezeUntil = 0;
    st.mapId = 'lobby';
    st.roundStart = this.sim.roundStart;
    for (const sp of this.sim.players.values()) sp.active = false;
    const w = st.winner ? this.sim.players.get(st.winner) : undefined;
    if (w) {
      w.state.spawn(PODIUM_SPOT[0], PODIUM_SPOT[1], PODIUM_SPOT[2], Math.PI);
      w.checkpoint = -1;
      w.active = true;
      this.sim.emote(w.id, 3);
    }
    this.host.broadcastMap();
  }
}
