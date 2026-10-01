import { beforeAll, describe, expect, it } from 'vitest';
import { MIN_MATCH_PLAYERS, getMap, initPhysics } from '@sp/shared';
import { Match, LOBBY_WAIT } from '../src/Match';
import { MatchSim } from '../src/MatchSim';
import { GameState, PlayerState, ST_ELIMINATED, ST_LOBBY } from '../src/schema';

beforeAll(async () => {
  await initPhysics();
});

function setup(quick: boolean, seed = 11) {
  const state = new GameState();
  state.isPrivate = !quick;
  const sim = new MatchSim(getMap('lobby'));
  const log = { maps: [] as string[], locked: false, over: 0, phases: [] as string[] };
  const match = new Match(state, sim, {
    broadcastMap: () => log.maps.push(sim.map.id),
    setLocked: (l) => { log.locked = l; },
    matchOver: () => { log.over++; },
  }, { quick, seed });
  match.enterLobby();
  const ps = new PlayerState();
  ps.slot = 0;
  ps.name = 'Human';
  ps.status = ST_LOBBY;
  state.players.set('h1', ps);
  sim.addPlayer('h1', 0, null);
  if (!state.host) state.host = 'h1';
  match.onJoin('h1');
  const run = (maxTicks: number, until: () => boolean) => {
    for (let i = 0; i < maxTicks && !until(); i++) {
      sim.step();
      match.tick();
      if (log.phases[log.phases.length - 1] !== state.phase) log.phases.push(state.phase);
    }
  };
  return { state, sim, match, log, run };
}

describe('match flow', () => {
  it('quick play: lobby timer, bots fill, every round, a single winner, podium', () => {
    const { state, sim, match, log, run } = setup(true);
    expect(state.phase).toBe('lobby');
    run(LOBBY_WAIT + 5, () => state.phase !== 'lobby');
    expect(state.phase).toBe('intro');
    expect(log.locked).toBe(true);
    expect(state.players.size).toBe(MIN_MATCH_PLAYERS);
    const plan = match.plan;
    expect(plan.length).toBeGreaterThanOrEqual(3);

    run(40 * 60 * 30, () => log.over > 0);
    expect(log.over).toBe(1);
    expect(log.phases).toContain('countdown');
    expect(log.phases).toContain('playing');
    expect(log.phases).toContain('results');
    expect(log.phases[log.phases.length - 1]).toBe('podium');
    // Every planned map was loaded (unless the field collapsed to one early), then the podium island.
    expect(log.maps[log.maps.length - 1]).toBe('lobby');
    expect(state.winner).not.toBe('');
    let alive = 0;
    state.players.forEach((p, id) => {
      if (id === state.winner) return;
      if (p.status !== ST_ELIMINATED) alive++;
    });
    expect(alive).toBe(0);
    // The champion stands on the podium; nobody else is in the world.
    const active = [...sim.players.values()].filter((p) => p.active).map((p) => p.id);
    expect(active).toEqual([state.winner]);
  }, 120_000);

  it('private room: waits for the host, and returns to its lobby without bots afterwards', () => {
    const { state, match, log, run } = setup(false, 4);
    run(LOBBY_WAIT + 30, () => false);
    expect(state.phase).toBe('lobby');
    state.fillBots = false;
    match.start();
    // A solo private match is a single race.
    expect(match.plan.length).toBe(1);
    expect(state.phase).toBe('intro');
    run(5 * 60 * 30, () => log.over > 0);
    expect(log.over).toBe(1);
    match.enterLobby();
    expect(state.phase).toBe('lobby');
    expect(log.locked).toBe(false);
    let bots = 0;
    state.players.forEach((p) => { if (p.bot) bots++; });
    expect(bots).toBe(0);
    expect(state.players.get('h1')!.status).toBe(ST_LOBBY);
  }, 120_000);
});
