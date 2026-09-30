import type { MatKey, Theme } from './types';

const base: Record<MatKey, number> = {
  floor: 0x3f7df5, floorAlt: 0x5f9dff, path: 0xffd84d, wall: 0xff5d7a, trim: 0xffffff,
  accent: 0xff8a1f, accentAlt: 0x8c5cff, hazard: 0xff3b47, bounce: 0x2ee6a6, conveyor: 0x3a4468,
  finish: 0xffffff, ice: 0xaee9ff, grass: 0x5fd64e, rock: 0x9aa7c7, metal: 0xc9d3e6,
  bumper: 0xff4fb8, tile: 0xffcf3a, tileAlt: 0xff9f1c, white: 0xffffff, dark: 0x2a2f45,
};

/** Bright midday sky: blue floors, candy obstacles. */
export const SUNNY: Theme = {
  skyTop: 0x2c86ff, skyHorizon: 0xc4ecff, skyBottom: 0xf2fbff, fog: 0xcfeeff,
  sunColor: 0xfff4de, sunDir: [0.45, 0.8, 0.35], cloudTint: 0xffffff,
  palette: base,
};

/** Pink-and-lilac candy afternoon. */
export const CANDY: Theme = {
  skyTop: 0x7a63ff, skyHorizon: 0xffc6e6, skyBottom: 0xfff0f8, fog: 0xffd9ee,
  sunColor: 0xfff0f5, sunDir: [-0.4, 0.75, 0.5], cloudTint: 0xfff4fb,
  palette: {
    ...base,
    floor: 0xff78b4, floorAlt: 0xffa3cf, path: 0xfff07a, wall: 0x7c5cff, accent: 0x3fd0ff,
    accentAlt: 0xffb13b, hazard: 0xff4d5e, bounce: 0x5ff2c6, tile: 0x9d7bff, tileAlt: 0x6fd6ff,
  },
};

/** Tropical turquoise. */
export const LAGOON: Theme = {
  skyTop: 0x16a9ff, skyHorizon: 0xd2fbff, skyBottom: 0xf0ffff, fog: 0xc8f6ff,
  sunColor: 0xfff6dc, sunDir: [0.3, 0.85, -0.45], cloudTint: 0xffffff,
  palette: {
    ...base,
    floor: 0x1fc2b4, floorAlt: 0x45dfcf, path: 0xffe066, wall: 0xffa23b, accent: 0xff6b6b,
    accentAlt: 0x4d7cff, hazard: 0xff4757, bounce: 0xb8f24a, tile: 0xff8fb1, tileAlt: 0xffc46b,
  },
};

/** Warm sunset for the finals. */
export const SUNSET: Theme = {
  skyTop: 0x3d2c96, skyHorizon: 0xffa26e, skyBottom: 0xffd6b0, fog: 0xf7b58f,
  sunColor: 0xffd2a1, sunDir: [-0.6, 0.45, 0.4], cloudTint: 0xffe2d0,
  palette: {
    ...base,
    floor: 0x6c5cff, floorAlt: 0x8f82ff, path: 0xffd166, wall: 0xef476f, accent: 0x06d6a0,
    accentAlt: 0xffa94d, hazard: 0xff3d5a, bounce: 0x3cf0b4, tile: 0xffd166, tileAlt: 0xff8c61,
  },
};

export const TEST_THEME = SUNNY;
