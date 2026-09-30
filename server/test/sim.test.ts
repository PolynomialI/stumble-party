import { beforeAll, describe, expect, it } from 'vitest';
import {
  BTN_DIVE, BTN_JUMP, BTN_JUMP_PRESS, CHAR, FX_JUMP, MODE_STUN, getMap, initPhysics, type InputPacket,
} from '@sp/shared';
import { MatchSim } from '../src/MatchSim';

beforeAll(async () => {
  await initPhysics();
});

const inp = (tick: number, mx = 0, mz = 0, buttons = 0, viewTick = tick): InputPacket => ({ tick, mx, mz, buttons, viewTick });

function lobbySim(n = 1) {
  const sim = new MatchSim(getMap('lobby'));
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  ids.forEach((id, i) => sim.addPlayer(id, i, null));
  sim.spawnAll(ids);
  return { sim, p: ids.map((id) => sim.players.get(id)!) };
}

describe('MatchSim input handling', () => {
  it('applies each input on the tick it was stamped for', () => {
    const { sim, p } = lobbySim();
    for (let t = 1; t <= 30; t++) sim.queueInput('p0', inp(t, 0, 1));
    const z0 = p[0].state.pz;
    for (let i = 0; i < 30; i++) sim.step();
    expect(p[0].state.pz - z0).toBeGreaterThan(5);
  });

  it('never loses a jump press that arrives late', () => {
    const { sim, p } = lobbySim();
    sim.step();
    sim.step();
    // Input for tick 2 arrives after tick 2 was simulated.
    sim.queueInput('p0', inp(2, 0, 0, BTN_JUMP | BTN_JUMP_PRESS));
    sim.step();
    expect(p[0].state.fx & FX_JUMP).toBeTruthy();
  });

  it('holds the last movement when an input is missing, but not its button presses', () => {
    const { sim, p } = lobbySim();
    sim.queueInput('p0', inp(1, 0, 1, BTN_JUMP | BTN_JUMP_PRESS));
    sim.step();
    let jumps = p[0].state.fx & FX_JUMP ? 1 : 0;
    const vz = p[0].state.vz;
    sim.step(); // no input for tick 2: keep running, but the jump press is not repeated
    expect(p[0].state.vz).toBeGreaterThanOrEqual(vz);
    for (let i = 0; i < 40; i++) {
      sim.step();
      if (p[0].state.fx & FX_JUMP) jumps++;
    }
    expect(jumps).toBe(1);
  });

  it('drops duplicate and absurdly early inputs', () => {
    const { sim, p } = lobbySim();
    sim.queueInput('p0', inp(5, 0, 1));
    sim.queueInput('p0', inp(5, 1, 0));
    sim.queueInput('p0', inp(4, 1, 0));
    expect(p[0].queue.length).toBe(1);
    sim.queueInput('p0', inp(10_000, 1, 0));
    expect(p[0].queue.length).toBe(1);
  });

  it('ignores inputs while frozen (countdown)', () => {
    const { sim, p } = lobbySim();
    sim.freezeUntil = 20;
    for (let t = 1; t <= 20; t++) sim.queueInput('p0', inp(t, 0, 1, BTN_DIVE));
    const z0 = p[0].state.pz;
    for (let i = 0; i < 20; i++) sim.step();
    expect(Math.abs(p[0].state.pz - z0)).toBeLessThan(1e-6);
  });

  it('stands disconnected players still', () => {
    const { sim, p } = lobbySim();
    for (let t = 1; t <= 30; t++) sim.queueInput('p0', inp(t, 0, 1));
    p[0].connected = false;
    const z0 = p[0].state.pz;
    for (let i = 0; i < 30; i++) sim.step();
    expect(Math.abs(p[0].state.pz - z0)).toBeLessThan(1e-6);
  });
});

describe('MatchSim player interactions', () => {
  it('players shove each other apart instead of overlapping', () => {
    const { sim, p } = lobbySim(2);
    p[0].state.spawn(0, 0, -9, 0);
    p[1].state.spawn(0.3, 0, -9, 0);
    for (let i = 0; i < 5; i++) sim.step();
    const d = Math.hypot(p[0].state.px - p[1].state.px, p[0].state.pz - p[1].state.pz);
    expect(d).toBeGreaterThan(CHAR.radius * 2 * 0.9);
  });

  it('dive tackles use the diver’s view of the target (lag compensation)', () => {
    const { sim, p } = lobbySim(2);
    const [diver, target] = p;
    diver.state.spawn(0, 0, -12, 0);
    target.state.spawn(0, 0, -9.5, Math.PI / 2);
    // Target stands still for 10 ticks (history), then runs off sideways for 9.
    for (let t = 1; t <= 10; t++) sim.step();
    const seenAt = sim.tick;
    const from = sim.tick;
    for (let t = from + 1; t <= from + 9; t++) sim.queueInput('p1', inp(t, 1, 0));
    for (let i = 0; i < 9; i++) sim.step();
    expect(Math.abs(target.state.px)).toBeGreaterThan(1.5);
    // The diver lunges at where it *saw* the target before it ran.
    let t = sim.tick + 1;
    sim.queueInput('p0', inp(t, 0, 1, BTN_DIVE, seenAt));
    for (let i = 0; i < 10; i++) {
      sim.queueInput('p0', inp(++t, 0, 1, 0, seenAt + i));
      sim.step();
      if (target.state.mode === MODE_STUN) break;
    }
    expect(target.state.mode).toBe(MODE_STUN);
  });

  it('without the rewind the same dive misses', () => {
    const { sim, p } = lobbySim(2);
    const [diver, target] = p;
    diver.state.spawn(0, 0, -12, 0);
    target.state.spawn(0, 0, -9.5, Math.PI / 2);
    for (let t = 1; t <= 10; t++) sim.step();
    const from = sim.tick;
    for (let t = from + 1; t <= from + 9; t++) sim.queueInput('p1', inp(t, 1, 0));
    for (let i = 0; i < 9; i++) sim.step();
    let t = sim.tick + 1;
    sim.queueInput('p0', inp(t, 0, 1, BTN_DIVE));
    for (let i = 0; i < 10; i++) {
      sim.queueInput('p0', inp(++t, 0, 1, 0));
      sim.step();
    }
    expect(target.state.mode).not.toBe(MODE_STUN);
  });
});
