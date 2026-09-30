import { beforeAll, describe, expect, it } from 'vitest';
import { DT } from '../src/constants';
import { inZone, reachCheckpoint, respawnPoint } from '../src/game/course';
import { getMap, spawnPoints } from '../src/maps/index';
import { BotBrain } from '../src/sim/bot';
import { CHAR, CharState, resolveObstacleHits, stepCharacter, type InputCmd } from '../src/sim/character';
import { PhysicsWorld, initPhysics } from '../src/sim/world';

beforeAll(async () => {
  await initPhysics();
});

/** Runs one bot solo through a race map. Returns finish time (s) or null, plus how often it fell. */
export function soloRace(mapId: string, seed: number, skill: number) {
  const map = getMap(mapId);
  const pw = new PhysicsWorld(map);
  pw.setTime(0);
  const s = spawnPoints(map, 8)[seed % 8];
  const c = new CharState().spawn(s.x, s.y, s.z, s.yaw);
  const brain = new BotBrain(seed, skill);
  brain.reset(map, c);
  const cmd: InputCmd = { mx: 0, mz: 0, buttons: 0 };
  let checkpoint = -1;
  let falls = 0;
  const limit = Math.round(map.timeLimit / DT);
  for (let tick = 1; tick <= limit; tick++) {
    brain.think(pw, c, cmd);
    stepCharacter(pw, c, cmd);
    pw.setTime(tick);
    resolveObstacleHits(pw, c);
    if (c.grounded && c.groundTile >= 0) pw.stepOnTile(c.groundTile, tick);
    if (c.py < map.killY) {
      falls++;
      const r = respawnPoint(map, checkpoint, seed % 15);
      c.spawn(r.x, r.y, r.z, r.yaw);
      brain.reset(map, c);
      continue;
    }
    const feet = c.py - CHAR.centerHeight;
    checkpoint = reachCheckpoint(map, c.px, feet, c.pz, checkpoint);
    if (map.finish && inZone(map.finish, c.px, feet, c.pz)) {
      pw.free();
      return { time: tick * DT, falls, checkpoint };
    }
  }
  pw.free();
  return { time: null, falls, checkpoint };
}

describe('bots', () => {
  it('finish Tumbletop Trail within the time limit', () => {
    const results = [1, 2, 3, 4, 5, 6].map((seed) => soloRace('tumbletop', seed, 0.85));
    const finished = results.filter((r) => r.time !== null);
    console.log('tumbletop bot runs', JSON.stringify(results));
    expect(finished.length).toBeGreaterThanOrEqual(5);
  });
});
