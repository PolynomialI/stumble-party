import * as THREE from 'three';
import type { Tex } from '@sp/shared';

/**
 * Procedural surface patterns. Each is a greyscale "multiplier" (white = full material colour) so one
 * texture serves every colour, plus an optional normal map for bevelled grooves that catch highlights.
 * Metres covered by one texture repeat — patterns are world-projected so they stay the same size everywhere.
 */
export const TEX_SCALE: Record<Tex, number> = {
  none: 1, grid: 2, stripes: 1.6, dots: 1.4, checker: 2, chevron: 2, planks: 3,
  wood: 3, rock: 5, grass: 4, ice: 6, metal: 3, soft: 4, lava: 7, waves: 9,
};

/** Colour multiplier range (low at height 0, high at height 1) and normal-map strength for the organic patterns. */
const LOOK: Partial<Record<Tex, { lo: number; hi: number; bump: number }>> = {
  wood: { lo: 0.62, hi: 1.04, bump: 2.6 },
  rock: { lo: 0.66, hi: 1.08, bump: 4.5 },
  grass: { lo: 0.8, hi: 1.08, bump: 1.6 },
  ice: { lo: 0.86, hi: 1.12, bump: 1.8 },
  metal: { lo: 0.7, hi: 1.05, bump: 3.2 },
  soft: { lo: 0.88, hi: 1.06, bump: 0 },
  lava: { lo: 0.3, hi: 1.15, bump: 2.4 },
  waves: { lo: 0.78, hi: 1.18, bump: 0 },
};

/** Tileable value noise: `cells` lattice points per side, smooth interpolation, wraps at the edges. */
function valueNoise(cells: number, seed: number): (u: number, v: number) => number {
  const grid = new Float32Array(cells * cells);
  let s = seed >>> 0;
  for (let i = 0; i < grid.length; i++) {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    grid[i] = ((s ^ (s >>> 13)) >>> 0) / 4294967296;
  }
  const at = (x: number, y: number) => grid[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smoothstep(0, 1, x - x0), fy = smoothstep(0, 1, y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Fractal noise in 0..1: octaves of value noise, each twice as fine and half as strong. */
function fbm(seed: number, base: number, octaves: number): (u: number, v: number) => number {
  const layers = Array.from({ length: octaves }, (_, i) => valueNoise(base << i, seed + i * 101));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (const n of layers) { sum += n(u, v) * amp; norm += amp; amp *= 0.5; }
    return sum / norm;
  };
}

interface TexSet {
  map: THREE.Texture;
  normal: THREE.Texture | null;
}

const SIZE = 256;
const cache = new Map<string, TexSet>();

function canvas2d(size = SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** Height field (0..1, 1 = high) for the pattern; also drives the colour multiplier. */
function heightField(tex: Tex): Float32Array {
  const h = new Float32Array(SIZE * SIZE);
  const s = SIZE;
  const n1 = fbm(11, 4, 4), n2 = fbm(57, 8, 3), grain = valueNoise(64, 5);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = (x + 0.5) / s, v = (y + 0.5) / s;
      let val = 1;
      switch (tex) {
        case 'grid': {
          // One tile per repeat with a rounded groove along its border.
          const d = Math.min(u, 1 - u, v, 1 - v);
          val = smoothstep(0.012, 0.05, d);
          break;
        }
        case 'planks': {
          // Offset boards, four rows per repeat.
          const rv = v * 4, row = Math.floor(rv), fv = rv - row;
          const dv = Math.min(fv, 1 - fv) / 4;
          const fu = (u + (row % 2) * 0.5) % 1;
          const du = Math.min(fu, 1 - fu);
          val = smoothstep(0.004, 0.02, Math.min(dv, du));
          break;
        }
        case 'stripes': {
          // 45-degree bands; (x + y) periodic in half the tile so it wraps seamlessly.
          const k = ((x + y) % (s / 2)) / (s / 2);
          val = smoothstep(-0.14, 0.14, Math.sin(k * Math.PI * 2));
          break;
        }
        case 'dots': {
          const d = Math.min(Math.hypot(u - 0.25, v - 0.25), Math.hypot(u - 0.75, v - 0.75));
          val = smoothstep(0.125, 0.105, d);
          break;
        }
        case 'wood': {
          // Boards with grooves between them, grain streaks along each board and the odd knot.
          const rv = v * 4, row = Math.floor(rv), fv = rv - row;
          const dv = Math.min(fv, 1 - fv) / 4;
          const fu = (u + (row % 2) * 0.5) % 1;
          const du = Math.min(fu, 1 - fu);
          const groove = smoothstep(0.004, 0.022, Math.min(dv, du));
          const streak = grain(u * 0.12 + row * 0.37, v * 1.0) * 0.6 + n2(u, v * 4 + row) * 0.4;
          const kx = (fu - 0.3 - 0.4 * ((row * 7) % 3) / 3), ky = (fv - 0.5) * 0.25;
          const knot = 1 - smoothstep(0.0, 0.03, Math.hypot(kx, ky));
          val = groove * (0.45 + 0.55 * streak) * (1 - knot * 0.5);
          break;
        }
        case 'rock': {
          const a = n1(u, v), b = n2(u, v);
          // Broad lumps with sharp creases where two noise fields meet.
          val = a * 0.7 + b * 0.3 - (1 - smoothstep(0, 0.035, Math.abs(a - b))) * 0.35;
          val = Math.max(0, Math.min(1, val * 1.15));
          break;
        }
        case 'grass':
          val = n2(u, v) * 0.6 + grain(u, v) * 0.4;
          break;
        case 'ice': {
          const a = n1(u, v);
          // Smooth sheet with thin frost cracks.
          const crack = 1 - smoothstep(0, 0.012, Math.abs(n2(u, v) - 0.5));
          val = Math.max(0, 0.55 + a * 0.45 - crack * 0.55);
          break;
        }
        case 'metal': {
          // Two-by-two plates with seams, a rivet in each corner and faint brushing.
          const pu = (u * 2) % 1, pv = (v * 2) % 1;
          const seam = smoothstep(0.012, 0.045, Math.min(pu, 1 - pu, pv, 1 - pv));
          const rx = Math.min(pu, 1 - pu) - 0.11, ry = Math.min(pv, 1 - pv) - 0.11;
          const rivet = 1 - smoothstep(0.03, 0.045, Math.hypot(rx, ry));
          val = Math.min(1, seam * (0.72 + grain(u * 0.08, v) * 0.16) + rivet * 0.3);
          break;
        }
        case 'soft':
          val = n1(u, v);
          break;
        case 'lava': {
          // Dark crust plates with glowing cracks between them.
          const a = n1(u, v), b = n2(u + 0.3, v + 0.7);
          val = 1 - smoothstep(0.0, 0.09, Math.abs(a - b) + (grain(u, v) - 0.5) * 0.03);
          val = Math.min(1, val + a * 0.18);
          break;
        }
        case 'waves': {
          const a = n1(u, v), b = n2(u + 0.5, v + 0.2);
          val = 1 - Math.abs(Math.sin((a + b) * Math.PI * 2.0)) * 0.9;
          break;
        }
        default:
          val = 1;
      }
      h[y * s + x] = val;
    }
  }
  return h;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeNormalMap(h: Float32Array, strength: number): THREE.Texture {
  const [c, g] = canvas2d();
  const img = g.createImageData(SIZE, SIZE);
  const s = SIZE;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const l = h[y * s + ((x - 1 + s) % s)], r = h[y * s + ((x + 1) % s)];
      const d = h[((y - 1 + s) % s) * s + x], u = h[((y + 1) % s) * s + x];
      let nx = (l - r) * strength, ny = (d - u) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const i = (y * s + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function drawPattern(tex: Tex, g: CanvasRenderingContext2D, h: Float32Array) {
  const s = SIZE;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, s, s);
  switch (tex) {
    case 'grid':
    case 'planks': {
      // Grooves darken, and a faint top-left highlight sells the bevel even without a normal map.
      const img = g.getImageData(0, 0, s, s);
      for (let i = 0; i < s * s; i++) {
        const v = 0.74 + 0.26 * h[i];
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255;
      }
      g.putImageData(img, 0, 0);
      if (tex === 'grid') {
        const grad = g.createRadialGradient(s * 0.3, s * 0.3, 0, s * 0.5, s * 0.5, s * 0.75);
        grad.addColorStop(0, 'rgba(255,255,255,0.10)');
        grad.addColorStop(1, 'rgba(0,0,0,0.05)');
        g.fillStyle = grad;
        g.fillRect(s * 0.05, s * 0.05, s * 0.9, s * 0.9);
      }
      break;
    }
    case 'stripes':
    case 'dots': {
      const img = g.getImageData(0, 0, s, s);
      const lo = tex === 'stripes' ? 0.7 : 1, hi = tex === 'stripes' ? 1 : 0.8;
      for (let i = 0; i < s * s; i++) {
        const v = lo + (hi - lo) * h[i];
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255;
      }
      g.putImageData(img, 0, 0);
      break;
    }
    case 'checker': {
      g.fillStyle = '#1e1e28';
      g.fillRect(0, 0, s / 2, s / 2);
      g.fillRect(s / 2, s / 2, s / 2, s / 2);
      break;
    }
    case 'chevron': {
      g.fillStyle = '#8a8a8a';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#ffffff';
      g.lineJoin = 'round';
      for (const oy of [0, 0.5]) {
        g.beginPath();
        g.moveTo(s * 0.18, s * (oy + 0.36));
        g.lineTo(s * 0.5, s * (oy + 0.12));
        g.lineTo(s * 0.82, s * (oy + 0.36));
        g.lineTo(s * 0.82, s * (oy + 0.46));
        g.lineTo(s * 0.5, s * (oy + 0.22));
        g.lineTo(s * 0.18, s * (oy + 0.46));
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'none':
      break;
    default: {
      const look = LOOK[tex];
      if (!look) break;
      const img = g.getImageData(0, 0, s, s);
      for (let i = 0; i < s * s; i++) {
        const v = Math.min(1, look.lo + (look.hi - look.lo) * h[i]);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255;
      }
      g.putImageData(img, 0, 0);
    }
  }
}

/** Colour-multiplier (and normal) textures for a pattern. Cached; shared by every material using it. */
export function patternTextures(tex: Tex, anisotropy: number, withNormal: boolean): TexSet | null {
  if (tex === 'none') return null;
  const key = `${tex}|${anisotropy}|${withNormal}`;
  let set = cache.get(key);
  if (set) return set;
  const h = heightField(tex);
  const [c, g] = canvas2d();
  drawPattern(tex, g, h);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = tex === 'grid' || tex === 'planks' ? 3.2 : LOOK[tex]?.bump ?? 0;
  const normal = withNormal && bump > 0 ? makeNormalMap(h, bump) : null;
  for (const t of [map, normal]) {
    if (!t) continue;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
  }
  set = { map, normal };
  cache.set(key, set);
  return set;
}

/** Soft round blob used for cheap contact shadows under characters. */
export function blobShadowTexture(): THREE.Texture {
  const [c, g] = canvas2d(64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
