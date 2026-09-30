import { CHAR, FX_BUMP, MODE_DIVE, knock, type CharState } from './character';

const MIN_DIST = CHAR.radius * 2 * 0.95;
const MAX_DY = CHAR.halfHeight * 2 + CHAR.radius * 1.4;

/**
 * Soft capsule-vs-capsule shove between two players. Positions are split evenly (the next move's
 * depenetration keeps anyone from being pushed into walls) and closing speed is exchanged with a bit
 * of bounce. Returns true if they touched.
 */
export function pushPlayers(a: CharState, b: CharState): boolean {
  const dy = b.py - a.py;
  if (Math.abs(dy) > MAX_DY) return false;
  const dx = b.px - a.px, dz = b.pz - a.pz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= MIN_DIST * MIN_DIST) return false;
  let d = Math.sqrt(d2);
  let nx: number, nz: number;
  if (d < 1e-4) {
    // Perfectly stacked: separate deterministically.
    nx = 1; nz = 0; d = 0;
  } else {
    nx = dx / d; nz = dz / d;
  }
  const overlap = MIN_DIST - d;
  a.px -= nx * overlap * 0.5; a.pz -= nz * overlap * 0.5;
  b.px += nx * overlap * 0.5; b.pz += nz * overlap * 0.5;
  const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rv < 0) {
    const j = -rv * 0.62;
    a.vx -= nx * j; a.vz -= nz * j;
    b.vx += nx * j; b.vz += nz * j;
    if (-rv > 3) { a.fx |= FX_BUMP; b.fx |= FX_BUMP; }
  }
  return true;
}

/**
 * Client-side prediction of bumping into someone we only see (interpolated, not simulated):
 * we take the whole correction ourselves, treating them as immovable for this tick.
 */
export function pushAgainst(self: CharState, ox: number, oy: number, oz: number): boolean {
  const dy = oy - self.py;
  if (Math.abs(dy) > MAX_DY) return false;
  const dx = ox - self.px, dz = oz - self.pz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= MIN_DIST * MIN_DIST || d2 < 1e-8) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d, nz = dz / d;
  const overlap = MIN_DIST - d;
  self.px -= nx * overlap * 0.5;
  self.pz -= nz * overlap * 0.5;
  const vn = self.vx * nx + self.vz * nz;
  if (vn > 0) { self.vx -= nx * vn * 0.62; self.vz -= nz * vn * 0.62; }
  return true;
}

/**
 * A diving player that reaches someone knocks them over. `bx/by/bz` is where the diver *saw* the target
 * (lag-compensated position), while the knock is applied to the target's present state.
 */
export function diveTackle(diver: CharState, target: CharState, bx: number, by: number, bz: number): boolean {
  if (diver.mode !== MODE_DIVE) return false;
  if (Math.abs(by - diver.py) > MAX_DY) return false;
  const dx = bx - diver.px, dz = bz - diver.pz;
  const reach = MIN_DIST + 0.45;
  if (dx * dx + dz * dz > reach * reach) return false;
  const sp = Math.hypot(diver.vx, diver.vz) || 1;
  knock(target, diver.vx / sp, diver.vz / sp, 8, 4.2, 0.85);
  return true;
}
