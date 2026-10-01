import { CHAR, FX_BUMP, MODE_DIVE, knock, type CharState } from './character';

const MIN_DIST = CHAR.radius * 2 * 0.95;
const MAX_DY = CHAR.halfHeight * 2 + CHAR.radius * 1.4;
/**
 * Share of a shove the charging player takes. Zero: whoever runs into someone keeps their momentum and the
 * one being hit gets shoved. That keeps the charger's own client prediction exact (see Predictor).
 */
const CHARGER_SHARE = 0;
const BOUNCE = 1.1;

/**
 * How much of a collision `self` absorbs, from both players' speeds toward each other along n (self -> other).
 * Whoever is charging in holds their ground; whoever is being run into gets shoved. Equal (or no) closing
 * speeds split it evenly.
 */
export function shoveShare(selfVx: number, selfVz: number, otherVx: number, otherVz: number, nx: number, nz: number): number {
  const vs = Math.max(0, selfVx * nx + selfVz * nz);
  const vo = Math.max(0, -(otherVx * nx + otherVz * nz));
  const total = vs + vo;
  if (total < 0.5) return 0.5;
  return Math.min(1 - CHARGER_SHARE, Math.max(CHARGER_SHARE, vo / total));
}

/**
 * Capsule-vs-capsule shove between two simulated players (server). Positional overlap and closing speed are
 * shared by `shoveShare`; the next move's depenetration keeps anyone from being pushed into walls.
 * Returns true if they touched.
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
    nx = 1; nz = 0; d = 0; // perfectly stacked: separate deterministically
  } else {
    nx = dx / d; nz = dz / d;
  }
  const wa = shoveShare(a.vx, a.vz, b.vx, b.vz, nx, nz);
  const wb = 1 - wa;
  const overlap = MIN_DIST - d;
  a.px -= nx * overlap * wa; a.pz -= nz * overlap * wa;
  b.px += nx * overlap * wb; b.pz += nz * overlap * wb;
  const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rv < 0) {
    const j = -rv * BOUNCE;
    a.vx -= nx * j * wa; a.vz -= nz * j * wa;
    b.vx += nx * j * wb; b.vz += nz * j * wb;
    if (-rv > 3) { a.fx |= FX_BUMP; b.fx |= FX_BUMP; }
  }
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
