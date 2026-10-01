import { box, cyl, deco, DEG } from './build';
import { CANDY } from './themes';
import type { MapDef, ObstacleDef, Piece } from './types';

const floor = (z0: number, z1: number, w: number, top: number, mat: Piece['mat'] = 'floor'): Piece =>
  box([0, top - 0.5, (z0 + z1) / 2], [w, 1, z1 - z0], mat, { tex: 'grid' });
const rails = (halfW: number, z0: number, z1: number, top: number): Piece[] => [-1, 1].map((s) =>
  box([s * (halfW + 0.2), top + 0.4, (z0 + z1) / 2], [0.4, 0.8, z1 - z0], 'trim', { round: 0.16 }));
const pillar = (x: number, z: number, top: number): Piece =>
  deco(cyl([x, top - 7.5, z], 1.8, 13, 'rock', { round: 0.4 }));

/** Lane of belt, with a white curb either side. */
const lane = (x: number, z0: number, z1: number, dir: [number, number, number], power: number): Piece[] => [
  box([x, 0.1, (z0 + z1) / 2], [4.4, 0.2, z1 - z0], 'conveyor', { surface: 'conveyor', power, dir, tex: 'chevron', round: 0.06 }),
];

/** Turntable riding over a void, with a low wall on it to hop. */
const turntable = (z: number, speed: number, phase: number): ObstacleDef => ({
  pos: [0, 0, z],
  motion: { kind: 'spin', axis: 'y', speed, phase },
  parts: [
    cyl([0, -0.3, 0], 11, 0.6, 'accentAlt', { tex: 'dots', round: 0.15 }),
    box([0, 0.3, 0], [7.5, 0.6, 0.6], 'wall', { round: 0.25 }),
    deco(cyl([0, -0.02, 0], 1.6, 0.08, 'white', { round: 0.03 })),
  ],
});

/** Log swinging along the path at shin height. */
const log = (z: number, phase: number): ObstacleDef => ({
  pos: [0, 6.4, z],
  hit: 10,
  motion: { kind: 'swing', axis: 'x', amplitude: 0.85, period: 2.6, phase },
  parts: [
    { shape: 'box', size: [0.3, 5.4, 0.3], pos: [-5.6, -2.7, 0], mat: 'metal', round: 0.1 },
    { shape: 'box', size: [0.3, 5.4, 0.3], pos: [5.6, -2.7, 0], mat: 'metal', round: 0.1 },
    cyl([0, -5.85, 0], 1, 13, 'hazard', { rot: [0, 0, 90 * DEG], tex: 'stripes', round: 0.35 }),
  ],
});

const logFrame = (z: number): Piece[] => [
  deco(cyl([-7.9, 3.4, z], 0.6, 6.8, 'accent', { round: 0.2 })),
  deco(cyl([7.9, 3.4, z], 0.6, 6.8, 'accent', { round: 0.2 })),
  deco(box([0, 6.6, z], [16.4, 0.7, 0.7], 'accent', { round: 0.25 })),
];

const bumper = (x: number, z: number): Piece[] => [
  cyl([x, 0.7, z], 1.1, 1.4, 'bumper', { surface: 'bumper', power: 9, round: 0.3 }),
  deco(cyl([x, 1.32, z], 1.22, 0.2, 'white', { round: 0.08 })),
];

/** Race: jump gaps, a three-lane conveyor maze, turntables over the void and swinging logs. */
export const BOUNCY: MapDef = {
  id: 'bouncy',
  name: 'Bouncy Boulevard',
  type: 'race',
  blurb: 'Leap the gaps, pick the right belt and ride the spinning floors!',
  timeLimit: 120,
  killY: -10,
  theme: CANDY,
  spawn: { pos: [0, 0, 4.8], yaw: 0, cols: 8, spacing: 1.4 },
  pieces: [
    // Start.
    floor(0, 12, 16, 0),
    ...rails(8, 0, 12, 0),
    box([0, 0.6, -0.2], [16.8, 1.2, 0.4], 'trim'),
    deco(cyl([-7.2, 2.5, 11.4], 1, 5, 'wall', { round: 0.3 })),
    deco(cyl([7.2, 2.5, 11.4], 1, 5, 'wall', { round: 0.3 })),
    deco(box([0, 5.3, 11.4], [15.4, 1.1, 1.1], 'wall', { round: 0.4 })),
    // Jump gaps.
    floor(12, 20, 12, 0, 'floorAlt'),
    floor(22.6, 30, 12, 0),
    floor(33, 40, 12, 0, 'floorAlt'),
    ...rails(6, 12, 20, 0), ...rails(6, 22.6, 30, 0), ...rails(6, 33, 40, 0),
    pillar(-3, 21.3, 0), pillar(3, 31.5, 0),
    // Conveyor lanes: left helps, middle fights you, right shoves you sideways.
    box([0, -0.5, 50.25], [16, 1, 20.5], 'floor', { tex: 'grid' }),
    ...rails(8, 40, 64, 0),
    ...lane(-5.2, 40.5, 60.3, [0, 0, 1], 3),
    ...lane(0, 40.5, 60.3, [0, 0, -1], 4.5),
    ...lane(5.2, 40.5, 60.3, [1, 0, 0], 2.6),
    ...bumper(-2.6, 46), ...bumper(2.6, 51), ...bumper(-2.6, 56),
    // Turntables over the void.
    // Floors run in under the turntables (a hair lower) so their round edges never leave a gap.
    floor(60.5, 64, 16, 0, 'path'),
    box([0, -0.53, 65.6], [12, 1, 3.2], 'path', { tex: 'grid' }),
    box([0, -0.53, 87.2], [12, 1, 3.2], 'path', { tex: 'grid' }),
    floor(88.6, 91, 12, 0, 'path'),
    pillar(0, 70, 0), pillar(0, 83, 0),
    // Swinging logs, then the finish.
    floor(91, 118, 14, 0),
    ...rails(7, 91, 118, 0),
    ...logFrame(97), ...logFrame(106),
    deco(cyl([-6.9, 2.5, 114], 1.1, 5, 'accent', { round: 0.3 })),
    deco(cyl([6.9, 2.5, 114], 1.1, 5, 'accent', { round: 0.3 })),
    deco(box([0, 5.2, 114], [15, 1.6, 0.6], 'finish', { tex: 'checker', round: 0.25 })),
    deco(box([0, 0.02, 114], [13.6, 0.04, 1.2], 'finish', { tex: 'checker', round: 0.01 })),
    box([0, 0.6, 118.2], [14.8, 1.2, 0.4], 'trim'),
  ],
  obstacles: [
    turntable(69.8, 0.9, 0),
    turntable(83.3, -1.1, Math.PI / 2),
    log(97, 0),
    log(106, Math.PI),
  ],
  tiles: [],
  checkpoints: [
    { min: [-6, -1, 33], max: [6, 5, 40], spawn: [0, 0, 36.5], yaw: 0 },
    { min: [-8, -1, 60.5], max: [8, 5, 64], spawn: [0, 0, 63.2], yaw: 0 },
    { min: [-7, -1, 88.6], max: [7, 5, 93], spawn: [0, 0, 91.6], yaw: 0 },
  ],
  finish: { min: [-7, -1, 114], max: [7, 8, 118] },
  bot: {
    path: [
      { p: [0, 0, 9], spread: 4 },
      { p: [0, 0, 19.55], spread: 3, jump: true },
      { p: [0, 0, 25], spread: 3 },
      { p: [0, 0, 29.55], spread: 3, jump: true },
      { p: [0, 0, 38], spread: 3 },
      { p: [-5.2, 0, 44], spread: 0.6 },
      { p: [-5.2, 0, 58.5], spread: 0.6 },
      { p: [0, 0, 63.4], spread: 2 },
      { p: [0, 0, 70], spread: 2 },
      { p: [0, 0, 74.85], spread: 0.6, jump: true },
      { p: [0, 0, 83], spread: 2 },
      { p: [0, 0, 88.6], spread: 1.5 },
      { p: [0, 0, 93], spread: 3 },
      { p: [0, 0, 101.5], spread: 4 },
      { p: [0, 0, 110], spread: 4 },
      { p: [0, 0, 116], spread: 4 },
    ],
  },
};
