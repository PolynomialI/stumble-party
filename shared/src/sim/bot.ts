import RAPIER from '@dimforge/rapier3d-compat';
import { DT } from '../constants';
import {
  newPose, poseApply, quatFromEuler, quatRotate, rng, type Pose, type Vec3,
} from '../math';
import type { BotNode, MapDef, Piece } from '../maps/types';
import { BTN_DIVE, BTN_JUMP, BTN_JUMP_PRESS, CHAR, MODE_NORMAL, type CharState, type InputCmd } from './character';
import { hillAt } from '../game/course';
import { obstaclePose } from './obstacles';
import { QUERY_SOLID, type PhysicsWorld } from './world';

/** A hazard part approximated as a capsule (segment + radius) in its obstacle's pivot frame. */
interface HazardSeg {
  obstacle: number;
  a: Vec3;
  b: Vec3;
  r: number;
}

function partSegment(p: Piece): { a: Vec3; b: Vec3; r: number } {
  const [sx, sy, sz] = p.size;
  const q = quatFromEuler(...(p.rot ?? [0, 0, 0]));
  let half: Vec3;
  let r: number;
  if (p.shape === 'cyl') {
    half = [0, sy / 2, 0];
    r = sx / 2;
  } else if (p.shape === 'ball') {
    half = [0, 0, 0];
    r = sx / 2;
  } else if (sx >= sy && sx >= sz) {
    half = [sx / 2, 0, 0];
    r = Math.max(sy, sz) / 2;
  } else if (sz >= sy) {
    half = [0, 0, sz / 2];
    r = Math.max(sx, sy) / 2;
  } else {
    half = [0, sy / 2, 0];
    r = Math.max(sx, sz) / 2;
  }
  const h = quatRotate(q, half);
  return {
    a: [p.pos[0] - h[0], p.pos[1] - h[1], p.pos[2] - h[2]],
    b: [p.pos[0] + h[0], p.pos[1] + h[1], p.pos[2] + h[2]],
    r,
  };
}

const hazardCache = new WeakMap<MapDef, HazardSeg[]>();
function hazards(map: MapDef): HazardSeg[] {
  let list = hazardCache.get(map);
  if (!list) {
    list = [];
    map.obstacles.forEach((o, i) => {
      if (!o.hit) return;
      for (const p of o.parts) {
        if (p.solid === false) continue;
        list!.push({ obstacle: i, ...partSegment(p) });
      }
    });
    hazardCache.set(map, list);
  }
  return list;
}

/** Squared distance between segments p1-q1 and p2-q2, plus the parameter on the second segment. */
function segSegDist2(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): [number, number] {
  const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2];
  const d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
  const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const cx = p1[0] + d1x * s - (p2[0] + d2x * t);
  const cy = p1[1] + d1y * s - (p2[1] + d2y * t);
  const cz = p1[2] + d1z * s - (p2[2] + d2z * t);
  return [cx * cx + cy * cy + cz * cz, t];
}

const _pose: Pose = newPose();
const _a: Vec3 = [0, 0, 0];
const _b: Vec3 = [0, 0, 0];
const _lo: Vec3 = [0, 0, 0];
const _hi: Vec3 = [0, 0, 0];
const _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
/** How long before a jumpable hazard arrives a bot takes off (s); the jump peaks ~0.34 s after take-off. */
const JUMP_LEAD = 0.36;
/** Bots treat floor that drops within this many ticks as already gone. */
const SAFE_TICKS = 4 / DT;

interface Danger {
  hit: boolean;
  /** Top of the threatening part above our feet (m). */
  top: number;
}

/**
 * Server-side (and practice-mode) opponent. Plays by the same inputs a human sends, so it obeys every rule.
 * `skill` in [0, 1] scales how reliably it reads hazards and how cleanly it runs.
 */
export class BotBrain {
  private readonly rand: () => number;
  private wp = 0;
  private lane: number;
  private stuckT = 0;
  private holdT = 0;
  private jumpCd = 0;
  private decideT = 0;
  private ignoreHazards = false;
  private wander: Vec3 | null = null;
  private wanderT = 0;
  private laneT = 0;
  /** Set by the match rules (tag rounds): someone to run at, or to run away from. */
  goal: { x: number; z: number; flee: boolean } | null = null;

  constructor(seed: number, readonly skill: number) {
    this.rand = rng(seed);
    this.lane = this.rand() * 2 - 1;
  }

  /** Call after a respawn or when a new round starts: re-acquire the nearest waypoint ahead. */
  reset(map: MapDef, c: CharState) {
    this.wander = null;
    this.stuckT = 0;
    this.holdT = 0;
    const path = map.bot.path;
    if (!path?.length) return;
    let best = 0, bestD = Infinity;
    path.forEach((n, i) => {
      const d = (n.p[0] - c.px) ** 2 + (n.p[1] - (c.py - CHAR.centerHeight)) ** 2 * 4 + (n.p[2] - c.pz) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    // Skip it if we are already past it along the path.
    const next = path[Math.min(best + 1, path.length - 1)];
    const n = path[best];
    const dx = next.p[0] - n.p[0], dz = next.p[2] - n.p[2];
    if ((c.px - n.p[0]) * dx + (c.pz - n.p[2]) * dz > 0) best = Math.min(best + 1, path.length - 1);
    this.wp = best;
  }

  private target(node: BotNode): [number, number] {
    return [node.p[0] + this.laneOffset(node), node.p[2]];
  }

  private laneOffset(node: BotNode): number {
    if (node.lanes?.length) {
      const want = this.lane * 5;
      return node.lanes.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    }
    const spread = node.spread ?? 1.5;
    let off = this.lane * spread;
    if (node.avoid && Math.abs(off) < node.avoid) off = (off < 0 ? -1 : 1) * node.avoid;
    return off;
  }

  /** Predicts whether standing at (x, feetY, z) at time `t` (round seconds) overlaps any hazard. */
  private danger(pw: PhysicsWorld, x: number, feetY: number, z: number, t: number): Danger {
    const out: Danger = { hit: false, top: 0 };
    _lo[0] = x; _lo[1] = feetY + CHAR.radius; _lo[2] = z;
    _hi[0] = x; _hi[1] = feetY + CHAR.centerHeight * 2 - CHAR.radius; _hi[2] = z;
    for (const h of hazards(pw.map)) {
      const def = pw.map.obstacles[h.obstacle];
      // Cheap reject on pivot distance.
      const dx = def.pos[0] - x, dz = def.pos[2] - z;
      if (dx * dx + dz * dz > 400) continue;
      obstaclePose(def, t, _pose);
      poseApply(_pose, h.a, _a);
      poseApply(_pose, h.b, _b);
      const [d2, s] = segSegDist2(_lo, _hi, _a, _b);
      const reach = h.r + CHAR.radius + 0.18;
      if (d2 < reach * reach) {
        out.hit = true;
        const y = _a[1] + (_b[1] - _a[1]) * s;
        out.top = Math.max(out.top, y + h.r - feetY);
      }
    }
    return out;
  }

  private groundAhead(pw: PhysicsWorld, x: number, feetY: number, z: number): boolean {
    _ray.origin = { x, y: feetY + 0.6, z };
    return !!pw.world.castRay(_ray, 4.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_SOLID);
  }

  /** Ground at (x, z) that will still be there a few seconds from now (not a tile about to drop). */
  private safeGround(pw: PhysicsWorld, x: number, feetY: number, z: number): boolean {
    _ray.origin = { x, y: feetY + 0.6, z };
    const hit = pw.world.castRay(_ray, 4.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY_SOLID);
    if (!hit) return false;
    const tile = pw.info.get(hit.collider.handle)?.tile ?? -1;
    if (tile < 0) return true;
    const fall = pw.tileFallTick(pw.tiles[tile]);
    return fall < 0 || fall - pw.tick > SAFE_TICKS;
  }

  think(pw: PhysicsWorld, c: CharState, out: InputCmd): InputCmd {
    const t = pw.tick * DT;
    const feetY = c.py - CHAR.centerHeight;
    out.buttons = 0;
    out.mx = 0;
    out.mz = 0;
    this.jumpCd = Math.max(0, this.jumpCd - DT);
    this.decideT -= DT;
    if (this.decideT <= 0) {
      // Every half second, maybe "lose focus" (lower skill = more hits taken).
      this.decideT = 0.5;
      this.ignoreHazards = this.rand() < (1 - this.skill) * 0.3;
    }
    this.laneT -= DT;
    // No lane changes while the path is split into separate lanes (beams, stepping stones, logs).
    const split = !!pw.map.bot.path?.[Math.min(this.wp, pw.map.bot.path.length - 1)]?.lanes;
    if (this.laneT <= 0 && !split) {
      this.laneT = 2 + this.rand() * 3;
      this.lane = Math.max(-1, Math.min(1, this.lane + (this.rand() - 0.5) * 0.8));
    }

    // Where do we want to go?
    let tx: number, tz: number;
    let takeOff = false;
    const path = pw.map.bot.path;
    if (path?.length) {
      let node = path[Math.min(this.wp, path.length - 1)];
      [tx, tz] = this.target(node);
      // Jump waypoints are take-off points: reach them (tightly) and jump; the next waypoint is the landing.
      const r = node.r ?? (node.jump ? 0.55 : 2.2);
      const prev = path[Math.max(0, this.wp - 1)];
      const fx = node.p[0] - prev.p[0], fz = node.p[2] - prev.p[2];
      const passed = this.wp > 0 && (c.px - node.p[0]) * fx + (c.pz - node.p[2]) * fz > 0;
      if (((c.px - tx) ** 2 + (c.pz - tz) ** 2 < r * r || passed) && this.wp < path.length - 1) {
        takeOff = !!node.jump;
        this.wp++;
        node = path[this.wp];
        [tx, tz] = this.target(node);
      }
    } else {
      [tx, tz] = this.wanderTarget(pw, c);
    }

    let dx = tx - c.px, dz = tz - c.pz;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-3) { dx /= dist; dz /= dist; }
    let speed = dist < 0.4 && !path ? 0 : 1;
    // Short hops (stepping stones): approach a take-off point slowly so the jump does not overshoot the landing.
    if (path?.length) {
      const cur = path[Math.min(this.wp, path.length - 1)];
      const land = path[Math.min(this.wp + 1, path.length - 1)];
      if (cur.jump && dist < 3) {
        const hop = Math.hypot(land.p[0] - cur.p[0], land.p[2] - cur.p[2]);
        speed = Math.min(speed, Math.max(0.45, Math.min(1, hop / 4.6)));
      }
    }

    // Hazards: compare "keep going" vs "hold still" a moment ahead.
    this.holdT = Math.max(0, this.holdT - DT);
    if (!this.ignoreHazards && c.mode === MODE_NORMAL) {
      const run = CHAR.runSpeed;
      // Sample every tick: a fast sweeper crosses a spot in ~0.15 s and would slip between coarser samples.
      let goHit = false, stayHit = false, lowTop = 99, soon = false;
      for (let h = DT; h <= 0.6 + 1e-6; h += DT) {
        const g = this.danger(pw, c.px + dx * run * h, feetY, c.pz + dz * run * h, t + h);
        const s = this.danger(pw, c.px, feetY, c.pz, t + h);
        if (g.hit) { goHit = true; lowTop = Math.min(lowTop, g.top); if (h <= JUMP_LEAD) soon = true; }
        if (s.hit) { stayHit = true; lowTop = Math.min(lowTop, s.top); if (h <= JUMP_LEAD) soon = true; }
        if (goHit && stayHit) break;
      }
      if (goHit || stayHit) {
        const jumpable = lowTop < 1.25;
        // Jump about an apex-time before impact: the feet are highest just as the bar arrives.
        if (jumpable && soon && c.grounded && this.jumpCd <= 0) {
          out.buttons |= BTN_JUMP | BTN_JUMP_PRESS;
          this.jumpCd = 0.6;
        } else if (!jumpable) {
          if (goHit && !stayHit) { speed = 0; this.holdT = 0.15; }
          else if (stayHit && goHit) { dx = -dx; dz = -dz; speed = 0.8; }
        }
      }
    }
    if (this.holdT > 0) speed = 0;

    // Gaps: jump at a take-off waypoint, or when the ground runs out just ahead.
    if ((c.grounded || c.airT < 0.08) && speed > 0 && this.jumpCd <= 0) {
      const ahead = this.groundAhead(pw, c.px + dx * 0.9, feetY, c.pz + dz * 0.9);
      if (takeOff || !ahead) {
        out.buttons |= BTN_JUMP | BTN_JUMP_PRESS;
        this.jumpCd = 0.45;
      }
    }

    // Stuck against something: hop, then try another lane.
    const hs = Math.hypot(c.vx, c.vz);
    if (c.grounded && speed > 0 && hs < 1.2) this.stuckT += DT;
    else this.stuckT = Math.max(0, this.stuckT - DT * 2);
    if (this.stuckT > 0.6 && this.jumpCd <= 0) {
      out.buttons |= BTN_JUMP | BTN_JUMP_PRESS;
      this.jumpCd = 0.7;
      if (this.stuckT > 1.8) { this.lane = this.rand() * 2 - 1; this.stuckT = 0; }
    }

    // The occasional flashy dive on open ground.
    if (c.grounded && speed > 0 && hs > 6 && this.rand() < 0.002 * (1 + this.skill)) out.buttons |= BTN_DIVE;

    const wobble = (1 - this.skill) * 0.25;
    const ang = (this.rand() - 0.5) * wobble;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    out.mx = (dx * cs - dz * sn) * speed;
    out.mz = (dx * sn + dz * cs) * speed;
    return out;
  }

  /** Survival/final: roam the arena, preferring solid tiles that are not about to drop. */
  private wanderTarget(pw: PhysicsWorld, c: CharState): [number, number] {
    this.wanderT -= DT;
    const arena = pw.map.bot.arena;
    if (this.goal) {
      if (!this.goal.flee) return [this.goal.x, this.goal.z];
      // Run directly away, but turn along the edge rather than off it.
      let x = c.px * 2 - this.goal.x, z = c.pz * 2 - this.goal.z;
      if (arena) {
        const d = Math.hypot(x - arena.center[0], z - arena.center[2]);
        const max = arena.radius * 0.85;
        if (d > max) {
          x = arena.center[0] + ((x - arena.center[0]) / d) * max + (c.pz - this.goal.z) * 0.6;
          z = arena.center[2] + ((z - arena.center[2]) / d) * max - (c.px - this.goal.x) * 0.6;
        }
      }
      return [x, z];
    }
    // Zone rounds: stand in the scoring zone, each bot on its own patch of it.
    const hill = hillAt(pw.map, pw.tick * DT);
    if (hill) {
      const r = pw.map.hill!.r * 0.6;
      return [hill[0] + this.lane * r, hill[2] + Math.sin(this.lane * 9) * r];
    }
    const feetY = c.py - CHAR.centerHeight;
    const reached = this.wander && (c.px - this.wander[0]) ** 2 + (c.pz - this.wander[2]) ** 2 < 1;
    // Re-plan if the destination, or the ground under our own feet, is about to drop.
    const unsafe = (this.wander && !this.safeGround(pw, this.wander[0], feetY, this.wander[2])) ||
      !this.safeGround(pw, c.px, feetY, c.pz);
    if (!this.wander || this.wanderT <= 0 || reached || unsafe) {
      this.wanderT = 1.5 + this.rand() * 2.5;
      let best: Vec3 | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 8; i++) {
        let x: number, z: number;
        if (pw.tiles.length > 0 && (i % 2 === 0 || !arena)) {
          const tile = pw.tiles[Math.floor(this.rand() * pw.tiles.length)];
          x = tile.def.piece.pos[0];
          z = tile.def.piece.pos[2];
        } else if (arena) {
          const a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand()) * arena.radius * 0.8;
          x = arena.center[0] + Math.cos(a) * r;
          z = arena.center[2] + Math.sin(a) * r;
        } else {
          x = c.px + (this.rand() - 0.5) * 8;
          z = c.pz + (this.rand() - 0.5) * 8;
        }
        if (!this.safeGround(pw, x, feetY, z)) continue;
        const d = Math.hypot(x - c.px, z - c.pz);
        const centre = arena ? Math.hypot(x - arena.center[0], z - arena.center[2]) : 0;
        const score = -Math.abs(d - 5) - centre * 0.3 + this.rand() * 2;
        if (score > bestScore) { bestScore = score; best = [x, feetY, z]; }
      }
      this.wander = best ?? (arena ? [arena.center[0], feetY, arena.center[2]] : [c.px, feetY, c.pz]);
    }
    return [this.wander[0], this.wander[2]];
  }
}
