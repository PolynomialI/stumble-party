import { loadQuality, saveQuality, type Quality } from './render/quality';

export interface Settings {
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
  sfx: number;
  music: number;
  showFps: boolean;
}

const KEY = 'sp.settings';

export function loadSettings(): Settings {
  const d: Settings = { quality: loadQuality(), sensitivity: 1, invertY: false, sfx: 0.8, music: 0.35, showFps: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const num = (v: unknown, lo: number, hi: number, f: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : f);
    return {
      quality: d.quality,
      sensitivity: num(raw.sensitivity, 0.2, 3, d.sensitivity),
      invertY: typeof raw.invertY === 'boolean' ? raw.invertY : d.invertY,
      sfx: num(raw.sfx, 0, 1, d.sfx),
      music: num(raw.music, 0, 1, d.music),
      showFps: typeof raw.showFps === 'boolean' ? raw.showFps : d.showFps,
    };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings) {
  saveQuality(s.quality);
  try {
    const rest = { sensitivity: s.sensitivity, invertY: s.invertY, sfx: s.sfx, music: s.music, showFps: s.showFps };
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* storage blocked */
  }
}
