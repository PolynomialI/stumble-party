import { beforeAll, describe, expect, it } from 'vitest';
import {
  BTN_DIVE, BTN_JUMP, BTN_JUMP_PRESS, CHAR, FX_BOUNCE, FX_JUMP, FX_LAND, MODE_DIVE, MODE_GETUP, MODE_NORMAL,
  MODE_SLIDE, MODE_STUN,
} from '../src/sim/character';
import { initPhysics } from '../src/sim/world';
import { Rig, fwd, idle, testMap } from './helpers';

beforeAll(async () => {
  await initPhysics();
});

const jump = { mx: 0, mz: 0, buttons: BTN_JUMP | BTN_JUMP_PRESS };

describe('character movement', () => {
  it('rests on the floor without sinking', () => {
    const r = new Rig(testMap());
    r.step(idle, 600);
    expect(r.c.grounded).toBe(true);
    expect(r.feetY).toBeGreaterThan(-0.01);
    expect(r.feetY).toBeLessThan(0.08);
    expect(Math.abs(r.c.vx) + Math.abs(r.c.vz)).toBe(0);
  });

  it('accelerates quickly to run speed and stops quickly', () => {
    const r = new Rig(testMap(), 0, -15);
    r.step(fwd, 9); // 0.3 s
    expect(Math.hypot(r.c.vx, r.c.vz)).toBeCloseTo(CHAR.runSpeed, 1);
    const z0 = r.c.pz;
    r.step(fwd, 30);
    expect(r.c.pz - z0).toBeGreaterThan(CHAR.runSpeed * 0.95);
    expect(r.c.pz - z0).toBeLessThan(CHAR.runSpeed * 1.05);
    r.step(idle, 9);
    expect(Math.hypot(r.c.vx, r.c.vz)).toBe(0);
  });

  it('turns to face the move direction', () => {
    const r = new Rig(testMap());
    r.step({ mx: 1, mz: 0, buttons: 0 }, 15);
    expect(r.c.yaw).toBeCloseTo(Math.PI / 2, 2);
  });

  it('jumps about 1.5 m and lands again', () => {
    const r = new Rig(testMap());
    r.step(idle, 5);
    const fx = r.step(jump);
    expect(fx & FX_JUMP).toBeTruthy();
    let apex = 0;
    let landed = false;
    for (let i = 0; i < 45; i++) {
      const f = r.step({ mx: 0, mz: 0, buttons: BTN_JUMP });
      apex = Math.max(apex, r.feetY);
      if (f & FX_LAND) landed = true;
    }
    const expected = (CHAR.jumpSpeed * CHAR.jumpSpeed) / (2 * CHAR.gravity);
    expect(apex).toBeGreaterThan(expected - 0.2);
    expect(apex).toBeLessThan(expected + 0.2);
    expect(landed).toBe(true);
    expect(r.c.grounded).toBe(true);
  });

  it('buffers a jump pressed just before landing', () => {
    const r = new Rig(testMap(), 0, 0, 1.2);
    r.c.grounded = false;
    let jumped = false;
    for (let i = 0; i < 30 && !jumped; i++) {
      const nearGround = r.feetY < 0.35 && r.c.vy < 0;
      const f = r.step(nearGround ? jump : idle);
      if (f & FX_JUMP) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('cannot double jump', () => {
    const r = new Rig(testMap());
    r.step(jump);
    r.step(idle, 6);
    const vyBefore = r.c.vy;
    const fx = r.step(jump);
    expect(fx & FX_JUMP).toBe(0);
    expect(r.c.vy).toBeLessThan(vyBefore);
  });

  it('is blocked by walls', () => {
    const r = new Rig(testMap({ pieces: [{ shape: 'box', size: [10, 3, 1], pos: [0, 1.5, 5], mat: 'wall' }] }));
    r.step(fwd, 60);
    expect(r.c.pz).toBeLessThan(5 - 0.5 - CHAR.radius + 0.05);
    expect(r.c.pz).toBeGreaterThan(3.5);
  });

  it('walks up gentle ramps', () => {
    const r = new Rig(testMap({
      pieces: [{ shape: 'wedge', size: [6, 2, 6], pos: [0, 1, 6], mat: 'path' }, { shape: 'box', size: [6, 2, 6], pos: [0, 1, 12], mat: 'floor' }],
    }));
    r.step(fwd, 48);
    expect(r.c.pz).toBeGreaterThan(10);
    expect(r.c.pz).toBeLessThan(14);
    expect(r.c.grounded).toBe(true);
    expect(r.feetY).toBeGreaterThan(1.95);
  });

  it('steps up small ledges but not tall ones', () => {
    const r = new Rig(testMap({
      pieces: [
        { shape: 'box', size: [4, 0.3, 4], pos: [0, 0.15, 4], mat: 'path' },
        { shape: 'box', size: [4, 0.8, 4], pos: [0, 0.7, 8], mat: 'wall' },
      ],
    }));
    r.step(fwd, 40);
    expect(r.feetY).toBeGreaterThan(0.28);
    expect(r.c.pz).toBeLessThan(6 - 0.4);
    expect(r.c.pz).toBeGreaterThan(5);
  });

  it('falls off ledges', () => {
    const map = testMap();
    map.pieces[0] = { shape: 'box', size: [4, 1, 4], pos: [0, -0.5, 0], mat: 'floor' };
    const r = new Rig(map);
    r.step(fwd, 30);
    expect(r.c.grounded).toBe(false);
    expect(r.feetY).toBeLessThan(-0.5);
  });

  it('launches off bounce pads', () => {
    const r = new Rig(testMap({
      pieces: [{ shape: 'cyl', size: [3, 0.3, 3], pos: [0, 0.15, 4], mat: 'bounce', surface: 'bounce', power: 16 }],
    }));
    let bounced = false;
    let apex = 0;
    for (let i = 0; i < 60; i++) {
      if (r.step(fwd) & FX_BOUNCE) bounced = true;
      apex = Math.max(apex, r.feetY);
    }
    expect(bounced).toBe(true);
    expect(apex).toBeGreaterThan(3.5);
  });

  it('is carried by conveyors', () => {
    const r = new Rig(testMap({
      pieces: [{ shape: 'box', size: [4, 0.2, 20], pos: [0, 0.1, 0], mat: 'conveyor', surface: 'conveyor', power: 3, dir: [0, 0, -1] }],
    }), 0, 0, 0.2);
    r.step(idle, 5);
    const z0 = r.c.pz;
    r.step(idle, 30);
    expect(r.c.pz - z0).toBeLessThan(-2.5);
    expect(r.c.pz - z0).toBeGreaterThan(-3.5);
  });

  it('rides moving platforms', () => {
    const map = testMap({
      obstacles: [{
        pos: [0, 5, 0], motion: { kind: 'slide', offset: [6, 0, 0], period: 6 },
        parts: [{ shape: 'box', size: [4, 0.5, 4], pos: [0, 0, 0], mat: 'accent' }],
      }],
    });
    const r = new Rig(map, 0, 0, 5.25);
    r.step(idle, 10);
    expect(r.c.grounded).toBe(true);
    r.step(idle, 80);
    expect(r.c.grounded).toBe(true);
    // Platform offset at t = 90 ticks = 3 s: half period, fully extended.
    expect(r.c.px).toBeGreaterThan(5.3);
    expect(r.c.px).toBeLessThan(6.7);
  });

  it('gets knocked back by a sweeper', () => {
    const map = testMap({
      obstacles: [{
        pos: [0, 0, 0], motion: { kind: 'spin', axis: 'y', speed: 2 }, hit: 12,
        parts: [{ shape: 'box', size: [0.6, 0.6, 8], pos: [0, 0.5, 4], mat: 'hazard' }],
      }],
    });
    const r = new Rig(map, 3, 0.5);
    let stunned = false;
    let maxSpeed = 0;
    for (let i = 0; i < 90; i++) {
      r.step(idle);
      if (r.c.mode === MODE_STUN) stunned = true;
      maxSpeed = Math.max(maxSpeed, Math.hypot(r.c.vx, r.c.vz));
    }
    expect(stunned).toBe(true);
    expect(maxSpeed).toBeGreaterThan(6);
  });

  it('dives, belly-slides and gets back up', () => {
    const r = new Rig(testMap(), 0, -10);
    r.step(fwd, 10);
    r.step({ mx: 0, mz: 1, buttons: BTN_DIVE });
    expect(r.c.mode).toBe(MODE_DIVE);
    expect(Math.hypot(r.c.vx, r.c.vz)).toBeGreaterThanOrEqual(CHAR.diveSpeed - 0.01);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      r.step(fwd);
      seen.add(r.c.mode);
    }
    expect(seen.has(MODE_SLIDE)).toBe(true);
    expect(seen.has(MODE_GETUP)).toBe(true);
    expect(r.c.mode).toBe(MODE_NORMAL);
  });

  it('only dives once per airtime', () => {
    const r = new Rig(testMap());
    r.step(jump);
    r.step({ mx: 0, mz: 1, buttons: BTN_DIVE });
    expect(r.c.mode).toBe(MODE_DIVE);
    const vy = r.c.vy;
    r.step({ mx: 0, mz: 1, buttons: BTN_DIVE });
    expect(r.c.vy).toBeLessThan(vy);
  });

  it('does not tunnel through thin floors at terminal velocity', () => {
    const map = testMap();
    map.pieces[0] = { shape: 'box', size: [6, 0.2, 6], pos: [0, -0.1, 0], mat: 'floor' };
    const r = new Rig(map, 0, 0, 40);
    r.c.grounded = false;
    r.c.vy = -32;
    r.step(idle, 90);
    expect(r.c.grounded).toBe(true);
    expect(Math.abs(r.feetY)).toBeLessThan(0.02);
  });

  it('does not tunnel through thin walls when diving', () => {
    const r = new Rig(testMap({ pieces: [{ shape: 'box', size: [8, 3, 0.15], pos: [0, 1.5, 3], mat: 'wall' }] }));
    r.step(fwd, 4);
    r.step({ mx: 0, mz: 1, buttons: BTN_DIVE });
    r.step(fwd, 40);
    expect(r.c.pz).toBeLessThan(3);
  });

  it('is deterministic for identical input streams', () => {
    const map = testMap({
      obstacles: [{
        pos: [0, 0, 6], motion: { kind: 'spin', axis: 'y', speed: 1.7 }, hit: 10,
        parts: [{ shape: 'box', size: [0.5, 0.5, 7], pos: [0, 0.6, 3.5], mat: 'hazard' }],
      }],
    });
    const a = new Rig(map, 0, -3);
    const b = new Rig(map, 0, -3);
    for (let i = 0; i < 200; i++) {
      const inp = { mx: Math.sin(i / 17), mz: Math.cos(i / 23), buttons: i % 37 === 0 ? BTN_JUMP_PRESS : i % 53 === 0 ? BTN_DIVE : 0 };
      a.step(inp);
      b.step(inp);
    }
    expect([a.c.px, a.c.py, a.c.pz, a.c.vx, a.c.vy, a.c.vz]).toEqual([b.c.px, b.c.py, b.c.pz, b.c.vx, b.c.vy, b.c.vz]);
  });
});
