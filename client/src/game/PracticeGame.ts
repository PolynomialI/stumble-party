import * as THREE from 'three';
import {
  CHAR, CharState, DT, PhysicsWorld, resolveObstacleHits, spawnPoints, stepCharacter, lerpAngle,
  type InputCmd, type MapDef,
} from '@sp/shared';
import type { Input } from '../input/Input';
import { CameraRig } from '../render/CameraRig';
import { Environment } from '../render/environment';
import { MapView } from '../render/MapView';
import type { GameRenderer } from '../render/Renderer';

/** Placeholder body until the real character renderer lands. */
function placeholderCharacter(r: GameRenderer) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(CHAR.radius, CHAR.halfHeight * 2, 8, 20), r.mats.get({ color: 0xff5a8a, roughness: 0.3 }));
  body.castShadow = r.profile.shadows;
  g.add(body);
  for (const x of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), r.mats.get({ color: 0xffffff }));
    eye.position.set(x, 0.3, 0.36);
    g.add(eye);
  }
  return g;
}

/** Offline play on one map: the same shared simulation the server runs, stepped locally. */
export class PracticeGame {
  readonly pw: PhysicsWorld;
  readonly state = new CharState();
  private readonly prev = new CharState();
  private readonly view: MapView;
  private readonly env: Environment;
  readonly cam: CameraRig;
  private readonly body: THREE.Group;
  private readonly cmd: InputCmd = { mx: 0, mz: 0, buttons: 0 };
  private readonly focus = new THREE.Vector3();
  private tick = 0;
  private acc = 0;

  constructor(private readonly r: GameRenderer, private readonly input: Input, readonly map: MapDef) {
    this.pw = new PhysicsWorld(map);
    this.pw.setTime(0);
    this.view = new MapView(map, r.mats, r.profile);
    r.scene.add(this.view.group);
    this.env = new Environment(r.scene, r.renderer, map.theme, r.profile, map.killY);
    this.cam = new CameraRig(r.camera);
    this.body = placeholderCharacter(r);
    r.scene.add(this.body);
    this.respawn();
  }

  private respawn() {
    const s = spawnPoints(this.map, 1)[0];
    this.state.spawn(s.x, s.y, s.z, s.yaw);
    this.prev.copyFrom(this.state);
    this.cam.yaw = s.yaw;
    this.cam.snap();
  }

  private fixedStep() {
    this.prev.copyFrom(this.state);
    this.input.sample(this.cam.yaw, this.cmd);
    stepCharacter(this.pw, this.state, this.cmd);
    this.tick++;
    this.pw.setTime(this.tick);
    resolveObstacleHits(this.pw, this.state);
    if (this.state.py < this.map.killY) this.respawn();
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
    this.body.position.set(this.focus.x, this.focus.y + CHAR.centerHeight, this.focus.z);
    this.body.rotation.y = lerpAngle(p.yaw, s.yaw, a);
    this.view.update(this.tick - 1 + a, dt, this.pw);
    this.cam.update(dt, this.focus, this.input.takeLook(), this.input.zoomDelta, this.pw);
    this.input.zoomDelta = 0;
    this.env.update(dt, this.focus);
  }

  dispose() {
    this.r.scene.remove(this.view.group, this.body);
    this.view.dispose();
    this.env.dispose();
    this.pw.free();
  }
}
