import { ball, cyl, deco, DEG } from './build';
import { LAGOON } from './themes';
import type { MapDef, Piece } from './types';

const R_FLOOR = 11.5;
const R_RIM = 13.6;

// Bumpers stand on the slippery rim, just outside the sweeper's reach.
const rimBumpers: Piece[] = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 15 * DEG;
  const x = Math.sin(a) * 12.55, z = Math.cos(a) * 12.55;
  rimBumpers.push(
    cyl([x, 0.65, z], 1.2, 1.3, 'bumper', { surface: 'bumper', power: 10, round: 0.3 }),
    deco(cyl([x, 1.28, z], 1.32, 0.18, 'white', { round: 0.08 })),
  );
}

/** Survival: one long sweeper that keeps speeding up, on an island with an icy rim. */
export const SPIN_CYCLE: MapDef = {
  id: 'spincycle',
  name: 'Spin Cycle',
  type: 'survival',
  blurb: 'Jump the sweeper as it speeds up. Stay on the island!',
  timeLimit: 90,
  killY: -10,
  theme: LAGOON,
  spawn: { pos: [0, 0, -4.6], yaw: 0, cols: 8, spacing: 1.2 },
  pieces: [
    cyl([0, -0.5, 0], R_FLOOR * 2, 1, 'floor', { tex: 'grid', round: 0.2 }),
    // Icy rim: walkable, but nobody keeps their footing for long.
    cyl([0, -0.56, 0], R_RIM * 2, 0.88, 'ice', { surface: 'ice', round: 0.3 }),
    deco(cyl([0, -0.1, 0], R_FLOOR * 2 + 0.25, 0.22, 'white', { round: 0.1 })),
    ...rimBumpers,
    deco(cyl([0, -2.6, 0], R_RIM * 2 - 2, 3, 'rock', { round: 0.8 })),
    deco(ball([0, -8, 0], 15, 'rock')),
  ],
  obstacles: [
    {
      pos: [0, 0, 0],
      hit: 9,
      // Starts lying along X so it clears the spawn grid (south half) until GO.
      motion: { kind: 'spin', axis: 'y', speed: 1.0, accel: 0.022, maxSpeed: 2.6, phase: Math.PI / 2 },
      parts: [
        cyl([0, 0.75, 0], 2.4, 1.5, 'metal'),
        cyl([0, 1.58, 0], 1.6, 0.18, 'accent'),
        { shape: 'box', size: [0.6, 0.6, 23], pos: [0, 0.5, 0], mat: 'hazard', round: 0.28, tex: 'stripes' },
        deco(ball([0, 1.9, 0], 0.8, 'accentAlt')),
      ],
    },
  ],
  tiles: [],
  checkpoints: [],
  bot: { arena: { center: [0, 0, 0], radius: R_FLOOR } },
};
