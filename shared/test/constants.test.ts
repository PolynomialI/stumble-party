import { describe, expect, it } from 'vitest';
import { DT, TICK_RATE } from '../src/constants';

describe('constants', () => {
  it('uses a 30 Hz fixed step', () => {
    expect(TICK_RATE).toBe(30);
    expect(DT * TICK_RATE).toBeCloseTo(1);
  });
});
