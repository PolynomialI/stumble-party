import {
  beams, beltClimb, belts, boulders, checkpoint, discs, finish, gaps, hammers, iceRink, logs, padJump, pushers,
  raceMap, ramp, run, slide, spinner, start, stones, sweepers, swingLogs, tileBridge, windmills, zigzag,
} from './kit';
import { CANDY, FOREST, FROST, LAGOON, SPLASH, SUNNY, SUNSET, TWILIGHT, VOLCANO, WORKS } from './themes';
import type { MapDef } from './types';

/** Sweepers, hammers, a belt climb, crumbling tiles, a turntable, boulders and pistons. */
export const TUMBLETOP: MapDef = raceMap({
  id: 'tumbletop', name: 'Tumbletop Trail', blurb: 'Hop the sweepers and time the hammers!',
  theme: SUNNY, prop: 'lantern', timeLimit: 200,
  build(c) {
    start(c);
    sweepers(c, 2);
    checkpoint(c);
    padJump(c);
    hammers(c, 3);
    checkpoint(c);
    beltClimb(c);
    checkpoint(c);
    tileBridge(c, 6);
    spinner(c);
    checkpoint(c);
    boulders(c, 2);
    checkpoint(c);
    pushers(c, 3);
    finish(c);
  },
});

/** Gaps, belts, spinning discs over the void, swinging logs and stepping stones. */
export const BOUNCY: MapDef = raceMap({
  id: 'bouncy', name: 'Bouncy Boulevard', blurb: 'Leap the gaps and ride the spinning floors!',
  theme: CANDY, prop: 'lolly', timeLimit: 200,
  build(c) {
    start(c);
    gaps(c, 3);
    checkpoint(c);
    belts(c, 21);
    checkpoint(c);
    discs(c, 2, 2.5);
    checkpoint(c);
    swingLogs(c, 2);
    padJump(c);
    checkpoint(c);
    stones(c, 5);
    checkpoint(c);
    spinner(c);
    sweepers(c, 1);
    finish(c);
  },
});

/** A climb past windmills, crumbling tiles and pistons to the summit. */
export const WINDMILL: MapDef = raceMap({
  id: 'windmill', name: 'Windmill Heights', blurb: 'Slip between the blades on the way to the top!',
  theme: LAGOON, prop: 'palm', timeLimit: 210,
  build(c) {
    start(c);
    ramp(c, 4, 14);
    windmills(c, 2);
    checkpoint(c);
    tileBridge(c, 5);
    pushers(c, 4);
    checkpoint(c);
    padJump(c);
    windmills(c, 3);
    checkpoint(c);
    ramp(c, 3, 10);
    boulders(c, 2);
    checkpoint(c);
    gaps(c, 2);
    finish(c);
  },
});

/** Forest: stepping stones, narrow beams and logs that roll under your feet. */
export const TIMBER: MapDef = raceMap({
  id: 'timber', name: 'Timber Tumble', blurb: 'Balance on the rolling logs!',
  theme: FOREST, prop: 'tree', timeLimit: 210,
  build(c) {
    start(c);
    stones(c, 5);
    checkpoint(c);
    beams(c, 16);
    run(c, 7);
    logs(c, 2);
    checkpoint(c);
    swingLogs(c, 2);
    padJump(c);
    checkpoint(c);
    logs(c, 3, 0.85);
    boulders(c, 2);
    checkpoint(c);
    beams(c, 12);
    run(c, 6);
    stones(c, 4);
    finish(c);
  },
});

/** Ice sheets, sliding blocks and two long slides down the mountain. */
export const FROSTBITE: MapDef = raceMap({
  id: 'frostbite', name: 'Frostbite Falls', blurb: 'Slip, slide and dodge the ice blocks!',
  theme: FROST, prop: 'pine', timeLimit: 200,
  build(c) {
    start(c);
    iceRink(c, 24);
    checkpoint(c);
    sweepers(c, 2);
    slide(c, 8, 34);
    checkpoint(c);
    iceRink(c, 30);
    gaps(c, 3);
    checkpoint(c);
    hammers(c, 3);
    slide(c, 6, 28);
    checkpoint(c);
    boulders(c, 2);
    finish(c);
  },
});

/** Water park: three big slides, belts and meshing discs. */
export const SPLASHDOWN: MapDef = raceMap({
  id: 'splashdown', name: 'Splashdown Slides', blurb: 'Ride the slides and weave the bumpers!',
  theme: SPLASH, prop: 'palm', timeLimit: 190,
  build(c) {
    start(c);
    slide(c, 10, 40);
    checkpoint(c);
    belts(c, 21);
    slide(c, 8, 34);
    checkpoint(c);
    discs(c, 3, -0.4);
    checkpoint(c);
    slide(c, 10, 40);
    padJump(c);
    spinner(c);
    checkpoint(c);
    pushers(c, 4);
    finish(c);
  },
});

/** Factory: meshing gears, pistons, hammers, belts and windmills. */
export const GEARWORKS: MapDef = raceMap({
  id: 'gearworks', name: 'Gearworks Gauntlet', blurb: 'Cross the turning gears!',
  theme: WORKS, prop: 'gear', timeLimit: 210,
  build(c) {
    start(c);
    discs(c, 3, -0.4);
    checkpoint(c);
    beltClimb(c);
    pushers(c, 4);
    checkpoint(c);
    hammers(c, 3);
    belts(c, 21);
    checkpoint(c);
    discs(c, 2, 2.5);
    checkpoint(c);
    windmills(c, 2);
    tileBridge(c, 6);
    spinner(c);
    finish(c);
  },
});

/** Volcano: gaps, boulders, crumbling bridges, stepping stones and beams over the lava. */
export const LAVALEAP: MapDef = {
  ...raceMap({
    id: 'lavaleap', name: 'Lava Leap', blurb: 'One slip and you are toast!',
    theme: VOLCANO, prop: 'torch', timeLimit: 210,
    build(c) {
      start(c);
      gaps(c, 3);
      checkpoint(c);
      boulders(c, 2);
      tileBridge(c, 7);
      checkpoint(c);
      stones(c, 6);
      checkpoint(c);
      hammers(c, 3);
      beams(c, 14);
      run(c, 6);
      checkpoint(c);
      sweepers(c, 2);
      padJump(c);
      finish(c);
    },
  }),
  sea: { y: -9, mat: 'lava' },
};

/** Sunset: a zigzag over the void, a slide, hammers, belts and rolling logs. */
export const SWITCHBACK: MapDef = raceMap({
  id: 'switchback', name: 'Switchback Sprint', blurb: 'Mind the corners!',
  theme: SUNSET, prop: 'lantern', timeLimit: 210,
  build(c) {
    start(c);
    zigzag(c, 4);
    checkpoint(c);
    slide(c, 6, 28);
    hammers(c, 3);
    checkpoint(c);
    zigzag(c, 5);
    checkpoint(c);
    belts(c, 21);
    logs(c, 2);
    checkpoint(c);
    sweepers(c, 2);
    finish(c);
  },
});

/** Twilight: a climb through windmills, stepping stones, a zigzag and beams. */
export const STARLIGHT: MapDef = raceMap({
  id: 'starlight', name: 'Starlight Steps', blurb: 'Climb to the stars!',
  theme: TWILIGHT, prop: 'crystal', timeLimit: 220,
  build(c) {
    start(c);
    ramp(c, 3, 10);
    windmills(c, 2);
    checkpoint(c);
    stones(c, 5);
    checkpoint(c);
    ramp(c, 3, 10);
    zigzag(c, 4);
    checkpoint(c);
    padJump(c);
    boulders(c, 2);
    checkpoint(c);
    beams(c, 14);
    run(c, 6);
    discs(c, 2, 2.5);
    finish(c);
  },
});

/** Candy: gears, a zigzag, crumbling tiles, a slide and swinging logs. */
export const SUGARDASH: MapDef = raceMap({
  id: 'sugardash', name: 'Sugar Dash', blurb: 'Sweet, sticky and fast!',
  theme: CANDY, prop: 'lolly', timeLimit: 210,
  build(c) {
    start(c);
    discs(c, 3, -0.4);
    checkpoint(c);
    zigzag(c, 4);
    checkpoint(c);
    tileBridge(c, 7);
    slide(c, 7, 30);
    checkpoint(c);
    swingLogs(c, 2);
    pushers(c, 4);
    checkpoint(c);
    gaps(c, 3);
    finish(c);
  },
});

export const RACES = [
  TUMBLETOP, BOUNCY, WINDMILL, TIMBER, FROSTBITE, SPLASHDOWN, GEARWORKS, LAVALEAP, SWITCHBACK, STARLIGHT, SUGARDASH,
];
