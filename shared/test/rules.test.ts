import { describe, expect, it } from 'vitest';
import { rng } from '../src/math';
import {
  finalSize, finalTimeUpWinner, planMatch, roundOver, roundTarget, survivorsWithTiebreak, topScorers, type MapPool,
} from '../src/game/rules';

const pool: MapPool = {
  race: ['r1', 'r2', 'r3', 'r4'], survival: ['s1', 's2'], points: ['p1'], tag: ['t1'], final: ['f1', 'f2'],
};

describe('match planning', () => {
  it('plays more rounds the bigger the lobby, always opening with a race and ending in a final', () => {
    expect(planMatch(32, pool, rng(1)).length).toBe(6);
    expect(planMatch(16, pool, rng(1)).length).toBe(5);
    expect(planMatch(10, pool, rng(1)).length).toBe(4);
    expect(planMatch(5, pool, rng(1)).length).toBe(3);
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

  it('plays the number of rounds asked for, as far as the lobby allows', () => {
    expect(planMatch(32, pool, rng(1), 8).length).toBe(8);
    expect(planMatch(32, pool, rng(1), 3).length).toBe(3);
    expect(planMatch(32, pool, rng(1), 99).length).toBe(8);
    // 5 players, final of 2: at most three knockout rounds fit before it.
    expect(planMatch(5, pool, rng(1), 8).length).toBe(4);
    for (let n = 4; n <= 32; n++) {
      for (let rounds = 2; rounds <= 8; rounds++) {
        const plan = planMatch(n, pool, rng(n * 10 + rounds), rounds);
        let prev = n;
        for (const r of plan.slice(0, -1)) {
          expect(r.qualify, `n=${n} rounds=${rounds}`).toBeLessThan(prev);
          prev = r.qualify;
        }
        expect(prev).toBe(finalSize(n));
      }
    }
  });

  it('never plays the same kind of round twice in a row after the opener, and uses every kind', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const plan = planMatch(32, pool, rng(seed), 8);
      plan.forEach((r, i) => {
        seen.add(r.type);
        if (i > 1) expect(r.type).not.toBe(plan[i - 1].type);
      });
    }
    expect([...seen].sort()).toEqual(['final', 'points', 'race', 'survival', 'tag']);
  });

  it('ranks points rounds by score', () => {
    const scores = [{ id: 'a', score: 3 }, { id: 'b', score: 9 }, { id: 'c', score: 9 }, { id: 'd', score: 0 }];
    expect(topScorers(scores, 2)).toEqual(['b', 'c']);
    expect(topScorers(scores, 3)).toEqual(['b', 'c', 'a']);
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
