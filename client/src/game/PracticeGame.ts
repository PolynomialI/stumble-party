import * as THREE from 'three';
import {
  CHAR, CharState, DT, NO_INPUT, PhysicsWorld, inZone, lerpAngle, reachCheckpoint, resolveObstacleHits, respawnPoint,
  spawnPoints, stepCharacter, type InputCmd, type Look, type MapDef,
} from '@sp/shared';
import { CharacterRenderer, type CharPose } from '../render/characters';
import type { Input } from '../input/Input';
import { CameraRig } from '../render/CameraRig';
import { Environment } from '../render/environment';
import { MapView } from '../render/MapView';
import type { GameRenderer } from '../render/Renderer';
import { Hud, formatTime } from '../ui/hud';

type Phase = 'countdown' | 'running' | 'finished' | 'free';

const COUNTDOWN_TICKS = 3 * 30;

/** Offline play on one map: the same shared simulation the server runs, stepped locally. */
export class PracticeGame {
  readonly pw: PhysicsWorld;
  readonly state = new CharState();
  private readonly prev = new CharState();
  private readonly view: MapView;
  private readonly env: Environment;
  readonly cam: CameraRig;
  private readonly chars: CharacterRenderer;
  private readonly hud: Hud;
  private readonly pose: CharPose = {
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, mode: 0, grounded: true, emote: 0, emoteT: 0, groundY: NaN,
  };
  private readonly cmd: InputCmd = { mx: 0, mz: 0, buttons: 0 };
  private readonly focus = new THREE.Vector3();
  /** Debug: extra idle characters to review outfits (?showcase). */
  private readonly extras: { slot: number; pose: CharPose }[] = [];
  private emote = 0;
  private emoteT = 0;
  private tick = 0;
  private acc = 0;
  private phase: Phase;
  private startTick = 0;
  private checkpoint = -1;
  private lastCount = -1;

  /** Title-screen mode: no input, slowly orbiting camera, the character idles and emotes. */
  readonly attract: boolean;
  private attractT = 0;

  constructor(private readonly r: GameRenderer, private readonly input: Input, readonly map: MapDef, look: Look, ui: HTMLElement,
    opts: { attract?: boolean } = {}) {
    this.attract = opts.attract ?? false;
    this.pw = new PhysicsWorld(map);
    this.pw.setTime(0);
    this.view = new MapView(map, r.mats, r.profile);
    r.scene.add(this.view.group);
    this.env = new Environment(r.scene, r.renderer, map.theme, r.profile, map.killY);
    this.cam = new CameraRig(r.camera);
    this.chars = new CharacterRenderer(r.mats, r.profile);
    this.chars.setLook(0, look);
    r.scene.add(this.chars.group);
    this.hud = new Hud(ui);
    this.phase = map.type === 'race' && !this.attract ? 'countdown' : 'free';
    this.respawn(true);
  }

  showcase(looks: Look[]) {
    looks.forEach((look, i) => {
      const slot = i + 1;
      this.chars.setLook(slot, look);
      const x = (i - (looks.length - 1) / 2) * 1.25;
      this.extras.push({ slot, pose: { ...this.pose, x, y: 0, z: -12.5 + Math.abs(x) * 0.25, yaw: 0, emote: 0, groundY: 0 } });
    });
  }

  private respawn(start = false) {
    const s = start ? spawnPoints(this.map, 1)[0] : respawnPoint(this.map, this.checkpoint, 0);
    this.state.spawn(s.x, s.y, s.z, s.yaw);
    this.prev.copyFrom(this.state);
    this.cam.yaw = s.yaw;
    this.cam.snap();
  }

  private fixedStep() {
    this.prev.copyFrom(this.state);
    if (!this.attract) this.input.sample(this.cam.yaw, this.cmd);
    const cmd = this.phase === 'countdown' || this.attract ? NO_INPUT : this.cmd;
    stepCharacter(this.pw, this.state, cmd);
    this.tick++;
    this.pw.setTime(this.tick);
    resolveObstacleHits(this.pw, this.state);

    // Tiles drop once stepped on (the server does this in multiplayer).
    if (this.state.grounded && this.state.groundTile >= 0) this.pw.stepOnTile(this.state.groundTile, this.tick);

    const s = this.state;
    const feetY = s.py - CHAR.centerHeight;
    if (s.py < this.map.killY) {
      this.respawn();
      return;
    }
    if (this.map.type !== 'race') return;
    this.checkpoint = reachCheckpoint(this.map, s.px, feetY, s.pz, this.checkpoint);
    if (this.phase === 'countdown' && this.tick >= COUNTDOWN_TICKS) {
      this.phase = 'running';
      this.startTick = this.tick;
      this.hud.showBanner('GO!', 'go', 900);
    }
    if (this.phase === 'running' && this.map.finish && inZone(this.map.finish, s.px, feetY, s.pz)) {
      this.phase = 'finished';
      const t = (this.tick - this.startTick) * DT;
      this.hud.showBanner('FINISHED!', 'good', 0, `Your time: ${formatTime(t)}.${Math.floor((t % 1) * 10)}`);
    }
  }

  frame(dt: number) {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.fixedStep();
    }
    const a = this.acc / DT;
    const s = this.state, p = this.prev;
    this.focus.set(p.px + (s.px - p.px) * a, p.py + (s.py - p.py) * a - CHAR.centerHeight, p.pz + (s.pz - p.pz) * a);

    if (this.phase === 'countdown') {
      const n = Math.ceil((COUNTDOWN_TICKS - this.tick) / 30);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        this.hud.showBanner(String(n), 'count', 900);
      }
      this.hud.setTimer(this.map.timeLimit);
    } else if (this.phase === 'running') {
      this.hud.setTimer(this.map.timeLimit - (this.tick - this.startTick) * DT);
    }

    let e = this.attract ? 0 : this.input.takeEmote();
    if (this.attract) {
      this.attractT += dt;
      this.cam.yaw += dt * 0.12;
      this.cam.pitch = 0.16;
      this.cam.distance = 5.2;
      if (this.attractT > 4.5) { this.attractT = 0; e = 1 + Math.floor(Math.random() * 4); }
    }
    if (e) { this.emote = e; this.emoteT = 0; }
    this.emoteT += dt;
    if (this.emoteT > 2.6 || Math.hypot(s.vx, s.vz) > 1 || !s.grounded) this.emote = 0;
    const pose = this.pose;
    pose.x = this.focus.x; pose.y = this.focus.y; pose.z = this.focus.z;
    pose.yaw = lerpAngle(p.yaw, s.yaw, a);
    pose.vx = s.vx; pose.vy = s.vy; pose.vz = s.vz;
    pose.mode = s.mode; pose.grounded = s.grounded;
    pose.emote = this.emote; pose.emoteT = this.emoteT;
    pose.groundY = this.focus.y;
    this.chars.beginFrame(dt);
    this.chars.update(0, pose, dt);
    for (const x of this.extras) this.chars.update(x.slot, x.pose, dt);
    this.view.update(this.tick - 1 + a, dt, this.pw);
    this.cam.update(dt, this.focus, this.attract ? [0, 0] : this.input.takeLook(), this.attract ? 0 : this.input.zoomDelta, this.pw);
    this.input.zoomDelta = 0;
    this.env.update(dt, this.focus);
  }

  dispose() {
    this.r.scene.remove(this.view.group, this.chars.group);
    this.chars.dispose();
    this.view.dispose();
    this.env.dispose();
    this.hud.dispose();
    this.pw.free();
  }
}
