import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../src/constants';
import { respawnPoint } from '../src/game/course';
import { MAPS, spawnPoints } from '../src/maps/index';
import type { MapDef } from '../src/maps/types';
import { CHAR, CharState, stepCharacter, resolveObstacleHits, NO_INPUT } from '../src/sim/character';
import { PhysicsWorld, initPhysics } from '../src/sim/world';

beforeAll(async () => {
  await initPhysics();
});

/** Drops a character at a feet position and reports whether it settles on solid ground nearby. */
function settles(pw: PhysicsWorld, x: number, y: number, z: number) {
  const c = new CharState().spawn(x, y, z, 0);
  for (let i = 0; i < 20; i++) {
    stepCharacter(pw, c, NO_INPUT);
    resolveObstacleHits(pw, c);
  }
  const feet = c.py - CHAR.centerHeight;
  return { grounded: c.grounded, drop: y - feet };
}

describe.each(Object.values(MAPS).map((m) => [m.id, m] as [string, MapDef]))('map %s', (_id, map) => {
  it('builds a physics world', () => {
    const pw = new PhysicsWorld(map);
    pw.setTime(0);
    expect(pw.obstacles.length).toBe(map.obstacles.length);
    expect(pw.tiles.length).toBe(map.tiles.length);
    pw.free();
  });

  it('spawns every player on solid ground', () => {
    const pw = new PhysicsWorld(map);
    pw.setTime(0);
    for (const s of spawnPoints(map, MAX_PLAYERS)) {
      const r = settles(pw, s.x, s.y, s.z);
      expect(r.grounded, `spawn ${s.x},${s.z}`).toBe(true);
      expect(Math.abs(r.drop), `spawn ${s.x},${s.z}`).toBeLessThan(0.1);
    }
    pw.free();
  });

  it('respawns on solid ground at every checkpoint', () => {
    const pw = new PhysicsWorld(map);
    pw.setTime(0);
    map.checkpoints.forEach((_, cp) => {
      for (let slot = 0; slot < 15; slot++) {
        const s = respawnPoint(map, cp, slot);
        const r = settles(pw, s.x, s.y, s.z);
        expect(r.grounded, `checkpoint ${cp} slot ${slot}`).toBe(true);
        expect(Math.abs(r.drop), `checkpoint ${cp} slot ${slot}`).toBeLessThan(0.1);
      }
    });
    pw.free();
  });

  if (map.type === 'race') {
    it('has a finish line beyond every checkpoint', () => {
      expect(map.finish).toBeDefined();
      for (const cp of map.checkpoints) expect(cp.spawn[2]).toBeLessThan(map.finish!.min[2]);
    });
  }
});
