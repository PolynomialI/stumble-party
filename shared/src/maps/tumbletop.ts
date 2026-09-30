import { box, cyl, deco, wedge, DEG } from './build';
import { SUNNY } from './themes';
import type { MapDef, ObstacleDef, Piece, TileDef } from './types';

// Course runs along +Z. Floors are 1 m thick slabs; `top` is the walking height.
const floor = (z0: number, z1: number, w: number, top: number, mat: Piece['mat'] = 'floor'): Piece =>
  box([0, top - 0.5, (z0 + z1) / 2], [w, 1, z1 - z0], mat, { tex: 'grid' });
const rails = (halfW: number, z0: number, z1: number, top: number): Piece[] => [-1, 1].map((s) =>
  box([s * (halfW + 0.2), top + 0.4, (z0 + z1) / 2], [0.4, 0.8, z1 - z0], 'trim', { round: 0.16 }));
const pillar = (x: number, z: number, top: number): Piece =>
  deco(cyl([x, top - 7.5, z], 1.8, 13, 'rock', { round: 0.4 }));

/** Sweeper: a striped bar spinning at shin height. Reach = 6.5 m from the hub. */
const sweeper = (z: number, speed: number, phase: number): ObstacleDef => ({
  pos: [0, 0, z],
  hit: 11,
  motion: { kind: 'spin', axis: 'y', speed, phase },
  parts: [
    cyl([0, 0.65, 0], 1.7, 1.3, 'metal'),
    cyl([0, 1.38, 0], 1.1, 0.16, 'hazard'),
    { shape: 'box', size: [0.55, 0.55, 13], pos: [0, 0.5, 0], mat: 'hazard', round: 0.25, tex: 'stripes' },
  ],
});

const hammer = (z: number, phase: number): ObstacleDef => ({
  pos: [0, 11, z],
  hit: 15,
  motion: { kind: 'swing', axis: 'z', amplitude: 1.05, period: 2.8, phase },
  parts: [
    { shape: 'box', size: [0.36, 6.4, 0.36], pos: [0, -3.2, 0], mat: 'metal', round: 0.12 },
    cyl([0, -7.3, 0], 1.9, 2.8, 'hazard', { rot: [90 * DEG, 0, 0], tex: 'stripes', round: 0.32 }),
    deco(cyl([0, -7.3, 1.42], 1.5, 0.1, 'white', { rot: [90 * DEG, 0, 0], round: 0.04 })),
    deco(cyl([0, -7.3, -1.42], 1.5, 0.1, 'white', { rot: [90 * DEG, 0, 0], round: 0.04 })),
  ],
});

const hammerFrame = (z: number): Piece[] => [
  deco(cyl([-6.75, 6.9, z], 0.6, 9, 'accentAlt', { round: 0.2 })),
  deco(cyl([6.75, 6.9, z], 0.6, 9, 'accentAlt', { round: 0.2 })),
  deco(box([0, 11.35, z], [14.2, 0.7, 0.7], 'accentAlt', { round: 0.25 })),
];

// Layout (z): start 0-14 | sweepers 14-49 | gap 49-55 | hammer alley 55-87 | conveyor climb 87-101 |
// landing 101-107 | tile bridge 107-121 | turntable + finish 121-145.
const RAMP_Z0 = 87, RAMP_Z1 = 101, RAMP_Y0 = 2.5, RAMP_Y1 = 5.5;
const SLOPE = Math.atan2(RAMP_Y1 - RAMP_Y0, RAMP_Z1 - RAMP_Z0);
const rampY = (z: number) => RAMP_Y0 + ((z - RAMP_Z0) / (RAMP_Z1 - RAMP_Z0)) * (RAMP_Y1 - RAMP_Y0);
const RAMP_MID = (RAMP_Z0 + RAMP_Z1) / 2;

const pusher = (side: -1 | 1, z: number, phase: number): ObstacleDef => ({
  pos: [side * 7.35, rampY(z) + 0.8, z],
  rot: [-SLOPE, 0, 0],
  hit: 12,
  motion: { kind: 'slide', offset: [-side * 4.6, 0, 0], period: 2.6, phase, ease: 'piston' },
  parts: [
    box([0, 0, 0], [2.6, 1.5, 2.2], 'accent', { round: 0.3 }),
    { shape: 'box', size: [0.2, 1.1, 1.8], pos: [-side * 1.32, 0, 0], mat: 'hazard', round: 0.08, tex: 'stripes' },
  ],
});

// Crumbling tile bridge.
const TILE_Z0 = 108.3;
const tiles: TileDef[] = [];
for (let row = 0; row < 6; row++) {
  for (let col = -1; col <= 1; col++) {
    tiles.push({
      piece: box([col * 3.3, 5.25, TILE_Z0 + row * 2.45], [3.1, 0.5, 2.3], (row + col) % 2 === 0 ? 'tile' : 'tileAlt', { round: 0.14 }),
      shake: 0.5,
      respawn: 3.2,
    });
  }
}

const pad = (x: number, z: number): Piece[] => [
  cyl([x, 0.12, z], 2.6, 0.24, 'bounce', { surface: 'bounce', power: 15.5, dir: [0, 0, 1], round: 0.08 }),
  deco(cyl([x, 0.07, z], 3.0, 0.14, 'white', { round: 0.06 })),
];

/** Race: an obstacle gauntlet across the sky, start to finish arch. */
export const TUMBLETOP: MapDef = {
  id: 'tumbletop',
  name: 'Tumbletop Trail',
  type: 'race',
  blurb: 'Hop the sweepers, time the hammers and race to the finish!',
  timeLimit: 120,
  killY: -10,
  theme: SUNNY,
  spawn: { pos: [0, 0, 5.5], yaw: 0, cols: 8, spacing: 1.5 },
  pieces: [
    // Start plaza.
    floor(0, 14, 18, 0),
    ...rails(9, 0, 14, 0),
    box([0, 0.6, -0.2], [18.8, 1.2, 0.4], 'trim'),
    deco(cyl([-8.2, 2.5, 13], 1.1, 5, 'accent', { round: 0.3 })),
    deco(cyl([8.2, 2.5, 13], 1.1, 5, 'accent', { round: 0.3 })),
    deco(box([0, 5.4, 13], [17.6, 1.2, 1.2], 'accent', { round: 0.4 })),
    deco(box([0, 4.35, 13.05], [12, 1.1, 0.25], 'white', { tex: 'stripes', round: 0.1 })),
    // Sweeper lanes, then bounce pads over the gap.
    floor(14, 49, 16, 0, 'floorAlt'),
    ...rails(8, 14, 45, 0),
    ...pad(-4.5, 47), ...pad(0, 47), ...pad(4.5, 47),
    pillar(-5, 3, 0), pillar(5, 3, 0), pillar(-5, 45, 0), pillar(5, 45, 0),
    // Hammer alley (raised).
    floor(55, 87, 12, 2.5),
    ...rails(6, 55, 87, 2.5),
    ...hammerFrame(63), ...hammerFrame(71), ...hammerFrame(79),
    pillar(-4, 58, 2.5), pillar(4, 58, 2.5), pillar(-4, 84, 2.5), pillar(4, 84, 2.5),
    // Conveyor climb.
    box([0, 2, RAMP_MID], [12, 1, RAMP_Z1 - RAMP_Z0], 'floorAlt'),
    wedge([0, (RAMP_Y0 + RAMP_Y1) / 2, RAMP_MID], [12, RAMP_Y1 - RAMP_Y0, RAMP_Z1 - RAMP_Z0], 'path'),
    box([0, rampY(RAMP_MID) + 0.06, RAMP_MID], [4, 0.24, RAMP_Z1 - RAMP_Z0 + 0.3], 'conveyor', {
      rot: [-SLOPE, 0, 0], surface: 'conveyor', power: 4, dir: [0, 0, -1], tex: 'chevron', round: 0.06,
    }),
    // Landing before the tile bridge, then the finish stretch.
    floor(101, 107, 12, 5.5),
    ...rails(6, 101, 107, 5.5),
    floor(121.8, 145, 16, 5.5),
    ...rails(8, 125.5, 145, 5.5),
    box([0, 6.1, 145.2], [16.8, 1.2, 0.4], 'trim'),
    pillar(-4, 104, 5.5), pillar(4, 104, 5.5), pillar(-5, 133, 5.5), pillar(5, 133, 5.5),
    // Finish arch.
    deco(cyl([-7.9, 8, 140], 1.1, 5, 'accent', { round: 0.3 })),
    deco(cyl([7.9, 8, 140], 1.1, 5, 'accent', { round: 0.3 })),
    deco(box([0, 10.7, 140], [17, 1.7, 0.6], 'finish', { tex: 'checker', round: 0.25 })),
    deco(box([0, 5.52, 140], [15.6, 0.04, 1.2], 'finish', { tex: 'checker', round: 0.01 })),
  ],
  obstacles: [
    sweeper(21, 1.45, 0),
    sweeper(38, -1.75, 1.2),
    hammer(63, 0),
    hammer(71, 2.1),
    hammer(79, 4.2),
    pusher(-1, 90, 0),
    pusher(1, 93.5, 0.35),
    pusher(-1, 97, 0.7),
    // Turntable with bumpers riding on it.
    {
      pos: [0, 5.5, 131],
      motion: { kind: 'spin', axis: 'y', speed: 0.75 },
      parts: [
        cyl([0, 0.15, 0], 11, 0.3, 'accentAlt', { tex: 'dots', round: 0.12 }),
        cyl([3.4, 0.95, 0], 1.2, 1.3, 'bumper', { surface: 'bumper', power: 9, round: 0.3 }),
        cyl([-3.4, 0.95, 0], 1.2, 1.3, 'bumper', { surface: 'bumper', power: 9, round: 0.3 }),
        deco(cyl([0, 0.45, 0], 1.6, 0.4, 'white', { round: 0.15 })),
      ],
    },
  ],
  tiles,
  checkpoints: [
    // Between the sweepers: clear of both arms (A reaches z 27.5, B from 31.5).
    { min: [-8, -1, 28], max: [8, 6, 31.5], spawn: [0, 0, 30.5], yaw: 0 },
    { min: [-6, 2, 55], max: [6, 9, 60], spawn: [0, 2.5, 57.5], yaw: 0 },
    { min: [-6, 5, 101], max: [6, 11, 107], spawn: [0, 5.5, 105.2], yaw: 0 },
    { min: [-8, 5, 121.8], max: [8, 11, 125.5], spawn: [0, 5.5, 124.6], yaw: 0 },
  ],
  finish: { min: [-8, 5, 140], max: [8, 13, 145] },
  bot: {
    path: [
      { p: [0, 0, 11], spread: 5 },
      { p: [0, 0, 17], spread: 5.5, avoid: 1.9 },
      { p: [0, 0, 25], spread: 5.5, avoid: 1.9 },
      { p: [0, 0, 30.5], spread: 5 },
      { p: [0, 0, 36], spread: 5.5, avoid: 1.9 },
      { p: [0, 0, 42], spread: 5.5, avoid: 1.9 },
      { p: [0, 0, 47], lanes: [-4.5, 0, 4.5], r: 1.2 },
      { p: [0, 2.5, 60], spread: 3 },
      { p: [0, 2.5, 67], spread: 3 },
      { p: [0, 2.5, 75], spread: 3 },
      { p: [0, 2.5, 85], spread: 3 },
      { p: [3.4, rampY(94), 94], spread: 1 },
      { p: [0, 5.5, 105.5], spread: 3 },
      { p: [0, 5.5, 113], spread: 2, jump: true },
      { p: [0, 5.5, 119], spread: 2, jump: true },
      { p: [0, 5.5, 125], spread: 4 },
      { p: [0, 5.8, 131], spread: 3 },
      { p: [0, 5.5, 142], spread: 5 },
    ],
  },
};
