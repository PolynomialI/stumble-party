import type { Vec3 } from '../math';
import type { MapDef, Zone } from '../maps/types';
import { spawnPoints } from '../maps/index';

/** Height below which a player is out, at round time `t` seconds (rises on lava maps). */
export function killYAt(map: MapDef, t: number): number {
  const l = map.lava;
  return l ? Math.min(l.yMax, map.killY + Math.max(0, t - l.delay) * l.speed) : map.killY;
}

/** Centre of the scoring zone at round time `t` seconds (points maps). */
export function hillAt(map: MapDef, t: number): Vec3 | null {
  const h = map.hill;
  return h ? h.spots[Math.floor(Math.max(0, t) / h.hold) % h.spots.length] : null;
}

/** Whether a feet position scores in the zone right now. */
export function onHill(map: MapDef, t: number, x: number, y: number, z: number): boolean {
  const c = hillAt(map, t);
  return !!c && Math.abs(y - c[1]) < 3 && (x - c[0]) ** 2 + (z - c[2]) ** 2 < map.hill!.r ** 2;
}

export function inZone(zone: Zone, x: number, y: number, z: number): boolean {
  return x >= zone.min[0] && x <= zone.max[0] && y >= zone.min[1] && y <= zone.max[1] && z >= zone.min[2] && z <= zone.max[2];
}

/** Index of the furthest checkpoint the feet position is inside, if it is beyond `current`; else `current`. */
export function reachCheckpoint(map: MapDef, x: number, y: number, z: number, current: number): number {
  for (let i = map.checkpoints.length - 1; i > current; i--) {
    if (inZone(map.checkpoints[i], x, y, z)) return i;
  }
  return current;
}

/** Where a player respawns after falling: their last checkpoint (or the start), fanned out by slot so nobody stacks. */
export function respawnPoint(map: MapDef, checkpoint: number, slot: number): { x: number; y: number; z: number; yaw: number } {
  if (checkpoint < 0) {
    const s = spawnPoints(map, slot + 1)[slot];
    return s;
  }
  const cp = map.checkpoints[checkpoint];
  const lane = ((slot * 7) % 5) - 2;
  const row = Math.floor(slot / 5) % 3;
  const fx = Math.sin(cp.yaw), fz = Math.cos(cp.yaw);
  return {
    x: cp.spawn[0] + fz * lane * 1.1 - fx * row * 1.1,
    y: cp.spawn[1],
    z: cp.spawn[2] - fx * lane * 1.1 - fz * row * 1.1,
    yaw: cp.yaw,
  };
}
