import type { MapDef } from '../maps/types';

export type RoundType = 'race' | 'survival' | 'points' | 'tag' | 'final';

export interface RoundPlan {
  mapId: string;
  type: RoundType;
  /** Planned number of players who advance (final: 1, the winner). */
  qualify: number;
}

export type MapPool = Record<RoundType, string[]>;

export function mapPool(maps: readonly MapDef[]): MapPool {
  const pool: MapPool = { race: [], survival: [], points: [], tag: [], final: [] };
  for (const m of maps) if (m.type !== 'lobby') pool[m.type].push(m.id);
  return pool;
}

/** Size of the final for a match that starts with n players. */
export function finalSize(n: number): number {
  if (n <= 3) return Math.max(1, n - 1);
  return Math.min(6, Math.max(2, Math.round(n * 0.2)));
}

export const MAX_ROUNDS = 8;

/** Rounds a match gets when nobody chose a number: the bigger the lobby, the longer the show. */
export function autoRounds(n: number): number {
  return n >= 24 ? 6 : n >= 16 ? 5 : n >= 8 ? 4 : 3;
}

function pick(list: string[], used: Set<string>, rand: () => number): string {
  const fresh = list.filter((id) => !used.has(id));
  const from = fresh.length ? fresh : list;
  const id = from[Math.floor(rand() * from.length) % from.length];
  used.add(id);
  return id;
}

/** Middle-round types and how often each comes up. */
const MIX: [RoundType, number][] = [['race', 3], ['survival', 3], ['points', 2], ['tag', 2]];

/**
 * Plans a match: a race to open, a mix of rounds, then a final. `rounds` (0 = automatic) is how many rounds
 * to play; it is capped so that every round can still knock someone out. Qualification targets shrink the
 * field geometrically toward the final size. Tiny lobbies get shorter matches: 1 or 2 players play a single
 * race (first home wins).
 */
export function planMatch(n: number, pool: MapPool, rand: () => number, rounds = 0): RoundPlan[] {
  const used = new Set<string>();
  if (n <= 2) return [{ mapId: pick(pool.race, used, rand), type: 'race', qualify: 1 }];
  if (n === 3) {
    return [
      { mapId: pick(pool.race, used, rand), type: 'race', qualify: 2 },
      { mapId: pick(pool.final, used, rand), type: 'final', qualify: 1 },
    ];
  }
  const f = finalSize(n);
  const total = Math.max(2, Math.min(rounds || autoRounds(n), MAX_ROUNDS, n - f + 1));
  const k = total - 1;
  const plan: RoundPlan[] = [];
  let prev = n;
  let last: RoundType | null = null;
  for (let i = 1; i <= k; i++) {
    // Open with a race; after that anything goes, but never the same kind twice running.
    let type: RoundType = 'race';
    if (i > 1) {
      const options = MIX.filter(([t]) => t !== last && pool[t].length > 0);
      let roll = rand() * options.reduce((sum, [, w]) => sum + w, 0);
      type = options[options.length - 1][0];
      for (const [t, w] of options) {
        if ((roll -= w) < 0) { type = t; break; }
      }
    }
    last = type;
    let q = i === k ? f : Math.round(n * Math.pow(f / n, i / k));
    q = Math.min(q, prev - 1);
    q = Math.max(q, f + (k - i));
    plan.push({ mapId: pick(pool[type], used, rand), type, qualify: q });
    prev = q;
  }
  plan.push({ mapId: pick(pool.final, used, rand), type: 'final', qualify: 1 });
  return plan;
}

/** Points rounds: the `target` highest scorers advance (ties go to the lower id: arbitrary but stable). */
export function topScorers(scores: { id: string; score: number }[], target: number): string[] {
  return [...scores].sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1)).slice(0, Math.max(1, target)).map((x) => x.id);
}

/**
 * The target for a round about to start with `alive` players: never more than planned, always eliminating at
 * least one (unless only one is left), never fewer than one.
 */
export function roundTarget(planned: number, alive: number, type: RoundType): number {
  if (type === 'final') return 1;
  if (alive <= 1) return alive;
  return Math.max(1, Math.min(planned, alive - 1));
}

export interface RoundStatus {
  type: RoundType;
  target: number;
  /** Players still in the round (not qualified, not eliminated). */
  running: number;
  qualified: number;
  timeUp: boolean;
}

/** Whether a round is over. Race: enough finishers, time up, or nobody left running. The rest: time up, or few enough left. */
export function roundOver(s: RoundStatus): boolean {
  if (s.timeUp) return true;
  if (s.type === 'race') return s.qualified >= s.target || s.running === 0;
  return s.running <= s.target;
}

export interface Faller {
  id: string;
  /** Tick it dropped out. */
  tick: number;
  /** Height when it fell (tie-break: the one who stayed up longest). */
  y: number;
}

/**
 * Survival / final resolution once the field dropped to or below the target: whoever is still standing
 * advances. If nobody is (everyone dropped on the same tick), the last to fall advance instead, latest tick
 * first then highest, up to the target, so a round never ends with no one going through.
 */
export function survivorsWithTiebreak(alive: string[], fallers: Faller[], target: number): string[] {
  if (alive.length > 0) return [...alive];
  const order = [...fallers].sort((a, b) => b.tick - a.tick || b.y - a.y || (a.id < b.id ? -1 : 1));
  return order.slice(0, Math.max(1, target)).map((f) => f.id);
}

/** Final at time-up with several still standing: the one nearest the arena centre (then by id) wins. */
export function finalTimeUpWinner(alive: { id: string; distToCenter: number }[]): string | null {
  if (!alive.length) return null;
  return [...alive].sort((a, b) => a.distToCenter - b.distToCenter || (a.id < b.id ? -1 : 1))[0].id;
}

/** Player status within a match (synced in the room state). */
export const STATUS = {
  lobby: 0,
  playing: 1,
  qualified: 2,
  eliminated: 3,
} as const;
