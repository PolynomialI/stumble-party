import RAPIER from '@dimforge/rapier3d-compat';
import { DT } from '../constants';
import {
  newPose, poseApply, poseInvApply, quatConj, quatFromEuler, quatMul, quatRotate, quatYaw,
  type Pose, type Quat, type Vec3,
} from '../math';
import type { MapDef, ObstacleDef, Piece, Surface, TileDef } from '../maps/types';
import { obstaclePose } from './obstacles';

let initPromise: Promise<void> | null = null;
/** Loads the Rapier WASM module once. Must resolve before any PhysicsWorld is built. */
export function initPhysics(): Promise<void> {
  return (initPromise ??= RAPIER.init());
}

// Collision groups: membership in the high 16 bits, filter in the low 16.
export const G_WORLD = 1;
export const G_OBSTACLE = 2;
export const G_TILE = 4;
export const G_PLAYER = 8;
const groups = (membership: number, filter: number) => ((membership << 16) | filter) >>> 0;
export const QUERY_SOLID = groups(0xffff, G_WORLD | G_OBSTACLE | G_TILE);
export const QUERY_OBSTACLES = groups(0xffff, G_OBSTACLE);
export const QUERY_STATIC = groups(0xffff, G_WORLD | G_TILE);

export const SURF_NORMAL = 0;
export const SURF_BOUNCE = 1;
export const SURF_CONVEYOR = 2;
export const SURF_ICE = 3;
export const SURF_BUMPER = 4;
const SURFACES: Record<Surface, number> = {
  normal: SURF_NORMAL, bounce: SURF_BOUNCE, conveyor: SURF_CONVEYOR, ice: SURF_ICE, bumper: SURF_BUMPER,
};

export interface ColliderInfo {
  surface: number;
  power: number;
  /** Surface direction (conveyor belt / bounce push). World space for static pieces, pivot-local for obstacle parts. */
  dir: Vec3;
  obstacle: number;
  tile: number;
}

export interface ObstacleRuntime {
  def: ObstacleDef;
  body: RAPIER.RigidBody;
  /** Pose at the world's current tick, and at the tick before (for point velocities). */
  pose: Pose;
  prev: Pose;
  hit: number;
}

export interface TileRuntime {
  def: TileDef;
  collider: RAPIER.Collider;
  /** Tick the tile was stepped on (-1 = never). Scheduled tiles ignore it. */
  triggerTick: number;
  shakeTicks: number;
  respawnTicks: number;
  fallTick: number;
  solid: boolean;
}

export const IDENT_ROT = { x: 0, y: 0, z: 0, w: 1 };

function clampRound(p: Piece, maxHalf: number): number {
  return Math.max(0, Math.min(p.round ?? 0, maxHalf - 0.005));
}

/** Rapier collider shape for a map piece (no transform applied). */
export function pieceColliderDesc(p: Piece): RAPIER.ColliderDesc {
  const [sx, sy, sz] = p.size;
  switch (p.shape) {
    case 'box': {
      const r = clampRound(p, Math.min(sx, sy, sz) / 2);
      return r > 0.01
        ? RAPIER.ColliderDesc.roundCuboid(sx / 2 - r, sy / 2 - r, sz / 2 - r, r)
        : RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
    }
    case 'cyl': {
      const r = clampRound(p, Math.min(sx, sy) / 2);
      return r > 0.01
        ? RAPIER.ColliderDesc.roundCylinder(sy / 2 - r, sx / 2 - r, r)
        : RAPIER.ColliderDesc.cylinder(sy / 2, sx / 2);
    }
    case 'ball':
      return RAPIER.ColliderDesc.ball(sx / 2);
    case 'wedge': {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2;
      const pts = new Float32Array([
        -hx, -hy, -hz, hx, -hy, -hz, -hx, -hy, hz, hx, -hy, hz, // bottom
        -hx, hy, hz, hx, hy, hz, // top back edge
      ]);
      const desc = RAPIER.ColliderDesc.convexHull(pts);
      if (!desc) throw new Error('wedge hull failed');
      return desc;
    }
  }
}

function toQuat(rot: Vec3 | undefined): Quat {
  return rot ? quatFromEuler(rot[0], rot[1], rot[2]) : [0, 0, 0, 1];
}

/**
 * The physical course: static geometry, kinematic obstacles driven by time, and tiles that drop.
 * The same class runs on the server (authoritative) and in the client (prediction), so everything
 * here must be a deterministic function of the map, the tick and the tile trigger ticks.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly info = new Map<number, ColliderInfo>();
  readonly obstacles: ObstacleRuntime[] = [];
  readonly tiles: TileRuntime[] = [];
  /** Round-relative tick the world is posed at. */
  tick = 0;
  private readonly tmpPose = newPose();
  private readonly tmpQ: Quat = [0, 0, 0, 1];

  constructor(readonly map: MapDef) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    for (const p of map.pieces) {
      if (p.solid === false) continue;
      const q = toQuat(p.rot);
      const desc = pieceColliderDesc(p)
        .setTranslation(p.pos[0], p.pos[1], p.pos[2])
        .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
        .setCollisionGroups(groups(G_WORLD, 0xffff));
      const c = this.world.createCollider(desc);
      this.info.set(c.handle, this.pieceInfo(p, q, -1, -1));
    }

    map.obstacles.forEach((def, i) => {
      const pose = obstaclePose(def, 0, newPose());
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(pose.pos[0], pose.pos[1], pose.pos[2])
          .setRotation({ x: pose.rot[0], y: pose.rot[1], z: pose.rot[2], w: pose.rot[3] }),
      );
      for (const p of def.parts) {
        if (p.solid === false) continue;
        const q = toQuat(p.rot);
        const desc = pieceColliderDesc(p)
          .setTranslation(p.pos[0], p.pos[1], p.pos[2])
          .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
          .setCollisionGroups(groups(G_OBSTACLE, 0xffff));
        const c = this.world.createCollider(desc, body);
        this.info.set(c.handle, this.pieceInfo(p, q, i, -1));
      }
      this.obstacles.push({ def, body, pose, prev: obstaclePose(def, -DT, newPose()), hit: def.hit ?? 0 });
    });

    map.tiles.forEach((def, i) => {
      const p = def.piece;
      const q = toQuat(p.rot);
      const desc = pieceColliderDesc(p)
        .setTranslation(p.pos[0], p.pos[1], p.pos[2])
        .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
        .setCollisionGroups(groups(G_TILE, 0xffff));
      const collider = this.world.createCollider(desc);
      this.info.set(collider.handle, this.pieceInfo(p, q, -1, i));
      const shakeTicks = Math.round((def.shake ?? 0.6) / DT);
      this.tiles.push({
        def, collider, triggerTick: -1, shakeTicks,
        respawnTicks: def.respawn === undefined ? -1 : Math.round(def.respawn / DT),
        fallTick: def.fallAt === undefined ? -1 : Math.round(def.fallAt / DT),
        solid: true,
      });
    });

    this.world.step();
  }

  private pieceInfo(p: Piece, q: Quat, obstacle: number, tile: number): ColliderInfo {
    const d: Vec3 = p.dir ? [p.dir[0], p.dir[1], p.dir[2]] : p.surface === 'conveyor' ? [0, 0, 1] : [0, 0, 0];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= len; d[1] /= len; d[2] /= len;
    // Static pieces store the world-space direction. Obstacle parts keep it relative to the pivot.
    const dir = quatRotate(q, d);
    return {
      surface: SURFACES[p.surface ?? 'normal'],
      power: p.power ?? (p.surface === 'bounce' ? 17 : p.surface === 'bumper' ? 10 : 0),
      dir,
      obstacle,
      tile,
    };
  }

  /** Tick at which a tile stops being solid (or -1 if it currently has no drop scheduled). */
  tileFallTick(tile: TileRuntime): number {
    if (tile.fallTick >= 0) return tile.fallTick;
    return tile.triggerTick < 0 ? -1 : tile.triggerTick + tile.shakeTicks;
  }

  tileSolidAt(tile: TileRuntime, tick: number): boolean {
    const fall = this.tileFallTick(tile);
    if (fall < 0 || tick < fall) return true;
    if (tile.fallTick >= 0 || tile.respawnTicks < 0) return false;
    return tick >= fall + tile.respawnTicks;
  }

  /** A player stood on tile `i` at `tick`: start its drop if it is idle. Returns true when newly triggered. */
  stepOnTile(i: number, tick: number): boolean {
    const t = this.tiles[i];
    if (!t || t.fallTick >= 0) return false;
    const fall = this.tileFallTick(t);
    const idle = fall < 0 || (t.respawnTicks >= 0 && tick >= fall + t.respawnTicks);
    if (!idle) return false;
    t.triggerTick = tick;
    return true;
  }

  /** Moves every obstacle / tile to its state at round tick `tick` and refreshes the query structures. */
  setTime(tick: number): void {
    const t = tick * DT;
    for (const o of this.obstacles) {
      obstaclePose(o.def, t - DT, o.prev);
      obstaclePose(o.def, t, o.pose);
      o.body.setNextKinematicTranslation({ x: o.pose.pos[0], y: o.pose.pos[1], z: o.pose.pos[2] });
      o.body.setNextKinematicRotation({ x: o.pose.rot[0], y: o.pose.rot[1], z: o.pose.rot[2], w: o.pose.rot[3] });
    }
    for (const tile of this.tiles) {
      const solid = this.tileSolidAt(tile, tick);
      if (solid !== tile.solid) {
        tile.solid = solid;
        tile.collider.setEnabled(solid);
      }
    }
    this.world.step();
    this.tick = tick;
  }

  /** Where point `p`, riding obstacle `i`, ends up one tick from now (platform carry). Returns the yaw delta. */
  carry(i: number, p: Vec3, out: Vec3): number {
    const o = this.obstacles[i];
    const next = obstaclePose(o.def, (this.tick + 1) * DT, this.tmpPose);
    poseInvApply(o.pose, p, out);
    poseApply(next, out, out);
    quatMul(next.rot, quatConj(o.pose.rot, this.tmpQ), this.tmpQ);
    return quatYaw(this.tmpQ);
  }

  /** Velocity of the material point of obstacle `i` currently at `p` (over the last tick). */
  pointVelocity(i: number, p: Vec3, out: Vec3): Vec3 {
    const o = this.obstacles[i];
    poseInvApply(o.pose, p, out);
    poseApply(o.prev, out, out);
    out[0] = (p[0] - out[0]) / DT;
    out[1] = (p[1] - out[1]) / DT;
    out[2] = (p[2] - out[2]) / DT;
    return out;
  }

  /** Conveyor / bounce direction of a collider, in world space at the current tick. */
  surfaceDir(info: ColliderInfo, out: Vec3): Vec3 {
    if (info.obstacle < 0) {
      out[0] = info.dir[0]; out[1] = info.dir[1]; out[2] = info.dir[2];
      return out;
    }
    return quatRotate(this.obstacles[info.obstacle].pose.rot, info.dir, out);
  }

  free(): void {
    this.world.free();
  }
}
