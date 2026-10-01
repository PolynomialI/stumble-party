import { describe, expect, it } from 'vitest';
import { rng } from '../src/math';
import {
  finalSize, finalTimeUpWinner, planMatch, roundOver, roundTarget, survivorsWithTiebreak, type MapPool,
} from '../src/game/rules';

const pool: MapPool = { race: ['r1', 'r2', 'r3'], survival: ['s1', 's2'], final: ['f1', 'f2'] };

describe('match planning', () => {
  it('plays 4 rounds with a big lobby and 3 with a small one, always ending in a final', () => {
    expect(planMatch(32, pool, rng(1)).length).toBe(4);
    expect(planMatch(12, pool, rng(1)).length).toBe(4);
    expect(planMatch(11, pool, rng(1)).length).toBe(3);
    expect(planMatch(10, pool, rng(1)).length).toBe(3);
    for (const n of [4, 10, 16, 32]) {
      const plan = planMatch(n, pool, rng(n));
      expect(plan[plan.length - 1].type).toBe('final');
      expect(plan[plan.length - 1].qualify).toBe(1);
      expect(plan[0].type).toBe('race');
    }
  });

  it('shrinks the field every round and reaches a sensible final size', () => {
    for (let n = 4; n <= 32; n++) {
      for (let seed = 1; seed <= 5; seed++) {
        const plan = planMatch(n, pool, rng(seed * 100 + n));
        let prev = n;
        for (const r of plan.slice(0, -1)) {
          expect(r.qualify, `n=${n}`).toBeLessThan(prev);
          expect(r.qualify, `n=${n}`).toBeGreaterThanOrEqual(2);
          prev = r.qualify;
        }
        expect(prev).toBe(finalSize(n));
      }
    }
    expect(finalSize(32)).toBe(6);
    expect(finalSize(10)).toBe(2);
  });

  it('uses each map at most once while the pools last', () => {
    const plan = planMatch(32, pool, rng(7));
    expect(new Set(plan.map((r) => r.mapId)).size).toBe(plan.length);
  });

  it('handles tiny lobbies', () => {
    expect(planMatch(1, pool, rng(1))).toEqual([{ mapId: expect.any(String), type: 'race', qualify: 1 }]);
    expect(planMatch(2, pool, rng(1)).map((r) => [r.type, r.qualify])).toEqual([['race', 1]]);
    expect(planMatch(3, pool, rng(1)).map((r) => [r.type, r.qualify])).toEqual([['race', 2], ['final', 1]]);
  });

  it('is deterministic for a seed', () => {
    expect(planMatch(20, pool, rng(42))).toEqual(planMatch(20, pool, rng(42)));
  });
});

describe('round targets', () => {
  it('never exceeds the plan and always eliminates someone', () => {
    expect(roundTarget(12, 20, 'race')).toBe(12);
    expect(roundTarget(12, 10, 'race')).toBe(9); // players left since planning
    expect(roundTarget(5, 2, 'survival')).toBe(1);
    expect(roundTarget(5, 1, 'race')).toBe(1);
    expect(roundTarget(3, 6, 'final')).toBe(1);
  });
});

describe('round end', () => {
  it('ends a race when enough finished, when time is up, or when nobody is left running', () => {
    expect(roundOver({ type: 'race', target: 5, running: 3, qualified: 5, timeUp: false })).toBe(true);
    expect(roundOver({ type: 'race', target: 5, running: 3, qualified: 4, timeUp: false })).toBe(false);
    expect(roundOver({ type: 'race', target: 5, running: 0, qualified: 2, timeUp: false })).toBe(true);
    expect(roundOver({ type: 'race', target: 5, running: 3, qualified: 1, timeUp: true })).toBe(true);
  });

  it('ends survival and finals when few enough remain', () => {
    expect(roundOver({ type: 'survival', target: 6, running: 7, qualified: 0, timeUp: false })).toBe(false);
    expect(roundOver({ type: 'survival', target: 6, running: 6, qualified: 0, timeUp: false })).toBe(true);
    expect(roundOver({ type: 'final', target: 1, running: 2, qualified: 0, timeUp: false })).toBe(false);
    expect(roundOver({ type: 'final', target: 1, running: 1, qualified: 0, timeUp: false })).toBe(true);
    expect(roundOver({ type: 'final', target: 1, running: 0, qualified: 0, timeUp: false })).toBe(true);
  });
});

describe('tie-breaks', () => {
  it('lets the survivors through', () => {
    expect(survivorsWithTiebreak(['a', 'b'], [{ id: 'c', tick: 9, y: 0 }], 3)).toEqual(['a', 'b']);
  });

  it('pulls back the last to fall when everyone dropped at once', () => {
    const fallers = [
      { id: 'early', tick: 100, y: -5 },
      { id: 'low', tick: 140, y: -12 },
      { id: 'high', tick: 140, y: -11 },
    ];
    expect(survivorsWithTiebreak([], fallers, 1)).toEqual(['high']);
    expect(survivorsWithTiebreak([], fallers, 2)).toEqual(['high', 'low']);
  });

  it('picks the final winner nearest the centre when time runs out', () => {
    expect(finalTimeUpWinner([{ id: 'x', distToCenter: 4 }, { id: 'y', distToCenter: 1.5 }])).toBe('y');
    expect(finalTimeUpWinner([])).toBeNull();
  });
});
