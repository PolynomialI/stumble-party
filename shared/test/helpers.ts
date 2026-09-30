import type { MapDef, ObstacleDef, Piece, TileDef } from '../src/maps/types';
import { CharState, resolveObstacleHits, stepCharacter, type InputCmd, CHAR } from '../src/sim/character';
import { PhysicsWorld } from '../src/sim/world';
import { TEST_THEME } from '../src/maps/themes';

export function testMap(extra: { pieces?: Piece[]; obstacles?: ObstacleDef[]; tiles?: TileDef[] } = {}): MapDef {
  return {
    id: 'test', name: 'Test', type: 'race', blurb: '', timeLimit: 60, killY: -20, theme: TEST_THEME,
    spawn: { pos: [0, 0, 0], yaw: 0, cols: 4, spacing: 1.5 },
    pieces: [{ shape: 'box', size: [40, 1, 40], pos: [0, -0.5, 0], mat: 'floor' }, ...(extra.pieces ?? [])],
    obstacles: extra.obstacles ?? [],
    tiles: extra.tiles ?? [],
    checkpoints: [],
    bot: {},
  };
}

/** One character in a world, stepped exactly like the server does it. */
export class Rig {
  readonly pw: PhysicsWorld;
  readonly c = new CharState();
  tick = 0;
  constructor(map: MapDef, x = 0, z = 0, y = 0) {
    this.pw = new PhysicsWorld(map);
    this.pw.setTime(0);
    this.c.spawn(x, y, z, 0);
  }
  step(inp: InputCmd, ticks = 1): number {
    let fx = 0;
    for (let i = 0; i < ticks; i++) {
      stepCharacter(this.pw, this.c, inp);
      this.tick++;
      this.pw.setTime(this.tick);
      resolveObstacleHits(this.pw, this.c);
      fx |= this.c.fx;
    }
    return fx;
  }
  get feetY() {
    return this.c.py - CHAR.centerHeight;
  }
}

export const idle: InputCmd = { mx: 0, mz: 0, buttons: 0 };
export const fwd: InputCmd = { mx: 0, mz: 1, buttons: 0 };
