import { box, cyl, deco, wedge, ball, DEG } from './build';
import { SUNNY } from './themes';
import type { MapDef, Piece } from './types';

const pads: Piece[] = [60, 180, 300].map((a) => {
  const r = 7.6, rad = (a + 180) * DEG;
  const x = Math.sin(rad) * r, z = Math.cos(rad) * r;
  return cyl([x, 0.12, z], 2.6, 0.24, 'bounce', {
    surface: 'bounce', power: 16, dir: [-x, 0, -z], round: 0.08,
  });
});

/** Waiting area between matches: a round sky island with toys to warm up on. */
export const LOBBY: MapDef = {
  id: 'lobby',
  name: 'Warm-Up Island',
  type: 'lobby',
  blurb: 'Stretch those legs while everyone arrives!',
  timeLimit: 600,
  killY: -18,
  theme: SUNNY,
  spawn: { pos: [0, 0, -9], yaw: 0, cols: 8, spacing: 1.3 },
  pieces: [
    cyl([0, -1, 0], 30, 2, 'floor', { tex: 'grid', round: 0.25 }),
    deco(cyl([0, -0.3, 0], 30.7, 0.4, 'trim', { round: 0.18 })),
    deco(cyl([0, -3.2, 0], 25, 2.6, 'rock', { round: 0.6 })),
    deco(ball([0, -10, 0], 16, 'rock')),
    // Central tower you reach with the bounce pads.
    cyl([0, 1.9, 0], 2.2, 3.8, 'wall', { round: 0.3 }),
    cyl([0, 3.75, 0], 6, 0.5, 'path', { tex: 'grid', round: 0.2 }),
    ...pads,
    // Ramp to a lookout deck.
    wedge([8.2, 0.9, 0], [4, 1.8, 5], 'accentAlt', { rot: [0, 90 * DEG, 0] }),
    box([12.3, 0.9, 0], [3.2, 1.8, 5], 'accentAlt', { tex: 'grid' }),
    // Conveyor strip.
    box([-10.5, 0.1, 0], [3, 0.2, 11], 'conveyor', { surface: 'conveyor', power: 3.5, dir: [0, 0, 1], tex: 'chevron' }),
    deco(box([-12.3, 0.35, 0], [0.4, 0.7, 11.4], 'trim')),
    deco(box([-8.7, 0.35, 0], [0.4, 0.7, 11.4], 'trim')),
  ],
  obstacles: [
    // A lazy sweeper around the tower: jump over it.
    {
      pos: [0, 0, 0], hit: 7,
      motion: { kind: 'spin', axis: 'y', speed: 1.1 },
      parts: [
        cyl([0, 0.55, 0], 2.6, 1.1, 'metal'),
        { shape: 'box', size: [0.45, 0.45, 5.2], pos: [0, 0.45, 3.9], mat: 'hazard', round: 0.2, tex: 'stripes' },
      ],
    },
  ],
  tiles: [],
  checkpoints: [],
  bot: { arena: { center: [0, 0, 0], radius: 12 } },
};
