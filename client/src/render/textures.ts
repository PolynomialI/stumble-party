import * as THREE from 'three';
import type { Tex } from '@sp/shared';

/**
 * Procedural surface patterns. Each is a greyscale "multiplier" (white = full material colour) so one
 * texture serves every colour, plus an optional normal map for bevelled grooves that catch highlights.
 * Metres covered by one texture repeat — patterns are world-projected so they stay the same size everywhere.
 */
export const TEX_SCALE: Record<Tex, number> = {
  none: 1, grid: 2, stripes: 1.6, dots: 1.4, checker: 2, chevron: 2, planks: 3,
};

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
  const normal = withNormal && (tex === 'grid' || tex === 'planks') ? makeNormalMap(h, 3.2) : null;
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
