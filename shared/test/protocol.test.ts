import { describe, expect, it } from 'vitest';
import {
  decodeInput, decodeSnapshot, decodeTiles, encodeInput, encodePlayers, encodeSnapshot, encodeTiles,
} from '../src/net/protocol';
import { BTN_DIVE, BTN_JUMP, BTN_JUMP_PRESS, CharState, MODE_DIVE } from '../src/sim/character';

describe('protocol', () => {
  it('round-trips inputs with int8 axis quantisation', () => {
    const buf = encodeInput({ tick: 123456, mx: 0.5, mz: -1, buttons: BTN_JUMP | BTN_JUMP_PRESS, viewTick: 123400 });
    expect(decodeInput(buf)).toEqual({ tick: 123456, mx: 64 / 127, mz: -1, buttons: BTN_JUMP | BTN_JUMP_PRESS, viewTick: 123400 });
  });

  it('rejects malformed input and masks unknown buttons', () => {
    expect(decodeInput(new Uint8Array(3))).toBeNull();
    const buf = encodeInput({ tick: 1, mx: 0, mz: 0, buttons: 0xff, viewTick: 0 });
    expect(decodeInput(buf)!.buttons).toBe(BTN_JUMP | BTN_JUMP_PRESS | BTN_DIVE);
  });

  it('clamps non-finite and out-of-range axes', () => {
    const d = decodeInput(encodeInput({ tick: 1, mx: NaN, mz: 9, buttons: 0, viewTick: 0 }))!;
    expect(d.mx).toBe(0);
    expect(d.mz).toBe(1);
  });

  it('round-trips snapshots (own state exact to float32, others quantised)', () => {
    const own = new CharState();
    own.px = 12.25; own.py = 3.5; own.pz = -40.125; own.vx = 1.5; own.vy = -2; own.vz = 7.2;
    own.yaw = 1.25; own.mode = MODE_DIVE; own.modeT = 0.2; own.grounded = false; own.diveUsed = true;
    own.groundObs = 3; own.groundTile = -1; own.jumpBuf = 0.1;
    const players = encodePlayers([
      { slot: 5, x: 1.234, y: -3.3, z: 140.7, yaw: -0.5, mode: 3, grounded: true, emote: 2, groundObs: -1 },
      { slot: 31, x: -500, y: 20, z: 0, yaw: 7, mode: 0, grounded: false, emote: 0, groundObs: 12 },
    ]);
    const snap = decodeSnapshot(encodeSnapshot(987654, -3, 17, own, players));
    expect(snap.tick).toBe(987654);
    expect(snap.lead).toBe(-3);
    expect(snap.mapVersion).toBe(17);
    expect(snap.own!.px).toBeCloseTo(12.25, 5);
    expect(snap.own!.vz).toBeCloseTo(7.2, 5);
    expect(snap.own!.mode).toBe(MODE_DIVE);
    expect(snap.own!.diveUsed).toBe(true);
    expect(snap.own!.groundObs).toBe(3);
    expect(snap.own!.jumpBuf).toBeCloseTo(0.1, 5);
    const [a, b] = snap.players;
    expect(a.slot).toBe(5);
    expect(a.x).toBeCloseTo(1.234, 1);
    expect(a.z).toBeCloseTo(140.7, 1);
    expect(a.mode).toBe(3);
    expect(a.grounded).toBe(true);
    expect(a.emote).toBe(2);
    expect(a.groundObs).toBe(-1);
    expect(Math.cos(a.yaw)).toBeCloseTo(Math.cos(-0.5), 1);
    expect(b.slot).toBe(31);
    expect(b.x).toBeCloseTo(-500, 1);
    expect(b.groundObs).toBe(12);
  });

  it('keeps snapshots compact', () => {
    const entries = Array.from({ length: 32 }, (_, i) => ({ slot: i, x: i, y: 0, z: i, yaw: 0, mode: 0, grounded: true, emote: 0, groundObs: -1 }));
    const bytes = encodeSnapshot(1, 2, 0, new CharState(), encodePlayers(entries)).byteLength;
    expect(bytes).toBeLessThan(420);
  });

  it('round-trips tile events', () => {
    const ev = [{ tile: 0, tick: 5 }, { tile: 300, tick: 123456 }];
    expect(decodeTiles(encodeTiles(ev))).toEqual(ev);
  });
});
