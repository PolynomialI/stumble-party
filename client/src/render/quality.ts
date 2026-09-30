export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  /** Upper bound for the render resolution scale (x devicePixelRatio, capped). */
  maxPixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** PBR (MeshStandard + environment reflections) vs cheap Blinn-Phong gloss. */
  pbr: boolean;
  normalMaps: boolean;
  anisotropy: number;
  /** Bevel segments on rounded geometry. */
  bevelSegments: number;
  cylinderSegments: number;
  clouds: number;
  particles: number;
}

export const PROFILES: Record<Quality, QualityProfile> = {
  low: {
    maxPixelRatio: 0.85, antialias: false, shadows: false, shadowMapSize: 0, pbr: false, normalMaps: false,
    anisotropy: 1, bevelSegments: 1, cylinderSegments: 20, clouds: 24, particles: 60,
  },
  medium: {
    maxPixelRatio: 1, antialias: true, shadows: true, shadowMapSize: 1024, pbr: true, normalMaps: true,
    anisotropy: 4, bevelSegments: 2, cylinderSegments: 32, clouds: 48, particles: 140,
  },
  high: {
    maxPixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 2048, pbr: true, normalMaps: true,
    anisotropy: 8, bevelSegments: 3, cylinderSegments: 48, clouds: 72, particles: 260,
  },
};

const KEY = 'sp.quality';

export function loadQuality(): Quality {
  try {
    const q = localStorage.getItem(KEY);
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch {
    /* storage blocked */
  }
  return guessQuality();
}

export function saveQuality(q: Quality) {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage blocked */
  }
}

/** First-run guess: phones/low-core Chromebooks start on low, everything else on medium. */
function guessQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  if (cores <= 4 || mem <= 4 || touchOnly) return 'low';
  return 'medium';
}
