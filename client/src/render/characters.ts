import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  MAX_PLAYERS, MODE_DIVE, MODE_GETUP, MODE_SLIDE, MODE_STUN, PALETTE, clamp, type Look,
} from '@sp/shared';
import type { MaterialLib } from './materials';
import type { QualityProfile } from './quality';
import { roundedCylinder } from './geometry';
import { blobShadowTexture } from './textures';

/** Everything the renderer needs to pose one character this frame. */
export interface CharPose {
  x: number;
  y: number; // feet
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  mode: number;
  grounded: boolean;
  /** Emote id (0 = none) and seconds since it started. */
  emote: number;
  emoteT: number;
  /** Height of the ground under the character (for the blob shadow), or NaN if none. */
  groundY: number;
  /** Carrying a bomb (tag rounds). */
  it?: boolean;
}

type ColorMode = 'main' | 'accent' | number;

interface PartSpec {
  geo: THREE.BufferGeometry;
  color: ColorMode;
  roughness?: number;
  emissive?: number;
  basic?: boolean;
  perPlayer: number;
  shadow?: boolean;
}

const PINK = 0xff9ab8;
const WHITE = 0xffffff;
const DARK = 0x1c1a2e;
const GOLD = 0xffd54a;

function lathe(profile: [number, number][], segments: number) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(28).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  const g = new THREE.LatheGeometry(pts, segments);
  g.computeVertexNormals();
  return g;
}

function sphere(r: number, sx: number, sy: number, sz: number, seg: number) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.66)));
  g.scale(sx, sy, sz);
  return g;
}

function mergeClean(parts: THREE.BufferGeometry[]) {
  for (const p of parts) {
    for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k);
    if (!p.index) p.setIndex([...Array(p.getAttribute('position').count).keys()]);
  }
  return mergeGeometries(parts)!;
}

/**
 * Hats are lists of (part, offset from head centre). Parts are shared across hats so each unique mesh is one
 * instanced draw call for the whole lobby.
 */
interface HatPiece {
  part: string;
  pos: [number, number, number];
  rot?: [number, number, number];
  scale?: number;
  spin?: boolean;
}

const HAT_DEFS: HatPiece[][] = [
  [],
  // Party hat
  [{ part: 'cone', pos: [0.02, 0.5, 0], rot: [0, 0, -0.12] }, { part: 'pom', pos: [0.07, 0.75, 0] }],
  // Beanie
  [{ part: 'cap', pos: [0, 0.16, 0] }, { part: 'band', pos: [0, 0.17, 0] }, { part: 'pom', pos: [0, 0.47, 0], scale: 1.3 }],
  // Top hat
  [{ part: 'brim', pos: [0, 0.33, 0], rot: [0, 0, 0.08] }, { part: 'crown', pos: [0.02, 0.55, 0], rot: [0, 0, 0.08] }, { part: 'hatband', pos: [0.012, 0.42, 0], rot: [0, 0, 0.08] }],
  // Propeller cap
  [{ part: 'cap', pos: [0, 0.16, 0] }, { part: 'stem', pos: [0, 0.52, 0] }, { part: 'blades', pos: [0, 0.66, 0], spin: true }, { part: 'visor', pos: [0, 0.18, 0.3] }],
  // Flower
  [{ part: 'petals', pos: [0.26, 0.28, 0.12], rot: [0.3, 0, -0.7] }, { part: 'bud', pos: [0.28, 0.3, 0.14], rot: [0.3, 0, -0.7] }],
  // Antenna
  [{ part: 'stem', pos: [0, 0.52, 0] }, { part: 'bulb', pos: [0, 0.72, 0] }],
  // Bunny ears
  [{ part: 'ear', pos: [-0.16, 0.55, 0], rot: [0, 0, 0.18] }, { part: 'ear', pos: [0.16, 0.55, 0], rot: [0, 0, -0.18] },
    { part: 'earInner', pos: [-0.16, 0.55, 0.035], rot: [0, 0, 0.18] }, { part: 'earInner', pos: [0.16, 0.55, 0.035], rot: [0, 0, -0.18] }],
  // Cat ears
  [{ part: 'catEar', pos: [-0.22, 0.36, 0], rot: [0, 0, 0.45] }, { part: 'catEar', pos: [0.22, 0.36, 0], rot: [0, 0, -0.45] }],
  // Halo
  [{ part: 'halo', pos: [0, 0.62, 0], rot: [0.15, 0, 0] }],
];

function buildParts(q: QualityProfile): Record<string, PartSpec> {
  const seg = q.cylinderSegments;
  const body = lathe([
    [0, 0.13], [0.26, 0.15], [0.37, 0.22], [0.415, 0.34], [0.415, 0.48], [0.39, 0.63], [0.34, 0.77],
    [0.27, 0.89], [0.17, 0.97], [0, 1.0],
  ], seg);
  const arm = new THREE.CapsuleGeometry(0.085, 0.24, 6, Math.max(10, seg / 3));
  arm.translate(0, -0.12, 0);
  const petals = mergeClean([0, 1, 2, 3, 4].map((i) => {
    const g = sphere(0.075, 1, 0.45, 1.35, 12);
    g.translate(0, 0, 0.09);
    g.rotateY((i / 5) * Math.PI * 2);
    return g;
  }));
  petals.rotateX(Math.PI / 2);
  const blades = mergeClean([0, 1].map((i) => {
    const g = sphere(0.16, 1, 0.12, 0.28, 12);
    g.translate(0.16, 0, 0);
    g.rotateY(i * Math.PI);
    return g;
  }));
  const band = new THREE.TorusGeometry(0.405, 0.05, 10, Math.max(20, seg));
  band.rotateX(Math.PI / 2);
  const halo = new THREE.TorusGeometry(0.21, 0.035, 10, Math.max(20, seg));
  halo.rotateX(Math.PI / 2);
  const mouth = new THREE.TorusGeometry(0.06, 0.019, 8, 16, Math.PI);
  mouth.rotateZ(Math.PI);
  const visor = sphere(0.2, 1, 0.12, 0.8, 16);
  visor.rotateX(0.15);

  return {
    body: { geo: body, color: 'main', perPlayer: 1, shadow: true },
    head: { geo: sphere(0.4, 1, 0.94, 0.97, seg), color: 'main', perPlayer: 1, shadow: true },
    eye: { geo: sphere(0.125, 0.82, 1.1, 0.5, 16), color: WHITE, roughness: 0.12, perPlayer: 2 },
    pupil: { geo: sphere(0.075, 0.85, 1.12, 0.5, 14), color: DARK, roughness: 0.08, perPlayer: 2 },
    sparkle: { geo: sphere(0.026, 1, 1, 0.5, 8), color: WHITE, basic: true, perPlayer: 2 },
    mouth: { geo: mouth, color: 0x5a1f35, roughness: 0.5, perPlayer: 1 },
    blush: { geo: sphere(0.07, 1, 0.55, 0.3, 12), color: PINK, roughness: 0.7, perPlayer: 2 },
    arm: { geo: arm, color: 'main', perPlayer: 2, shadow: true },
    hand: { geo: sphere(0.105, 1, 1, 1, 14), color: 'accent', perPlayer: 2, shadow: true },
    foot: { geo: sphere(0.15, 0.85, 0.62, 1.22, 16), color: 'accent', perPlayer: 2, shadow: true },
    // Hat parts
    cone: { geo: new THREE.ConeGeometry(0.2, 0.46, Math.max(16, seg / 2)), color: 'accent', perPlayer: 1, shadow: true },
    pom: { geo: sphere(0.075, 1, 1, 1, 14), color: WHITE, roughness: 0.8, perPlayer: 1 },
    cap: { geo: new THREE.SphereGeometry(0.415, seg, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1), color: 'accent', perPlayer: 1, shadow: true },
    band: { geo: band, color: WHITE, roughness: 0.8, perPlayer: 1 },
    brim: { geo: roundedCylinder(0.38, 0.05, 0.02, seg, 2), color: DARK, roughness: 0.3, perPlayer: 1, shadow: true },
    crown: { geo: roundedCylinder(0.23, 0.42, 0.03, seg, 2), color: DARK, roughness: 0.3, perPlayer: 1, shadow: true },
    hatband: { geo: roundedCylinder(0.236, 0.09, 0.01, seg, 1), color: 'accent', perPlayer: 1 },
    stem: { geo: roundedCylinder(0.025, 0.3, 0.01, 8, 1), color: 0x7a8090, roughness: 0.25, perPlayer: 1 },
    blades: { geo: blades, color: 'accent', perPlayer: 1, shadow: true },
    visor: { geo: visor, color: 'accent', perPlayer: 1 },
    petals: { geo: petals, color: PINK, roughness: 0.5, perPlayer: 1 },
    bud: { geo: sphere(0.06, 1, 1, 1, 12), color: GOLD, perPlayer: 1 },
    bulb: { geo: sphere(0.085, 1, 1, 1, 14), color: 'accent', emissive: 0.6, perPlayer: 1 },
    ear: { geo: sphere(0.1, 0.5, 1.9, 0.3, 14), color: 'main', perPlayer: 2, shadow: true },
    earInner: { geo: sphere(0.06, 0.45, 1.6, 0.2, 10), color: PINK, perPlayer: 2 },
    catEar: { geo: new THREE.ConeGeometry(0.12, 0.22, 12), color: 'main', perPlayer: 2, shadow: true },
    halo: { geo: halo, color: GOLD, emissive: 0.5, roughness: 0.15, perPlayer: 1 },
    // Tag rounds: a bomb bobbing over the carrier's head.
    bomb: { geo: sphere(0.3, 1, 1, 1, 16), color: DARK, roughness: 0.25, perPlayer: 1 },
    spark: { geo: sphere(0.09, 1, 1, 1, 8), color: 0xffb300, basic: true, perPlayer: 1 },
  };
}

// Per-part local pivots in character space (feet at origin, facing +Z).
const HEAD_Y = 1.18;
const SHOULDER: [number, number] = [0.37, 0.84];

const PATTERN_VERT = /* glsl */ `
attribute float aPattern;
attribute vec3 aColor2;
varying float vPattern;
varying vec3 vColor2;
varying vec3 vLocal;
`;

const PATTERN_FRAG = /* glsl */ `
float patternMask(vec3 p, float id) {
  if (id < 0.5) return 0.0;
  float ang = atan(p.x, p.z);
  if (id < 1.5) { // stripes
    float s = sin(p.y * 34.0);
    return smoothstep(-0.18, 0.18, s);
  }
  if (id < 2.5) { // dots
    vec2 uv = vec2(ang * 1.35, p.y * 5.2);
    vec2 cell = fract(uv) - 0.5;
    float d = length(cell);
    return 1.0 - smoothstep(0.2, 0.25, d);
  }
  if (id < 3.5) return smoothstep(-0.015, 0.015, p.x); // split
  if (id < 4.5) { // belly
    vec2 b = vec2(p.x / 0.27, (p.y - 0.5) / 0.3);
    return step(0.0, p.z) * (1.0 - smoothstep(0.88, 1.0, length(b)));
  }
  // zigzag band
  float zz = abs(fract(ang * 2.2) - 0.5) * 0.2;
  return 1.0 - smoothstep(0.055, 0.075, abs(p.y - 0.52 - zz + 0.05));
}
`;

const _m = new THREE.Matrix4();
const _root = new THREE.Matrix4();
const _head = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

/** Rig channels, smoothed toward per-state targets each frame. */
const enum R {
  Bob, HeadRx, HeadRz, ArmLrx, ArmLrz, ArmRrx, ArmRrz, FootLz, FootLlift, FootRz, FootRlift, Tilt, FootLrx, FootRrx,
  Hop, Count,
}

class Anim {
  rig = new Float32Array(R.Count);
  target = new Float32Array(R.Count);
  phase = Math.random() * 6;
  squash = 0;
  squashV = 0;
  tumble = new THREE.Quaternion();
  tumbleAxis = new THREE.Vector3(1, 0, 0);
  tumbleSpeed = 0;
  wasGrounded = true;
  wasStun = false;
  blinkIn = 2 + Math.random() * 3;
  blinkT = 0;
  spin = 0;
  propeller = Math.random() * 6;
  visible = false;
  look: Look | null = null;
}

/** Instanced renderer for every character in the match. */
export class CharacterRenderer {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private readonly specs: Record<string, PartSpec>;
  private readonly anims: Anim[] = [];
  private readonly patternAttr: THREE.InstancedBufferAttribute;
  private readonly color2Attr: THREE.InstancedBufferAttribute;
  private readonly shadowMesh: THREE.InstancedMesh | null;
  private time = 0;

  constructor(mats: MaterialLib, profile: QualityProfile) {
    this.specs = buildParts(profile);
    for (let i = 0; i < MAX_PLAYERS; i++) this.anims.push(new Anim());
    const n = MAX_PLAYERS;
    this.patternAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.color2Attr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);

    for (const [name, spec] of Object.entries(this.specs)) {
      const count = n * spec.perPlayer;
      let mat: THREE.Material;
      if (spec.basic) {
        mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      } else if (name === 'body') {
        mat = this.bodyMaterial(mats);
      } else {
        mat = mats.get({
          color: 0xffffff,
          roughness: spec.roughness ?? 0.3,
          clearcoat: spec.color === 'main' || spec.color === 'accent',
          emissive: spec.emissive ? 0xffffff : undefined,
          emissiveIntensity: spec.emissive,
        });
      }
      if (name === 'body') {
        spec.geo.setAttribute('aPattern', this.patternAttr);
        spec.geo.setAttribute('aColor2', this.color2Attr);
      }
      const mesh = new THREE.InstancedMesh(spec.geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = !!spec.shadow && profile.shadows;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      const c = new THREE.Color(typeof spec.color === 'number' ? spec.color : 0xffffff);
      for (let i = 0; i < count; i++) {
        mesh.setMatrixAt(i, _zero);
        mesh.setColorAt(i, c);
      }
      this.meshes.set(name, mesh);
      this.group.add(mesh);
    }

    // Blob contact shadows: always on for low quality, subtle helper on others.
    if (!profile.shadows) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
      this.shadowMesh = new THREE.InstancedMesh(geo, mat, n);
      this.shadowMesh.frustumCulled = false;
      this.shadowMesh.renderOrder = 1;
      for (let i = 0; i < n; i++) this.shadowMesh.setMatrixAt(i, _zero);
      this.group.add(this.shadowMesh);
    } else {
      this.shadowMesh = null;
    }
  }

  private bodyMaterial(mats: MaterialLib): THREE.Material {
    const base = mats.get({ color: 0xffffff, roughness: 0.3, clearcoat: true });
    const m = base.clone() as THREE.MeshStandardMaterial;
    const baseCompile = base.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      baseCompile.call(m, shader, renderer);
      shader.vertexShader = PATTERN_VERT + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPattern = aPattern;\nvColor2 = aColor2;\nvLocal = position;',
      );
      shader.fragmentShader = 'varying float vPattern;\nvarying vec3 vColor2;\nvarying vec3 vLocal;\n' + PATTERN_FRAG +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vColor2, patternMask(vLocal, vPattern));',
        );
    };
    m.customProgramCacheKey = () => 'toy-body';
    return m;
  }

  setLook(slot: number, look: Look) {
    const a = this.anims[slot];
    a.look = look;
    const main = new THREE.Color(PALETTE[look.body].hex);
    const accent = new THREE.Color(PALETTE[look.accent].hex);
    for (const [name, spec] of Object.entries(this.specs)) {
      if (typeof spec.color === 'number') continue;
      const mesh = this.meshes.get(name)!;
      const c = spec.color === 'main' ? main : accent;
      for (let k = 0; k < spec.perPlayer; k++) mesh.setColorAt(slot * spec.perPlayer + k, c);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.patternAttr.setX(slot, look.pattern);
    this.color2Attr.setXYZ(slot, accent.r, accent.g, accent.b);
    this.patternAttr.needsUpdate = true;
    this.color2Attr.needsUpdate = true;
  }

  /** Hides a character (eliminated, qualified or left). */
  hide(slot: number) {
    const a = this.anims[slot];
    if (!a.visible) return;
    a.visible = false;
    for (const [name, spec] of Object.entries(this.specs)) {
      const mesh = this.meshes.get(name)!;
      for (let k = 0; k < spec.perPlayer; k++) mesh.setMatrixAt(slot * spec.perPlayer + k, _zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.shadowMesh?.setMatrixAt(slot, _zero);
  }

  beginFrame(dt: number) {
    this.time += dt;
  }

  /** Animates and poses one character. */
  update(slot: number, p: CharPose, dt: number) {
    const a = this.anims[slot];
    if (!a.look) return;
    a.visible = true;
    const t = this.time;
    const speed = Math.hypot(p.vx, p.vz);
    const run = clamp(speed / 7.2, 0, 1.3);
    const tg = a.target;
    tg.fill(0);

    const diving = p.mode === MODE_DIVE || p.mode === MODE_SLIDE;
    const stunned = p.mode === MODE_STUN;
    const emoting = p.emote > 0 && p.grounded && !diving && !stunned && speed < 1;

    if (stunned) {
      tg[R.ArmLrz] = 1.6 + Math.sin(t * 17) * 0.6;
      tg[R.ArmRrz] = -1.6 - Math.sin(t * 15) * 0.6;
      tg[R.ArmLrx] = Math.sin(t * 13) * 1.2;
      tg[R.ArmRrx] = Math.cos(t * 11) * 1.2;
      tg[R.FootLz] = Math.sin(t * 16) * 0.2;
      tg[R.FootRz] = -Math.sin(t * 16) * 0.2;
      tg[R.FootLlift] = 0.12;
      tg[R.FootRlift] = 0.12;
      tg[R.Tilt] = p.grounded ? -1.35 : 0;
    } else if (diving) {
      tg[R.Tilt] = 1.42;
      tg[R.ArmLrx] = -2.9;
      tg[R.ArmRrx] = -2.9;
      tg[R.ArmLrz] = 0.25;
      tg[R.ArmRrz] = -0.25;
      tg[R.HeadRx] = -0.95;
      tg[R.FootLlift] = 0.05;
      tg[R.FootRlift] = 0.05;
      tg[R.FootLz] = -0.08;
      tg[R.FootRz] = -0.08;
    } else if (!p.grounded) {
      const flap = Math.sin(t * 16) * 0.25;
      tg[R.ArmLrz] = 1.15 + flap;
      tg[R.ArmRrz] = -1.15 - flap;
      tg[R.ArmLrx] = -0.35;
      tg[R.ArmRrx] = -0.35;
      tg[R.FootLz] = 0.1;
      tg[R.FootRz] = -0.07;
      tg[R.FootLlift] = 0.08;
      tg[R.FootRlift] = 0.03;
      tg[R.Tilt] = clamp(-p.vy * 0.018, -0.18, 0.2) + run * 0.1;
      tg[R.HeadRx] = clamp(p.vy * 0.02, -0.2, 0.2);
    } else if (emoting) {
      this.emotePose(a, p.emote, t);
    } else {
      a.phase += dt * speed * 1.55;
      const ph = a.phase;
      const idle = 1 - clamp(run * 3, 0, 1);
      tg[R.Bob] = Math.abs(Math.sin(ph)) * 0.055 * run + Math.sin(t * 2.3) * 0.012 * idle;
      tg[R.FootLz] = Math.sin(ph) * 0.2 * run;
      tg[R.FootRz] = -Math.sin(ph) * 0.2 * run;
      tg[R.FootLlift] = Math.max(0, -Math.cos(ph)) * 0.13 * run;
      tg[R.FootRlift] = Math.max(0, Math.cos(ph)) * 0.13 * run;
      tg[R.FootLrx] = -Math.sin(ph) * 0.4 * run;
      tg[R.FootRrx] = Math.sin(ph) * 0.4 * run;
      tg[R.ArmLrx] = -Math.sin(ph) * 1.05 * run + Math.sin(t * 2.3) * 0.05 * idle;
      tg[R.ArmRrx] = Math.sin(ph) * 1.05 * run - Math.sin(t * 2.3) * 0.05 * idle;
      tg[R.ArmLrz] = 0.14 + 0.1 * run;
      tg[R.ArmRrz] = -0.14 - 0.1 * run;
      tg[R.Tilt] = 0.17 * run;
      tg[R.HeadRx] = -0.1 * run;
      tg[R.HeadRz] = Math.sin(ph) * 0.05 * run;
    }

    const k = 1 - Math.exp(-dt * (stunned ? 10 : 16));
    for (let i = 0; i < R.Count; i++) a.rig[i] += (tg[i] - a.rig[i]) * k;
    if (!emoting) a.spin *= Math.exp(-dt * 10);

    // Squash & stretch spring: stretch on take-off, splat on landing.
    if (p.grounded && !a.wasGrounded) a.squashV -= clamp(-p.vy, 4, 22) * 0.028 + 0.25;
    if (!p.grounded && a.wasGrounded && p.vy > 3) a.squashV += 1.6;
    a.wasGrounded = p.grounded;
    a.squashV += (-a.squash * 280 - a.squashV * 13) * dt;
    a.squash = clamp(a.squash + a.squashV * dt, -0.32, 0.35);

    // Tumble while knocked out.
    if (stunned && !a.wasStun) {
      a.tumbleAxis.set(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
      a.tumbleSpeed = 11;
    }
    a.wasStun = stunned;
    if (stunned && !p.grounded) {
      _q2.setFromAxisAngle(a.tumbleAxis, a.tumbleSpeed * dt);
      a.tumble.premultiply(_q2);
      a.tumbleSpeed *= Math.exp(-dt * 1.2);
    } else {
      a.tumble.slerp(_q2.identity(), 1 - Math.exp(-dt * (p.mode === MODE_GETUP ? 14 : 8)));
    }

    // Blinking.
    a.blinkIn -= dt;
    if (a.blinkIn <= 0) {
      a.blinkT = 0.13;
      a.blinkIn = 2 + Math.random() * 3.5;
    }
    a.blinkT = Math.max(0, a.blinkT - dt);
    const eyeScaleY = a.blinkT > 0 ? 0.12 : 1;

    this.pose(slot, a, p, eyeScaleY, dt);
  }

  private emotePose(a: Anim, emote: number, t: number) {
    const tg = a.target;
    switch (emote) {
      case 1: // wave
        tg[R.ArmRrz] = -2.55;
        tg[R.ArmRrx] = Math.sin(t * 13) * 0.4;
        tg[R.ArmLrz] = 0.15;
        tg[R.HeadRz] = 0.15;
        tg[R.Bob] = Math.sin(t * 6) * 0.015;
        break;
      case 2: // dance
        tg[R.ArmLrz] = 1.4 + Math.sin(t * 10) * 0.9;
        tg[R.ArmRrz] = -1.4 + Math.sin(t * 10) * 0.9;
        tg[R.Bob] = Math.abs(Math.sin(t * 10)) * 0.08;
        tg[R.FootLlift] = Math.max(0, Math.sin(t * 10)) * 0.12;
        tg[R.FootRlift] = Math.max(0, -Math.sin(t * 10)) * 0.12;
        tg[R.HeadRz] = Math.sin(t * 5) * 0.2;
        break;
      case 3: // cheer
        tg[R.ArmLrz] = 2.55;
        tg[R.ArmRrz] = -2.55;
        tg[R.ArmLrx] = Math.sin(t * 18) * 0.15;
        tg[R.ArmRrx] = -Math.sin(t * 18) * 0.15;
        tg[R.Hop] = Math.abs(Math.sin(t * 8)) * 0.4;
        break;
      default: // giggle
        tg[R.Bob] = Math.sin(t * 34) * 0.02;
        tg[R.HeadRx] = -0.28 + Math.sin(t * 34) * 0.05;
        tg[R.ArmLrx] = -0.7;
        tg[R.ArmRrx] = -0.7;
        tg[R.ArmLrz] = 0.55;
        tg[R.ArmRrz] = -0.55;
        tg[R.Tilt] = -0.12;
        break;
    }
  }

  private pose(slot: number, a: Anim, p: CharPose, eyeScaleY: number, dt: number) {
    const r = a.rig;
    const look = a.look!;
    if (p.emote === 2 && p.grounded) a.spin += dt * 7;

    // Root: position, facing, then tilt + tumble around the hips (lowered when lying flat), squash from the feet.
    const sy = 1 + a.squash;
    const sxz = 1 - a.squash * 0.55;
    const lie = clamp(Math.abs(r[R.Tilt]) / 1.4, 0, 1);
    _root.makeTranslation(p.x, p.y + r[R.Hop], p.z)
      .multiply(_tmp.makeRotationY(p.yaw + a.spin))
      .multiply(_tmp.makeTranslation(0, 0.8 - 0.4 * lie, 0))
      .multiply(_tmp.makeRotationFromQuaternion(a.tumble))
      .multiply(_tmp.makeRotationX(r[R.Tilt]))
      .multiply(_tmp.makeTranslation(0, -0.8, 0))
      .multiply(_tmp.makeScale(sxz, sy, sxz));

    const set = (name: string, k: number, m: THREE.Matrix4) => {
      const mesh = this.meshes.get(name)!;
      mesh.setMatrixAt(slot * this.specs[name].perPlayer + k, m);
    };

    set('body', 0, _m.copy(_root).multiply(_tmp.makeTranslation(0, r[R.Bob], 0)));

    // Head and face.
    _e.set(r[R.HeadRx], 0, r[R.HeadRz]);
    _head.copy(_root).multiply(_tmp.makeTranslation(0, HEAD_Y + r[R.Bob] * 1.25, 0)).multiply(_tmp.makeRotationFromEuler(_e));
    set('head', 0, _head);
    const face = (name: string, k: number, x: number, y: number, z: number, sx = 1, syy = 1, rz = 0) => {
      _m.copy(_head).multiply(_tmp.makeTranslation(x, y, z));
      if (rz) _m.multiply(_tmp.makeRotationZ(rz));
      _m.multiply(_tmp.makeRotationX(-0.12)).multiply(_tmp.makeScale(sx, syy, 1));
      set(name, k, _m);
    };
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      face('eye', s, side * 0.15, 0.0, 0.33, 1, eyeScaleY);
      face('pupil', s, side * 0.145, -0.015, 0.378, 1, eyeScaleY);
      face('sparkle', s, side * 0.125, 0.035, 0.408, 1, eyeScaleY);
      face('blush', s, side * 0.255, -0.11, 0.285, 1, 1, side * -0.2);
    }
    face('mouth', 0, 0, -0.155, 0.36);

    // Arms + hands. rz > 0 raises either arm outward (mirrored per side); rx swings it forward/back.
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const rx = s === 0 ? r[R.ArmLrx] : r[R.ArmRrx];
      const rz = s === 0 ? r[R.ArmLrz] : -r[R.ArmRrz];
      _m.copy(_root)
        .multiply(_tmp.makeTranslation(side * SHOULDER[0], SHOULDER[1] + r[R.Bob], 0))
        .multiply(_tmp.makeRotationZ(side * rz))
        .multiply(_tmp.makeRotationX(rx));
      set('arm', s, _m);
      _m.multiply(_tmp.makeTranslation(0, -0.29, 0));
      set('hand', s, _m);
    }

    // Feet.
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const fz = s === 0 ? r[R.FootLz] : r[R.FootRz];
      const lift = s === 0 ? r[R.FootLlift] : r[R.FootRlift];
      const frx = s === 0 ? r[R.FootLrx] : r[R.FootRrx];
      _m.copy(_root).multiply(_tmp.makeTranslation(side * 0.165, 0.085 + lift, 0.03 + fz)).multiply(_tmp.makeRotationX(frx));
      set('foot', s, _m);
    }

    // Hat.
    const hat = HAT_DEFS[look.hat] ?? [];
    const used = new Map<string, number>();
    for (const [name] of this.meshes) {
      if (!this.isHatPart(name)) continue;
      const spec = this.specs[name];
      for (let k = 0; k < spec.perPlayer; k++) set(name, k, _zero);
    }
    a.propeller += dt * (10 + Math.hypot(p.vx, p.vz) * 3);
    for (const piece of hat) {
      const k = used.get(piece.part) ?? 0;
      used.set(piece.part, k + 1);
      _m.copy(_head).multiply(_tmp.makeTranslation(...piece.pos));
      if (piece.rot) _m.multiply(_tmp.makeRotationFromEuler(_e.set(...piece.rot)));
      if (piece.spin) _m.multiply(_tmp.makeRotationY(a.propeller));
      if (piece.scale) _m.multiply(_tmp.makeScale(piece.scale, piece.scale, piece.scale));
      set(piece.part, k, _m);
    }

    if (p.it) {
      const bob = Math.sin(this.time * 7) * 0.06;
      const pulse = 1 + Math.sin(this.time * 14) * 0.08;
      set('bomb', 0, _m.makeTranslation(p.x, p.y + 2.45 + bob, p.z).multiply(_tmp.makeScale(pulse, pulse, pulse)));
      const fl = 0.7 + Math.random() * 0.8;
      set('spark', 0, _m.makeTranslation(p.x + 0.12, p.y + 2.8 + bob, p.z).multiply(_tmp.makeScale(fl, fl, fl)));
    }

    for (const mesh of this.meshes.values()) mesh.instanceMatrix.needsUpdate = true;

    if (this.shadowMesh) {
      if (Number.isFinite(p.groundY)) {
        const h = Math.max(0, p.y - p.groundY);
        const sc = 1.1 * clamp(1 - h * 0.12, 0.35, 1);
        _q.identity();
        this.shadowMesh.setMatrixAt(slot, _m.compose(_v.set(p.x, p.groundY + 0.03, p.z), _q, _s.set(sc, 1, sc)));
      } else {
        this.shadowMesh.setMatrixAt(slot, _zero);
      }
      this.shadowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private isHatPart(name: string) {
    return !['body', 'head', 'eye', 'pupil', 'sparkle', 'mouth', 'blush', 'arm', 'hand', 'foot'].includes(name);
  }

  dispose() {
    for (const m of this.meshes.values()) m.geometry.dispose();
    this.shadowMesh?.geometry.dispose();
  }
}
