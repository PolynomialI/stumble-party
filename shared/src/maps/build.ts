import type { Vec3 } from '../math';
import type { MatKey, Piece } from './types';

type Extra = Partial<Omit<Piece, 'shape' | 'pos' | 'size' | 'mat'>>;

/** Rounded box. */
export const box = (pos: Vec3, size: Vec3, mat: MatKey, extra: Extra = {}): Piece => ({
  shape: 'box', pos, size, mat, round: Math.min(0.18, Math.min(...size) * 0.25), ...extra,
});

/** Upright cylinder: `d` = diameter, `h` = height. */
export const cyl = (pos: Vec3, d: number, h: number, mat: MatKey, extra: Extra = {}): Piece => ({
  shape: 'cyl', pos, size: [d, h, d], mat, round: Math.min(0.15, h * 0.3), ...extra,
});

export const ball = (pos: Vec3, d: number, mat: MatKey, extra: Extra = {}): Piece => ({
  shape: 'ball', pos, size: [d, d, d], mat, ...extra,
});

/** Ramp rising toward local +Z. */
export const wedge = (pos: Vec3, size: Vec3, mat: MatKey, extra: Extra = {}): Piece => ({
  shape: 'wedge', pos, size, mat, ...extra,
});

/** Decorative only. */
export const deco = (p: Piece): Piece => ({ ...p, solid: false });

export const DEG = Math.PI / 180;
