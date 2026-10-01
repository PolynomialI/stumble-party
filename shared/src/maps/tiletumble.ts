import { ball, cyl, deco } from './build';
import { TWILIGHT } from './themes';
import type { MapDef, Piece, TileDef } from './types';

const N = 7;
const STEP = 2.75;
const SIZE = 2.6;
const LAYERS = [0, -7, -14];

const tiles: TileDef[] = [];
LAYERS.forEach((top, layer) => {
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = (i - (N - 1) / 2) * STEP, z = (j - (N - 1) / 2) * STEP;
      tiles.push({
        piece: {
          shape: 'box', size: [SIZE, 0.5, SIZE], pos: [x, top - 0.25, z], round: 0.16,
          mat: (i + j + layer) % 2 === 0 ? 'tile' : 'tileAlt',
        },
        shake: 0.55,
      });
    }
  }
});

// Lanterns on posts around the floors, just for atmosphere.
const lanterns: Piece[] = [];
for (const [x, z] of [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5]] as const) {
  lanterns.push(
    deco(cyl([x, -9, z], 0.8, 22, 'wall', { round: 0.3 })),
    deco(ball([x, 2.4, z], 1.4, 'accent')),
  );
}

/** Survival: three floors of tiles that drop the moment you step off them. Keep moving! */
export const TILE_TUMBLE: MapDef = {
  id: 'tiletumble',
  name: 'Tile Tumble',
  type: 'survival',
  blurb: 'Tiles drop right after you touch them. Keep moving and fall to the floor below!',
  timeLimit: 120,
  killY: -20,
  theme: TWILIGHT,
  spawn: { pos: [0, 0, -1.4], yaw: 0, cols: 8, spacing: 1.25 },
  pieces: [...lanterns],
  obstacles: [],
  tiles,
  checkpoints: [],
  bot: { arena: { center: [0, 0, 0], radius: 8.5 } },
};
