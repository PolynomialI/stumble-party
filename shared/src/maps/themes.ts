import type { MatKey, Theme } from './types';

const base: Record<MatKey, number> = {
  floor: 0x3f7df5, floorAlt: 0x5f9dff, path: 0xffd84d, wall: 0xff5d7a, trim: 0xffffff,
  accent: 0xff8a1f, accentAlt: 0x8c5cff, hazard: 0xff3b47, bounce: 0x2ee6a6, conveyor: 0x3a4468,
  finish: 0xffffff, ice: 0xaee9ff, grass: 0x5fd64e, rock: 0x9aa7c7, metal: 0xc9d3e6,
  bumper: 0xff4fb8, tile: 0xffcf3a, tileAlt: 0xff9f1c, white: 0xffffff, dark: 0x2a2f45,
  wood: 0xb8793f, leaf: 0x3fb34f, lava: 0xff5a1f, water: 0x2f9bff, snow: 0xf2f8ff, gold: 0xffc83d,
};

/** Bright midday sky: blue floors, candy obstacles. */
export const SUNNY: Theme = {
  skyTop: 0x1a73f5, skyHorizon: 0xa9e2ff, skyBottom: 0xe8f7ff, fog: 0xb9e6ff,
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

/** Twilight: violet sky, glowing candy colours. */
export const TWILIGHT: Theme = {
  skyTop: 0x241a6b, skyHorizon: 0xd77cf0, skyBottom: 0xf2c2ff, fog: 0xb98be6,
  sunColor: 0xffd9f2, sunDir: [0.5, 0.55, -0.6], cloudTint: 0xf1d6ff,
  palette: {
    ...base,
    floor: 0x4b3bd1, floorAlt: 0x6a5cf0, path: 0x5ff2e0, wall: 0xff5fa8, accent: 0xffc23d,
    accentAlt: 0x37d6ff, hazard: 0xff4774, bounce: 0x7dff9a, tile: 0x6be4ff, tileAlt: 0xff8ad8,
    trim: 0xf6eaff,
  },
};

/** Deep forest: mossy floors, timber and a green-gold sky. */
export const FOREST: Theme = {
  skyTop: 0x2a9d8f, skyHorizon: 0xc9f2c7, skyBottom: 0xeffbe6, fog: 0xc4eccb,
  sunColor: 0xfff3c4, sunDir: [0.35, 0.8, -0.4], cloudTint: 0xfaffee,
  palette: {
    ...base,
    floor: 0x4caf50, floorAlt: 0x6cc24a, path: 0xd9a05b, wall: 0x8d5a34, trim: 0xf3e9d2, accent: 0xe07a3f,
    accentAlt: 0x7b5cd6, hazard: 0xe63946, bounce: 0xff5d8f, rock: 0x8a8f86, tile: 0xc98b4a, tileAlt: 0xa86e37,
    grass: 0x58c44a, water: 0x3aa7e8,
  },
};

/** Frozen peaks: ice, snow and a pale winter sky. */
export const FROST: Theme = {
  skyTop: 0x3f7fd9, skyHorizon: 0xd6ecff, skyBottom: 0xf4fbff, fog: 0xd9eeff,
  sunColor: 0xf3f8ff, sunDir: [-0.45, 0.7, 0.4], cloudTint: 0xffffff,
  palette: {
    ...base,
    floor: 0x7fb6f5, floorAlt: 0xa5cdfa, path: 0xe9f4ff, wall: 0x5567d8, trim: 0xffffff, accent: 0xff7aa8,
    accentAlt: 0x44d1c5, hazard: 0xff4d6d, bounce: 0xffd23f, rock: 0xd8e6f5, tile: 0x9fd8ff, tileAlt: 0x6fb8f0,
    leaf: 0x2f8f6b, wood: 0x7a5a45,
  },
};

/** Volcano at dusk: dark rock, glowing lava. */
export const VOLCANO: Theme = {
  skyTop: 0x2b1438, skyHorizon: 0xff7a3d, skyBottom: 0xffc27a, fog: 0xd9683f,
  sunColor: 0xffc48a, sunDir: [0.5, 0.5, 0.45], cloudTint: 0xffb38a,
  palette: {
    ...base,
    floor: 0x5b4a5e, floorAlt: 0x74607a, path: 0xf2a65a, wall: 0x9b2d30, trim: 0xffe0b8, accent: 0xffb703,
    accentAlt: 0xe5383b, hazard: 0xff2e2e, bounce: 0x7cf29c, rock: 0x4a3c4d, tile: 0xff9248, tileAlt: 0xd9642e,
    dark: 0x2a2030, conveyor: 0x33283a,
  },
};

/** Clockwork factory: brass, teal and steel under an evening sky. */
export const WORKS: Theme = {
  skyTop: 0x1f4e79, skyHorizon: 0xf2c57c, skyBottom: 0xffe9c2, fog: 0xe6c79a,
  sunColor: 0xffe2b0, sunDir: [-0.5, 0.6, -0.4], cloudTint: 0xfff0d8,
  palette: {
    ...base,
    floor: 0x2a9d8f, floorAlt: 0x3fb8a8, path: 0xe9c46a, wall: 0xc8553d, trim: 0xf6f1e4, accent: 0xf4a261,
    accentAlt: 0xe76f51, hazard: 0xe63946, bounce: 0x8ce99a, metal: 0xd9c9a8, rock: 0x6f7f8c, tile: 0xe9c46a,
    tileAlt: 0xf4a261,
  },
};

/** Water park: aqua, sunshine yellow and coral. */
export const SPLASH: Theme = {
  skyTop: 0x0f8fe8, skyHorizon: 0xb5f0ff, skyBottom: 0xe9fdff, fog: 0xbdefff,
  sunColor: 0xfff8d6, sunDir: [0.4, 0.85, 0.3], cloudTint: 0xffffff,
  palette: {
    ...base,
    floor: 0xffd23f, floorAlt: 0xffe27a, path: 0x23c4e8, wall: 0xff6b6b, trim: 0xffffff, accent: 0xff7f50,
    accentAlt: 0x2ec4b6, hazard: 0xff3d5a, bounce: 0xb8f24a, conveyor: 0x1a9fd1, tile: 0x5ee0ff, tileAlt: 0x2bb8e6,
    wood: 0xc98b4a,
  },
};

export const TEST_THEME = SUNNY;
