import { rng } from './math';

/** Suit colours players can pick from. */
export const PALETTE: readonly { name: string; hex: number }[] = [
  { name: 'Strawberry', hex: 0xff4f6d },
  { name: 'Tangerine', hex: 0xff8a3d },
  { name: 'Sunflower', hex: 0xffc93c },
  { name: 'Lime', hex: 0x9be15d },
  { name: 'Mint', hex: 0x3ddc97 },
  { name: 'Lagoon', hex: 0x1fc7c1 },
  { name: 'Sky', hex: 0x3fa9ff },
  { name: 'Cobalt', hex: 0x4d6bff },
  { name: 'Grape', hex: 0x8c5cff },
  { name: 'Orchid', hex: 0xd65cff },
  { name: 'Bubblegum', hex: 0xff6fcf },
  { name: 'Snow', hex: 0xe6eaf3 },
  { name: 'Pebble', hex: 0x9aa5b8 },
  { name: 'Charcoal', hex: 0x3a3f55 },
  { name: 'Cocoa', hex: 0x8b5a3c },
  { name: 'Peach', hex: 0xffcf9e },
];

export const PATTERNS = ['Solid', 'Stripes', 'Dots', 'Split', 'Belly', 'Zigzag'] as const;
export const HATS = ['None', 'Party Hat', 'Beanie', 'Top Hat', 'Propeller', 'Flower', 'Antenna', 'Bunny Ears', 'Cat Ears', 'Halo'] as const;
export const EMOTES = ['', 'Wave', 'Dance', 'Cheer', 'Giggle'] as const;
export const EMOTE_COUNT = EMOTES.length - 1;

export interface Look {
  body: number;
  accent: number;
  pattern: number;
  hat: number;
}

export const NAME_MAX = 16;

const intIn = (v: unknown, n: number, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : fallback;

/** Clamps untrusted customisation to valid indices. */
export function sanitizeLook(raw: unknown): Look {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    body: intIn(o.body, PALETTE.length, 0),
    accent: intIn(o.accent, PALETTE.length, 2),
    pattern: intIn(o.pattern, PATTERNS.length, 0),
    hat: intIn(o.hat, HATS.length, 0),
  };
}

/** Trims, strips control/markup characters and limits length. Empty names get a friendly default. */
export function sanitizeName(raw: unknown, fallback = 'Player'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(cleaned).slice(0, NAME_MAX).join('');
  return chars.length > 0 ? chars : fallback;
}

const NAME_A = ['Bouncy', 'Wobbly', 'Zippy', 'Giggly', 'Sneaky', 'Fluffy', 'Jumpy', 'Speedy', 'Sparkly', 'Dizzy', 'Plucky', 'Snappy', 'Cosmic', 'Turbo', 'Mellow', 'Rowdy'];
const NAME_B = ['Bean', 'Noodle', 'Pickle', 'Waffle', 'Muffin', 'Pebble', 'Button', 'Nugget', 'Sprout', 'Biscuit', 'Gumdrop', 'Dumpling', 'Taco', 'Marble', 'Puffin', 'Otter'];

/** Deterministic silly name + outfit, used for bots and first-time players. */
export function randomIdentity(seed: number): { name: string; look: Look } {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const body = pick(PALETTE.length);
  let accent = pick(PALETTE.length);
  if (accent === body) accent = (accent + 5) % PALETTE.length;
  return {
    name: `${NAME_A[pick(NAME_A.length)]}${NAME_B[pick(NAME_B.length)]}${pick(90) + 10}`,
    look: { body, accent, pattern: pick(PATTERNS.length), hat: pick(HATS.length) },
  };
}
