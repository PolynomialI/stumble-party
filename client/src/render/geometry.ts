import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Piece } from '@sp/shared';
import type { QualityProfile } from './quality';

/** Cylinder with rounded top/bottom edges, built as a lathe so the bevel shading is smooth. */
export function roundedCylinder(radius: number, height: number, bevel: number, radial: number, bevelSegs: number) {
  const b = Math.max(0, Math.min(bevel, radius * 0.9, height / 2 - 0.001));
  const h = height / 2;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -h)];
  if (b > 0.001) {
    for (let i = 0; i <= bevelSegs; i++) {
      const a = -Math.PI / 2 + (i / bevelSegs) * (Math.PI / 2);
      pts.push(new THREE.Vector2(radius - b + Math.cos(a) * b, -h + b + Math.sin(a) * b));
    }
    for (let i = 0; i <= bevelSegs; i++) {
      const a = (i / bevelSegs) * (Math.PI / 2);
      pts.push(new THREE.Vector2(radius - b + Math.cos(a) * b, h - b + Math.sin(a) * b));
    }
  } else {
    pts.push(new THREE.Vector2(radius, -h), new THREE.Vector2(radius, h));
  }
  pts.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, radial);
  g.computeVertexNormals();
  return g;
}

/** Ramp rising from local -Z (height 0) to +Z (full height). Indexed, flat-shaded faces. */
export function wedgeGeometry(w: number, h: number, d: number) {
  const x = w / 2, y = h / 2, z = d / 2;
  const P = {
    a: [-x, -y, -z], b: [x, -y, -z], c: [x, -y, z], dd: [-x, -y, z], // bottom
    e: [-x, y, z], f: [x, y, z], // top back edge
  };
  const faces: number[][][] = [
    [P.a, P.dd, P.e, P.a], // left (tri + degenerate)
    [P.b, P.f, P.c, P.b], // right
    [P.dd, P.c, P.f, P.e], // back (quad)
    [P.a, P.e, P.f, P.b], // slope (quad)
    [P.a, P.b, P.c, P.dd], // bottom (quad)
  ];
  const pos: number[] = [];
  const idx: number[] = [];
  for (const f of faces) {
    const base = pos.length / 3;
    for (const v of f) pos.push(v[0], v[1], v[2]);
    idx.push(base, base + 1, base + 2);
    if (f[3] !== f[0]) idx.push(base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _w = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Tangent frame used to project a pattern onto a face with local normal n. */
function faceFrame(n: THREE.Vector3, t: THREE.Vector3, b: THREE.Vector3) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (ay >= 0.5 && ay >= ax && ay >= az) {
    t.copy(X);
    b.crossVectors(t, n).normalize();
    if (b.z < 0 || (b.z === 0 && b.y < 0)) b.negate();
  } else if (ax > az) {
    t.copy(Z);
    b.copy(Y);
  } else {
    t.copy(X);
    b.copy(Y);
  }
}

const BOX_AXES = [X, X.clone().negate(), Y, Y.clone().negate(), Z, Z.clone().negate()];

/**
 * Geometry for a map piece, positioned in its parent space (world for statics, pivot for obstacle parts), with
 * UVs in metres / scale. Each face keeps one projection frame across its rounded bevel, so patterns flow over
 * edges without seams, and axis-aligned neighbours line up because UVs come from parent-space positions.
 * `topDown` projects cylinders straight down, so floor patterns wrap over the rim like real tiles.
 */
export function pieceGeometry(p: Piece, q: QualityProfile, scale = 1, topDown = false): THREE.BufferGeometry {
  const [sx, sy, sz] = p.size;
  let g: THREE.BufferGeometry;
  let kind: 'box' | 'lathe' | 'flat' | 'smooth' = 'smooth';
  let bevel = 0;
  switch (p.shape) {
    case 'box': {
      const r = Math.max(0, Math.min(p.round ?? 0, Math.min(sx, sy, sz) / 2 - 0.005));
      g = r > 0.01
        ? new RoundedBoxGeometry(sx, sy, sz, q.bevelSegments, r)
        : new THREE.BoxGeometry(sx, sy, sz);
      kind = 'box';
      break;
    }
    case 'cyl': {
      const segs = Math.max(12, Math.round(q.cylinderSegments * Math.min(1.6, Math.max(0.5, sx / 4))));
      bevel = Math.max(0, Math.min(p.round ?? 0, sx / 2 * 0.9, sy / 2 - 0.001));
      g = roundedCylinder(sx / 2, sy, bevel, segs, q.bevelSegments + 1);
      kind = 'lathe';
      break;
    }
    case 'ball':
      g = new THREE.SphereGeometry(sx / 2, Math.round(q.cylinderSegments * 0.75), Math.round(q.cylinderSegments * 0.5));
      break;
    case 'wedge':
      g = wedgeGeometry(sx, sy, sz);
      kind = 'flat';
      break;
  }
  const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0])));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p.pos), rot, new THREE.Vector3(1, 1, 1));

  // Per-vertex local face normal used to choose the projection frame.
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const faceN = new Float32Array(pos.count * 3);
  if (kind === 'box' && g.groups.length === 6 && g.index) {
    const idx = g.index;
    g.groups.forEach((grp, gi) => {
      const ax = BOX_AXES[gi];
      for (let k = grp.start; k < grp.start + grp.count; k++) faceN.set([ax.x, ax.y, ax.z], idx.getX(k) * 3);
    });
  } else {
    for (let i = 0; i < pos.count; i++) faceN.set([nrm.getX(i), nrm.getY(i), nrm.getZ(i)], i * 3);
  }

  const uv = new Float32Array(pos.count * 2);
  const k = 1 / scale;
  const capY = sy / 2 - bevel * 0.5;
  for (let i = 0; i < pos.count; i++) {
    _w.fromBufferAttribute(pos, i).applyMatrix4(m);
    if (kind === 'lathe') {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      if (topDown || Math.abs(ly) >= capY) {
        _n.set(0, topDown ? 1 : Math.sign(ly), 0);
      } else {
        // Cylindrical: arc length around, height along the axis.
        _b.copy(Y).applyQuaternion(rot);
        uv[i * 2] = Math.atan2(lx, lz) * (sx / 2) * k;
        uv[i * 2 + 1] = _w.dot(_b) * k;
        continue;
      }
    } else {
      _n.set(faceN[i * 3], faceN[i * 3 + 1], faceN[i * 3 + 2]);
    }
    faceFrame(_n, _t, _b);
    _t.applyQuaternion(rot);
    _b.applyQuaternion(rot);
    uv[i * 2] = _w.dot(_t) * k;
    uv[i * 2 + 1] = _w.dot(_b) * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.applyMatrix4(m);
  return g;
}

/** Keeps only the attributes merged meshes share, so mergeGeometries never trips over extras. */
export function normalizeAttributes(g: THREE.BufferGeometry): THREE.BufferGeometry {
  // Every builder above produces indexed geometry, which mergeGeometries requires to be consistent.
  if (!g.index) {
    const idx = new Array(g.getAttribute('position').count).fill(0).map((_, i) => i);
    g.setIndex(idx);
  }
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
