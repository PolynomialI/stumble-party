import { ball, cyl, deco, DEG } from './build';
import { SUNSET } from './themes';
import type { MapDef, TileDef } from './types';

/** One ring of floor segments that all drop at `fallAt` seconds, shaking for `warn` seconds first. */
function ring(r1: number, r2: number, segments: number, fallAt: number, warn: number, offset: number): TileDef[] {
  const out: TileDef[] = [];
  const step = (Math.PI * 2) / segments;
  const mid = (r1 + r2) / 2;
  for (let i = 0; i < segments; i++) {
    const a = (i + 0.5 + offset) * step;
    out.push({
      piece: {
        shape: 'box',
        size: [r2 * step * 1.01, 0.7, r2 - r1 - 0.06],
        pos: [Math.sin(a) * mid, -0.35, Math.cos(a) * mid],
        rot: [0, a, 0],
        round: 0.12,
        mat: i % 2 === 0 ? 'tile' : 'tileAlt',
      },
      fallAt,
      shake: warn,
    });
  }
  return out;
}

/** Final: the stage shrinks ring by ring under a speeding sweeper. Last one standing wins. */
export const LAST_STAND: MapDef = {
  id: 'laststand',
  name: 'Last Stand',
  type: 'final',
  blurb: 'The stage crumbles from the outside in. Be the last one standing!',
  timeLimit: 150,
  killY: -10,
  theme: SUNSET,
  spawn: { pos: [0, 0, -9.6], yaw: 0, cols: 8, spacing: 1.25 },
  pieces: [
    cyl([0, -0.35, 0], 9, 0.7, 'floor', { tex: 'grid', round: 0.15 }),
    deco(cyl([0, -0.02, 0], 2.2, 0.06, 'white', { round: 0.02 })),
    deco(cyl([0, -3.2, 0], 7, 5, 'rock', { round: 0.8 })),
    deco(ball([0, -6.5, 0], 9, 'rock')),
    // Glowing posts marking the old edge, out over the void.
    ...[0, 60, 120, 180, 240, 300].map((d) =>
      deco(cyl([Math.sin(d * DEG) * 16.5, -1.5, Math.cos(d * DEG) * 16.5], 0.7, 5, 'accent', { round: 0.25 }))),
  ],
  obstacles: [
    {
      pos: [0, 0, 0],
      hit: 9,
      motion: { kind: 'spin', axis: 'y', speed: 1.1, accel: 0.02, maxSpeed: 2.8, phase: Math.PI / 2 },
      parts: [
        cyl([0, 0.75, 0], 2.2, 1.5, 'metal'),
        cyl([0, 1.58, 0], 1.5, 0.18, 'accent'),
        { shape: 'box', size: [0.6, 0.6, 29], pos: [0, 0.5, 0], mat: 'hazard', round: 0.28, tex: 'stripes' },
        deco(ball([0, 1.9, 0], 0.8, 'bounce')),
      ],
    },
  ],
  tiles: [
    ...ring(11.5, 15, 20, 18, 3, 0),
    ...ring(8, 11.5, 16, 38, 3, 0.5),
    ...ring(4.5, 8, 12, 62, 3, 0),
  ],
  checkpoints: [],
  bot: { arena: { center: [0, 0, 0], radius: 7 } },
};
