import * as THREE from 'three';
import type { Room } from '@colyseus/sdk';
import {
  CHAR, DT, FX_DIVE, FX_JUMP, FX_LAND, MAX_PLAYERS, MODE_DIVE, MODE_STUN, MSG_INPUT, MSG_SNAPSHOT, MSG_TILES,
  PhysicsWorld, Predictor, TICK_RATE, decodeSnapshot, decodeTiles, encodeInput, getMap, lerpAngle, newPose,
  obstaclePose, poseApply, poseInvApply, type InputCmd, type Look, type MapDef, type MapInfo, type Vec3,
} from '@sp/shared';
import { sound } from '../audio/sound';
import type { Input } from '../input/Input';
import { CameraRig } from '../render/CameraRig';
import { CharacterRenderer, type CharPose } from '../render/characters';
import { Effects } from '../render/effects';
import { Environment } from '../render/environment';
import { MapView } from '../render/MapView';
import type { GameRenderer } from '../render/Renderer';
import { Hud } from '../ui/hud';
import { NameTags } from '../ui/nametags';
import { playFx } from './PracticeGame';

/** Remote players are shown this many ticks in the past so there is always a snapshot pair to blend. */
const INTERP_TICKS = 3.5;
/** Capsules closer than this are drawn pushed apart (render only). */
const VISUAL_MIN_DIST = CHAR.radius * 2;
/** Other players' sounds fade out over this distance (m). */
const HEARING = 28;

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
  readonly vel = new THREE.Vector3();
  yaw = 0;
  mode = 0;
  grounded = true;
  visible = false;
  touching = false;

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
const _r: Vec3 = [0, 0, 0];

/** Networked play: predicts our own character, interpolates everyone else, renders the room's map. */
export class OnlineGame {
  readonly cam: CameraRig;
  private readonly chars: CharacterRenderer;
  private readonly effects: Effects;
  readonly hud: Hud;
  private readonly tags: NameTags;
  private view: MapView | null = null;
  private env: Environment | null = null;
  private map: MapDef | null = null;
  pw: PhysicsWorld | null = null;
  info: MapInfo | null = null;
  predictor: Predictor | null = null;

  /** Visual offset that eases out prediction corrections. */
  private readonly smooth = new THREE.Vector3();
  private readonly renderOwn = new THREE.Vector3();
  private readonly cmd: InputCmd = { mx: 0, mz: 0, buttons: 0 };
  private readonly pktBuf = new Uint8Array(11);
  private ownEmote = 0;
  private ownEmoteT = 0;
  /** Effect flags of our freshly predicted ticks since the last frame. */
  private ownFx = 0;
  /** When we last drew ourselves on this map (we leave the world the moment we qualify). */
  private ownSeenAt = 0;
  readonly netStats = { maxCorrection: 0, lastCorrection: 0, recent: [] as number[] };

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
    this.effects = new Effects(r.profile);
    r.scene.add(this.effects.group);
    this.hud = new Hud(ui);
    this.tags = new NameTags(ui);

    this.unsub.push(room.onMessage(MSG_SNAPSHOT, (buf: Uint8Array) => this.onSnapshot(buf)));
    this.unsub.push(room.onMessage(MSG_TILES, (buf: Uint8Array) => this.onTiles(buf)));
    this.unsub.push(room.onMessage('map', (info: MapInfo) => this.onMap(info)));
    room.onStateChange(() => this.syncPlayers());
    this.syncPlayers();
    // Ask for the map only now that our handlers exist (earlier messages could be dropped).
    room.send('ready');
    this.measurePing();
    this.pingTimer = window.setInterval(() => this.measurePing(), 2000);
  }

  get ownActive(): boolean {
    return !!this.predictor?.active;
  }

  get own() {
    return this.predictor?.own ?? null;
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
    const sameLoad = this.info && this.info.v === info.v && this.map === map;
    this.info = info;
    if (sameLoad) {
      this.predictor?.reset(this.pw!, info);
      return;
    }
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
    this.ownSeenAt = 0;
    for (let s = 0; s < MAX_PLAYERS; s++) this.chars.hide(s);
    if (this.predictor) this.predictor.reset(this.pw, info);
    else {
      this.predictor = new Predictor(this.pw, info, {
        sample: () => this.input.sample(this.cam.yaw, this.cmd),
        send: (pkt) => this.room.sendBytes(MSG_INPUT, encodeInput(pkt, this.pktBuf)),
        viewTick: () => this.serverNow() - INTERP_TICKS,
        rttTicks: () => (this.rttMs / 1000) * TICK_RATE,
        fx: (bits) => { this.ownFx |= bits; },
        resynced: () => {
          this.smooth.set(0, 0, 0);
          this.cam.snap();
        },
      });
    }
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
    if (!this.info || !this.predictor || snap.mapVersion !== this.info.v) return;

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

    const p = this.predictor;
    const wasActive = p.active;
    const before = p.active ? p.renderPos(_a) : null;
    const result = p.onSnapshot(snap.tick, snap.own, snap.lead);
    if (result === 'replay' && before) {
      // Keep the drawn position continuous; the offset eases out over ~100 ms.
      const after = p.renderPos(_b);
      this.smooth.x += before[0] - after[0];
      this.smooth.y += before[1] - after[1];
      this.smooth.z += before[2] - after[2];
      const c = Math.hypot(before[0] - after[0], before[1] - after[1], before[2] - after[2]);
      this.netStats.lastCorrection = c;
      this.netStats.maxCorrection = Math.max(this.netStats.maxCorrection, c);
      this.netStats.recent.push(+c.toFixed(3));
      if (this.netStats.recent.length > 24) this.netStats.recent.shift();
      if (this.smooth.lengthSq() > 9) this.smooth.set(0, 0, 0);
    } else if (result === 'inactive' && wasActive && this.mySlot >= 0) {
      this.chars.hide(this.mySlot);
    }
  }

  // ------------------------------------------------------------------ per frame

  frame(dt: number) {
    const p = this.predictor;
    if (p) p.advance(dt);
    else this.input.sample(this.cam.yaw, this.cmd); // keep consuming presses while loading

    const e = this.input.takeEmote();
    if (e && p?.active) {
      this.room.send('emote', e);
      this.ownEmote = e;
      this.ownEmoteT = 0;
    }
    this.ownEmoteT += dt;

    if (!this.info || !this.map || !this.view || !p) return;
    const start = this.info.start;
    const present = p.synced ? p.predTick - 1 + p.acc : this.serverNow();
    const renderTick = this.serverNow() - INTERP_TICKS;
    this.chars.beginFrame(dt);
    this.tags.beginFrame();

    // Own character.
    this.smooth.multiplyScalar(Math.exp(-dt * 12));
    if (p.active && this.mySlot >= 0) {
      p.renderPos(_r);
      this.renderOwn.set(_r[0], _r[1], _r[2]).add(this.smooth);
      const s = p.own, prev = p.prev;
      if (this.ownEmoteT > 2.6 || Math.hypot(s.vx, s.vz) > 1 || !s.grounded) this.ownEmote = 0;
      const pose = this.pose;
      pose.x = this.renderOwn.x; pose.y = this.renderOwn.y; pose.z = this.renderOwn.z;
      pose.yaw = lerpAngle(prev.yaw, s.yaw, p.acc);
      pose.vx = s.vx; pose.vy = s.vy; pose.vz = s.vz;
      pose.mode = s.mode; pose.grounded = s.grounded;
      pose.emote = this.ownEmote; pose.emoteT = this.ownEmoteT;
      pose.groundY = this.renderOwn.y;
      this.chars.update(this.mySlot, pose, dt);
      if (this.ownFx) playFx(this.ownFx, this.effects, this.renderOwn.x, this.renderOwn.y, this.renderOwn.z, 1, this.cam);
      this.ownSeenAt = performance.now();
    }
    this.ownFx = 0;

    // Everyone else.
    const staleBefore = this.serverNow() - 20;
    for (const [slot, tr] of this.tracks) {
      const wasGrounded = tr.grounded, wasMode = tr.mode;
      if (tr.lastSeen < staleBefore || !this.sampleTrack(tr, renderTick, present - start)) {
        if (tr.visible) { tr.visible = false; this.chars.hide(slot); }
        continue;
      }
      if (tr.visible) this.remoteFx(tr, wasGrounded, wasMode);
      tr.visible = true;
      const touching = p.active && this.separate(tr.pos, this.renderOwn);
      if (touching && !tr.touching && Math.hypot(p.own.vx, p.own.vz) > 2.5) sound.play('bump', 0.8);
      tr.touching = touching;
      const em = this.currentEmote(tr);
      if (tr.emote !== em) { tr.emote = em; tr.emoteStart = performance.now(); }
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
    this.effects.update(dt);

    // Camera: follow ourselves, or spectate someone while we are out.
    if (p.active) this.focus.copy(this.renderOwn);
    else {
      const target = this.spectateTarget();
      if (target) this.focus.copy(target.pos);
    }
    this.cam.update(dt, this.focus, this.input.takeLook(), this.input.zoomDelta, this.pw);
    this.input.zoomDelta = 0;
    this.env?.update(dt, this.focus);
  }

  /**
   * Draws someone we bumped into pushed clear of us right away. Their real shove only reaches us a round trip
   * later; without this we would appear to run through them for a moment. Render-only.
   */
  private separate(pos: THREE.Vector3, self: THREE.Vector3): boolean {
    if (Math.abs(pos.y - self.y) > CHAR.centerHeight * 2) return false;
    const dx = pos.x - self.x, dz = pos.z - self.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= VISUAL_MIN_DIST * VISUAL_MIN_DIST) return false;
    const d = Math.sqrt(d2);
    const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
    pos.x = self.x + nx * VISUAL_MIN_DIST;
    pos.z = self.z + nz * VISUAL_MIN_DIST;
    return true;
  }

  /** Sounds and dust for someone else, read off their interpolated state; quieter with distance. */
  private remoteFx(tr: Track, wasGrounded: boolean, wasMode: number) {
    const c = this.r.camera.position;
    const vol = 0.7 * (1 - Math.hypot(tr.pos.x - c.x, tr.pos.y - c.y, tr.pos.z - c.z) / HEARING);
    if (vol <= 0) return;
    let fx = 0;
    if (wasGrounded && !tr.grounded && tr.vel.y > 2 && tr.mode !== MODE_DIVE) fx |= FX_JUMP;
    if (!wasGrounded && tr.grounded && tr.vel.y < -1) fx |= FX_LAND;
    if (tr.mode === MODE_DIVE && wasMode !== MODE_DIVE) fx |= FX_DIVE;
    if (fx) playFx(fx, this.effects, tr.pos.x, tr.pos.y, tr.pos.z, vol);
    if (tr.mode === MODE_STUN && wasMode !== MODE_STUN) sound.play('hit', vol);
  }

  /** A burst of confetti over a player (qualifying, the champion on the podium). False if they are not in view. */
  celebrate(sessionId: string, count = 90): boolean {
    let at: THREE.Vector3 | null = null;
    for (const [slot, info] of this.slots) {
      if (info.sessionId !== sessionId) continue;
      const tr = this.tracks.get(slot);
      if (slot === this.mySlot && performance.now() - this.ownSeenAt < 2000) at = this.renderOwn;
      else if (tr?.visible) at = tr.pos;
    }
    if (!at) return false;
    this.effects.confetti(at.x, at.y + 1.6, at.z, count);
    return true;
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
    const nearest = t < 0.5 ? a : b;
    tr.mode = nearest.mode;
    tr.grounded = nearest.grounded;
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

  /** Turn the camera to look the champion in the face (podium). */
  facePodium() {
    this.cam.yaw = 0;
    this.cam.pitch = 0.18;
    this.cam.distance = 5.5;
    this.cam.snap();
  }

  get spectatingName(): string {
    return this.slots.get(this.spectate)?.name ?? '';
  }

  dispose() {
    clearInterval(this.pingTimer);
    for (const u of this.unsub) u();
    this.r.scene.remove(this.chars.group, this.effects.group);
    this.chars.dispose();
    this.effects.dispose();
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
