import { beforeAll, describe, expect, it } from 'vitest';
import { BTN_DIVE, BTN_JUMP, BTN_JUMP_PRESS, initPhysics, type InputCmd } from '@sp/shared';
import { NetHarness } from './netharness';

beforeAll(async () => {
  await initPhysics();
});

const idle: InputCmd = { mx: 0, mz: 0, buttons: 0 };

/** Runs forward with the odd jump and dive, like a player crossing the start area. */
const runner = (start: number) => (tick: number): InputCmd => {
  const t = tick - start;
  const buttons = t % 45 === 10 ? BTN_JUMP | BTN_JUMP_PRESS : t % 97 === 50 ? BTN_DIVE : 0;
  return { mx: Math.sin(t / 40) * 0.3, mz: 1, buttons };
};

describe('netcode (simulated network)', () => {
  for (const rtt of [40, 150, 300]) {
    it(`predicts a solo run exactly at ${rtt} ms RTT with jitter`, () => {
      const h = new NetHarness('tumbletop', rtt, 25, 7);
      const c = h.addClient('solo', runner(0));
      h.spawn();
      h.run(6000);
      const p = c.predictor;
      expect(p.synced).toBe(true);
      expect(p.stats.resyncs).toBe(0);
      expect(c.maxCorrection).toBeLessThan(0.05);
      // Client and server agree on where we are (client is ahead by the lead + latency).
      const srv = h.serverState(c);
      expect(Math.abs(srv.pz - p.own.pz)).toBeLessThan(8);
      expect(srv.pz).toBeGreaterThan(20);
    });
  }

  it('keeps corrections small when shoving someone', () => {
    const h = new NetHarness('lobby', 150, 20, 3);
    const a = h.addClient('a', () => idle);
    const b = h.addClient('b', () => idle);
    h.spawn();
    h.run(1500);
    // B charges straight at A.
    const ax = a.own.px, az = a.own.pz;
    b.script = () => {
      const dx = ax - b.own.px, dz = az - b.own.pz, l = Math.hypot(dx, dz) || 1;
      return { mx: dx / l, mz: dz / l, buttons: 0 };
    };
    h.run(2500);
    const avg = b.corrections ? b.sumCorrection / b.corrections : 0;
    console.log('charger corrections', b.corrections, 'max', b.maxCorrection.toFixed(3), 'avg', avg.toFixed(3),
      '| victim max', a.maxCorrection.toFixed(3));
    expect(b.maxCorrection).toBeLessThan(0.35);
    expect(avg).toBeLessThan(0.12);
  });

  it('recovers from a long stall without runaway resyncs', () => {
    const h = new NetHarness('lobby', 150, 20, 5);
    const c = h.addClient('s', runner(0));
    h.spawn();
    h.run(2000);
    c.stallUntil = h.now + 2500;
    h.run(6000);
    const p = c.predictor;
    expect(p.stats.resyncs).toBeLessThanOrEqual(2);
    expect(p.predTick - h.sim.tick).toBeGreaterThan(0);
    expect(p.predTick - h.sim.tick).toBeLessThan(20);
  });
});
