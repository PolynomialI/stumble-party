import {
  CharState, PhysicsWorld, Predictor, TICK_RATE, decodeSnapshot, encodePlayers, encodeSnapshot, getMap, rng,
  type InputCmd, type InputPacket, type MapInfo, type Vec3,
} from '@sp/shared';
import { MatchSim } from '../src/MatchSim';

interface Packet<T> { at: number; seq: number; data: T }

/** One simulated player: a Predictor fed through a fake network, with a scripted input function. */
export class FakeClient {
  readonly predictor: Predictor;
  readonly inbox: Packet<Uint8Array>[] = [];
  /** Per-slot snapshot samples of everyone else: [tick, x, y, z]. */
  private readonly seen = new Map<number, number[][]>();
  maxCorrection = 0;
  sumCorrection = 0;
  corrections = 0;
  maxAhead = 0;
  stallUntil = 0;
  private lastSnapTick = 0;

  constructor(readonly h: NetHarness, readonly id: string, readonly slot: number, public script: (tick: number) => InputCmd) {
    const info: MapInfo = { v: h.sim.mapVersion, id: h.sim.map.id, start: h.sim.roundStart, freeze: h.sim.freezeUntil };
    this.predictor = new Predictor(new PhysicsWorld(h.sim.map), info, {
      sample: () => this.script(this.predictor.predTick + 1),
      send: (pkt) => h.toServer(this, { ...pkt }),
      viewTick: () => this.lastSnapTick - 3.5,
      rttTicks: () => (h.rttMs / 1000) * TICK_RATE,
    });
  }

  frame(now: number, dt: number) {
    if (now < this.stallUntil) return;
    this.predictor.advance(dt);
    this.maxAhead = Math.max(this.maxAhead, this.predictor.predTick - this.h.sim.tick);
  }

  receive(buf: Uint8Array) {
    const snap = decodeSnapshot(buf);
    this.lastSnapTick = snap.tick;
    for (const e of snap.players) {
      if (e.slot === this.slot) continue;
      let list = this.seen.get(e.slot);
      if (!list) this.seen.set(e.slot, (list = []));
      list.push([snap.tick, e.x, e.y, e.z]);
      if (list.length > 40) list.shift();
    }
    const before: Vec3 = this.predictor.renderPos([0, 0, 0]);
    const r = this.predictor.onSnapshot(snap.tick, snap.own, snap.lead);
    if (r === 'replay') {
      const after = this.predictor.renderPos([0, 0, 0]);
      const c = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
      this.maxCorrection = Math.max(this.maxCorrection, c);
      this.sumCorrection += c;
      this.corrections++;
    }
  }

  get own(): CharState {
    return this.predictor.own;
  }
}

/**
 * Deterministic network simulation: an authoritative MatchSim ticking at 30 Hz, clients rendering at 60 Hz,
 * and every message delayed by half the RTT plus jitter (in order, like TCP).
 */
export class NetHarness {
  readonly sim: MatchSim;
  readonly clients: FakeClient[] = [];
  private readonly toSrv: Packet<{ c: FakeClient; pkt: InputPacket }>[] = [];
  now = 0;
  private nextTick = 0;
  private seq = 0;
  private readonly rand: () => number;
  private lastArrival = new Map<string, number>();

  constructor(mapId: string, readonly rttMs: number, readonly jitterMs = 0, seed = 1) {
    this.sim = new MatchSim(getMap(mapId));
    this.rand = rng(seed);
  }

  addClient(id: string, script: (tick: number) => InputCmd): FakeClient {
    const slot = this.clients.length;
    this.sim.addPlayer(id, slot, null);
    const c = new FakeClient(this, id, slot, script);
    this.clients.push(c);
    return c;
  }

  spawn() {
    this.sim.spawnAll(this.clients.map((c) => c.id));
  }

  /** In-order delivery time for a message on a given link. */
  private deliverAt(link: string): number {
    const at = Math.max(this.now + this.rttMs / 2 + this.rand() * this.jitterMs, this.lastArrival.get(link) ?? 0);
    this.lastArrival.set(link, at);
    return at;
  }

  toServer(c: FakeClient, pkt: InputPacket) {
    this.toSrv.push({ at: this.deliverAt(`up:${c.id}`), seq: this.seq++, data: { c, pkt } });
  }

  /** Runs the whole system for `ms` of wall-clock time. */
  run(ms: number) {
    const end = this.now + ms;
    const frame = 1000 / 60;
    while (this.now < end) {
      this.now += frame;
      // Server: deliver inputs, then catch up on ticks.
      while (this.nextTick <= this.now) {
        this.toSrv.sort((a, b) => a.at - b.at || a.seq - b.seq);
        while (this.toSrv.length && this.toSrv[0].at <= this.nextTick) {
          const m = this.toSrv.shift()!;
          this.sim.queueInput(m.data.c.id, m.data.pkt);
        }
        this.sim.step();
        const shared = encodePlayers(this.sim.entries());
        for (const c of this.clients) {
          const sp = this.sim.players.get(c.id)!;
          const buf = encodeSnapshot(this.sim.tick, sp.newestTick - this.sim.tick, this.sim.mapVersion,
            sp.active ? this.sim.ownState(sp) : null, shared);
          c.inbox.push({ at: this.deliverAt(`down:${c.id}`), seq: this.seq++, data: buf });
        }
        this.nextTick += 1000 / TICK_RATE;
      }
      // Clients: receive, then render a frame.
      for (const c of this.clients) {
        while (c.inbox.length && c.inbox[0].at <= this.now && this.now >= c.stallUntil) c.receive(c.inbox.shift()!.data);
        c.frame(this.now, frame / 1000);
      }
    }
  }

  serverState(c: FakeClient): CharState {
    return this.sim.players.get(c.id)!.state;
  }
}
