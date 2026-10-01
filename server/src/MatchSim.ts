import {
  BTN_DIVE, BTN_JUMP, BTN_JUMP_PRESS, BotBrain, CHAR, CharState, DT, MODE_DIVE, NO_INPUT, PhysicsWorld, diveTackle,
  inZone, killYAt, pushPlayers, reachCheckpoint, resolveObstacleHits, respawnPoint, spawnPoints, stepCharacter,
  type InputCmd, type InputPacket, type MapDef, type RemoteEntry,
} from '@sp/shared';

const HISTORY = 32;
/** Oldest view we honour for lag compensation (ticks, ~330 ms). */
const MAX_REWIND = 10;
/** Inputs stamped further ahead than this are dropped (client clock is broken; lead feedback will fix it). */
const MAX_AHEAD = 90;
const EMOTE_TICKS = 78;

export interface SimPlayer {
  id: string;
  slot: number;
  bot: BotBrain | null;
  state: CharState;
  /** In the world right now (false once eliminated / qualified / spectating). */
  active: boolean;
  connected: boolean;
  queue: InputPacket[];
  last: InputCmd;
  newestTick: number;
  viewTick: number;
  checkpoint: number;
  tackled: boolean;
  emote: number;
  emoteUntil: number;
  /** Ring of recent positions for lag compensation: [tick, x, y, z] per slot. */
  history: Float64Array;
}

export interface SimEvents {
  /** Race finish line crossed. */
  finish?(p: SimPlayer): void;
  /** Fell below the map. Return true if the rules handled it (elimination); otherwise the player respawns. */
  fell?(p: SimPlayer): boolean;
  /** Two players bumped into each other, or one dive-tackled the other. */
  touch?(a: SimPlayer, b: SimPlayer): void;
}

/**
 * Authoritative simulation for one room: the map world, every player (humans and bots) and the
 * per-tick pipeline. Knows nothing about networking; GameRoom feeds inputs and ships snapshots.
 */
export class MatchSim {
  map: MapDef;
  pw: PhysicsWorld;
  /** Absolute server tick (monotonic for the life of the room). */
  tick = 0;
  /** Absolute tick at which the current map's clock reads zero. */
  roundStart = 0;
  /** Inputs are ignored up to and including this tick (intro / countdown). */
  freezeUntil = 0;
  /** Map load counter, carried in snapshots so clients can drop stale ones. */
  mapVersion = 0;
  readonly players = new Map<string, SimPlayer>();
  /** Tile drops since the last flush (round-relative ticks). */
  tileEvents: { tile: number; tick: number }[] = [];
  events: SimEvents = {};
  private readonly scratch = new CharState();

  constructor(map: MapDef) {
    this.map = map;
    this.pw = new PhysicsWorld(map);
    this.pw.setTime(0);
  }

  get worldTick() {
    return this.tick - this.roundStart;
  }

  /** Switches maps; the new map's clock starts at `startTick`. */
  loadMap(map: MapDef, startTick: number) {
    this.pw.free();
    this.map = map;
    this.roundStart = startTick;
    this.pw = new PhysicsWorld(map);
    this.pw.setTime(this.worldTick);
    this.tileEvents = [];
    this.mapVersion = (this.mapVersion + 1) & 0xff;
  }

  addPlayer(id: string, slot: number, bot: BotBrain | null): SimPlayer {
    const p: SimPlayer = {
      id, slot, bot, state: new CharState(), active: false, connected: true, queue: [], last: { ...NO_INPUT },
      newestTick: 0, viewTick: 0, checkpoint: -1, tackled: false, emote: 0, emoteUntil: 0,
      history: new Float64Array(HISTORY * 4).fill(-1),
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  /** Puts the given players on the map's spawn grid (in order) and activates them. */
  spawnAll(ids: string[]) {
    const pts = spawnPoints(this.map, ids.length);
    ids.forEach((id, i) => {
      const p = this.players.get(id);
      if (!p) return;
      p.state.spawn(pts[i].x, pts[i].y, pts[i].z, pts[i].yaw);
      p.active = true;
      p.checkpoint = -1;
      p.queue.length = 0;
      p.last = { ...NO_INPUT };
      p.emote = 0;
      p.history.fill(-1);
      p.bot?.reset(this.map, p.state);
    });
  }

  respawn(p: SimPlayer) {
    const s = respawnPoint(this.map, p.checkpoint, p.slot);
    p.state.spawn(s.x, s.y, s.z, s.yaw);
    p.bot?.reset(this.map, p.state);
  }

  queueInput(id: string, pkt: InputPacket) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    if (pkt.tick > this.tick + MAX_AHEAD) {
      // Absurdly early: don't queue it, but report where the client's clock is so it can resync.
      p.newestTick = pkt.tick;
      return;
    }
    if (pkt.tick <= p.newestTick) {
      // The client restarted its clock backwards: drop queued inputs from its old timeline.
      let n = p.queue.length;
      while (n > 0 && p.queue[n - 1].tick >= pkt.tick) n--;
      p.queue.length = n;
    }
    p.newestTick = pkt.tick;
    p.viewTick = pkt.viewTick;
    p.queue.push(pkt);
    if (p.queue.length > MAX_AHEAD) p.queue.shift();
  }

  emote(id: string, emote: number) {
    const p = this.players.get(id);
    if (!p || !p.active) return;
    p.emote = emote;
    p.emoteUntil = this.tick + EMOTE_TICKS;
  }

  /** The command applied for player `p` at tick `t`: its own input, or a held-over one if it's late. */
  private takeInput(p: SimPlayer, t: number): InputCmd {
    if (!p.connected) return NO_INPUT;
    let edges = 0;
    while (p.queue.length && p.queue[0].tick < t) {
      // Arrived too late for its tick: keep its button presses so jumps are never lost.
      const late = p.queue.shift()!;
      edges |= late.buttons & (BTN_JUMP_PRESS | BTN_DIVE);
      p.last = late;
    }
    let cmd: InputCmd;
    if (p.queue.length && p.queue[0].tick === t) {
      cmd = p.queue.shift()!;
      p.last = cmd;
    } else {
      cmd = { mx: p.last.mx, mz: p.last.mz, buttons: p.last.buttons & BTN_JUMP };
    }
    if (edges) cmd = { mx: cmd.mx, mz: cmd.mz, buttons: cmd.buttons | edges };
    return cmd;
  }

  /** Where `p` was at tick `t` (or now, if that is out of the history window). */
  posAt(p: SimPlayer, t: number): [number, number, number] {
    const i = (t % HISTORY) * 4;
    if (p.history[i] === t) return [p.history[i + 1], p.history[i + 2], p.history[i + 3]];
    return [p.state.px, p.state.py, p.state.pz];
  }

  step() {
    this.tick++;
    const t = this.tick;
    const wt = this.worldTick;
    const frozen = t <= this.freezeUntil;
    const active: SimPlayer[] = [];
    for (const p of this.players.values()) if (p.active) active.push(p);

    const botCmd: InputCmd = { mx: 0, mz: 0, buttons: 0 };
    for (const p of active) {
      let cmd: InputCmd;
      if (frozen) {
        cmd = NO_INPUT;
        p.queue = p.queue.filter((q) => q.tick > t);
      } else if (p.bot) {
        cmd = p.bot.think(this.pw, p.state, botCmd);
      } else {
        cmd = this.takeInput(p, t);
      }
      stepCharacter(this.pw, p.state, cmd);
      if (p.state.mode !== MODE_DIVE) p.tackled = false;
    }
    this.pw.setTime(wt);
    for (const p of active) resolveObstacleHits(this.pw, p.state);

    // Player vs player: shoves, then lag-compensated dive tackles.
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (pushPlayers(active[i].state, active[j].state)) this.events.touch?.(active[i], active[j]);
      }
    }
    for (const d of active) {
      if (d.state.mode !== MODE_DIVE || d.tackled) continue;
      const view = d.bot ? t : Math.min(t, Math.max(t - MAX_REWIND, d.viewTick));
      for (const o of active) {
        if (o === d) continue;
        const [x, y, z] = view === t ? [o.state.px, o.state.py, o.state.pz] : this.posAt(o, view);
        if (diveTackle(d.state, o.state, x, y, z)) {
          d.tackled = true;
          this.events.touch?.(d, o);
          break;
        }
      }
    }

    for (const p of active) {
      const s = p.state;
      if (!frozen && s.grounded && s.groundTile >= 0 && this.pw.stepOnTile(s.groundTile, wt)) {
        this.tileEvents.push({ tile: s.groundTile, tick: wt });
      }
      if (s.py < killYAt(this.map, wt * DT)) {
        if (!this.events.fell?.(p)) this.respawn(p);
        continue;
      }
      const feet = s.py - CHAR.centerHeight;
      p.checkpoint = reachCheckpoint(this.map, s.px, feet, s.pz, p.checkpoint);
      if (this.map.finish && !frozen && inZone(this.map.finish, s.px, feet, s.pz)) this.events.finish?.(p);
      if (p.emote && (t > p.emoteUntil || !s.grounded || Math.hypot(s.vx, s.vz) > 1.5)) p.emote = 0;
      const h = (t % HISTORY) * 4;
      p.history[h] = t;
      p.history[h + 1] = s.px;
      p.history[h + 2] = s.py;
      p.history[h + 3] = s.pz;
    }
  }

  /** Compact view of every active player for this tick's snapshot. */
  entries(): RemoteEntry[] {
    const out: RemoteEntry[] = [];
    for (const p of this.players.values()) {
      if (!p.active) continue;
      const s = p.state;
      out.push({
        slot: p.slot, x: s.px, y: s.py - CHAR.centerHeight, z: s.pz, yaw: s.yaw, mode: s.mode,
        grounded: s.grounded, emote: p.emote, groundObs: s.groundObs,
      });
    }
    return out;
  }

  /** Copy of a player's full state (for their own reconciliation). */
  ownState(p: SimPlayer): CharState {
    return this.scratch.copyFrom(p.state);
  }

  dispose() {
    this.pw.free();
  }
}
