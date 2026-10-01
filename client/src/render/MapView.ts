import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  DT, hillAt, killYAt, newPose, obstaclePose, type MapDef, type MatKey, type Piece, type PhysicsWorld, type Tex,
} from '@sp/shared';
import { normalizeAttributes, pieceGeometry } from './geometry';
import type { MaterialLib, ToyOptions } from './materials';
import type { QualityProfile } from './quality';
import { TEX_SCALE } from './textures';
import { Decor } from './decor';

const DEFAULT_TEX: Partial<Record<MatKey, Tex>> = {
  floor: 'grid', floorAlt: 'grid', hazard: 'stripes', conveyor: 'chevron', finish: 'checker', wood: 'planks',
};

const MAT_LOOK: Partial<Record<MatKey, Partial<ToyOptions>>> = {
  metal: { roughness: 0.22 },
  ice: { roughness: 0.08 },
  rock: { roughness: 0.75 },
  bounce: { roughness: 0.25 },
  bumper: { roughness: 0.2 },
  wood: { roughness: 0.6 },
  leaf: { roughness: 0.65 },
  snow: { roughness: 0.55 },
  gold: { roughness: 0.14, emissive: 0x7a4a00, emissiveIntensity: 0.35 },
  lava: { roughness: 0.5, emissive: 0xff4a10, emissiveIntensity: 0.9 },
};

const FLOOR_TEX = new Set<Tex>(['grid', 'planks']);

function texOf(p: Piece): Tex {
  return p.tex ?? DEFAULT_TEX[p.mat] ?? 'none';
}

interface ObstacleView {
  index: number;
  obj: THREE.Group;
}

interface TileGroup {
  mesh: THREE.InstancedMesh;
  tiles: number[];
  base: THREE.Matrix4[];
  colors: THREE.Color[];
}

interface Belt {
  tex: THREE.Texture;
  speed: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const SHAKE_TINT = new THREE.Color(0xfff1c9);

/** Renders a MapDef: merged statics, moving obstacles, and instanced falling tiles. */
export class MapView {
  readonly group = new THREE.Group();
  private readonly obstacles: ObstacleView[] = [];
  private readonly tileGroups: TileGroup[] = [];
  private readonly belts: Belt[] = [];
  private readonly pose = newPose();
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly decor: Decor;
  private sea: THREE.Mesh | null = null;
  private hill: THREE.Group | null = null;

  constructor(readonly map: MapDef, private readonly mats: MaterialLib, private readonly profile: QualityProfile) {
    this.buildStatics();
    this.buildObstacles();
    this.buildTiles();
    this.decor = new Decor(map, mats, profile);
    this.group.add(this.decor.group);
    this.buildSea();
    this.buildHill();
  }

  /** Water or lava under the course: one big sheet (lava rises with the map's kill height). */
  private buildSea() {
    const sea = this.map.sea;
    if (!sea) return;
    const lava = sea.mat === 'lava';
    const mat = new THREE.MeshLambertMaterial({
      color: this.map.theme.palette[sea.mat],
      emissive: lava ? 0xff3a00 : 0x0a3a66,
      emissiveIntensity: lava ? 0.85 : 0.25,
      transparent: !lava,
      opacity: lava ? 1 : 0.86,
    });
    this.ownedMaterials.push(mat);
    const zs = this.map.pieces.map((p) => p.pos[2]);
    const mid = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    const geo = new THREE.PlaneGeometry(700, 700 + (zs.length ? Math.max(...zs) - Math.min(...zs) : 0), 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(geo, mat);
    this.sea.position.set(0, sea.y, mid);
    this.group.add(this.sea);
  }

  /** The scoring zone of a points round: a glowing ring and a soft column of light. */
  private buildHill() {
    const hill = this.map.hill;
    if (!hill) return;
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(hill.r, 0.16, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe14d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(hill.r, hill.r, 7, 40, 1, true), beamMat);
    beam.position.y = 3.5;
    this.ownedMaterials.push(ringMat, beamMat);
    g.add(ring, beam);
    this.hill = g;
    this.group.add(g);
  }

  private material(p: Piece): THREE.Material {
    const tex = texOf(p);
    return this.mats.get({ color: this.map.theme.palette[p.mat], tex: tex === 'none' ? undefined : tex, ...MAT_LOOK[p.mat] });
  }

  private buildStatics() {
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.map.pieces) {
      if (p.visible === false) continue;
      if (p.surface === 'conveyor') {
        this.addBelt(p);
        continue;
      }
      const g = pieceGeometry(p, this.profile, TEX_SCALE[texOf(p)], FLOOR_TEX.has(texOf(p)));
      const mat = this.material(p);
      const list = buckets.get(mat) ?? [];
      list.push(normalizeAttributes(g));
      buckets.set(mat, list);
    }
    for (const [mat, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = this.profile.shadows;
      mesh.castShadow = this.profile.shadows && this.profile.shadowMapSize >= 2048;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  /** Conveyors get their own material so the chevrons can scroll along the belt. */
  private addBelt(p: Piece) {
    const g = normalizeAttributes(pieceGeometry(p, this.profile, TEX_SCALE.chevron));
    const base = this.material({ ...p, tex: 'chevron' }) as THREE.MeshStandardMaterial;
    const mat = base.clone();
    mat.onBeforeCompile = base.onBeforeCompile;
    mat.customProgramCacheKey = base.customProgramCacheKey;
    this.ownedMaterials.push(mat);
    const dir = new THREE.Vector3(...(p.dir ?? [0, 0, 1])).applyEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0])));
    if (mat.map) {
      const tex = mat.map.clone();
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.atan2(-dir.x, dir.z);
      mat.map = tex;
      this.belts.push({ tex, speed: (p.power ?? 3) / TEX_SCALE.chevron });
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = this.profile.shadows;
    this.group.add(mesh);
  }

  private buildObstacles() {
    this.map.obstacles.forEach((def, index) => {
      const obj = new THREE.Group();
      const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
      for (const p of def.parts) {
        if (p.visible === false) continue;
        const g = pieceGeometry(p, this.profile, TEX_SCALE[texOf(p)], FLOOR_TEX.has(texOf(p)));
        const mat = this.material(p);
        const list = buckets.get(mat) ?? [];
        list.push(normalizeAttributes(g));
        buckets.set(mat, list);
      }
      for (const [mat, geos] of buckets) {
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = this.profile.shadows;
        mesh.receiveShadow = this.profile.shadows;
        obj.add(mesh);
      }
      this.obstacles.push({ index, obj });
      this.group.add(obj);
    });
  }

  private buildTiles() {
    const groups = new Map<string, number[]>();
    this.map.tiles.forEach((t, i) => {
      const p = t.piece;
      const key = JSON.stringify([p.shape, p.size, p.round ?? 0, texOf(p)]);
      const list = groups.get(key) ?? [];
      list.push(i);
      groups.set(key, list);
    });
    for (const tiles of groups.values()) {
      const first = this.map.tiles[tiles[0]].piece;
      const g = normalizeAttributes(pieceGeometry({ ...first, pos: [0, 0, 0], rot: [0, 0, 0] }, this.profile, TEX_SCALE[texOf(first)], FLOOR_TEX.has(texOf(first))));
      const mat = this.mats.get({ color: 0xffffff, tex: texOf(first) === 'none' ? undefined : texOf(first) });
      const mesh = new THREE.InstancedMesh(g, mat, tiles.length);
      mesh.castShadow = this.profile.shadows;
      mesh.receiveShadow = this.profile.shadows;
      const base: THREE.Matrix4[] = [];
      const colors: THREE.Color[] = [];
      tiles.forEach((ti, k) => {
        const p = this.map.tiles[ti].piece;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(...p.pos),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
          new THREE.Vector3(1, 1, 1),
        );
        base.push(m);
        mesh.setMatrixAt(k, m);
        const col = new THREE.Color(this.map.theme.palette[p.mat]);
        colors.push(col);
        mesh.setColorAt(k, col);
      });
      mesh.computeBoundingSphere();
      this.tileGroups.push({ mesh, tiles, base, colors });
      this.group.add(mesh);
    }
  }

  /**
   * Poses everything for render time `tick` (fractional, round-relative). Obstacles come straight from the shared
   * time functions; tile animation reads trigger ticks from the physics world.
   */
  update(tick: number, dt: number, pw: PhysicsWorld | null) {
    const t = tick * DT;
    for (const o of this.obstacles) {
      obstaclePose(this.map.obstacles[o.index], t, this.pose);
      o.obj.position.set(this.pose.pos[0], this.pose.pos[1], this.pose.pos[2]);
      o.obj.quaternion.set(this.pose.rot[0], this.pose.rot[1], this.pose.rot[2], this.pose.rot[3]);
    }
    for (const b of this.belts) b.tex.offset.y -= b.speed * dt;
    this.decor.update(dt);
    if (this.sea) {
      this.sea.position.y = (this.map.lava ? killYAt(this.map, t) + 0.5 : this.map.sea!.y) + Math.sin(t * 1.3) * 0.12;
    }
    if (this.hill) {
      const c = hillAt(this.map, t)!;
      this.hill.position.set(c[0], c[1], c[2]);
      const left = this.map.hill!.hold - (Math.max(0, t) % this.map.hill!.hold);
      // Blink for the last two seconds before the zone moves.
      this.hill.visible = left > 2 || Math.floor(t * 6) % 2 === 0;
      this.hill.children[0].scale.setScalar(1 + Math.sin(t * 4) * 0.03);
    }
    if (pw) this.updateTiles(tick, pw);
  }

  private updateTiles(tick: number, pw: PhysicsWorld) {
    for (const g of this.tileGroups) {
      let dirty = false;
      g.tiles.forEach((ti, k) => {
        const rt = pw.tiles[ti];
        const fall = pw.tileFallTick(rt);
        const trigger = rt.fallTick >= 0 ? rt.fallTick - rt.shakeTicks : rt.triggerTick;
        let state: 'idle' | 'shake' | 'fall' | 'gone' | 'back' = 'idle';
        let since = 0;
        if (fall >= 0 && tick >= trigger) {
          if (tick < fall) { state = 'shake'; since = (tick - trigger) * DT; }
          else if (rt.respawnTicks >= 0 && rt.fallTick < 0 && tick >= fall + rt.respawnTicks) {
            state = 'back'; since = (tick - fall - rt.respawnTicks) * DT;
          } else if (tick < fall + 1.4 / DT) { state = 'fall'; since = (tick - fall) * DT; }
          else state = 'gone';
        }
        if (state === 'idle' && !g.mesh.userData.touched) return;
        g.base[k].decompose(_p, _q, _s);
        _c.copy(g.colors[k]);
        switch (state) {
          case 'shake': {
            const amp = 0.05 + since * 0.06;
            _p.x += Math.sin(tick * 2.7 + ti) * amp;
            _p.z += Math.cos(tick * 3.1 + ti * 1.7) * amp;
            _c.lerp(SHAKE_TINT, 0.35 + 0.25 * Math.sin(tick * 1.3));
            break;
          }
          case 'fall': {
            _p.y -= 0.5 * 22 * since * since;
            _q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(since * 1.2, 0, since * 0.8)));
            _s.setScalar(Math.max(0.01, 1 - since * 0.5));
            break;
          }
          case 'gone':
            _s.setScalar(0);
            break;
          case 'back': {
            const k2 = Math.min(1, since / 0.35);
            _s.setScalar(k2 < 1 ? 0.2 + 0.8 * (1 - Math.pow(1 - k2, 3)) * (1 + Math.sin(k2 * Math.PI) * 0.15) : 1);
            break;
          }
          default:
            break;
        }
        g.mesh.setMatrixAt(k, _m.compose(_p, _q, _s));
        g.mesh.setColorAt(k, _c);
        g.mesh.userData.touched = true;
        dirty = true;
      });
      if (dirty) {
        g.mesh.instanceMatrix.needsUpdate = true;
        if (g.mesh.instanceColor) g.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose() {
    this.decor.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.ownedMaterials.forEach((m) => m.dispose());
    this.belts.forEach((b) => b.tex.dispose());
  }
}
