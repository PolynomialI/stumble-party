import { box, cyl, deco, wedge, DEG } from './build';
import { LAGOON } from './themes';
import type { MapDef, ObstacleDef, Piece, TileDef } from './types';

const floor = (z0: number, z1: number, w: number, top: number, mat: Piece['mat'] = 'floor'): Piece =>
  box([0, top - 0.5, (z0 + z1) / 2], [w, 1, z1 - z0], mat, { tex: 'grid' });
const rails = (halfW: number, z0: number, z1: number, top: number): Piece[] => [-1, 1].map((s) =>
  box([s * (halfW + 0.2), top + 0.4, (z0 + z1) / 2], [0.4, 0.8, z1 - z0], 'trim', { round: 0.16 }));
const pillar = (x: number, z: number, top: number, h = 13): Piece =>
  deco(cyl([x, top - h / 2 - 1, z], 1.8, h, 'rock', { round: 0.4 }));

const DECK = 4; // windmill deck height
const TOP = 7; // gauntlet height
const SUMMIT = 12;

/** Four-bladed windmill turning across the path (axis along the course). Blade tips brush the deck. */
const windmill = (z: number, speed: number, phase: number): ObstacleDef => {
  const parts: Piece[] = [cyl([0, 0, 0], 1.5, 1.3, 'metal', { rot: [90 * DEG, 0, 0], round: 0.3 })];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    parts.push({
      shape: 'box', size: [0.8, 4.4, 0.8], pos: [-Math.sin(a) * 2.6, Math.cos(a) * 2.6, 0], rot: [0, 0, a],
      mat: k % 2 === 0 ? 'hazard' : 'accent', round: 0.3, tex: k % 2 === 0 ? 'stripes' : undefined,
    });
  }
  return { pos: [0, DECK + 4.8, z], hit: 11, motion: { kind: 'spin', axis: 'z', speed, phase }, parts };
};

const windmillFrame = (z: number): Piece[] => [
  deco(box([-6, DECK + 4.4, z + 0.9], [0.7, 8.8, 0.7], 'wall', { round: 0.25 })),
  deco(box([6, DECK + 4.4, z + 0.9], [0.7, 8.8, 0.7], 'wall', { round: 0.25 })),
  deco(box([0, DECK + 8.9, z + 0.9], [12.7, 0.7, 0.7], 'wall', { round: 0.25 })),
  deco(cyl([0, DECK + 4.8, z + 0.65], 0.5, 0.6, 'metal', { rot: [90 * DEG, 0, 0] })),
];

/** Block that shoots across the gauntlet from one side. */
const pusher = (side: -1 | 1, z: number, phase: number): ObstacleDef => ({
  pos: [side * 7.3, TOP + 0.75, z],
  hit: 12,
  motion: { kind: 'slide', offset: [-side * 5.2, 0, 0], period: 2.3, phase, ease: 'piston' },
  parts: [
    box([0, 0, 0], [2.4, 1.5, 2.6], 'wall', { round: 0.3 }),
    { shape: 'box', size: [0.2, 1.1, 2.2], pos: [-side * 1.22, 0, 0], mat: 'hazard', round: 0.08, tex: 'stripes' },
  ],
});

// Crumbling staircase: two columns of steps, each a little higher than the last.
const tiles: TileDef[] = [];
for (let i = 0; i < 5; i++) {
  for (const x of [-2.3, 2.3]) {
    const top = DECK + 0.5 + i * 0.6;
    tiles.push({
      piece: box([x, top - 0.25, 48 + i * 3.6], [3.4, 0.5, 3], i % 2 === 0 ? 'tile' : 'tileAlt', { round: 0.14 }),
      shake: 0.55,
      respawn: 2.4,
    });
  }
}

const pad = (x: number): Piece[] => [
  cyl([x, TOP + 0.12, 94], 2.4, 0.24, 'bounce', { surface: 'bounce', power: 18, dir: [0, 0, 1], round: 0.08 }),
  deco(cyl([x, TOP + 0.07, 94], 2.8, 0.14, 'white', { round: 0.06 })),
];

/** Race: climb past windmills and crumbling steps, through a pusher gauntlet, and bounce to the summit. */
export const WINDMILL: MapDef = {
  id: 'windmill',
  name: 'Windmill Heights',
  type: 'race',
  blurb: 'Slip between the blades, hop the crumbling steps and bounce to the top!',
  timeLimit: 140,
  killY: -10,
  theme: LAGOON,
  spawn: { pos: [0, 0, 4.6], yaw: 0, cols: 8, spacing: 1.3 },
  pieces: [
    floor(0, 12, 14, 0),
    ...rails(7, 0, 12, 0),
    box([0, 0.6, -0.2], [14.8, 1.2, 0.4], 'trim'),
    deco(cyl([-6.3, 2.5, 11.4], 1, 5, 'accent', { round: 0.3 })),
    deco(cyl([6.3, 2.5, 11.4], 1, 5, 'accent', { round: 0.3 })),
    deco(box([0, 5.3, 11.4], [13.6, 1.1, 1.1], 'accent', { round: 0.4 })),
    // Ramp up to the windmill deck.
    wedge([0, DECK / 2, 19], [10, DECK, 14], 'path', { tex: 'grid' }),
    floor(26, 46, 10, DECK),
    ...rails(5, 26, 46, DECK),
    ...windmillFrame(31), ...windmillFrame(40),
    pillar(-3, 28, DECK), pillar(3, 44, DECK),
    // Gauntlet platform (no rails: the pushers will happily shove you off).
    floor(64.5, 96, 12, TOP, 'floorAlt'),
    pillar(-4, 70, TOP), pillar(4, 86, TOP),
    ...pad(-3), ...pad(0), ...pad(3),
    // Summit.
    floor(100, 116, 12, SUMMIT),
    ...rails(6, 100, 116, SUMMIT),
    box([0, SUMMIT + 0.6, 116.2], [12.8, 1.2, 0.4], 'trim'),
    pillar(-3, 104, SUMMIT, 16), pillar(3, 112, SUMMIT, 16),
    deco(cyl([-5.6, SUMMIT + 2.5, 110], 1, 5, 'accent', { round: 0.3 })),
    deco(cyl([5.6, SUMMIT + 2.5, 110], 1, 5, 'accent', { round: 0.3 })),
    deco(box([0, SUMMIT + 5.2, 110], [12.6, 1.6, 0.6], 'finish', { tex: 'checker', round: 0.25 })),
    deco(box([0, SUMMIT + 0.02, 110], [11.6, 0.04, 1.2], 'finish', { tex: 'checker', round: 0.01 })),
  ],
  obstacles: [
    windmill(31, 1.2, 0.3),
    windmill(40, -1.45, 0),
    pusher(-1, 70, 0),
    pusher(1, 75, 0.25),
    pusher(-1, 80, 0.5),
    pusher(1, 85, 0.75),
  ],
  tiles,
  checkpoints: [
    { min: [-5, DECK - 1, 26], max: [5, DECK + 6, 29.5], spawn: [0, DECK, 28.2], yaw: 0 },
    { min: [-5, DECK - 1, 42.5], max: [5, DECK + 6, 46], spawn: [0, DECK, 45], yaw: 0 },
    { min: [-6, TOP - 1, 64.5], max: [6, TOP + 6, 68], spawn: [0, TOP, 67.2], yaw: 0 },
    { min: [-6, TOP - 1, 87.5], max: [6, TOP + 6, 92.6], spawn: [0, TOP, 90.6], yaw: 0 },
  ],
  finish: { min: [-6, SUMMIT - 1, 110], max: [6, SUMMIT + 7, 116] },
  bot: {
    path: [
      { p: [0, 0, 9], spread: 4 },
      { p: [0, DECK / 2, 19], spread: 3 },
      { p: [0, DECK, 27.5], spread: 3 },
      { p: [0, DECK, 35.5], spread: 2.5 },
      { p: [0, DECK, 44.5], spread: 2.5 },
      { p: [0, DECK, 45.6], lanes: [-2.3, 2.3], jump: true },
      { p: [0, DECK + 0.5, 48.0], lanes: [-2.3, 2.3], r: 0.9 },
      { p: [0, DECK + 0.5, 49.15], lanes: [-2.3, 2.3], jump: true },
      { p: [0, DECK + 1.1, 51.6], lanes: [-2.3, 2.3], r: 0.9 },
      { p: [0, DECK + 1.1, 52.75], lanes: [-2.3, 2.3], jump: true },
      { p: [0, DECK + 1.7, 55.2], lanes: [-2.3, 2.3], r: 0.9 },
      { p: [0, DECK + 1.7, 56.35], lanes: [-2.3, 2.3], jump: true },
      { p: [0, DECK + 2.3, 58.8], lanes: [-2.3, 2.3], r: 0.9 },
      { p: [0, DECK + 2.3, 59.95], lanes: [-2.3, 2.3], jump: true },
      { p: [0, DECK + 2.9, 62.4], lanes: [-2.3, 2.3], r: 0.9 },
      { p: [0, DECK + 2.9, 63.55], lanes: [-2.3, 2.3], jump: true },
      { p: [0, TOP, 66.5], spread: 2 },
      { p: [0, TOP, 77.5], spread: 1.5 },
      { p: [0, TOP, 90], spread: 2 },
      { p: [0, TOP, 94], lanes: [-3, 0, 3], r: 1.1 },
      { p: [0, SUMMIT, 106], spread: 3 },
      { p: [0, SUMMIT, 113], spread: 3 },
    ],
  },
};
