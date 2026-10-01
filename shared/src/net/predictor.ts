import { TICK_RATE } from '../constants';
import { clamp, type Vec3 } from '../math';
import { CHAR, CharState, NO_INPUT, resolveObstacleHits, stepCharacter, type InputCmd } from '../sim/character';
import type { PhysicsWorld } from '../sim/world';
import type { InputPacket, MapInfo } from './protocol';

const RING = 256;
/** How many ticks ahead of the server our inputs should arrive. */
export const TARGET_LEAD = 2.5;
const MAX_STEPS_PER_ADVANCE = 8;

/** What the predictor needs from its surroundings (a browser client, or a test harness). */
export interface PredictorHost {
  /** This tick's input; called once per local tick, even while not synced (so button presses are consumed). */
  sample(): InputCmd;
  send(pkt: InputPacket): void;
  /** Server tick of the remote players currently on screen (for lag compensation). */
  viewTick(): number;
  /** Round-trip time in ticks. */
  rttTicks(): number;
  /** Effect flags (FX_*) of a freshly predicted tick; never called for replays. */
  fx?(bits: number): void;
  /** Called after the prediction jumped to a new timeline (first sync, stalls, map changes). */
  resynced?(): void;
}

export type SnapshotResult = 'match' | 'replay' | 'resync' | 'inactive';

/**
 * Client-side prediction for our own character: runs the shared simulation ahead of the server, stamps
 * inputs with the server tick they are meant for, and on disagreement rewinds to the authoritative state
 * and replays the inputs still in flight. A lead feedback loop nudges the local clock so inputs arrive
 * just before the server needs them.
 *
 * Bumps with other players are deliberately not predicted: we only see them hundreds of milliseconds in
 * the past, and guessing from that is worse than not guessing. The server rule (`shoveShare`) makes the
 * charger keep its momentum, so running into people never mispredicts; being run into arrives as a short,
 * smoothed correction, which reads as getting bumped.
 */
export class Predictor {
  readonly own = new CharState();
  readonly prev = new CharState();
  predTick = 0;
  /** Fraction of the next tick elapsed (render interpolation factor). */
  acc = 0;
  rate = 1;
  synced = false;
  active = false;
  private leadAvg = TARGET_LEAD;
  private leadTrustFrom = 0;
  private readonly inputs: (InputCmd & { tick: number })[] = Array.from({ length: RING }, () => ({ tick: -1, mx: 0, mz: 0, buttons: 0 }));
  private readonly states: { tick: number; s: CharState }[] = Array.from({ length: RING }, () => ({ tick: -1, s: new CharState() }));
  private readonly pkt: InputPacket = { tick: 0, mx: 0, mz: 0, buttons: 0, viewTick: 0 };
  readonly stats = { snapshots: 0, replays: 0, resyncs: 0, why: [] as string[], lead: 0, ahead: 0 };
  /**
   * A resync decided while snapshots arrive is applied on the next advance(), from the newest snapshot seen
   * by then. After a stall the browser delivers a backlog of snapshots in one burst; resyncing on each of
   * them (from ever-stale ticks) would chain resyncs.
   */
  private pending: { T: number; why: string; shift: number } | null = null;
  private readonly pendingState = new CharState();

  constructor(public pw: PhysicsWorld, public info: MapInfo, private readonly host: PredictorHost) {}

  /** New map: forget everything and wait for the first snapshot. */
  reset(pw: PhysicsWorld, info: MapInfo) {
    this.pw = pw;
    this.info = info;
    this.synced = false;
    this.active = false;
    this.pending = null;
    for (const s of this.states) s.tick = -1;
  }

  /** Advances the local clock by `dt` seconds, simulating (and sending) whole ticks. */
  advance(dt: number): number {
    if (this.pending) this.applyPending();
    this.acc += dt * TICK_RATE * this.rate;
    let steps = 0;
    while (this.acc >= 1 && steps < MAX_STEPS_PER_ADVANCE) {
      this.acc -= 1;
      this.step();
      steps++;
    }
    if (this.acc >= 1) this.acc = 0; // long hitch: drop the backlog; the lead loop re-aligns us
    return steps;
  }

  private step() {
    const cmd = this.host.sample();
    if (!this.synced || !this.active) return;
    const k = this.predTick + 1;
    const pkt = this.pkt;
    pkt.tick = k;
    pkt.mx = cmd.mx;
    pkt.mz = cmd.mz;
    pkt.buttons = cmd.buttons;
    pkt.viewTick = Math.max(0, Math.floor(this.host.viewTick()));
    this.host.send(pkt);
    const slot = this.inputs[k % RING];
    slot.tick = k; slot.mx = cmd.mx; slot.mz = cmd.mz; slot.buttons = cmd.buttons;
    this.prev.copyFrom(this.own);
    this.simulate(k, cmd);
    this.predTick = k;
    if (this.own.fx) this.host.fx?.(this.own.fx);
  }

  private simulate(k: number, cmd: InputCmd) {
    const { pw, info, own } = this;
    stepCharacter(pw, own, k <= info.freeze ? NO_INPUT : cmd);
    pw.setTime(k - info.start);
    resolveObstacleHits(pw, own);
    const st = this.states[k % RING];
    st.tick = k;
    st.s.copyFrom(own);
  }

  /** Feeds one snapshot. `server` is our authoritative state at tick T (null while we are not in the world). */
  onSnapshot(T: number, server: CharState | null, lead: number): SnapshotResult {
    this.stats.snapshots++;
    if (!server) {
      this.active = false;
      this.synced = false;
      this.pending = null;
      return 'inactive';
    }
    if (this.pending) {
      // Keep the pending resync current with the newest authoritative state.
      this.queueResync(T, server, this.pending.why, this.pending.shift);
      return 'resync';
    }
    const behind = this.synced && T >= this.predTick;
    if (!this.synced || !this.active || behind) {
      this.queueResync(T, server, behind ? 'behind' : '', 0);
      return 'resync';
    }

    // Lead feedback: where our newest input landed relative to the server's clock (-128 = none arrived yet).
    // Right after a resync the reports still describe the old timeline, so wait a round trip before trusting them.
    if (lead > -128 && T >= this.leadTrustFrom) {
      this.leadAvg += (lead - this.leadAvg) * 0.12;
      if (lead < TARGET_LEAD - 30) {
        this.queueResync(T, server, 'late', Math.round(TARGET_LEAD - lead));
        return 'resync';
      }
      if (lead > TARGET_LEAD + 30) {
        this.queueResync(T, server, 'early', 0);
        return 'resync';
      }
      this.rate = 1 + clamp((TARGET_LEAD - this.leadAvg) * 0.04, -0.25, 0.25);
    }
    this.stats.lead = lead;
    this.stats.ahead = this.predTick - T;

    const h = this.states[T % RING];
    if (h.tick === T && near(h.s, server)) return 'match';

    // Misprediction: rewind to the authoritative state and replay the inputs still in flight.
    this.own.copyFrom(server);
    this.pw.setTime(T - this.info.start);
    const st = this.states[T % RING];
    st.tick = T;
    st.s.copyFrom(server);
    for (let k = T + 1; k <= this.predTick; k++) {
      if (k === this.predTick) this.prev.copyFrom(this.own);
      const inp = this.inputs[k % RING];
      this.simulate(k, inp.tick === k ? inp : NO_INPUT);
    }
    if (T === this.predTick) this.prev.copyFrom(this.own);
    this.stats.replays++;
    return 'replay';
  }

  private queueResync(T: number, server: CharState, why: string, shift: number) {
    this.pendingState.copyFrom(server);
    this.pending = { T, why, shift };
  }

  private applyPending() {
    const p = this.pending!;
    this.pending = null;
    const fresh = p.T + Math.ceil(this.host.rttTicks() + TARGET_LEAD);
    let pred: number;
    if (!this.synced || !this.active) pred = fresh;
    else if (p.why === 'late') pred = Math.max(this.predTick + p.shift, fresh);
    else if (p.why === 'early') pred = fresh; // backwards: the server accepts a restarted input stream
    else pred = Math.max(fresh + 2, this.predTick + 1); // behind
    this.resync(p.T, this.pendingState, pred, p.why);
  }

  private resync(T: number, server: CharState, predTick: number, why: string) {
    if (this.synced && why) {
      this.stats.resyncs++;
      this.stats.why.push(why);
      if (this.stats.why.length > 16) this.stats.why.shift();
    }
    this.own.copyFrom(server);
    this.prev.copyFrom(server);
    this.predTick = predTick;
    this.leadTrustFrom = T + Math.ceil(this.host.rttTicks() * 2) + 12;
    this.pw.setTime(predTick - this.info.start);
    for (const s of this.states) s.tick = -1;
    this.acc = 0;
    this.rate = 1;
    this.leadAvg = TARGET_LEAD;
    this.synced = true;
    this.active = true;
    this.host.resynced?.();
  }

  /** Own feet position interpolated between the last two ticks. */
  renderPos(out: Vec3): Vec3 {
    const a = this.acc, p = this.prev, s = this.own;
    out[0] = p.px + (s.px - p.px) * a;
    out[1] = p.py + (s.py - p.py) * a - CHAR.centerHeight;
    out[2] = p.pz + (s.pz - p.pz) * a;
    return out;
  }
}

/** Close enough that replaying would change nothing visible. */
function near(a: CharState, b: CharState): boolean {
  return Math.abs(a.px - b.px) < 0.02 && Math.abs(a.py - b.py) < 0.02 && Math.abs(a.pz - b.pz) < 0.02 &&
    Math.abs(a.vx - b.vx) < 0.15 && Math.abs(a.vy - b.vy) < 0.15 && Math.abs(a.vz - b.vz) < 0.15 &&
    a.mode === b.mode && a.grounded === b.grounded;
}
