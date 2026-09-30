import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { QUERY_STATIC, clamp, type PhysicsWorld } from '@sp/shared';

const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

/** Third-person orbit camera with smoothing and wall avoidance. */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  distance = 7;
  private readonly target = new THREE.Vector3();
  private readonly smoothTarget = new THREE.Vector3();
  private curDist = 7;
  private initialized = false;
  private kick = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Adds a short FOV punch (dives, bounce pads). */
  punch(amount: number) {
    this.kick = Math.max(this.kick, amount);
  }

  snap() {
    this.initialized = false;
  }

  update(dt: number, focus: THREE.Vector3, look: [number, number], zoom: number, world: PhysicsWorld | null) {
    this.yaw -= look[0];
    this.pitch = clamp(this.pitch + look[1], -0.35, 1.25);
    this.distance = clamp(this.distance + zoom * 0.8, 4, 12);

    this.target.set(focus.x, focus.y + 1.05, focus.z);
    if (!this.initialized) {
      this.smoothTarget.copy(this.target);
      this.curDist = this.distance;
      this.initialized = true;
    } else {
      // Critically-damped follow: tight horizontally, softer vertically so jumps don't jolt the view.
      const kh = 1 - Math.exp(-dt * 18);
      const kv = 1 - Math.exp(-dt * 9);
      this.smoothTarget.x += (this.target.x - this.smoothTarget.x) * kh;
      this.smoothTarget.z += (this.target.z - this.smoothTarget.z) * kh;
      this.smoothTarget.y += (this.target.y - this.smoothTarget.y) * kv;
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = sp, dz = -Math.cos(this.yaw) * cp;
    let want = this.distance;
    if (world) {
      _ray.origin = { x: this.smoothTarget.x, y: this.smoothTarget.y, z: this.smoothTarget.z };
      _ray.dir = { x: dx, y: dy, z: dz };
      const hit = world.world.castRay(_ray, want, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_STATIC);
      if (hit) want = Math.max(1.2, hit.timeOfImpact - 0.35);
    }
    // Pull in fast when blocked, ease back out slowly.
    this.curDist += (want - this.curDist) * (want < this.curDist ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 3));

    const cam = this.camera;
    cam.position.set(
      this.smoothTarget.x + dx * this.curDist,
      this.smoothTarget.y + dy * this.curDist,
      this.smoothTarget.z + dz * this.curDist,
    );
    cam.lookAt(this.smoothTarget);
    this.kick *= Math.exp(-dt * 6);
    const fov = 68 + this.kick * 10;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
