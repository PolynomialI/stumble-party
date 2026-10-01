import type { MapDef } from '../maps/types';

export type RoundType = 'race' | 'survival' | 'final';

export interface RoundPlan {
  mapId: string;
  type: RoundType;
  /** Planned number of players who advance (final: 1, the winner). */
  qualify: number;
}

export interface MapPool {
  race: string[];
  survival: string[];
  final: string[];
}

export function mapPool(maps: readonly MapDef[]): MapPool {
  const pool: MapPool = { race: [], survival: [], final: [] };
  for (const m of maps) if (m.type !== 'lobby') pool[m.type].push(m.id);
  return pool;
}

/** Size of the final for a match that starts with n players. */
export function finalSize(n: number): number {
  if (n <= 3) return Math.max(1, n - 1);
  return Math.min(6, Math.max(2, Math.round(n * 0.2)));
}

function pick(list: string[], used: Set<string>, rand: () => number): string {
  const fresh = list.filter((id) => !used.has(id));
  const from = fresh.length ? fresh : list;
  const id = from[Math.floor(rand() * from.length) % from.length];
  used.add(id);
  return id;
}

/**
 * Plans a match: 3 rounds (4 from 12 players) ending in a final, with qualification targets that shrink the
 * field geometrically toward the final size. Tiny lobbies get shorter matches: 2 players play a single race
 * (first home wins), 1 player just runs a course.
 */
export function planMatch(n: number, pool: MapPool, rand: () => number): RoundPlan[] {
  const used = new Set<string>();
  if (n <= 1) return [{ mapId: pick(pool.race, used, rand), type: 'race', qualify: 1 }];
  if (n === 2) return [{ mapId: pick(pool.race, used, rand), type: 'race', qualify: 1 }];
  if (n === 3) {
    return [
      { mapId: pick(pool.race, used, rand), type: 'race', qualify: 2 },
      { mapId: pick(pool.final, used, rand), type: 'final', qualify: 1 },
    ];
  }
  const total = n >= 12 ? 4 : 3;
  const k = total - 1;
  const f = finalSize(n);
  const types: RoundType[] = k === 3
    ? ['race', rand() < 0.5 ? 'race' : 'survival', 'survival']
    : ['race', rand() < 0.4 ? 'race' : 'survival'];
  const plan: RoundPlan[] = [];
  let prev = n;
  for (let i = 1; i <= k; i++) {
    let q = i === k ? f : Math.round(n * Math.pow(f / n, i / k));
    q = Math.min(q, prev - 1);
    q = Math.max(q, f + (k - i));
    plan.push({ mapId: pick(pool[types[i - 1]].length ? pool[types[i - 1]] : pool.race, used, rand), type: types[i - 1], qualify: q });
    prev = q;
  }
  plan.push({ mapId: pick(pool.final, used, rand), type: 'final', qualify: 1 });
  return plan;
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

/** Whether a round is over. Race: enough finishers, time up, or nobody left running. Survival/final: few enough left. */
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
