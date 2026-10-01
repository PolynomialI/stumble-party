import { ball, cyl, deco } from './build';
import { rng } from '../math';
import { SUNNY } from './themes';
import type { MapDef, ObstacleDef, Piece, TileDef } from './types';

const N = 6;
const STEP = 3.5;
const SIZE = 3.38;

// Deterministic drop order: three waves of nine tiles each, leaving nine standing.
const order = Array.from({ length: N * N }, (_, i) => i);
const r = rng(20251);
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(r() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
const WAVES = [20, 38, 56];
const dropAt = new Map<number, number>();
order.slice(0, 27).forEach((tile, k) => dropAt.set(tile, WAVES[Math.floor(k / 9)]));

// Squares that drop are scheduled tiles; the nine that never drop are plain floor.
const tiles: TileDef[] = [];
const solid: Piece[] = [];
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const piece: Piece = {
      shape: 'box', size: [SIZE, 0.7, SIZE],
      pos: [(i - (N - 1) / 2) * STEP, -0.35, (j - (N - 1) / 2) * STEP],
      round: 0.14, mat: (i + j) % 2 === 0 ? 'tile' : 'tileAlt',
    };
    const fallAt = dropAt.get(i * N + j);
    if (fallAt === undefined) solid.push(piece);
    else tiles.push({ piece, fallAt, shake: 3 });
  }
}

/** A heavy ball swung around the arena on an invisible arm. */
const ballArm = (radius: number, speed: number, phase: number): ObstacleDef => ({
  pos: [0, 0, 0],
  hit: 10,
  motion: { kind: 'spin', axis: 'y', speed, phase, accel: 0.012, maxSpeed: speed * 2.2 },
  parts: [ball([0, 1.05, radius], 2.1, 'hazard', { tex: 'stripes' })],
});

/** Final: the checkerboard collapses in waves while wrecking balls roll around it. Last one standing wins. */
export const CHECKER: MapDef = {
  id: 'checker',
  name: 'Checker Clash',
  type: 'final',
  blurb: 'Squares drop in waves and wrecking balls roll by. Be the last one standing!',
  timeLimit: 150,
  killY: -10,
  theme: SUNNY,
  spawn: { pos: [0, 0, -5.25], yaw: 0, cols: 8, spacing: 1.25 },
  pieces: [
    ...solid,
    deco(cyl([0, -3, 0], 18, 4, 'rock', { round: 1 })),
    deco(ball([0, -7, 0], 12, 'rock')),
    ...[[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([x, z]) =>
      deco(cyl([x, -2, z], 1.2, 8, 'accent', { round: 0.4 }))),
  ],
  obstacles: [
    // The arms start pointing away from the spawn rows (south) so nobody is hit before GO.
    ballArm(7.8, 0.75, Math.PI * 0.5),
    ballArm(4.2, -1.05, -Math.PI * 0.5),
  ],
  tiles,
  checkpoints: [],
  bot: { arena: { center: [0, 0, 0], radius: 8 } },
};
