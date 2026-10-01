import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, hashString, rng, type MapDef } from '@sp/shared';
import type { MaterialLib } from './materials';
import type { QualityProfile } from './quality';

interface Balloon {
  x: number;
  y: number;
  z: number;
  phase: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Lumpy rock with a flat top and a pointed underside: a floating sky island. */
function islandGeometry(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('normal').deleteAttribute('uv'));
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 0.85 + r() * 0.3;
    x *= n; z *= n;
    y = y > 0 ? y * 0.25 : y * (1.6 + r() * 0.4);
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Background life for a map: floating islands (some with trees) and clusters of bobbing balloons.
 * Purely visual and fully instanced (six draw calls), placed deterministically per map.
 */
export class Decor {
  readonly group = new THREE.Group();
  private readonly balloonMesh: THREE.InstancedMesh;
  private readonly stringMesh: THREE.InstancedMesh;
  private readonly balloons: Balloon[] = [];
  private time = 0;

  constructor(map: MapDef, mats: MaterialLib, profile: QualityProfile) {
    const r = rng(hashString(map.id));
    // Course bounds from its pieces.
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, ySum = 0, yN = 0;
    for (const p of [...map.pieces, ...map.tiles.map((t) => t.piece)]) {
      x0 = Math.min(x0, p.pos[0]); x1 = Math.max(x1, p.pos[0]);
      z0 = Math.min(z0, p.pos[2]); z1 = Math.max(z1, p.pos[2]);
      ySum += p.pos[1]; yN++;
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = yN ? ySum / yN : 0;
    const rx = (x1 - x0) / 2 + 10, rz = (z1 - z0) / 2 + 10;

    // Islands.
    const islands = profile.clouds >= 48 ? 12 : 7;
    const rockMat = mats.get({ color: map.theme.palette.rock, roughness: 0.8 });
    const grassMat = mats.get({ color: map.theme.palette.grass, roughness: 0.55 });
    const trunkMat = mats.get({ color: 0x9b6a43, roughness: 0.7 });
    const leafMat = mats.get({ color: 0x46c06a, roughness: 0.45 });
    const rock = new THREE.InstancedMesh(islandGeometry(hashString(map.id) + 1), rockMat, islands);
    const grassGeo = new THREE.CylinderGeometry(1, 0.92, 0.14, 18);
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, islands);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 0.6, 8), trunkMat, islands);
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), leafMat, islands);
    let trees = 0;
    for (let i = 0; i < islands; i++) {
      const a = (i / islands) * Math.PI * 2 + r() * 0.5;
      // Well clear of the course and below it, so nobody mistakes an island for somewhere to land.
      const dist = 1.55 + r() * 1.4;
      const x = cx + Math.cos(a) * rx * dist + (r() - 0.5) * 20;
      const z = cz + Math.sin(a) * rz * dist + (r() - 0.5) * 20;
      const y = cy - 26 + r() * 17;
      const s = 6 + r() * 9;
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      rock.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(s, s * 0.9, s)));
      grass.setMatrixAt(i, _m.compose(_p.set(x, y + s * 0.25 + 0.03, z), _q, _s.set(s * 0.93, s * 0.9, s * 0.93)));
      if (r() < 0.7) {
        const tx = x + (r() - 0.5) * s * 0.8, tz = z + (r() - 0.5) * s * 0.8, ty = y + s * 0.25 + 0.1;
        const k = s * 0.32;
        trunk.setMatrixAt(trees, _m.compose(_p.set(tx, ty + 0.3 * k, tz), _q.identity(), _s.setScalar(k)));
        leaves.setMatrixAt(trees, _m.compose(_p.set(tx, ty + 0.85 * k, tz), _q.identity(), _s.set(k, k * 1.15, k)));
        trees++;
      }
    }
    trunk.count = leaves.count = trees;
    for (const m of [rock, grass, trunk, leaves]) {
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
    }

    // Balloon clusters drifting beside the course.
    const clusters = profile.clouds >= 48 ? 9 : 5;
    const perCluster = 4;
    const n = clusters * perCluster;
    const balloonGeo = new THREE.SphereGeometry(0.55, 16, 12).scale(1, 1.18, 1);
    this.balloonMesh = new THREE.InstancedMesh(balloonGeo, mats.get({ color: 0xffffff, roughness: 0.12, clearcoat: true }), n);
    this.stringMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 2.2, 4), mats.get({ color: 0xf4f4f4 }), n);
    const colors = PALETTE.filter((p) => !['Charcoal', 'Cocoa', 'Pebble'].includes(p.name));
    for (let c = 0; c < clusters; c++) {
      const side = c % 2 === 0 ? -1 : 1;
      const along = (c / Math.max(1, clusters - 1)) * 2 - 1;
      const bx = cx + side * (rx + 4 + r() * 8);
      const bz = cz + along * rz;
      const by = cy + 5 + r() * 8;
      for (let k = 0; k < perCluster; k++) {
        this.balloons.push({ x: bx + (r() - 0.5) * 1.8, y: by + (r() - 0.5) * 1.2, z: bz + (r() - 0.5) * 1.8, phase: r() * 6.28 });
        this.balloonMesh.setColorAt(this.balloons.length - 1, new THREE.Color(colors[Math.floor(r() * colors.length)].hex));
      }
    }
    this.balloonMesh.frustumCulled = false;
    this.stringMesh.frustumCulled = false;
    this.group.add(this.balloonMesh, this.stringMesh);
    this.update(0);
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    this.balloons.forEach((b, i) => {
      const y = b.y + Math.sin(t * 0.9 + b.phase) * 0.35;
      const sway = Math.sin(t * 0.7 + b.phase * 1.3) * 0.12;
      _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway);
      this.balloonMesh.setMatrixAt(i, _m.compose(_p.set(b.x, y, b.z), _q, _s.setScalar(1)));
      this.stringMesh.setMatrixAt(i, _m.compose(_p.set(b.x + sway * 0.9, y - 1.75, b.z), _q, _s.setScalar(1)));
    });
    this.balloonMesh.instanceMatrix.needsUpdate = true;
    this.stringMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
