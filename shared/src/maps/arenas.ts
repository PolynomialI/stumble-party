import { ball, box, cyl, deco, wedge, DEG } from './build';
import { checkpoint, course, hammers, padJump, pushers, ramp, run, start, stones, sweepers, type Course } from './kit';
import { FOREST, SUNNY, SUNSET, TWILIGHT, VOLCANO } from './themes';
import type { MapDef, Piece, TileDef } from './types';

// ------------------------------------------------------------------------------------ zone control (points)

const MOUND = 1;
const moundRamps: Piece[] = [0, 90, 180, 270].map((d) => {
  const a = d * DEG;
  // A wedge rises toward its local +Z; turn each one to climb toward the centre.
  return wedge([-Math.sin(a) * 6.4, MOUND / 2, -Math.cos(a) * 6.4], [4.5, MOUND, 3], 'path', { rot: [0, a, 0] });
});

/** Points: stand in the glowing zone to score. It moves every few seconds, and a sweeper keeps you hopping. */
export const HILLTOP: MapDef = {
  id: 'hilltop',
  name: 'Hilltop Hustle',
  type: 'points',
  blurb: 'Stay in the zone to score!',
  timeLimit: 80,
  killY: -12,
  theme: SUNNY,
  spawn: { pos: [0, 0, -12.5], yaw: 0, cols: 8, spacing: 1.3 },
  pieces: [
    cyl([0, -0.5, 0], 40, 1, 'floor', { tex: 'grid', round: 0.25 }),
    deco(cyl([0, -0.3, 0], 40.8, 0.4, 'trim', { round: 0.18 })),
    cyl([0, MOUND / 2, 0], 10, MOUND, 'floorAlt', { tex: 'grid', round: 0.2 }),
    ...moundRamps,
    deco(cyl([0, -3.4, 0], 34, 5, 'rock', { round: 1 })),
    deco(ball([0, -12, 0], 24, 'rock')),
    ...[45, 135, 225, 315].flatMap((d) => {
      const x = Math.sin(d * DEG) * 15.5, z = Math.cos(d * DEG) * 15.5;
      return [
        cyl([x, 0.7, z], 1.3, 1.4, 'bumper', { surface: 'bumper', power: 9, round: 0.3 }),
        deco(cyl([x, 1.34, z], 1.44, 0.2, 'white', { round: 0.08 })),
      ];
    }),
  ],
  obstacles: [
    {
      pos: [0, MOUND, 0],
      hit: 9,
      // Lies along X until GO, clear of the spawn rows to the south.
      motion: { kind: 'spin', axis: 'y', speed: 0.85, phase: Math.PI / 2 },
      parts: [
        cyl([0, 0.6, 0], 1.6, 1.2, 'metal'),
        { shape: 'box', size: [0.5, 0.5, 9.4], pos: [0, 0.45, 0], mat: 'hazard', round: 0.22, tex: 'stripes' },
      ],
    },
  ],
  tiles: [],
  checkpoints: [],
  bot: { arena: { center: [0, 0, 0], radius: 18 } },
  hill: { r: 3.8, hold: 11, spots: [[0, MOUND, 0], [11.5, 0, 4], [-9, 0, -9], [-4, 0, 13], [12, 0, -8], [0, MOUND, 0], [-13, 0, 3]] },
};

// ------------------------------------------------------------------------------------ bomb tag

/** Tag: whoever holds a bomb when the clock stops is out. Pass it on by touching someone. */
export const HOTPOTATO: MapDef = {
  id: 'hotpotato',
  name: 'Hot Potato Plaza',
  type: 'tag',
  blurb: 'Pass the bomb before time runs out!',
  timeLimit: 55,
  killY: -12,
  theme: TWILIGHT,
  spawn: { pos: [0, 0, -13.2], yaw: 0, cols: 8, spacing: 1.2 },
  pieces: [
    cyl([0, -0.5, 0], 38, 1, 'floor', { tex: 'grid', round: 0.25 }),
    // A rail all the way round: tag is about dodging, not falling off.
    ...Array.from({ length: 24 }, (_, i) => {
      const a = ((i + 0.5) / 24) * Math.PI * 2;
      return box([Math.sin(a) * 18.8, 0.5, Math.cos(a) * 18.8], [5.1, 1, 0.5], 'trim', { rot: [0, a, 0], round: 0.16 });
    }),
    cyl([0, 0.45, 0], 7, 0.9, 'floorAlt', { tex: 'grid', round: 0.2 }),
    ...[0, 60, 120, 180, 240, 300].flatMap((d) => {
      const x = Math.sin(d * DEG) * 11, z = Math.cos(d * DEG) * 11;
      return d % 120 === 0
        ? [cyl([x, 1.6, z], 2.2, 3.2, 'wall', { round: 0.4 }), deco(ball([x, 3.7, z], 1.6, 'accent'))]
        : [box([x, 0.6, z], [5, 1.2, 0.9], 'accentAlt', { rot: [0, d * DEG + Math.PI / 2, 0], round: 0.25 })];
    }),
    ...[30, 150, 270].flatMap((d) => {
      const x = Math.sin(d * DEG) * 15, z = Math.cos(d * DEG) * 15;
      return [
        cyl([x, 0.12, z], 2.6, 0.24, 'bounce', { surface: 'bounce', power: 13, dir: [-x, 0, -z], round: 0.08 }),
        deco(cyl([x, 0.07, z], 3, 0.14, 'white', { round: 0.06 })),
      ];
    }),
    deco(cyl([0, -3.4, 0], 32, 5, 'rock', { round: 1 })),
    deco(ball([0, -12, 0], 22, 'rock')),
  ],
  obstacles: [],
  tiles: [],
  checkpoints: [],
  bot: { arena: { center: [0, 0, 0], radius: 17 } },
};

// ------------------------------------------------------------------------------------ rolling logs (survival)

const LOG_R = 2.2;
const LOG_LEN = 16;
const deck: TileDef[] = [];
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 2; j++) {
    deck.push({
      piece: box([(i - 1.5) * 3.9, -0.25, (j - 0.5) * 3.1], [3.85, 0.5, 3.05], (i + j) % 2 === 0 ? 'tile' : 'tileAlt', { round: 0.14 }),
      fallAt: 3,
      shake: 2,
    });
  }
}

/** Survival: three giant logs turning in the river, faster and faster. The start deck drops away at GO+3. */
export const LOGJAM: MapDef = {
  id: 'logjam',
  name: 'Log Jam',
  type: 'survival',
  blurb: 'Stay on the rolling logs!',
  timeLimit: 100,
  killY: -8,
  theme: FOREST,
  spawn: { pos: [0, 0, 1.2], yaw: 0, cols: 11, spacing: 1.2 },
  pieces: [
    ...[-1, 1].flatMap((s) => [
      deco(cyl([s * (LOG_LEN / 2 + 1.4), -3.5, 0], 2.2, 9, 'wood', { round: 0.4 })),
      deco(box([s * (LOG_LEN / 2 + 1.4), 0.2, 0], [1.6, 0.9, 17], 'wood', { tex: 'planks', round: 0.3 })),
      deco(cyl([s * 14, -4, -9], 5, 4, 'rock', { round: 1 })),
      deco(ball([s * 14, 0.5, -9], 5, 'leaf')),
      deco(cyl([s * 13, -4, 10], 4, 4, 'rock', { round: 1 })),
      deco(ball([s * 13, 0, 10], 4.2, 'leaf')),
    ]),
  ],
  obstacles: [-1, 0, 1].map((k) => ({
    pos: [0, -1 - LOG_R, k * (LOG_R * 2 + 1.3)] as [number, number, number],
    motion: {
      kind: 'spin' as const, axis: 'x' as const, speed: (k === 0 ? 1 : -1) * 0.4, accel: (k === 0 ? 1 : -1) * 0.014,
      maxSpeed: (k === 0 ? 1 : -1) * 1.7,
    },
    parts: [
      cyl([0, 0, 0], LOG_R * 2, LOG_LEN, 'wood', { rot: [0, 0, 90 * DEG], tex: 'planks', round: 0.3 }),
      deco(cyl([LOG_LEN / 2 + 0.03, 0, 0], LOG_R * 1.5, 0.06, 'trim', { rot: [0, 0, 90 * DEG], round: 0.02 })),
      deco(cyl([-LOG_LEN / 2 - 0.03, 0, 0], LOG_R * 1.5, 0.06, 'trim', { rot: [0, 0, 90 * DEG], round: 0.02 })),
    ],
  })),
  tiles: deck,
  checkpoints: [],
  bot: { arena: { center: [0, -1, 0], radius: 5 } },
  sea: { y: -5.5, mat: 'water' },
};

// ------------------------------------------------------------------------------------ rising lava (survival)

function finishCourse(c: Course): Pick<MapDef, 'spawn' | 'pieces' | 'obstacles' | 'tiles' | 'checkpoints'> {
  return { spawn: c.spawn!, pieces: c.pieces, obstacles: c.obstacles, tiles: c.tiles, checkpoints: c.checkpoints };
}

const magma = course('torch', 99);
start(magma);
ramp(magma, 3, 10);
run(magma, 8, 12);
stones(magma, 4);
run(magma, 6, 12);
ramp(magma, 3, 10);
hammers(magma, 2);
ramp(magma, 4, 12);
sweepers(magma, 1);
padJump(magma);
ramp(magma, 3, 10);
pushers(magma, 3);
ramp(magma, 3, 10);
const SUMMIT_Z = magma.z + 12;
magma.pieces.push(
  cyl([0, magma.y - 0.5, SUMMIT_Z], 25, 1, 'floor', { tex: 'grid', round: 0.25 }),
  deco(cyl([0, magma.y - 0.3, SUMMIT_Z], 25.8, 0.4, 'trim', { round: 0.18 })),
  deco(cyl([0, magma.y - 12, SUMMIT_Z], 20, 23, 'rock', { round: 1.2 })),
);
magma.obstacles.push({
  pos: [0, magma.y, SUMMIT_Z],
  hit: 9,
  motion: { kind: 'spin', axis: 'y', speed: 0.8, accel: 0.02, maxSpeed: 2.5 },
  parts: [
    cyl([0, 0.75, 0], 2.4, 1.5, 'metal'),
    { shape: 'box', size: [0.6, 0.6, 24], pos: [0, 0.5, 0], mat: 'hazard', round: 0.28, tex: 'stripes' },
    deco(ball([0, 1.9, 0], 0.9, 'lava')),
  ],
});
magma.path.push({ p: [0, magma.y, SUMMIT_Z - 9], spread: 3 }, { p: [0, magma.y, SUMMIT_Z + 4], spread: 6, avoid: 2.5 });

/** Survival: the lava is rising. Climb to the summit, then outlast the sweeper up there. */
export const MAGMA: MapDef = {
  id: 'magma',
  name: 'Magma Mountain',
  type: 'survival',
  blurb: 'Climb! The lava is rising!',
  timeLimit: 130,
  killY: -12,
  theme: VOLCANO,
  ...finishCourse(magma),
  bot: { path: magma.path, arena: { center: [0, magma.y, SUMMIT_Z], radius: 11 } },
  lava: { delay: 6, speed: 0.4, yMax: magma.y - 1.3 },
  sea: { y: -12, mat: 'lava' },
};

// ------------------------------------------------------------------------------------ crown rush (final)

const crown = course('lantern', 41);
start(crown, 13);
hammers(crown, 2);
ramp(crown, 3, 10);
checkpoint(crown, 12);
pushers(crown, 3);
padJump(crown);
checkpoint(crown);
sweepers(crown, 1);
ramp(crown, 3, 9);
const CROWN_Z = crown.z + 7;
crown.pieces.push(
  cyl([0, crown.y - 0.5, CROWN_Z], 14, 1, 'path', { tex: 'grid', round: 0.25 }),
  deco(cyl([0, crown.y - 9, CROWN_Z], 9, 17, 'rock', { round: 1 })),
  // The crown: a gold band with points and jewels, floating over a pedestal.
  cyl([0, crown.y + 0.3, CROWN_Z + 1], 3, 0.6, 'white', { round: 0.2 }),
  deco(cyl([0, crown.y + 2.2, CROWN_Z + 1], 2.2, 0.9, 'gold', { round: 0.2 })),
  ...[0, 72, 144, 216, 288].flatMap((d) => {
    const x = Math.sin(d * DEG) * 0.95, z = CROWN_Z + 1 + Math.cos(d * DEG) * 0.95;
    return [
      deco(box([x, crown.y + 3, z], [0.5, 0.9, 0.5], 'gold', { rot: [0, d * DEG, 0], round: 0.12 })),
      deco(ball([x, crown.y + 3.6, z], 0.42, d % 144 === 0 ? 'hazard' : 'bounce')),
    ];
  }),
);
crown.path.push({ p: [0, crown.y, CROWN_Z - 3], spread: 3 }, { p: [0, crown.y, CROWN_Z + 1], spread: 0.3 });

/** Final: no knock-outs here. First to reach the crown wins the whole match. */
export const CROWNRUSH: MapDef = {
  id: 'crownrush',
  name: 'Crown Rush',
  type: 'final',
  blurb: 'First to the crown wins it all!',
  timeLimit: 110,
  killY: -12,
  theme: SUNSET,
  ...finishCourse(crown),
  finish: { min: [-2.2, crown.y - 0.5, CROWN_Z - 1.2], max: [2.2, crown.y + 5, CROWN_Z + 3.2] },
  bot: { path: crown.path, arena: { center: [0, crown.y, CROWN_Z + 1], radius: 6 } },
};
