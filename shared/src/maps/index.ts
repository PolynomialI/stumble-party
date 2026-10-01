import { LOBBY } from './lobby';
import { TUMBLETOP } from './tumbletop';
import { SPIN_CYCLE } from './spincycle';
import { LAST_STAND } from './laststand';
import { BOUNCY } from './bouncy';
import { WINDMILL } from './windmill';
import { TILE_TUMBLE } from './tiletumble';
import { CHECKER } from './checker';
import type { MapDef } from './types';

export const MAPS: Record<string, MapDef> = {
  [LOBBY.id]: LOBBY,
  [TUMBLETOP.id]: TUMBLETOP,
  [SPIN_CYCLE.id]: SPIN_CYCLE,
  [LAST_STAND.id]: LAST_STAND,
  [BOUNCY.id]: BOUNCY,
  [WINDMILL.id]: WINDMILL,
  [TILE_TUMBLE.id]: TILE_TUMBLE,
  [CHECKER.id]: CHECKER,
};

export function getMap(id: string): MapDef {
  const m = MAPS[id];
  if (!m) throw new Error(`unknown map ${id}`);
  return m;
}

/** Feet positions + yaw for `count` players on the map's spawn grid. */
export function spawnPoints(map: MapDef, count: number): { x: number; y: number; z: number; yaw: number }[] {
  const { pos, yaw, cols, spacing } = map.spawn;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = -fz, rz = fx;
  const out = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const side = (col - (cols - 1) / 2) * spacing;
    const back = -row * spacing;
    out.push({ x: pos[0] + rx * side + fx * back, y: pos[1], z: pos[2] + rz * side + fz * back, yaw });
  }
  return out;
}
