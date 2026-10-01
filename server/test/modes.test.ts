import { beforeAll, describe, expect, it } from 'vitest';
import { getMap, initPhysics, type RoundPlan } from '@sp/shared';
import { Match } from '../src/Match';
import { MatchSim } from '../src/MatchSim';
import { GameState, PlayerState, ST_ELIMINATED, ST_LOBBY, ST_QUALIFIED } from '../src/schema';

beforeAll(async () => {
  await initPhysics();
});

/** A private room with one idle human and nine bots, forced to play exactly `plan`. */
function play(plan: RoundPlan[], seed = 5) {
  const state = new GameState();
  state.isPrivate = true;
  const sim = new MatchSim(getMap('lobby'));
  const log = { over: 0 };
  const match = new Match(state, sim, {
    broadcastMap: () => {},
    setLocked: () => {},
    matchOver: () => { log.over++; },
  }, { quick: false, seed });
  match.enterLobby();
  const ps = new PlayerState();
  ps.slot = 0;
  ps.name = 'Human';
  ps.status = ST_LOBBY;
  state.players.set('h1', ps);
  sim.addPlayer('h1', 0, null);
  state.host = 'h1';
  match.onJoin('h1');
  match.start();
  match.plan = plan;
  state.rounds = plan.length;
  match.roundIndex = -1;
  (match as unknown as { nextRound(): void }).nextRound();
  const run = (maxTicks: number, until: () => boolean) => {
    for (let i = 0; i < maxTicks && !until(); i++) {
      sim.step();
      match.tick();
    }
  };
  const players = () => [...state.players.entries()].map(([id, p]) => ({ id, p }));
  return { state, sim, match, log, run, players };
}

describe('game modes', () => {
  it('zone rounds: the highest scorers go through', () => {
    const { state, run, players } = play([
      { mapId: 'hilltop', type: 'points', qualify: 4 },
      { mapId: 'laststand', type: 'final', qualify: 1 },
    ]);
    expect(state.qualify).toBe(4);
    run(200 * 30, () => state.phase === 'results');
    expect(state.phase).toBe('results');
    const all = players();
    const through = all.filter((x) => x.p.status === ST_QUALIFIED);
    const out = all.filter((x) => x.p.status === ST_ELIMINATED);
    expect(through.length).toBe(4);
    expect(out.length).toBe(6);
    // Bots found the zone and scored, and nobody who went out outscored someone who went through.
    expect(Math.max(...through.map((x) => x.p.points))).toBeGreaterThan(50);
    expect(Math.min(...through.map((x) => x.p.points))).toBeGreaterThanOrEqual(Math.max(...out.map((x) => x.p.points)));
  }, 120_000);

  it('crown thief: holding a crown scores, crowns get stolen, the top scorers go through', () => {
    const { state, run, players } = play([
      { mapId: 'crownthief', type: 'points', qualify: 4 },
      { mapId: 'laststand', type: 'final', qualify: 1 },
    ]);
    const holders = () => players().filter((x) => x.p.it).map((x) => x.id).sort().join();
    expect(players().filter((x) => x.p.it).length).toBe(3);
    let steals = 0;
    let prev = holders();
    run(200 * 30, () => {
      if (state.phase === 'playing' && holders() !== prev) { steals++; prev = holders(); }
      return state.phase === 'results';
    });
    expect(steals).toBeGreaterThan(2);
    const all = players();
    const through = all.filter((x) => x.p.status === ST_QUALIFIED);
    const out = all.filter((x) => x.p.status === ST_ELIMINATED);
    expect(through.length).toBe(4);
    expect(Math.max(...through.map((x) => x.p.points))).toBeGreaterThan(50);
    expect(Math.min(...through.map((x) => x.p.points))).toBeGreaterThanOrEqual(Math.max(...out.map((x) => x.p.points)));
  }, 120_000);

  it('tag rounds: as many bombs as players to knock out, bombs change hands, holders go out', () => {
    const { state, run, players } = play([
      { mapId: 'hotpotato', type: 'tag', qualify: 6 },
      { mapId: 'laststand', type: 'final', qualify: 1 },
    ]);
    const first = players().filter((x) => x.p.it).map((x) => x.id).sort();
    expect(first.length).toBe(4);
    let passes = 0;
    let prev = first.join();
    run(200 * 30, () => {
      const now = players().filter((x) => x.p.it).map((x) => x.id).sort();
      if (state.phase === 'playing') {
        expect(now.length).toBe(4);
        if (now.join() !== prev) { passes++; prev = now.join(); }
      }
      return state.phase === 'results';
    });
    expect(passes).toBeGreaterThan(2);
    const all = players();
    expect(all.filter((x) => x.p.status === ST_QUALIFIED).length).toBe(6);
    for (const x of all) expect(x.p.status === ST_ELIMINATED).toBe(x.p.it);
  }, 120_000);

  it('rising lava: climbers who reach the summit survive, the rest are caught', () => {
    const { state, sim, run, players } = play([
      { mapId: 'magma', type: 'survival', qualify: 4 },
      { mapId: 'laststand', type: 'final', qualify: 1 },
    ]);
    run(200 * 30, () => state.phase === 'results');
    expect(state.phase).toBe('results');
    const all = players();
    const through = all.filter((x) => x.p.status === ST_QUALIFIED);
    // The idle human never leaves the start and is swallowed; bots make the climb.
    expect(all.find((x) => x.id === 'h1')!.p.status).toBe(ST_ELIMINATED);
    expect(through.length).toBeGreaterThanOrEqual(1);
    expect(through.length).toBeLessThanOrEqual(9);
    for (const x of through) expect(sim.players.get(x.id)!.state.py).toBeGreaterThan(10);
  }, 120_000);

  it('log jam: the field is whittled down to the target', () => {
    const { state, run, players } = play([
      { mapId: 'logjam', type: 'survival', qualify: 3 },
      { mapId: 'laststand', type: 'final', qualify: 1 },
    ]);
    run(200 * 30, () => state.phase === 'results');
    expect(state.phase).toBe('results');
    const through = players().filter((x) => x.p.status === ST_QUALIFIED).length;
    expect(through).toBeGreaterThanOrEqual(1);
    expect(through).toBeLessThanOrEqual(3);
  }, 120_000);

  it('crown final: the first to the crown wins, and falling does not knock you out', () => {
    const { state, log, run, players } = play([{ mapId: 'crownrush', type: 'final', qualify: 1 }]);
    run(200 * 30, () => state.phase === 'results');
    expect(state.phase).toBe('results');
    expect(state.winner).not.toBe('');
    expect(state.winner).not.toBe('h1');
    expect(players().filter((x) => x.p.status === ST_QUALIFIED).map((x) => x.id)).toEqual([state.winner]);
    run(40 * 30, () => log.over > 0);
    expect(log.over).toBe(1);
  }, 120_000);

  it('plays as many rounds as the host asked for', () => {
    const state = new GameState();
    state.isPrivate = true;
    state.roundsWanted = 6;
    const sim = new MatchSim(getMap('lobby'));
    const match = new Match(state, sim, { broadcastMap: () => {}, setLocked: () => {}, matchOver: () => {} }, { quick: false, seed: 3 });
    match.enterLobby();
    const ps = new PlayerState();
    ps.slot = 0;
    ps.name = 'Human';
    state.players.set('h1', ps);
    sim.addPlayer('h1', 0, null);
    match.onJoin('h1');
    match.start();
    expect(match.plan.length).toBe(6);
    expect(state.rounds).toBe(6);
  });
});
