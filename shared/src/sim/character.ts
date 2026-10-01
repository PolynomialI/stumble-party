import RAPIER from '@dimforge/rapier3d-compat';
import { DT } from '../constants';
import { clamp, turnTowards, type Vec3 } from '../math';
import {
  IDENT_ROT, QUERY_OBSTACLES, QUERY_SOLID, SURF_BOUNCE, SURF_BUMPER, SURF_CONVEYOR, SURF_ICE, SURF_NORMAL,
  type PhysicsWorld,
} from './world';

/** Movement tuning. Snappy acceleration, heavy gravity and a short jump give the bouncy party-game feel. */
export const CHAR = {
  radius: 0.42,
  halfHeight: 0.38,
  /** Capsule centre height above the feet. */
  centerHeight: 0.8,
  runSpeed: 7.2,
  groundAccel: 52,
  groundDecel: 44,
  airAccel: 17,
  airSteer: 2.6,
  airDrag: 1.4,
  gravity: 26,
  jumpSpeed: 8.9,
  maxFall: 32,
  coyote: 0.1,
  jumpBuffer: 0.13,
  diveSpeed: 10.8,
  diveMaxSpeed: 13,
  diveUpGround: 4.4,
  diveUpAir: 3.2,
  slideTime: 0.42,
  slideDecel: 10,
  getUpTime: 0.32,
  turnRate: 13,
  /** Surfaces flatter than this (normal.y) count as ground; steeper ones behave like walls. */
  minGroundNy: 0.6,
  snapDown: 0.3,
} as const;

export const MODE_NORMAL = 0;
export const MODE_DIVE = 1;
export const MODE_SLIDE = 2;
export const MODE_STUN = 3;
export const MODE_GETUP = 4;

export const BTN_JUMP = 1;
export const BTN_JUMP_PRESS = 2;
export const BTN_DIVE = 4;

/** One-tick effect flags, set by the step that produced them (for sounds and particles). */
export const FX_JUMP = 1;
export const FX_LAND = 2;
export const FX_DIVE = 4;
export const FX_BOUNCE = 8;
export const FX_HIT = 16;
export const FX_BUMP = 32;

export interface InputCmd {
  /** World-space move direction on XZ, length <= 1 (already camera-relative). */
  mx: number;
  mz: number;
  buttons: number;
}

export const NO_INPUT: InputCmd = { mx: 0, mz: 0, buttons: 0 };

/** Complete simulation state of one character. Everything needed to rewind and replay prediction. */
export class CharState {
  px = 0; py = 0; pz = 0;
  vx = 0; vy = 0; vz = 0;
  yaw = 0;
  mode = MODE_NORMAL;
  modeT = 0;
  stunDur = 0;
  grounded = false;
  airT = 0;
  jumpBuf = 0;
  diveUsed = false;
  groundObs = -1;
  groundTile = -1;
  groundSurf = SURF_NORMAL;
  convX = 0;
  convZ = 0;
  hitCd = 0;
  fx = 0;

  copyFrom(o: CharState): this {
    this.px = o.px; this.py = o.py; this.pz = o.pz;
    this.vx = o.vx; this.vy = o.vy; this.vz = o.vz;
    this.yaw = o.yaw; this.mode = o.mode; this.modeT = o.modeT; this.stunDur = o.stunDur;
    this.grounded = o.grounded; this.airT = o.airT; this.jumpBuf = o.jumpBuf; this.diveUsed = o.diveUsed;
    this.groundObs = o.groundObs; this.groundTile = o.groundTile; this.groundSurf = o.groundSurf;
    this.convX = o.convX; this.convZ = o.convZ; this.hitCd = o.hitCd; this.fx = o.fx;
    return this;
  }

  /** Places the character standing at feet position (x, y, z). */
  spawn(x: number, y: number, z: number, yaw: number): this {
    this.copyFrom(new CharState());
    this.px = x; this.py = y + CHAR.centerHeight + SKIN; this.pz = z;
    this.yaw = yaw;
    this.grounded = true;
    return this;
  }
}

function setMode(c: CharState, mode: number) {
  c.mode = mode;
  c.modeT = 0;
}

/** Knocks a character away: sets its velocity and puts it into the tumbling stun state. */
export function knock(c: CharState, dirX: number, dirZ: number, speed: number, up: number, stun = 0.8 + speed * 0.03) {
  const len = Math.hypot(dirX, dirZ) || 1;
  c.vx = (dirX / len) * speed;
  c.vz = (dirZ / len) * speed;
  c.vy = Math.max(c.vy, up);
  setMode(c, MODE_STUN);
  c.stunDur = stun;
  c.grounded = false;
  c.airT = CHAR.coyote + 1;
  c.hitCd = 0.3;
  c.fx |= FX_HIT;
}

// ---------------------------------------------------------------------------------------------
// Collide-and-slide. Rapier's built-in character controller (and shape casts with a non-zero
// target distance) miss hits when a round shape starts inside the skin gap, which lets characters
// sink through floors. So: resolve overlaps with exact contact queries first, then sweep with a
// zero target distance and stop a small skin short of whatever we hit.
// ---------------------------------------------------------------------------------------------

const SKIN = 0.004;
const STEP_UP = 0.35;
const _p = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };
const _down = { x: 0, y: -1, z: 0 };
const _v3: Vec3 = [0, 0, 0];
const _v3b: Vec3 = [0, 0, 0];
const _overlaps: RAPIER.Collider[] = [];

export interface SlideHit {
  collider: RAPIER.Collider;
  nx: number;
  ny: number;
  nz: number;
}
const _hits: SlideHit[] = [];
const _hitPool: SlideHit[] = [];

let _capsule: RAPIER.Capsule | null = null;
/** The one capsule shape every character uses for queries (players have no colliders of their own). */
export function characterShape(): RAPIER.Capsule {
  return (_capsule ??= new RAPIER.Capsule(CHAR.halfHeight, CHAR.radius));
}

/** Pushes the capsule at `p` out of every solid it overlaps. */
function depenetrate(pw: PhysicsWorld, p: { x: number; y: number; z: number }, excludeBody?: RAPIER.RigidBody) {
  const cap = characterShape();
  for (let iter = 0; iter < 4; iter++) {
    _overlaps.length = 0;
    pw.world.intersectionsWithShape(p, IDENT_ROT, cap, (c) => {
      _overlaps.push(c);
      return true;
    }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_SOLID, undefined, excludeBody);
    let moved = false;
    for (const c of _overlaps) {
      const ct = c.contactShape(cap, p, IDENT_ROT, 0);
      if (ct && ct.distance < -1e-6) {
        const push = -ct.distance + SKIN;
        p.x += ct.normal1.x * push;
        p.y += ct.normal1.y * push;
        p.z += ct.normal1.z * push;
        moved = true;
      }
    }
    if (!moved) return;
  }
}

/** Moves the capsule by (dx, dy, dz), sliding along whatever it touches. Hits are left in `_hits`. */
function slideMove(pw: PhysicsWorld, p: { x: number; y: number; z: number }, dx: number, dy: number, dz: number,
  excludeBody?: RAPIER.RigidBody) {
  for (const h of _hits) _hitPool.push(h);
  _hits.length = 0;
  depenetrate(pw, p, excludeBody);
  const cap = characterShape();
  let rx = dx, ry = dy, rz = dz;
  for (let iter = 0; iter < 4; iter++) {
    const len = Math.hypot(rx, ry, rz);
    if (len < 1e-6) break;
    _dir.x = rx / len; _dir.y = ry / len; _dir.z = rz / len;
    const h = pw.world.castShape(p, IDENT_ROT, _dir, cap, 0, len, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_SOLID, undefined, excludeBody);
    const into = h ? _dir.x * h.normal1.x + _dir.y * h.normal1.y + _dir.z * h.normal1.z : 0;
    // No hit, or only grazing a surface we already touch (moving along/away from it): take the full move.
    // Treating a zero-distance graze as a block would stall a wall-hugger for a tick, and whether a cast
    // reports one hinges on sub-millimetre differences, which also made client and server disagree.
    if (!h || into > -0.05) {
      p.x += rx; p.y += ry; p.z += rz;
      break;
    }
    const travel = Math.max(0, h.time_of_impact - SKIN);
    p.x += _dir.x * travel; p.y += _dir.y * travel; p.z += _dir.z * travel;
    const k = 1 - travel / len;
    rx *= k; ry *= k; rz *= k;
    const nx = h.normal1.x, ny = h.normal1.y, nz = h.normal1.z;
    const hit = _hitPool.pop() ?? { collider: h.collider, nx, ny, nz };
    hit.collider = h.collider; hit.nx = nx; hit.ny = ny; hit.nz = nz;
    _hits.push(hit);
    // Steep surfaces act as vertical walls for upward motion so you cannot climb them by walking into them.
    // Falling onto one uses the true normal, so you slide off rounded edges instead of hanging on them.
    let px = nx, py = ny, pz = nz;
    if (Math.abs(ny) < CHAR.minGroundNy && ry > 0) {
      const hl = Math.hypot(nx, nz);
      if (hl > 1e-4) { px = nx / hl; py = 0; pz = nz / hl; }
    }
    const rn = rx * px + ry * py + rz * pz;
    if (rn < 0) { rx -= px * rn; ry -= py * rn; rz -= pz * rn; }
  }
  depenetrate(pw, p, excludeBody);
}

/** Distance to walkable ground below the capsule (within maxDist), or null. */
function probeGround(pw: PhysicsWorld, p: { x: number; y: number; z: number }, maxDist: number) {
  const h = pw.world.castShape(p, IDENT_ROT, _down, characterShape(), 0, maxDist, true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_SOLID);
  if (!h || h.normal1.y < CHAR.minGroundNy) return null;
  return h;
}

/**
 * Advances one character by one tick against the world as it stands (obstacles at the previous tick).
 * Call `resolveObstacleHits` after the world has been moved to the new tick.
 */
export function stepCharacter(pw: PhysicsWorld, c: CharState, inp: InputCmd): void {
  const dt = DT;
  c.fx = 0;
  c.modeT += dt;
  if (c.hitCd > 0) c.hitCd -= dt;
  c.jumpBuf = inp.buttons & BTN_JUMP_PRESS ? CHAR.jumpBuffer : Math.max(0, c.jumpBuf - dt);

  let wx = Number.isFinite(inp.mx) ? inp.mx : 0;
  let wz = Number.isFinite(inp.mz) ? inp.mz : 0;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  const wish = Math.min(1, wl);

  if (c.mode === MODE_SLIDE && c.modeT >= CHAR.slideTime) setMode(c, MODE_GETUP);
  else if (c.mode === MODE_GETUP && c.modeT >= CHAR.getUpTime) setMode(c, MODE_NORMAL);
  else if (c.mode === MODE_STUN && c.grounded && c.modeT >= c.stunDur) setMode(c, MODE_GETUP);

  const control = c.mode === MODE_NORMAL ? 1 : c.mode === MODE_GETUP ? 0.35 : 0;
  const ice = c.grounded && c.groundSurf === SURF_ICE;

  // Platform / conveyor carry for this tick (we were standing on it at the end of the last tick).
  let cx = 0, cy = 0, cz = 0;
  if (c.grounded) {
    if (c.groundObs >= 0) {
      _v3[0] = c.px; _v3[1] = c.py - CHAR.centerHeight; _v3[2] = c.pz;
      const dyaw = pw.carry(c.groundObs, _v3, _v3b);
      cx = _v3b[0] - _v3[0]; cy = _v3b[1] - _v3[1]; cz = _v3b[2] - _v3[2];
      c.yaw += dyaw;
    }
    cx += c.convX * dt;
    cz += c.convZ * dt;
  }

  // Horizontal velocity.
  let hx = c.vx, hz = c.vz;
  if (c.grounded) {
    if (control > 0 && wish > 0.05) {
      const accel = CHAR.groundAccel * control * (ice ? 0.18 : 1) * dt;
      [hx, hz] = towards(hx, hz, wx * CHAR.runSpeed, wz * CHAR.runSpeed, accel);
    } else {
      let decel = c.mode === MODE_SLIDE ? CHAR.slideDecel : c.mode === MODE_STUN ? 9 : CHAR.groundDecel;
      if (ice) decel *= 0.1;
      [hx, hz] = towards(hx, hz, 0, 0, decel * dt);
    }
  } else if (control > 0 && wish > 0.05) {
    const speed = Math.hypot(hx, hz);
    if (speed <= CHAR.runSpeed + 0.01) {
      [hx, hz] = towards(hx, hz, wx * CHAR.runSpeed, wz * CHAR.runSpeed, CHAR.airAccel * control * dt);
    } else {
      // Above run speed (pads, knockback): steer without throwing away momentum.
      let dx = hx / speed + (wx / Math.max(wl, 1e-6)) * CHAR.airSteer * control * dt;
      let dz = hz / speed + (wz / Math.max(wl, 1e-6)) * CHAR.airSteer * control * dt;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      const s = speed - CHAR.airDrag * dt;
      hx = dx * s; hz = dz * s;
    }
  } else {
    [hx, hz] = towards(hx, hz, 0, 0, CHAR.airDrag * dt);
  }

  // Facing.
  if (c.mode === MODE_DIVE || c.mode === MODE_SLIDE) {
    if (hx * hx + hz * hz > 1) c.yaw = Math.atan2(hx, hz);
  } else if (control > 0 && wish > 0.1) {
    c.yaw = turnTowards(c.yaw, Math.atan2(wx, wz), CHAR.turnRate * dt);
  }

  // Jump (buffered + coyote time).
  if (c.jumpBuf > 0 && c.mode === MODE_NORMAL && (c.grounded || c.airT <= CHAR.coyote) && c.vy <= 1) {
    c.vy = CHAR.jumpSpeed;
    c.jumpBuf = 0;
    c.grounded = false;
    c.airT = CHAR.coyote + 1;
    c.fx |= FX_JUMP;
    // Keep the platform's momentum when leaving it.
    hx += cx / dt; hz += cz / dt;
  }

  // Dive: once per airtime, a flat lunge that ends in a belly slide.
  if (inp.buttons & BTN_DIVE && c.mode === MODE_NORMAL && !c.diveUsed) {
    let dx: number, dz: number;
    if (wish > 0.1) { dx = wx / wl; dz = wz / wl; } else { dx = Math.sin(c.yaw); dz = Math.cos(c.yaw); }
    const sp = clamp(Math.max(Math.hypot(hx, hz), CHAR.diveSpeed), 0, CHAR.diveMaxSpeed);
    hx = dx * sp; hz = dz * sp;
    c.vy = c.grounded ? CHAR.diveUpGround : Math.max(c.vy, 0) * 0.5 + CHAR.diveUpAir;
    setMode(c, MODE_DIVE);
    c.diveUsed = true;
    c.grounded = false;
    c.airT = CHAR.coyote + 1;
    c.yaw = Math.atan2(dx, dz);
    c.fx |= FX_DIVE;
  }

  if (!c.grounded) c.vy = Math.max(c.vy - CHAR.gravity * dt, -CHAR.maxFall);
  else if (c.vy < 0) c.vy = 0;
  c.vx = hx; c.vz = hz;

  // Move through the world.
  const wasGrounded = c.grounded;
  const mx = c.vx * dt + cx, my = c.vy * dt + cy, mz = c.vz * dt + cz;
  _p.x = c.px; _p.y = c.py; _p.z = c.pz;
  slideMove(pw, _p, mx, my, mz);
  let hits: readonly SlideHit[] = _hits;
  const rising = c.vy > 0.5;

  // Step up small ledges (pad rims, tile lips): if a grounded move hit a wall, retry it raised by
  // STEP_UP and keep that result when it gets further and lands on walkable ground.
  if (wasGrounded && !rising && _hits.some((h) => Math.abs(h.ny) < CHAR.minGroundNy)) {
    const firstHits = _hits.map((h) => ({ ...h }));
    const ax = _p.x, ay = _p.y, az = _p.z;
    _p.x = c.px; _p.y = c.py; _p.z = c.pz;
    slideMove(pw, _p, 0, STEP_UP, 0);
    const lifted = _p.y - c.py;
    slideMove(pw, _p, mx, 0, mz);
    const land = lifted > 0.05 ? probeGround(pw, _p, lifted + 0.05) : null;
    const progressed = (_p.x - c.px) ** 2 + (_p.z - c.pz) ** 2 > (ax - c.px) ** 2 + (az - c.pz) ** 2 + 1e-4;
    if (land && progressed) {
      _p.y -= Math.max(0, land.time_of_impact - SKIN);
      hits = [];
    } else {
      _p.x = ax; _p.y = ay; _p.z = az;
      hits = firstHits;
    }
  }

  for (const h of hits) {
    if (h.ny >= CHAR.minGroundNy) continue; // floors are handled by the ground probe below
    if (h.ny < -CHAR.minGroundNy) {
      if (c.vy > 0) c.vy = 0; // bonked a ceiling
    } else {
      const hl = Math.hypot(h.nx, h.nz) || 1;
      const ux = h.nx / hl, uz = h.nz / hl;
      const vn = c.vx * ux + c.vz * uz;
      if (vn < 0) {
        const speed = Math.hypot(c.vx, c.vz);
        const bouncy = (c.mode === MODE_DIVE || c.mode === MODE_STUN || c.mode === MODE_SLIDE) && speed > 5;
        const k = bouncy ? 1.45 : 1;
        c.vx -= vn * ux * k;
        c.vz -= vn * uz * k;
      }
    }
    const info = pw.info.get(h.collider.handle);
    if (info && info.surface === SURF_BUMPER && c.hitCd <= 0) {
      knock(c, h.nx, h.nz, info.power, 3 + info.power * 0.25, 0.45);
    }
  }

  // Ground: snap down small steps while walking, detect landings. A fall that was blocked by steep
  // geometry (wedged in a crevice, perched on a rim) counts as supported, so you can always jump out.
  const ground = rising ? null : probeGround(pw, _p, wasGrounded ? CHAR.snapDown : 0.06);
  const supported = !ground && !rising && my < -0.02 && _p.y - c.py > my * 0.25;
  if (ground || supported) {
    if (ground && ground.time_of_impact > SKIN) _p.y -= ground.time_of_impact - SKIN;
    if (!wasGrounded) {
      c.fx |= FX_LAND;
      c.diveUsed = false;
      if (c.mode === MODE_DIVE) setMode(c, MODE_SLIDE);
    }
    c.grounded = true;
    c.airT = 0;
    if (c.vy < 0) c.vy = 0;
  } else {
    c.grounded = false;
    c.airT += dt;
  }
  c.px = _p.x; c.py = _p.y; c.pz = _p.z;

  c.groundObs = -1;
  c.groundTile = -1;
  c.groundSurf = SURF_NORMAL;
  c.convX = 0;
  c.convZ = 0;
  if (ground) {
    const info = pw.info.get(ground.collider.handle);
    if (info) {
      c.groundObs = info.obstacle;
      c.groundTile = info.tile;
      c.groundSurf = info.surface;
      if (info.surface === SURF_BOUNCE) {
        pw.surfaceDir(info, _v3);
        c.vy = info.power;
        c.vx += _v3[0] * info.power * 0.6;
        c.vz += _v3[2] * info.power * 0.6;
        c.grounded = false;
        c.airT = CHAR.coyote + 1;
        c.diveUsed = false;
        if (c.mode !== MODE_STUN) setMode(c, MODE_NORMAL);
        c.fx |= FX_BOUNCE;
      } else if (info.surface === SURF_CONVEYOR) {
        pw.surfaceDir(info, _v3);
        c.convX = _v3[0] * info.power;
        c.convZ = _v3[2] * info.power;
      } else if (info.surface === SURF_BUMPER && c.hitCd <= 0) {
        knock(c, Math.sin(c.yaw + Math.PI), Math.cos(c.yaw + Math.PI), info.power, 4 + info.power * 0.3, 0.45);
      }
    }
  }
}

/**
 * After the world has moved to the new tick: pushes the character out of any obstacle that swept into it,
 * and knocks it back if that obstacle is a hazard (hammers, sweepers, pushers).
 */
export function resolveObstacleHits(pw: PhysicsWorld, c: CharState): void {
  _p.x = c.px; _p.y = c.py; _p.z = c.pz;
  _overlaps.length = 0;
  const cap = characterShape();
  pw.world.intersectionsWithShape(_p, IDENT_ROT, cap, (other) => {
    _overlaps.push(other);
    return true;
  }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_OBSTACLES);
  if (_overlaps.length === 0) return;
  const hitList = _overlaps.slice();

  for (const other of hitList) {
    _p.x = c.px; _p.y = c.py; _p.z = c.pz;
    const ct = other.contactShape(cap, _p, IDENT_ROT, 0);
    if (!ct || ct.distance >= 0) continue;
    const info = pw.info.get(other.handle);
    if (!info || info.obstacle < 0) continue;
    const ob = pw.obstacles[info.obstacle];
    let nx = ct.normal1.x, ny = ct.normal1.y, nz = ct.normal1.z;
    const depth = -ct.distance + SKIN;
    _v3[0] = ct.point1.x; _v3[1] = ct.point1.y; _v3[2] = ct.point1.z;
    const pv = pw.pointVelocity(info.obstacle, _v3, _v3b);

    if (ny < -0.3 && c.grounded) {
      // Being pressed into the floor: squeeze out sideways instead.
      let hl = Math.hypot(nx, nz);
      if (hl < 0.2) { nx = pv[0]; nz = pv[2]; hl = Math.hypot(nx, nz); }
      if (hl < 1e-4) { nx = 1; nz = 0; hl = 1; }
      nx /= hl; nz /= hl; ny = 0;
    }
    // Push out with a sweep that ignores this obstacle, so walls behind us still block.
    slideMove(pw, _p, nx * depth, ny * depth, nz * depth, ob.body);
    c.px = _p.x; c.py = _p.y; c.pz = _p.z;

    const pvh = Math.hypot(pv[0], pv[2]);
    // Only a fast-moving hazard surface sends you flying; brushing a slowly turning hub just pushes.
    if (ob.hit > 0 && pvh > 2) {
      if (c.hitCd <= 0) {
        const dx = nx + (pv[0] / pvh) * 1.3, dz = nz + (pv[2] / pvh) * 1.3;
        const strength = ob.hit * clamp(0.45 + pvh / 16, 0.5, 1);
        knock(c, dx, dz, strength, 2.5 + ob.hit * 0.3);
      }
    } else {
      // Solid mover: at least match its velocity along the contact normal.
      const vn = c.vx * nx + c.vy * ny + c.vz * nz;
      const pn = pv[0] * nx + pv[1] * ny + pv[2] * nz;
      if (vn < pn) {
        c.vx += nx * (pn - vn);
        c.vy += ny * (pn - vn);
        c.vz += nz * (pn - vn);
      }
    }
  }
}

function towards(x: number, z: number, tx: number, tz: number, maxStep: number): [number, number] {
  const dx = tx - x, dz = tz - z;
  const d = Math.hypot(dx, dz);
  if (d <= maxStep || d < 1e-9) return [tx, tz];
  return [x + (dx / d) * maxStep, z + (dz / d) * maxStep];
}
