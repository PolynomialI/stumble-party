// Tiny allocation-light math kit shared by server and client (the server has no three.js).

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Rotates angle `from` toward `to` by at most `maxStep` radians along the shortest arc. */
export function turnTowards(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return to;
  return wrapAngle(from + Math.sign(d) * maxStep);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

export function quatIdentity(): Quat {
  return [0, 0, 0, 1];
}

export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number, out: Quat = [0, 0, 0, 1]): Quat {
  const h = angle * 0.5;
  const s = Math.sin(h);
  out[0] = ax * s;
  out[1] = ay * s;
  out[2] = az * s;
  out[3] = Math.cos(h);
  return out;
}

/** Euler angles applied in XYZ order (matches THREE.Euler default). */
export function quatFromEuler(x: number, y: number, z: number, out: Quat = [0, 0, 0, 1]): Quat {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  out[0] = s1 * c2 * c3 + c1 * s2 * s3;
  out[1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[3] = c1 * c2 * c3 - s1 * s2 * s3;
  return out;
}

export function quatMul(a: Quat, b: Quat, out: Quat = [0, 0, 0, 1]): Quat {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function quatConj(q: Quat, out: Quat = [0, 0, 0, 1]): Quat {
  out[0] = -q[0];
  out[1] = -q[1];
  out[2] = -q[2];
  out[3] = q[3];
  return out;
}

export function quatRotate(q: Quat, v: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  const x = v[0], y = v[1], z = v[2];
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + (qy * tz - qz * ty);
  out[1] = y + qw * ty + (qz * tx - qx * tz);
  out[2] = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** Rigid transform: p' = pos + rot * p. */
export interface Pose {
  pos: Vec3;
  rot: Quat;
}

export function newPose(): Pose {
  return { pos: [0, 0, 0], rot: [0, 0, 0, 1] };
}

export function poseApply(pose: Pose, p: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  quatRotate(pose.rot, p, out);
  out[0] += pose.pos[0];
  out[1] += pose.pos[1];
  out[2] += pose.pos[2];
  return out;
}

const _inv: Quat = [0, 0, 0, 1];
export function poseInvApply(pose: Pose, p: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
  out[0] = p[0] - pose.pos[0];
  out[1] = p[1] - pose.pos[1];
  out[2] = p[2] - pose.pos[2];
  return quatRotate(quatConj(pose.rot, _inv), out, out);
}

/** Yaw (rotation about +Y) change produced by rotation q, measured on the +Z axis. */
export function quatYaw(q: Quat): number {
  const fwd = quatRotate(q, [0, 0, 1]);
  return Math.atan2(fwd[0], fwd[2]);
}

/** Deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
