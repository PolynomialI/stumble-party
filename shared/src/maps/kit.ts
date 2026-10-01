import { rng, type Vec3 } from '../math';
import { ball, box, cyl, deco, wedge, DEG } from './build';
import type {
  BotNode, Checkpoint, MapDef, MatKey, ObstacleDef, Piece, SpawnDef, Theme, TileDef, Zone,
} from './types';

/**
 * Course kit: race maps are a sequence of sections laid end to end along +Z. Each section adds its floor,
 * hazards, scenery and the waypoints bots follow, then moves the cursor on. Geometry and bot waypoints live
 * together, so a section that bots can run once is safe to reuse in every map.
 */
export type Prop = 'tree' | 'pine' | 'crystal' | 'lolly' | 'palm' | 'torch' | 'gear' | 'lantern';

export interface Course {
  pieces: Piece[];
  obstacles: ObstacleDef[];
  tiles: TileDef[];
  checkpoints: Checkpoint[];
  path: BotNode[];
  /** Cursor: where the next section starts, and the walking height there. */
  z: number;
  y: number;
  /** Lowest walking height so far (sets the kill height). */
  minY: number;
  spawn?: SpawnDef;
  finish?: Zone;
  prop: Prop;
  rand: () => number;
  /** Section counter: alternates floor colours and hazard phases. */
  n: number;
}

export function course(prop: Prop, seed = 1): Course {
  return {
    pieces: [], obstacles: [], tiles: [], checkpoints: [], path: [], z: 0, y: 0, minY: 0, prop, rand: rng(seed), n: 0,
  };
}

const alt = (c: Course): MatKey => (c.n++ % 2 === 0 ? 'floor' : 'floorAlt');

/** A 1 m thick floor slab with its top at height `y`. */
function slab(c: Course, z0: number, z1: number, w: number, mat: MatKey, y = c.y, x = 0) {
  c.pieces.push(box([x, y - 0.5, (z0 + z1) / 2], [w, 1, z1 - z0], mat, { tex: 'grid' }));
  c.minY = Math.min(c.minY, y);
}

function rails(c: Course, z0: number, z1: number, w: number, y = c.y) {
  for (const s of [-1, 1]) {
    c.pieces.push(box([s * (w / 2 + 0.2), y + 0.4, (z0 + z1) / 2], [0.4, 0.8, z1 - z0], 'trim', { round: 0.16 }));
  }
}

/** One piece of scenery standing on its own little floating island beside the course. */
function prop(c: Course, x: number, y: number, z: number) {
  const r = c.rand;
  const s = 0.85 + r() * 0.5;
  const P = c.pieces;
  P.push(deco(cyl([x, y - 1.2, z], 4.2 * s, 2.4, 'rock', { round: 0.9 })));
  P.push(deco(cyl([x, y - 0.05, z], 4.3 * s, 0.3, c.prop === 'crystal' ? 'snow' : c.prop === 'torch' ? 'dark' : 'grass', { round: 0.14 })));
  switch (c.prop) {
    case 'tree':
      P.push(deco(cyl([x, y + 1.5 * s, z], 0.7 * s, 3 * s, 'wood', { round: 0.2 })));
      P.push(deco(ball([x, y + 4 * s, z], 3.6 * s, 'leaf')));
      P.push(deco(ball([x + 1.1 * s, y + 3.1 * s, z + 0.6 * s], 2.3 * s, 'leaf')));
      P.push(deco(ball([x - 1.0 * s, y + 3.3 * s, z - 0.7 * s], 2.1 * s, 'leaf')));
      break;
    case 'pine':
      P.push(deco(cyl([x, y + 0.9 * s, z], 0.6 * s, 1.8 * s, 'wood', { round: 0.2 })));
      for (let k = 0; k < 3; k++) {
        P.push(deco(cyl([x, y + (2.1 + k * 1.3) * s, z], (3.4 - k * 0.9) * s, 1.5 * s, k === 2 ? 'snow' : 'leaf', { round: 0.7 * s })));
      }
      break;
    case 'crystal':
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + r() * 0.6, h = (2.6 + r() * 2.2) * s;
        P.push(deco(box([x + Math.cos(a) * 0.7 * s, y + h / 2 - 0.2, z + Math.sin(a) * 0.7 * s], [0.9 * s, h, 0.9 * s], 'ice',
          { rot: [0.22 * Math.cos(a), a, 0.22 * Math.sin(a)], round: 0.12 })));
      }
      break;
    case 'lolly':
      P.push(deco(cyl([x, y + 1.9 * s, z], 0.28 * s, 3.8 * s, 'white', { round: 0.1 })));
      P.push(deco(cyl([x, y + 4.4 * s, z], 2.6 * s, 0.6 * s, r() < 0.5 ? 'accent' : 'accentAlt', { rot: [90 * DEG, r() * 3, 0], tex: 'stripes', round: 0.28 })));
      break;
    case 'palm':
      P.push(deco(cyl([x, y + 2.1 * s, z], 0.5 * s, 4.2 * s, 'wood', { rot: [0.12, 0, 0.1], round: 0.2 })));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        P.push(deco(box([x + Math.cos(a) * 1.3 * s, y + 4.3 * s, z + Math.sin(a) * 1.3 * s], [2.6 * s, 0.16, 0.9 * s], 'leaf',
          { rot: [0, -a, -0.45], round: 0.07 })));
      }
      break;
    case 'torch':
      P.push(deco(cyl([x, y + 1.6 * s, z], 1.1 * s, 3.2 * s, 'rock', { round: 0.3 })));
      P.push(deco(ball([x, y + 3.7 * s, z], 1.5 * s, 'lava')));
      break;
    case 'gear':
      P.push(deco(cyl([x, y + 1.5 * s, z], 0.5 * s, 3 * s, 'metal', { round: 0.15 })));
      P.push(deco(cyl([x, y + 3.6 * s, z], 3.2 * s, 0.7 * s, 'accent', { rot: [90 * DEG, r() * 3, 0], tex: 'dots', round: 0.25 })));
      P.push(deco(cyl([x + 1.9 * s, y + 2.2 * s, z + 0.5 * s], 1.9 * s, 0.6 * s, 'accentAlt', { rot: [90 * DEG, 0, 0], round: 0.2 })));
      break;
    case 'lantern':
      P.push(deco(cyl([x, y + 2 * s, z], 0.4 * s, 4 * s, 'wall', { round: 0.15 })));
      P.push(deco(ball([x, y + 4.5 * s, z], 1.5 * s, 'gold')));
      break;
  }
}

/** Something huge in the distance, so the course feels like part of a world: a giant tree, a volcano, a peak... */
function landmark(c: Course, side: number, z: number) {
  const x = side * (52 + c.rand() * 16), y = c.minY - 16;
  const P = c.pieces;
  const stack = (sizes: [number, number, MatKey][]) => {
    let top = y;
    for (const [d, h, mat] of sizes) {
      P.push(deco(cyl([x, top + h / 2, z], d, h, mat, { round: Math.min(2, h * 0.3) })));
      top += h * 0.82;
    }
    return top;
  };
  switch (c.prop) {
    case 'tree': {
      P.push(deco(cyl([x, y + 22, z], 8, 48, 'wood', { round: 1.5 })));
      P.push(deco(ball([x, y + 52, z], 32, 'leaf')));
      P.push(deco(ball([x + 11, y + 43, z + 6], 21, 'leaf')));
      P.push(deco(ball([x - 10, y + 45, z - 7], 19, 'leaf')));
      break;
    }
    case 'pine':
    case 'crystal':
      stack([[64, 16, 'rock'], [48, 16, 'rock'], [33, 15, 'snow'], [19, 13, 'snow'], [8, 10, 'snow']]);
      break;
    case 'torch': {
      const top = stack([[72, 15, 'dark'], [54, 15, 'dark'], [38, 14, 'rock'], [24, 11, 'rock']]);
      P.push(deco(cyl([x, top - 0.6, z], 17, 2, 'lava', { round: 0.6 })));
      P.push(deco(ball([x + 2, top + 5, z], 7, 'lava')));
      P.push(deco(ball([x - 3, top + 11, z + 2], 4.5, 'lava')));
      break;
    }
    case 'lolly': {
      P.push(deco(cyl([x, y + 22, z], 2.4, 46, 'white', { round: 0.8 })));
      P.push(deco(cyl([x, y + 52, z], 26, 5, c.rand() < 0.5 ? 'accent' : 'bumper', { rot: [90 * DEG, side * 0.5, 0], tex: 'stripes', round: 2 })));
      break;
    }
    case 'palm': {
      const top = stack([[12, 16, 'trim'], [11, 16, 'wall'], [10, 16, 'trim'], [9, 12, 'wall']]);
      P.push(deco(cyl([x, top + 1.5, z], 13, 2.4, 'trim', { round: 0.8 })));
      P.push(deco(ball([x, top + 6, z], 8, 'gold')));
      break;
    }
    case 'gear': {
      P.push(deco(cyl([x, y + 20, z], 5, 42, 'metal', { round: 1 })));
      const teeth: Piece[] = [deco(cyl([0, 0, 0], 34, 4.5, 'accent', { rot: [90 * DEG, 0, 0], tex: 'dots', round: 1 }))];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        teeth.push(deco(box([Math.cos(a) * 18.5, Math.sin(a) * 18.5, 0], [6, 5, 4.4], 'accent', { rot: [0, 0, a], round: 0.8 })));
      }
      teeth.push(deco(cyl([0, 0, 0], 8, 6, 'metal', { rot: [90 * DEG, 0, 0], round: 1 })));
      c.obstacles.push({ pos: [x, y + 44, z], rot: [0, side * 0.5, 0], motion: { kind: 'spin', axis: 'z', speed: side * 0.25 }, parts: teeth });
      break;
    }
    case 'lantern': {
      const top = stack([[13, 20, 'wall'], [12, 20, 'wall'], [15.5, 4, 'trim'], [11, 8, 'accentAlt'], [6, 7, 'accentAlt']]);
      P.push(deco(cyl([x, top + 3, z], 0.5, 8, 'white', { round: 0.2 })));
      P.push(deco(box([x + 2.2, top + 5.4, z], [4, 2.6, 0.2], 'accent', { round: 0.08 })));
      break;
    }
  }
}

/** Support pillars under a stretch of floor and scenery along both sides of it. */
function dress(c: Course, z0: number, z1: number, w: number, y = c.y) {
  if (z1 - z0 >= 9) {
    for (const z of [z0 + 2.5, z1 - 2.5]) {
      const x = (c.rand() < 0.5 ? -1 : 1) * w * 0.22;
      c.pieces.push(deco(cyl([x, y - 8, z], 1.8, 14, 'rock', { round: 0.4 })));
    }
  }
  for (let z = z0 + 3 + c.rand() * 6; z < z1 - 2; z += 13 + c.rand() * 6) {
    const side = c.rand() < 0.5 ? -1 : 1;
    prop(c, side * (w / 2 + 5.5 + c.rand() * 5), y - 1.5 + c.rand() * 3.5, z);
    if (c.rand() < 0.45) prop(c, -side * (w / 2 + 8 + c.rand() * 7), y - 3 + c.rand() * 4, z + 4);
  }
}

/** A gateway over the course: two posts and a beam. */
function arch(c: Course, z: number, w: number, mat: MatKey, banner?: 'stripes' | 'checker', y = c.y) {
  for (const s of [-1, 1]) c.pieces.push(deco(cyl([s * (w / 2 - 0.8), y + 2.6, z], 1.1, 5.2, mat, { round: 0.3 })));
  c.pieces.push(deco(box([0, y + 5.6, z], [w - 0.4, 1.3, 1.3], mat, { round: 0.4 })));
  if (banner) {
    c.pieces.push(deco(box([0, y + 4.45, z + 0.05], [w * 0.68, 1.1, 0.25], banner === 'checker' ? 'finish' : 'white', { tex: banner, round: 0.1 })));
  }
}

// ---------------------------------------------------------------------------------------------- sections

/** Starting plaza with the spawn grid. */
export function start(c: Course, depth = 15) {
  const w = 19, z = c.z;
  slab(c, z, z + depth, w, 'floor');
  rails(c, z, z + depth, w);
  c.pieces.push(box([0, c.y + 0.6, z - 0.2], [w + 0.8, 1.2, 0.4], 'trim'));
  arch(c, z + depth - 1, w, 'accent', 'stripes');
  // Towers either side of the gate make the start read from across the map.
  for (const s of [-1, 1]) {
    c.pieces.push(deco(cyl([s * (w / 2 + 2.6), c.y + 1, z + depth - 1], 2.4, 16, 'wall', { round: 0.5 })));
    c.pieces.push(deco(cyl([s * (w / 2 + 2.6), c.y + 9.6, z + depth - 1], 3.2, 1.2, 'trim', { round: 0.4 })));
    c.pieces.push(deco(ball([s * (w / 2 + 2.6), c.y + 11, z + depth - 1], 2.2, 'accentAlt')));
  }
  c.spawn = { pos: [0, c.y, z + 5.5], yaw: 0, cols: 8, spacing: 1.5 };
  c.path.push({ p: [0, c.y, z + depth - 3], spread: 5 });
  dress(c, z, z + depth, w + 6);
  c.z += depth;
}

/** Plain stretch of floor. */
export function run(c: Course, len: number, w = 14) {
  slab(c, c.z, c.z + len, w, alt(c));
  rails(c, c.z, c.z + len, w);
  c.path.push({ p: [0, c.y, c.z + len - 1.5], spread: w / 2 - 2.5 });
  dress(c, c.z, c.z + len, w);
  c.z += len;
}

/** A safe pad that fallers are put back on. */
export function checkpoint(c: Course, w = 14) {
  const z = c.z;
  slab(c, z, z + 6, w, 'path');
  rails(c, z, z + 6, w);
  for (const s of [-1, 1]) {
    c.pieces.push(deco(cyl([s * (w / 2 + 0.2), c.y + 2.2, z + 0.6], 0.3, 4.4, 'white', { round: 0.1 })));
    c.pieces.push(deco(box([s * (w / 2 + 0.2) - s * 0.9, c.y + 3.7, z + 0.6], [1.6, 1, 0.12], 'bounce', { round: 0.05 })));
  }
  c.checkpoints.push({ min: [-w / 2, c.y - 1, z], max: [w / 2, c.y + 6, z + 4.5], spawn: [0, c.y, z + 3.3], yaw: 0 });
  c.path.push({ p: [0, c.y, z + 4], spread: 3 });
  c.z += 6;
}

/** Spinning bars at shin height: jump them. */
export function sweepers(c: Course, n = 2, speed = 1.45) {
  const w = 16;
  for (let i = 0; i < n; i++) {
    const z = c.z;
    slab(c, z, z + 17, w, alt(c));
    rails(c, z, z + 17, w);
    c.obstacles.push({
      pos: [0, c.y, z + 8.5],
      hit: 11,
      motion: { kind: 'spin', axis: 'y', speed: (i % 2 === 0 ? 1 : -1) * (speed + i * 0.15), phase: i * 1.2 },
      parts: [
        cyl([0, 0.65, 0], 1.7, 1.3, 'metal'),
        cyl([0, 1.38, 0], 1.1, 0.16, 'hazard'),
        { shape: 'box', size: [0.55, 0.55, 13], pos: [0, 0.5, 0], mat: 'hazard', round: 0.25, tex: 'stripes' },
      ],
    });
    c.path.push({ p: [0, c.y, z + 4.5], spread: 5.5, avoid: 1.9 }, { p: [0, c.y, z + 12.5], spread: 5.5, avoid: 1.9 });
    dress(c, z, z + 17, w);
    c.z += 17;
  }
}

/** Swinging hammers across the lane. */
export function hammers(c: Course, n = 3) {
  const w = 12, z0 = c.z, len = 8 * n + 4;
  slab(c, z0, z0 + len, w, alt(c));
  rails(c, z0, z0 + len, w);
  c.path.push({ p: [0, c.y, z0 + 2], spread: 3 });
  for (let i = 0; i < n; i++) {
    const z = z0 + 6 + i * 8;
    c.obstacles.push({
      pos: [0, c.y + 8.5, z],
      hit: 15,
      motion: { kind: 'swing', axis: 'z', amplitude: 1.05, period: 2.8, phase: i * 2.1 },
      parts: [
        { shape: 'box', size: [0.36, 6.4, 0.36], pos: [0, -3.2, 0], mat: 'metal', round: 0.12 },
        cyl([0, -7.3, 0], 1.9, 2.8, 'hazard', { rot: [90 * DEG, 0, 0], tex: 'stripes', round: 0.32 }),
        deco(cyl([0, -7.3, 1.42], 1.5, 0.1, 'white', { rot: [90 * DEG, 0, 0], round: 0.04 })),
        deco(cyl([0, -7.3, -1.42], 1.5, 0.1, 'white', { rot: [90 * DEG, 0, 0], round: 0.04 })),
      ],
    });
    for (const s of [-1, 1]) c.pieces.push(deco(cyl([s * 6.75, c.y + 4.4, z], 0.6, 9, 'accentAlt', { round: 0.2 })));
    c.pieces.push(deco(box([0, c.y + 8.85, z], [14.2, 0.7, 0.7], 'accentAlt', { round: 0.25 })));
    c.path.push({ p: [0, c.y, z + 4], spread: 3 });
  }
  dress(c, z0, z0 + len, w);
  c.z += len;
}

/** Three bounce pads that launch you over a gap onto a higher floor. */
export function padJump(c: Course, rise = 2.5) {
  const w = 14, z = c.z;
  slab(c, z, z + 4, w, alt(c));
  for (const x of [-4.5, 0, 4.5]) {
    c.pieces.push(cyl([x, c.y + 0.12, z + 2], 2.6, 0.24, 'bounce', { surface: 'bounce', power: 15.5, dir: [0, 0, 1], round: 0.08 }));
    c.pieces.push(deco(cyl([x, c.y + 0.07, z + 2], 3.0, 0.14, 'white', { round: 0.06 })));
  }
  c.path.push({ p: [0, c.y, z + 2], lanes: [-4.5, 0, 4.5], r: 1.2 });
  c.y += rise;
  slab(c, z + 10, z + 19, w, alt(c));
  rails(c, z + 10, z + 19, w);
  c.path.push({ p: [0, c.y, z + 15.5], spread: 3 });
  dress(c, z + 10, z + 19, w);
  c.z += 19;
}

/** A ramp up (rise > 0). */
export function ramp(c: Course, rise: number, len: number, w = 12) {
  const z = c.z;
  c.pieces.push(wedge([0, c.y + rise / 2, z + len / 2], [w, rise, len], 'path', { tex: 'grid' }));
  c.path.push({ p: [0, c.y + rise / 2, z + len / 2], spread: 3 });
  c.y += rise;
  c.z += len;
}

/** Uphill ramp with a belt running against you and pistons shoving from the sides. */
export function beltClimb(c: Course, rise = 3, len = 14) {
  const w = 12, z0 = c.z, y0 = c.y;
  const slope = Math.atan2(rise, len);
  const at = (z: number) => y0 + ((z - z0) / len) * rise;
  c.pieces.push(box([0, y0 - 0.5, z0 + len / 2], [w, 1, len], 'floorAlt'));
  c.pieces.push(wedge([0, y0 + rise / 2, z0 + len / 2], [w, rise, len], 'path', { tex: 'grid' }));
  c.pieces.push(box([0, at(z0 + len / 2) + 0.06, z0 + len / 2], [4, 0.24, len + 0.3], 'conveyor', {
    rot: [-slope, 0, 0], surface: 'conveyor', power: 4, dir: [0, 0, -1], tex: 'chevron', round: 0.06,
  }));
  for (let i = 0; i < 3; i++) {
    const side = i % 2 === 0 ? -1 : 1, z = z0 + 3 + i * 3.5;
    c.obstacles.push({
      pos: [side * 7.35, at(z) + 0.8, z],
      rot: [-slope, 0, 0],
      hit: 12,
      motion: { kind: 'slide', offset: [-side * 4.6, 0, 0], period: 2.6, phase: i * 0.35, ease: 'piston' },
      parts: [
        box([0, 0, 0], [2.6, 1.5, 2.2], 'accent', { round: 0.3 }),
        { shape: 'box', size: [0.2, 1.1, 1.8], pos: [-side * 1.32, 0, 0], mat: 'hazard', round: 0.08, tex: 'stripes' },
      ],
    });
  }
  c.path.push({ p: [3.4, at(z0 + len / 2), z0 + len / 2], spread: 1 });
  c.y += rise;
  c.z += len;
}

/** A narrow deck with no rails and pistons that shove you off it. */
export function pushers(c: Course, n = 4) {
  const w = 12, z0 = c.z, len = 5 * n + 7;
  slab(c, z0, z0 + len, w, alt(c));
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    c.obstacles.push({
      pos: [side * 7.3, c.y + 0.75, z0 + 6 + i * 5],
      hit: 12,
      motion: { kind: 'slide', offset: [-side * 5.2, 0, 0], period: 2.3, phase: i * 0.25, ease: 'piston' },
      parts: [
        box([0, 0, 0], [2.4, 1.5, 2.6], 'wall', { round: 0.3 }),
        { shape: 'box', size: [0.2, 1.1, 2.2], pos: [-side * 1.22, 0, 0], mat: 'hazard', round: 0.08, tex: 'stripes' },
      ],
    });
  }
  c.path.push({ p: [0, c.y, z0 + 2], spread: 2 }, { p: [0, c.y, z0 + len / 2], spread: 1.5 }, { p: [0, c.y, z0 + len - 2], spread: 2 });
  dress(c, z0, z0 + len, w + 4);
  c.z += len;
}

/** A bridge of tiles that crumble shortly after you step on them (and grow back). */
export function tileBridge(c: Course, rows = 6) {
  const z0 = c.z + 1.3;
  for (let row = 0; row < rows; row++) {
    for (let col = -1; col <= 1; col++) {
      c.tiles.push({
        piece: box([col * 3.3, c.y - 0.25, z0 + row * 2.45], [3.1, 0.5, 2.3], (row + col) % 2 === 0 ? 'tile' : 'tileAlt', { round: 0.14 }),
        shake: 0.5,
        respawn: 3.2,
      });
    }
  }
  const len = rows * 2.45;
  c.path.push({ p: [0, c.y, c.z + len * 0.35], spread: 2 }, { p: [0, c.y, c.z + len * 0.8], spread: 2 });
  c.z += len + 0.1;
}

/** A turntable set into the floor, with bumpers riding on it. */
export function spinner(c: Course) {
  const w = 16, z = c.z;
  slab(c, z, z + 15, w, alt(c));
  rails(c, z + 3, z + 15, w);
  c.obstacles.push({
    pos: [0, c.y, z + 7.5],
    motion: { kind: 'spin', axis: 'y', speed: c.n % 2 === 0 ? 0.75 : -0.75 },
    parts: [
      cyl([0, 0.15, 0], 11, 0.3, 'accentAlt', { tex: 'dots', round: 0.12 }),
      cyl([3.4, 0.95, 0], 1.2, 1.3, 'bumper', { surface: 'bumper', power: 9, round: 0.3 }),
      cyl([-3.4, 0.95, 0], 1.2, 1.3, 'bumper', { surface: 'bumper', power: 9, round: 0.3 }),
      deco(cyl([0, 0.45, 0], 1.6, 0.4, 'white', { round: 0.15 })),
    ],
  });
  c.path.push({ p: [0, c.y, z + 1.5], spread: 4 }, { p: [0, c.y + 0.3, z + 7.5], spread: 3 }, { p: [0, c.y, z + 13.5], spread: 4 });
  dress(c, z, z + 15, w);
  c.z += 15;
}

/**
 * Spinning discs over the void. With a positive `gap` you jump from one to the next; with a negative one
 * they overlap like meshing gears and you walk across while each carries you a different way.
 */
export function discs(c: Course, n = 2, gap = 2.5) {
  const z0 = c.z, step = 11 + gap;
  // The floor runs in under the first disc (a hair lower) so its round edge never leaves a hole.
  c.pieces.push(box([0, c.y - 0.53, z0 + 1.5], [12, 1, 3], 'path', { tex: 'grid' }));
  for (let i = 0; i < n; i++) {
    const zc = z0 + 5.6 + i * step;
    c.obstacles.push({
      pos: [0, c.y - (i % 2) * 0.03, zc],
      motion: { kind: 'spin', axis: 'y', speed: (i % 2 === 0 ? 1 : -1) * (0.9 + i * 0.1), phase: i * 1.5 },
      parts: [
        cyl([0, -0.3, 0], 11, 0.6, i % 2 === 0 ? 'accentAlt' : 'accent', { tex: 'dots', round: 0.15 }),
        box([0, 0.3, 0], [7.5, 0.6, 0.6], 'wall', { round: 0.25 }),
        deco(cyl([0, -0.02, 0], 1.6, 0.08, 'white', { round: 0.03 })),
      ],
    });
    c.pieces.push(deco(cyl([0, c.y - 8.6, zc], 1.6, 16, 'rock', { round: 0.4 })));
    c.path.push({ p: [0, c.y, zc], spread: 2 });
    if (i < n - 1 && gap > 0.5) c.path.push({ p: [0, c.y, zc + 5.05], spread: 0.6, jump: true });
  }
  const end = z0 + 5.6 + (n - 1) * step + 5.5;
  c.pieces.push(box([0, c.y - 0.53, end - 1.5], [12, 1, 3], 'path', { tex: 'grid' }));
  c.path.push({ p: [0, c.y, end - 0.2], spread: 1.5 });
  c.z = end + 0.1;
}

/** A narrow path that doglegs left and right over the void. */
export function zigzag(c: Course, n = 4) {
  const seg = 9.5, off = 4.4, wide = 5.5;
  let x = 0;
  const cross = (to: number) => {
    slab(c, c.z, c.z + wide, Math.abs(to - x) + wide, 'path', c.y, (x + to) / 2);
    c.path.push({ p: [to, c.y, c.z + wide / 2], spread: 1.2 });
  };
  for (let i = 0; i < n; i++) {
    const to = (i % 2 === 0 ? 1 : -1) * off;
    cross(to);
    slab(c, c.z + wide, c.z + seg, wide, alt(c), c.y, to);
    c.pieces.push(deco(cyl([to, c.y - 8, c.z + seg - 2], 1.6, 14, 'rock', { round: 0.4 })));
    c.path.push({ p: [to, c.y, c.z + seg - 1], spread: 1.2 });
    c.z += seg;
    x = to;
  }
  cross(0);
  c.z += wide;
}

/** Floor with jump gaps in it. */
export function gaps(c: Course, n = 3, gap = 2.6) {
  const w = 12;
  for (let i = 0; i < n; i++) {
    const z = c.z;
    slab(c, z, z + 7.4, w, alt(c));
    rails(c, z, z + 7.4, w);
    c.path.push({ p: [0, c.y, z + 3.5], spread: 3 }, { p: [0, c.y, z + 6.95], spread: 3, jump: true });
    c.pieces.push(deco(cyl([(i % 2 === 0 ? -3 : 3), c.y - 8, z + 8.7], 1.8, 14, 'rock', { round: 0.4 })));
    c.z += 7.4 + gap + (i % 2) * 0.4;
  }
}

/** Two columns of stepping stones. */
export function stones(c: Course, n = 5) {
  const lanes = [-2.6, 2.6];
  c.path.push({ p: [0, c.y, c.z - 0.4], lanes, jump: true });
  for (let i = 0; i < n; i++) {
    const zc = c.z + 2.7 + i * 4.2;
    for (const x of lanes) {
      c.pieces.push(cyl([x, c.y - 0.6, zc], 3, 1.2, i % 2 === 0 ? 'rock' : 'wood', { round: 0.3, tex: 'none' }));
      c.pieces.push(deco(cyl([x, c.y - 7.4, zc], 1.4, 12.5, 'rock', { round: 0.4 })));
    }
    c.path.push({ p: [0, c.y, zc], lanes, r: 0.9 }, { p: [0, c.y, zc + 1.1], lanes, jump: true });
  }
  c.z += 2.7 + (n - 1) * 4.2 + 1.5 + 1.2;
}

/** Three narrow beams over the void. */
export function beams(c: Course, len = 16) {
  const lanes = [-4, 0, 4], z = c.z;
  for (const x of lanes) {
    c.pieces.push(box([x, c.y - 0.35, z + len / 2], [1.5, 0.7, len + 0.4], 'wood', { tex: 'planks', round: 0.2 }));
    for (const zz of [z + 1, z + len - 1]) c.pieces.push(deco(cyl([x, c.y - 7.6, zz], 0.9, 14, 'wood', { round: 0.3 })));
  }
  for (let d = 1; d < len; d += 4.5) c.path.push({ p: [0, c.y, z + d], lanes, r: 1 });
  c.path.push({ p: [0, c.y, z + len - 0.6], lanes, r: 1 });
  c.z += len;
}

/** Logs that roll under your feet: keep walking against the spin or be carried off the side. */
export function logs(c: Course, n = 2, speed = 0.75) {
  const lanes = [-2.7, 2.7], L = 11;
  for (let i = 0; i < n; i++) {
    const z = c.z;
    lanes.forEach((x, k) => {
      c.obstacles.push({
        pos: [x, c.y - 1.3, z + L / 2],
        motion: { kind: 'spin', axis: 'z', speed: ((i + k) % 2 === 0 ? 1 : -1) * (speed + i * 0.1) },
        parts: [
          cyl([0, 0, 0], 2.6, L, 'wood', { rot: [90 * DEG, 0, 0], tex: 'planks', round: 0.25 }),
          deco(cyl([0, 0, L / 2 + 0.02], 1.9, 0.06, 'trim', { rot: [90 * DEG, 0, 0], round: 0.02 })),
          deco(cyl([0, 0, -L / 2 - 0.02], 1.9, 0.06, 'trim', { rot: [90 * DEG, 0, 0], round: 0.02 })),
        ],
      });
    });
    // Waypoints close together, so a bot keeps steering back to the top of the log.
    for (let d = 0.8; d < L; d += 2.3) c.path.push({ p: [0, c.y, z + d], lanes, r: 1.1 });
    c.z += L;
    slab(c, c.z, c.z + 3.5, 12, 'path');
    c.path.push({ p: [0, c.y, c.z + 1.8], lanes, r: 1.4 });
    c.z += 3.5;
  }
}

/** Logs on ropes swinging along the lane at shin height. */
export function swingLogs(c: Course, n = 2) {
  const w = 14, z0 = c.z, len = 9 * n + 7;
  slab(c, z0, z0 + len, w, alt(c));
  rails(c, z0, z0 + len, w);
  for (let i = 0; i < n; i++) {
    const z = z0 + 6 + i * 9;
    c.obstacles.push({
      pos: [0, c.y + 6.4, z],
      hit: 10,
      motion: { kind: 'swing', axis: 'x', amplitude: 0.85, period: 2.6, phase: i * Math.PI },
      parts: [
        { shape: 'box', size: [0.3, 5.4, 0.3], pos: [-5.6, -2.7, 0], mat: 'metal', round: 0.1 },
        { shape: 'box', size: [0.3, 5.4, 0.3], pos: [5.6, -2.7, 0], mat: 'metal', round: 0.1 },
        cyl([0, -5.85, 0], 1, 13, 'hazard', { rot: [0, 0, 90 * DEG], tex: 'stripes', round: 0.35 }),
      ],
    });
    for (const s of [-1, 1]) c.pieces.push(deco(cyl([s * 7.9, c.y + 3.4, z], 0.6, 6.8, 'accent', { round: 0.2 })));
    c.pieces.push(deco(box([0, c.y + 6.6, z], [16.4, 0.7, 0.7], 'accent', { round: 0.25 })));
    c.path.push({ p: [0, c.y, z - 4], spread: 4 }, { p: [0, c.y, z + 4.5], spread: 4 });
  }
  dress(c, z0, z0 + len, w);
  c.z += len;
}

/** Windmills whose blades sweep across the lane. */
export function windmills(c: Course, n = 2) {
  const w = 10, z0 = c.z, len = 9 * n + 11;
  slab(c, z0, z0 + len, w, alt(c));
  rails(c, z0, z0 + len, w);
  c.path.push({ p: [0, c.y, z0 + 1.5], spread: 3 });
  for (let i = 0; i < n; i++) {
    const z = z0 + 5 + i * 9;
    const parts: Piece[] = [cyl([0, 0, 0], 1.5, 1.3, 'metal', { rot: [90 * DEG, 0, 0], round: 0.3 })];
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      parts.push({
        shape: 'box', size: [0.8, 4.4, 0.8], pos: [-Math.sin(a) * 2.6, Math.cos(a) * 2.6, 0], rot: [0, 0, a],
        mat: k % 2 === 0 ? 'hazard' : 'accent', round: 0.3, tex: k % 2 === 0 ? 'stripes' : undefined,
      });
    }
    c.obstacles.push({
      pos: [0, c.y + 4.8, z], hit: 11,
      motion: { kind: 'spin', axis: 'z', speed: i % 2 === 0 ? 1.2 : -1.45, phase: i === 0 ? 0.3 : 0 },
      parts,
    });
    for (const s of [-1, 1]) c.pieces.push(deco(box([s * 6, c.y + 4.4, z + 0.9], [0.7, 8.8, 0.7], 'wall', { round: 0.25 })));
    c.pieces.push(deco(box([0, c.y + 8.9, z + 0.9], [12.7, 0.7, 0.7], 'wall', { round: 0.25 })));
    c.pieces.push(deco(cyl([0, c.y + 4.8, z + 0.65], 0.5, 0.6, 'metal', { rot: [90 * DEG, 0, 0] })));
    c.path.push({ p: [0, c.y, z + 4.5], spread: 2.5 });
  }
  c.path.push({ p: [0, c.y, z0 + len - 1.5], spread: 2.5 });
  dress(c, z0, z0 + len, w);
  c.z += len;
}

/** Three belts: one helps, one fights you, one shoves you sideways. Bumpers stand between them. */
export function belts(c: Course, len = 20) {
  const w = 16, z = c.z;
  slab(c, z, z + len, w, 'floor');
  rails(c, z, z + len, w);
  const lane = (x: number, dir: Vec3, power: number) =>
    c.pieces.push(box([x, c.y + 0.1, z + len / 2], [4.4, 0.2, len - 0.7], 'conveyor', { surface: 'conveyor', power, dir, tex: 'chevron', round: 0.06 }));
  lane(-5.2, [0, 0, 1], 3);
  lane(0, [0, 0, -1], 4.5);
  lane(5.2, [1, 0, 0], 2.6);
  [[-2.6, 0.28], [2.6, 0.52], [-2.6, 0.78]].forEach(([x, f]) => {
    c.pieces.push(cyl([x, c.y + 0.7, z + len * f], 1.1, 1.4, 'bumper', { surface: 'bumper', power: 9, round: 0.3 }));
    c.pieces.push(deco(cyl([x, c.y + 1.32, z + len * f], 1.22, 0.2, 'white', { round: 0.08 })));
  });
  c.path.push({ p: [-5.2, c.y, z + 3.5], spread: 0.6 }, { p: [-5.2, c.y, z + len - 1.8], spread: 0.6 });
  dress(c, z, z + len, w);
  c.z += len;
}

/** A sheet of ice with blocks sliding across it. */
export function iceRink(c: Course, len = 24) {
  const w = 16, z = c.z;
  c.pieces.push(box([0, c.y - 0.5, z + len / 2], [w, 1, len], 'ice', { surface: 'ice', round: 0.12 }));
  c.minY = Math.min(c.minY, c.y);
  rails(c, z, z + len, w);
  for (let i = 0; i < Math.floor(len / 7); i++) {
    c.obstacles.push({
      pos: [-5.5, c.y + 0.75, z + 5 + i * 7],
      hit: 9,
      motion: { kind: 'slide', offset: [11, 0, 0], period: 3.4 - i * 0.2, phase: i * 0.37 },
      parts: [box([0, 0, 0], [3, 1.5, 1.7], 'snow', { round: 0.35 }), deco(box([0, 0.4, 0], [3.06, 0.3, 1.76], 'hazard', { round: 0.1 }))],
    });
  }
  for (let d = 2; d < len; d += 5.5) c.path.push({ p: [0, c.y, z + d], spread: 4 });
  c.path.push({ p: [0, c.y, z + len - 0.8], spread: 4 });
  dress(c, z, z + len, w);
  c.z += len;
}

/** A long slide down, with a belt that hurries you along and bumper posts to weave between. */
export function slide(c: Course, drop = 8, len = 34) {
  const w = 14, z = c.z, y0 = c.y;
  const slope = Math.atan2(drop, len);
  const at = (zz: number) => y0 - ((zz - z) / len) * drop;
  const run2 = Math.hypot(drop, len);
  c.pieces.push(wedge([0, y0 - drop / 2, z + len / 2], [w, drop, len], 'path', { rot: [0, Math.PI, 0] }));
  c.pieces.push(box([0, at(z + len / 2) + 0.05, z + len / 2], [w - 1, 0.22, run2], 'conveyor', {
    rot: [slope, 0, 0], surface: 'conveyor', power: 7.5, dir: [0, 0, 1], tex: 'chevron', round: 0.06,
  }));
  for (const s of [-1, 1]) {
    c.pieces.push(box([s * (w / 2 + 0.2), at(z + len / 2) + 0.55, z + len / 2], [0.4, 1.1, run2], 'trim', { rot: [slope, 0, 0], round: 0.16 }));
  }
  for (let i = 0; i < Math.floor(len / 8); i++) {
    const zz = z + 7 + i * 8, x = (i % 2 === 0 ? -1 : 1) * 3.2;
    c.pieces.push(cyl([x, at(zz) + 0.75, zz], 1.3, 1.6, 'bumper', { surface: 'bumper', power: 8, round: 0.3 }));
    c.pieces.push(deco(cyl([x, at(zz) + 1.45, zz], 1.42, 0.2, 'white', { round: 0.08 })));
    c.path.push({ p: [-x * 0.9, at(zz), zz], spread: 1.2 });
  }
  c.y -= drop;
  c.minY = Math.min(c.minY, c.y);
  c.z += len;
  slab(c, c.z, c.z + 6, w, alt(c));
  rails(c, c.z, c.z + 6, w);
  c.path.push({ p: [0, c.y, c.z + 4], spread: 4 });
  c.z += 6;
}

/** Big balls swung round the lane on unseen arms. */
export function boulders(c: Course, n = 2) {
  const w = 16;
  for (let i = 0; i < n; i++) {
    const z = c.z;
    slab(c, z, z + 16, w, alt(c));
    rails(c, z, z + 16, w);
    c.obstacles.push({
      pos: [0, c.y, z + 8],
      hit: 11,
      motion: { kind: 'spin', axis: 'y', speed: (i % 2 === 0 ? 1 : -1) * 1.0, phase: i * 2.2 },
      parts: [
        ball([0, 1.2, 5.3], 2.4, 'rock'),
        ball([0, 1.2, -5.3], 2.4, 'rock'),
        cyl([0, 0.5, 0], 2, 1, 'metal'),
        deco(box([0, 0.9, 0], [0.3, 0.3, 9], 'metal', { round: 0.1 })),
      ],
    });
    c.path.push({ p: [0, c.y, z + 3], spread: 5.5, avoid: 2 }, { p: [0, c.y, z + 13], spread: 5.5, avoid: 2 });
    dress(c, z, z + 16, w);
    c.z += 16;
  }
}

/** Home stretch: the arch, the line, and a wall behind it. */
export function finish(c: Course, len = 18) {
  const w = 16, z = c.z;
  slab(c, z, z + len, w, 'floor');
  rails(c, z, z + len, w);
  const line = z + len - 6;
  arch(c, line, w, 'accent', 'checker');
  c.pieces.push(deco(box([0, c.y + 0.02, line], [w - 0.4, 0.04, 1.2], 'finish', { tex: 'checker', round: 0.01 })));
  c.pieces.push(box([0, c.y + 0.6, z + len + 0.2], [w + 0.8, 1.2, 0.4], 'trim'));
  for (const s of [-1, 1]) {
    c.pieces.push(deco(cyl([s * (w / 2 + 2.4), c.y + 2, z + len - 2], 2.8, 18, 'wall', { round: 0.5 })));
    c.pieces.push(deco(ball([s * (w / 2 + 2.4), c.y + 12, z + len - 2], 3.2, 'gold')));
  }
  c.finish = { min: [-w / 2, c.y - 1, line], max: [w / 2, c.y + 8, z + len] };
  c.path.push({ p: [0, c.y, z + len - 2.5], spread: 5 });
  dress(c, z, z + len, w + 6);
  c.z += len;
}

export interface RaceSpec {
  id: string;
  name: string;
  blurb: string;
  theme: Theme;
  prop: Prop;
  timeLimit: number;
  build(c: Course): void;
}

/** Builds a race map from a list of sections. */
export function raceMap(spec: RaceSpec): MapDef {
  let seed = 7;
  for (const ch of spec.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const c = course(spec.prop, seed);
  spec.build(c);
  if (!c.spawn || !c.finish) throw new Error(`${spec.id}: a race needs start() and finish()`);
  landmark(c, -1, c.z * 0.3);
  landmark(c, 1, c.z * 0.62);
  landmark(c, c.rand() < 0.5 ? -0.35 : 0.35, c.z + 55);
  return {
    id: spec.id, name: spec.name, type: 'race', blurb: spec.blurb, timeLimit: spec.timeLimit,
    killY: c.minY - 12, theme: spec.theme, spawn: c.spawn, pieces: c.pieces, obstacles: c.obstacles,
    tiles: c.tiles, checkpoints: c.checkpoints, finish: c.finish, bot: { path: c.path },
  };
}
