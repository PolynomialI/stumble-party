import * as THREE from 'three';
import type { Room } from '@colyseus/sdk';
import {
  CHAR, CharState, DT, MAX_PLAYERS, MSG_INPUT, MSG_SNAPSHOT, MSG_TILES, NO_INPUT, PhysicsWorld, TICK_RATE, clamp,
  decodeSnapshot, decodeTiles, encodeInput, getMap, lerpAngle, newPose, obstaclePose, poseApply, poseInvApply,
  pushAgainst, resolveObstacleHits, stepCharacter, type InputCmd, type InputPacket, type Look, type MapDef,
  type MapInfo, type Vec3,
} from '@sp/shared';
import type { Input } from '../input/Input';
import { CameraRig } from '../render/CameraRig';
import { CharacterRenderer, type CharPose } from '../render/characters';
import { Environment } from '../render/environment';
import { MapView } from '../render/MapView';
import type { GameRenderer } from '../render/Renderer';
import { Hud } from '../ui/hud';
import { NameTags } from '../ui/nametags';

const RING = 256;
/** Remote players are shown this many ticks in the past so there is always a snapshot pair to blend. */
const INTERP_TICKS = 3.5;
/** How far ahead of the server our inputs should arrive (ticks). */
const TARGET_LEAD = 2.5;
const MAX_STEPS_PER_FRAME = 8;

interface Sample {
  tick: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: number;
  grounded: boolean;
  emote: number;
  obs: number;
}

class Track {
  readonly samples: Sample[] = [];
  lastSeen = 0;
  emote = 0;
  emoteStart = 0;
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  mode = 0;
  grounded = true;
  visible = false;
  primed = false;

  push(s: Sample) {
    const last = this.samples[this.samples.length - 1];
    if (last && s.tick <= last.tick) return;
    this.samples.push(s);
    if (this.samples.length > 48) this.samples.shift();
  }
}

interface SlotInfo {
  sessionId: string;
  name: string;
  lookKey: string;
}

const _pose = newPose();
const _pose2 = newPose();
const _a: Vec3 = [0, 0, 0];
const _b: Vec3 = [0, 0, 0];

/** Networked play: predicts our own character, interpolates everyone else, renders the room's map. */
export class OnlineGame {
  readonly cam: CameraRig;
  private readonly chars: CharacterRenderer;
  private readonly hud: Hud;
  private readonly tags: NameTags;
  private view: MapView | null = null;
  private env: Environment | null = null;
  private map: MapDef | null = null;
  pw: PhysicsWorld | null = null;
  info: MapInfo | null = null;

  // Own prediction.
  readonly own = new CharState();
  private readonly prevOwn = new CharState();
  private predTick = 0;
  private acc = 0;
  private synced = false;
  ownActive = false;
  private rate = 1;
  private leadAvg = TARGET_LEAD;
  private readonly inputs: (InputCmd & { tick: number })[] = new Array(RING);
  private readonly states: { tick: number; s: CharState }[] = Array.from({ length: RING }, () => ({ tick: -1, s: new CharState() }));
  private readonly smooth = new THREE.Vector3();
  private readonly renderOwn = new THREE.Vector3();
  private readonly cmd: InputCmd = { mx: 0, mz: 0, buttons: 0 };
  private readonly pkt: InputPacket = { tick: 0, mx: 0, mz: 0, buttons: 0, viewTick: 0 };
  private readonly pktBuf = new Uint8Array(11);
  private ownEmote = 0;
  private ownEmoteT = 0;
  /** Prediction health counters (debug overlay / tests). */
  readonly netStats = { snapshots: 0, replays: 0, resyncs: 0, maxCorrection: 0, lastCorrection: 0, recent: [] as number[], why: [] as string[], lead: 0, leadAvg: 0, rate: 1, ahead: 0 };

  // Server clock: serverTick ~= localTicks() + clockOffset (tracks the earliest-arrival envelope).
  private clockOffset = NaN;
  private lastClockMs = 0;
  rttMs = 100;

  // Everyone else.
  readonly tracks = new Map<number, Track>();
  readonly slots = new Map<number, SlotInfo>();
  mySlot = -1;
  private readonly pose: CharPose = {
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, mode: 0, grounded: true, emote: 0, emoteT: 0, groundY: NaN,
  };
  private readonly focus = new THREE.Vector3();
  private spectate = -1;
  private readonly unsub: (() => void)[] = [];
  private pingTimer = 0;

  constructor(private readonly r: GameRenderer, private readonly input: Input, ui: HTMLElement, readonly room: Room) {
    this.cam = new CameraRig(r.camera);
    this.chars = new CharacterRenderer(r.mats, r.profile);
    r.scene.add(this.chars.group);
    this.hud = new Hud(ui);
    this.tags = new NameTags(ui);

    this.unsub.push(room.onMessage(MSG_SNAPSHOT, (buf: Uint8Array) => this.onSnapshot(buf)));
    this.unsub.push(room.onMessage(MSG_TILES, (buf: Uint8Array) => this.onTiles(buf)));
    this.unsub.push(room.onMessage('map', (info: MapInfo) => this.onMap(info)));
    room.onStateChange(() => this.syncPlayers());
    this.syncPlayers();
    room.send('ready');
    this.measurePing();
    this.pingTimer = window.setInterval(() => this.measurePing(), 2000);
  }

  private measurePing() {
    this.room.ping((ms: number) => {
      if (Number.isFinite(ms) && ms > 0) this.rttMs = this.rttMs * 0.7 + ms * 0.3;
    });
  }

  private localTicks() {
    return (performance.now() / 1000) * TICK_RATE;
  }

  serverNow() {
    return Number.isNaN(this.clockOffset) ? 0 : this.localTicks() + this.clockOffset;
  }

  // ------------------------------------------------------------------ room state

  private syncPlayers() {
    const state = this.room.state as {
      players?: { forEach(cb: (p: Record<string, unknown>, id: string) => void): void };
    } | undefined;
    if (!state?.players) return;
    const seen = new Set<number>();
    state.players.forEach((p, id) => {
      const slot = p.slot as number;
      seen.add(slot);
      const look: Look = { body: p.body as number, accent: p.accent as number, pattern: p.pattern as number, hat: p.hat as number };
      const key = `${look.body}/${look.accent}/${look.pattern}/${look.hat}`;
      const info = this.slots.get(slot);
      if (!info || info.lookKey !== key || info.sessionId !== id) this.chars.setLook(slot, look);
      const name = String(p.name ?? '');
      this.slots.set(slot, { sessionId: id, name, lookKey: key });
      this.tags.setName(slot, name, id === this.room.sessionId);
      if (id === this.room.sessionId) this.mySlot = slot;
    });
    for (const slot of [...this.slots.keys()]) {
      if (!seen.has(slot)) {
        this.slots.delete(slot);
        this.tags.remove(slot);
        this.tracks.delete(slot);
        this.chars.hide(slot);
      }
    }
  }

  private onMap(info: MapInfo) {
    const map = getMap(info.id);
    const sameMap = this.info && this.info.v === info.v && this.map === map;
    this.info = info;
    if (sameMap) return;
    this.pw?.free();
    if (this.view) {
      this.r.scene.remove(this.view.group);
      this.view.dispose();
    }
    this.env?.dispose();
    this.map = map;
    this.pw = new PhysicsWorld(map);
    this.view = new MapView(map, this.r.mats, this.r.profile);
    this.r.scene.add(this.view.group);
    this.env = new Environment(this.r.scene, this.r.renderer, map.theme, this.r.profile, map.killY);
    this.tracks.clear();
    for (let s = 0; s < MAX_PLAYERS; s++) this.chars.hide(s);
    this.synced = false;
    this.ownActive = false;
    for (const st of this.states) st.tick = -1;
    this.cam.snap();
  }

  private onTiles(buf: Uint8Array) {
    if (!this.pw) return;
    for (const e of decodeTiles(buf)) {
      const t = this.pw.tiles[e.tile];
      if (t) t.triggerTick = e.tick;
    }
  }

  // ------------------------------------------------------------------ snapshots

  private onSnapshot(buf: Uint8Array) {
    const snap = decodeSnapshot(buf);
    if (!this.info || !this.pw || snap.mapVersion !== this.info.v) return;

    const sample = snap.tick - this.localTicks();
    const nowMs = performance.now();
    if (Number.isNaN(this.clockOffset)) this.clockOffset = sample;
    else this.clockOffset = Math.max(sample, this.clockOffset - ((nowMs - this.lastClockMs) / 1000) * 0.3);
    this.lastClockMs = nowMs;

    for (const e of snap.players) {
      if (e.slot === this.mySlot) {
        if (e.emote && e.emote !== this.ownEmote && this.ownEmoteT > 0.4) { this.ownEmote = e.emote; this.ownEmoteT = 0; }
        continue;
      }
      let tr = this.tracks.get(e.slot);
      if (!tr) this.tracks.set(e.slot, (tr = new Track()));
      tr.push({ tick: snap.tick, x: e.x, y: e.y, z: e.z, yaw: e.yaw, mode: e.mode, grounded: e.grounded, emote: e.emote, obs: e.groundObs });
      tr.lastSeen = snap.tick;
    }

    if (snap.own) this.reconcile(snap.tick, snap.own, snap.lead);
    else if (this.ownActive) {
      this.ownActive = false;
      this.synced = false;
      if (this.mySlot >= 0) this.chars.hide(this.mySlot);
    }
  }

  private rttTicks() {
    return (this.rttMs / 1000) * TICK_RATE;
  }

  private reconcile(T: number, server: CharState, lead: number) {
    const pw = this.pw!;
    const start = this.info!.start;
    this.netStats.snapshots++;

    // (Re)start prediction a round trip + margin ahead of this snapshot. The input clock only ever moves
    // forward: the server drops inputs stamped at or before ones it already has.
    const behind = this.synced && T >= this.predTick;
    if (!this.synced || behind) {
      const want = T + Math.ceil(this.rttTicks() + TARGET_LEAD) + (behind ? 2 : 0);
      this.resync(server, this.synced ? Math.max(want, this.predTick + 1) : want, behind ? 'behind' : '');
      return;
    }

    // Lead feedback. -128 means "no input of yours has arrived yet": nothing to learn from it.
    if (lead > -128) {
      this.leadAvg += (lead - this.leadAvg) * 0.12;
      if (lead < TARGET_LEAD - 30) {
        this.resync(server, this.predTick + Math.round(TARGET_LEAD - lead), `late ${lead}`);
        return;
      }
      this.rate = 1 + clamp((TARGET_LEAD - this.leadAvg) * 0.04, -0.25, 0.25);
    }
    this.netStats.lead = lead;
    this.netStats.ahead = this.predTick - T;
    this.netStats.leadAvg = +this.leadAvg.toFixed(2);
    this.netStats.rate = +this.rate.toFixed(3);

    const h = this.states[T % RING];
    if (h.tick === T && near(h.s, server)) return;

    // Misprediction: rewind to the authoritative state and replay our buffered inputs.
    const alpha = this.acc;
    const before = this.renderOwn.clone();
    this.own.copyFrom(server);
    pw.setTime(T - start);
    this.states[T % RING].tick = T;
    this.states[T % RING].s.copyFrom(server);
    for (let k = T + 1; k <= this.predTick; k++) {
      if (k === this.predTick) this.prevOwn.copyFrom(this.own);
      const inp = this.inputs[k % RING];
      this.simulate(k, inp && inp.tick === k ? inp : NO_INPUT);
    }
    if (T === this.predTick) this.prevOwn.copyFrom(this.own);
    const p = this.prevOwn, s = this.own;
    const after = new THREE.Vector3(
      p.px + (s.px - p.px) * alpha, p.py + (s.py - p.py) * alpha - CHAR.centerHeight, p.pz + (s.pz - p.pz) * alpha);
    this.smooth.copy(before).sub(after);
    this.netStats.replays++;
    this.netStats.lastCorrection = this.smooth.length();
    this.netStats.recent.push(+this.netStats.lastCorrection.toFixed(3));
    if (this.netStats.recent.length > 24) this.netStats.recent.shift();
    this.netStats.maxCorrection = Math.max(this.netStats.maxCorrection, this.netStats.lastCorrection);
    if (this.smooth.lengthSq() > 9) this.smooth.set(0, 0, 0);
  }

  /** Adopts the server's state and continues predicting from `predTick`. */
  private resync(server: CharState, predTick: number, why: string) {
    if (this.synced && why) {
      this.netStats.resyncs++;
      this.netStats.why.push(why);
    }
    this.own.copyFrom(server);
    this.prevOwn.copyFrom(server);
    this.renderOwn.set(server.px, server.py - CHAR.centerHeight, server.pz);
    this.predTick = predTick;
    this.pw!.setTime(predTick - this.info!.start);
    for (const st of this.states) st.tick = -1;
    this.acc = 0;
    this.rate = 1;
    this.leadAvg = TARGET_LEAD;
    this.smooth.set(0, 0, 0);
    if (!this.ownActive) this.cam.snap();
    this.synced = true;
    this.ownActive = true;
  }

  /** One predicted tick for our own character (also used for replays). */
  private simulate(k: number, cmd: InputCmd) {
    const pw = this.pw!;
    const info = this.info!;
    stepCharacter(pw, this.own, k <= info.freeze ? NO_INPUT : cmd);
    pw.setTime(k - info.start);
    resolveObstacleHits(pw, this.own);
    for (const tr of this.tracks.values()) {
      if (tr.visible) pushAgainst(this.own, tr.pos.x, tr.pos.y + CHAR.centerHeight, tr.pos.z);
    }
    const st = this.states[k % RING];
    st.tick = k;
    st.s.copyFrom(this.own);
  }

  private predictTick() {
    const cmd = this.input.sample(this.cam.yaw, this.cmd);
    if (!this.synced || !this.ownActive || !this.pw) return;
    const k = this.predTick + 1;
    const pkt = this.pkt;
    pkt.tick = k;
    pkt.mx = cmd.mx;
    pkt.mz = cmd.mz;
    pkt.buttons = cmd.buttons;
    pkt.viewTick = Math.max(0, Math.floor(this.serverNow() - INTERP_TICKS));
    this.room.sendBytes(MSG_INPUT, encodeInput(pkt, this.pktBuf));
    const slot = this.inputs[k % RING];
    if (slot) { slot.tick = k; slot.mx = cmd.mx; slot.mz = cmd.mz; slot.buttons = cmd.buttons; }
    else this.inputs[k % RING] = { tick: k, mx: cmd.mx, mz: cmd.mz, buttons: cmd.buttons };
    this.prevOwn.copyFrom(this.own);
    this.simulate(k, cmd);
    this.predTick = k;
  }

  // ------------------------------------------------------------------ per frame

  frame(dt: number) {
    this.acc += dt * TICK_RATE * this.rate;
    let steps = 0;
    while (this.acc >= 1 && steps < MAX_STEPS_PER_FRAME) {
      this.acc -= 1;
      this.predictTick();
      steps++;
    }
    if (this.acc >= 1) this.acc = 0; // long hitch: drop the backlog, the server holds our last input

    const e = this.input.takeEmote();
    if (e && this.ownActive) {
      this.room.send('emote', e);
      this.ownEmote = e;
      this.ownEmoteT = 0;
    }
    this.ownEmoteT += dt;

    if (!this.info || !this.map || !this.view) return;
    const start = this.info.start;
    const present = this.synced ? this.predTick - 1 + this.acc : this.serverNow();
    const renderTick = this.serverNow() - INTERP_TICKS;
    this.chars.beginFrame(dt);
    this.tags.beginFrame();

    // Own character.
    this.smooth.multiplyScalar(Math.exp(-dt * 12));
    if (this.ownActive && this.mySlot >= 0) {
      const a = this.acc, p = this.prevOwn, s = this.own;
      this.renderOwn.set(
        p.px + (s.px - p.px) * a, p.py + (s.py - p.py) * a - CHAR.centerHeight, p.pz + (s.pz - p.pz) * a,
      ).add(this.smooth);
      if (this.ownEmoteT > 2.6 || Math.hypot(s.vx, s.vz) > 1 || !s.grounded) this.ownEmote = 0;
      const pose = this.pose;
      pose.x = this.renderOwn.x; pose.y = this.renderOwn.y; pose.z = this.renderOwn.z;
      pose.yaw = lerpAngle(p.yaw, s.yaw, a);
      pose.vx = s.vx; pose.vy = s.vy; pose.vz = s.vz;
      pose.mode = s.mode; pose.grounded = s.grounded;
      pose.emote = this.ownEmote; pose.emoteT = this.ownEmoteT;
      pose.groundY = this.renderOwn.y;
      this.chars.update(this.mySlot, pose, dt);
    }

    // Everyone else.
    const staleBefore = this.serverNow() - 20;
    for (const [slot, tr] of this.tracks) {
      if (tr.lastSeen < staleBefore || !this.sampleTrack(tr, renderTick, present - start)) {
        if (tr.visible) { tr.visible = false; this.chars.hide(slot); }
        continue;
      }
      tr.visible = true;
      if (tr.emote !== this.currentEmote(tr)) { tr.emote = this.currentEmote(tr); tr.emoteStart = performance.now(); }
      const pose = this.pose;
      pose.x = tr.pos.x; pose.y = tr.pos.y; pose.z = tr.pos.z; pose.yaw = tr.yaw;
      pose.vx = tr.vel.x; pose.vy = tr.vel.y; pose.vz = tr.vel.z;
      pose.mode = tr.mode; pose.grounded = tr.grounded;
      pose.emote = tr.emote; pose.emoteT = (performance.now() - tr.emoteStart) / 1000;
      pose.groundY = tr.pos.y;
      this.chars.update(slot, pose, dt);
      this.tags.place(slot, tr.pos.x, tr.pos.y + 2.05, tr.pos.z, this.r.camera);
    }
    this.tags.endFrame();

    this.view.update(present - start, dt, this.pw);

    // Camera: follow ourselves, or spectate someone while we are out.
    if (this.ownActive) this.focus.copy(this.renderOwn);
    else {
      const target = this.spectateTarget();
      if (target) this.focus.copy(target.pos);
    }
    this.cam.update(dt, this.focus, this.input.takeLook(), this.input.zoomDelta, this.pw);
    this.input.zoomDelta = 0;
    this.env?.update(dt, this.focus);
  }

  private currentEmote(tr: Track) {
    return tr.samples.length ? tr.samples[tr.samples.length - 1].emote : 0;
  }

  /**
   * Interpolates a remote player at `tick`. If it stands on a moving platform, it is carried from where the
   * platform was then to where we draw the platform now, so riders never slide off their ride visually.
   */
  private sampleTrack(tr: Track, tick: number, presentWorldTick: number): boolean {
    const n = tr.samples.length;
    if (n === 0) return false;
    let a = tr.samples[0], b = a, t = 0;
    if (tick <= tr.samples[0].tick) {
      a = b = tr.samples[0];
    } else if (tick >= tr.samples[n - 1].tick) {
      a = b = tr.samples[n - 1];
      // Brief extrapolation hides a late packet; beyond that we hold.
      if (n >= 2) {
        a = tr.samples[n - 2];
        t = Math.min(1 + (tick - b.tick) / Math.max(1, b.tick - a.tick), 1.6);
      }
    } else {
      for (let i = n - 1; i > 0; i--) {
        if (tr.samples[i - 1].tick <= tick) {
          a = tr.samples[i - 1];
          b = tr.samples[i];
          t = (tick - a.tick) / Math.max(1, b.tick - a.tick);
          break;
        }
      }
    }
    tr.prevPos.copy(tr.pos);
    const start = this.info!.start;
    if (a.obs >= 0 && a.obs === b.obs && this.map && this.map.obstacles[a.obs]) {
      const def = this.map.obstacles[a.obs];
      obstaclePose(def, (a.tick - start) * DT, _pose);
      poseInvApply(_pose, [a.x, a.y, a.z], _a);
      obstaclePose(def, (b.tick - start) * DT, _pose);
      poseInvApply(_pose, [b.x, b.y, b.z], _b);
      const local: Vec3 = [_a[0] + (_b[0] - _a[0]) * t, _a[1] + (_b[1] - _a[1]) * t, _a[2] + (_b[2] - _a[2]) * t];
      obstaclePose(def, presentWorldTick * DT, _pose2);
      poseApply(_pose2, local, _a);
      tr.pos.set(_a[0], _a[1], _a[2]);
    } else {
      tr.pos.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    }
    tr.yaw = lerpAngle(a.yaw, b.yaw, Math.min(1, t));
    const near = t < 0.5 ? a : b;
    tr.mode = near.mode;
    tr.grounded = near.grounded;
    if (!tr.primed) { tr.prevPos.copy(tr.pos); tr.primed = true; }
    // Velocity from the snapshot pair drives run cycles and squash/stretch.
    const span = Math.max(1, b.tick - a.tick) * DT;
    tr.vel.set((b.x - a.x) / span, (b.y - a.y) / span, (b.z - a.z) / span);
    return true;
  }

  private spectateTarget(): Track | null {
    const visible = [...this.tracks.entries()].filter(([, t]) => t.visible);
    if (!visible.length) return null;
    const cur = visible.find(([s]) => s === this.spectate);
    if (cur) return cur[1];
    this.spectate = visible[0][0];
    return visible[0][1];
  }

  cycleSpectate(dir: 1 | -1) {
    const slots = [...this.tracks.entries()].filter(([, t]) => t.visible).map(([s]) => s).sort((a, b) => a - b);
    if (!slots.length) return;
    const i = slots.indexOf(this.spectate);
    this.spectate = slots[(i + dir + slots.length) % slots.length];
    this.cam.snap();
  }

  get spectatingName(): string {
    return this.slots.get(this.spectate)?.name ?? '';
  }

  get hudRef() {
    return this.hud;
  }

  dispose() {
    clearInterval(this.pingTimer);
    for (const u of this.unsub) u();
    this.r.scene.remove(this.chars.group);
    this.chars.dispose();
    if (this.view) {
      this.r.scene.remove(this.view.group);
      this.view.dispose();
    }
    this.env?.dispose();
    this.pw?.free();
    this.hud.dispose();
    this.tags.dispose();
  }
}

/** Close enough that replaying would change nothing visible. */
function near(a: CharState, b: CharState): boolean {
  return Math.abs(a.px - b.px) < 0.01 && Math.abs(a.py - b.py) < 0.01 && Math.abs(a.pz - b.pz) < 0.01 &&
    Math.abs(a.vx - b.vx) < 0.05 && Math.abs(a.vy - b.vy) < 0.05 && Math.abs(a.vz - b.vz) < 0.05 &&
    a.mode === b.mode && a.grounded === b.grounded;
}
