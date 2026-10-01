import * as THREE from 'three';
import { PALETTE } from '@sp/shared';
import type { QualityProfile } from './quality';

interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number }
interface Bit {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  rx: number; ry: number; wx: number; wy: number; age: number; life: number; c: THREE.Color;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/** Pooled, instanced particles: landing dust and confetti. Two draw calls in total. */
export class Effects {
  readonly group = new THREE.Group();
  private readonly puffMesh: THREE.InstancedMesh;
  private readonly bitMesh: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private readonly bits: Bit[] = [];
  private readonly maxPuffs: number;
  private readonly maxBits: number;
  private readonly colors = PALETTE.filter((p) => p.name !== 'Charcoal' && p.name !== 'Cocoa').map((p) => new THREE.Color(p.hex));

  constructor(profile: QualityProfile) {
    this.maxPuffs = Math.max(24, Math.round(profile.particles * 0.4));
    this.maxBits = Math.max(80, profile.particles * 2);
    this.puffMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8c97b8, emissiveIntensity: 0.45, transparent: true, opacity: 0.8, depthWrite: false }),
      this.maxPuffs,
    );
    const bitGeo = new THREE.PlaneGeometry(0.16, 0.09);
    this.bitMesh = new THREE.InstancedMesh(
      bitGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      this.maxBits,
    );
    for (const m of [this.puffMesh, this.bitMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    for (let i = 0; i < this.maxBits; i++) this.bitMesh.setColorAt(i, this.colors[i % this.colors.length]);
  }

  /** A ring of dust at someone's feet (landing, diving). */
  dust(x: number, y: number, z: number, strength = 1) {
    const n = Math.round(4 + strength * 4);
    for (let i = 0; i < n && this.puffs.length < this.maxPuffs; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 1.2 + Math.random() * 1.6 * strength;
      this.puffs.push({
        x: x + Math.cos(a) * 0.3, y: y + 0.1, z: z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp, vy: 0.6 + Math.random() * 0.8, vz: Math.sin(a) * sp,
        age: 0, life: 0.45 + Math.random() * 0.25, size: 0.35 + Math.random() * 0.3 * strength,
      });
    }
  }

  /** A burst of confetti (qualified, winner). */
  confetti(x: number, y: number, z: number, count = 90, spread = 1) {
    for (let i = 0; i < count && this.bits.length < this.maxBits; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 5 + Math.random() * 6;
      const out = (1 + Math.random() * 3.5) * spread;
      this.bits.push({
        x, y, z, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out,
        rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 18, wy: (Math.random() - 0.5) * 18,
        age: 0, life: 2.6 + Math.random() * 1.4, c: this.colors[Math.floor(Math.random() * this.colors.length)],
      });
    }
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) { this.puffs.splice(i, 1); continue; }
      const drag = Math.exp(-dt * 5);
      p.vx *= drag; p.vz *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.age / p.life;
      const s = p.size * (k < 0.25 ? 0.5 + k * 2 : 1) * (1 - k * k);
      this.puffMesh.setMatrixAt(n++, _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.setScalar(s)));
    }
    this.puffMesh.count = n;
    this.puffMesh.instanceMatrix.needsUpdate = true;

    n = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.age += dt;
      if (b.age >= b.life) { this.bits.splice(i, 1); continue; }
      b.vy -= 9 * dt;
      const drag = Math.exp(-dt * (b.vy < 0 ? 2.6 : 0.6));
      b.vx *= drag; b.vz *= drag;
      if (b.vy < -2.2) b.vy = -2.2; // flutter down
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.rx += b.wx * dt; b.ry += b.wy * dt;
      const fade = b.life - b.age < 0.4 ? (b.life - b.age) / 0.4 : 1;
      _q.setFromEuler(_e.set(b.rx, b.ry, 0));
      this.bitMesh.setColorAt(n, b.c);
      this.bitMesh.setMatrixAt(n++, _m.compose(_p.set(b.x, b.y, b.z), _q, _s.setScalar(fade)));
    }
    for (let i = n; i < this.bitMesh.count; i++) this.bitMesh.setMatrixAt(i, _zero);
    this.bitMesh.count = n;
    this.bitMesh.instanceMatrix.needsUpdate = true;
    if (this.bitMesh.instanceColor) this.bitMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.puffMesh.geometry.dispose();
    this.bitMesh.geometry.dispose();
    (this.puffMesh.material as THREE.Material).dispose();
    (this.bitMesh.material as THREE.Material).dispose();
  }
}
