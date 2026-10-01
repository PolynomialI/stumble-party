import { quatFromAxisAngle, quatFromEuler, quatMul, type Pose, type Quat } from '../math';
import type { Axis, ObstacleDef } from '../maps/types';

const AXES: Record<Axis, [number, number, number]> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Piston profile over one period: snap out, hold, ease back, rest. Continuous, so velocities stay finite. */
export function pistonEase(x: number): number {
  if (x < 0.14) return smooth(x / 0.14);
  if (x < 0.45) return 1;
  if (x < 0.85) return 1 - smooth((x - 0.45) / 0.4);
  return 0;
}

/** Spin angle with optional linear speed-up that caps at maxSpeed. Before t=0 it just turns at base speed. */
export function spinAngle(speed: number, t: number, phase = 0, accel = 0, maxSpeed = speed): number {
  if (t <= 0 || accel === 0) return phase + speed * t;
  const tCap = Math.max(0, (maxSpeed - speed) / accel);
  if (t < tCap) return phase + speed * t + 0.5 * accel * t * t;
  return phase + speed * tCap + 0.5 * accel * tCap * tCap + maxSpeed * (t - tCap);
}

const _base: Quat = [0, 0, 0, 1];
const _local: Quat = [0, 0, 0, 1];

/**
 * Pose of an obstacle's pivot at round time `t` (seconds). Pure function of time, so client and server agree.
 * Obstacles hold their starting pose until GO (t = 0): nobody gets swept while frozen in the countdown.
 */
export function obstaclePose(def: ObstacleDef, t: number, out: Pose): Pose {
  if (t < 0) t = 0;
  const r = def.rot;
  if (r) quatFromEuler(r[0], r[1], r[2], _base);
  else { _base[0] = 0; _base[1] = 0; _base[2] = 0; _base[3] = 1; }
  out.pos[0] = def.pos[0];
  out.pos[1] = def.pos[1];
  out.pos[2] = def.pos[2];
  const m = def.motion;
  if (m.kind === 'slide') {
    const period = Math.max(0.1, m.period);
    let x = (t / period + (m.phase ?? 0)) % 1;
    if (x < 0) x += 1;
    const u = m.ease === 'piston' ? pistonEase(x) : 0.5 - 0.5 * Math.cos(x * Math.PI * 2);
    // Offset is expressed in the obstacle's base frame.
    const ox = m.offset[0] * u, oy = m.offset[1] * u, oz = m.offset[2] * u;
    const qx = _base[0], qy = _base[1], qz = _base[2], qw = _base[3];
    const tx = 2 * (qy * oz - qz * oy), ty = 2 * (qz * ox - qx * oz), tz = 2 * (qx * oy - qy * ox);
    out.pos[0] += ox + qw * tx + (qy * tz - qz * ty);
    out.pos[1] += oy + qw * ty + (qz * tx - qx * tz);
    out.pos[2] += oz + qw * tz + (qx * ty - qy * tx);
    out.rot[0] = _base[0]; out.rot[1] = _base[1]; out.rot[2] = _base[2]; out.rot[3] = _base[3];
    return out;
  }
  const angle = m.kind === 'spin'
    ? spinAngle(m.speed, t, m.phase ?? 0, m.accel ?? 0, m.maxSpeed ?? m.speed)
    : m.amplitude * Math.sin((t / m.period) * Math.PI * 2 + (m.phase ?? 0));
  const a = AXES[m.axis];
  quatFromAxisAngle(a[0], a[1], a[2], angle, _local);
  quatMul(_base, _local, out.rot);
  return out;
}
