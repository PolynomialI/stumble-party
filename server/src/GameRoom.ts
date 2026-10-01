import { Room, matchMaker, type Client } from '@colyseus/core';
import {
  MAX_PLAYERS, MSG_INPUT, MSG_SNAPSHOT, MSG_TILES, EMOTE_COUNT, TICK_RATE, decodeInput, encodePlayers,
  encodeSnapshot, encodeTiles, getMap, randomIdentity, sanitizeLook, sanitizeName, type MapInfo,
} from '@sp/shared';
import { Match } from './Match';
import { MatchSim, type SimPlayer } from './MatchSim';
import { GameState, PlayerState, ST_ELIMINATED, ST_LOBBY } from './schema';
import { TickMeter, roomStats } from './stats';

interface CreateOptions {
  mode?: unknown;
  fillBots?: unknown;
}

interface JoinOptions {
  name?: unknown;
  look?: unknown;
}

/** Join codes avoid look-alike characters (0/O, 1/I/L). */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function uniqueCode(): Promise<string> {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    const taken = await matchMaker.query({ roomId: code });
    if (taken.length === 0) return code;
  }
}

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = MAX_PLAYERS;
  sim!: MatchSim;
  match!: Match;
  private readonly meter = new TickMeter();
  private readonly simBySession = new Map<string, SimPlayer>();

  async onCreate(options: CreateOptions = {}) {
    const isPrivate = options.mode === 'private';
    this.state = new GameState();
    this.state.isPrivate = isPrivate;
    this.state.fillBots = isPrivate ? options.fillBots !== false : true;
    if (isPrivate) {
      this.roomId = await uniqueCode();
      this.state.code = this.roomId;
      await this.setPrivate(true);
    }
    this.patchRate = 100;
    this.maxMessagesPerSecond = 120;
    this.sim = new MatchSim(getMap('lobby'));
    this.match = new Match(this.state, this.sim, {
      broadcastMap: () => this.broadcast('map', this.mapInfo()),
      setLocked: (locked) => { void (locked ? this.lock() : this.unlock()); },
      matchOver: () => this.onMatchOver(),
    }, { quick: !isPrivate, seed: Math.floor(Math.random() * 2 ** 31) });
    this.match.enterLobby();

    this.onMessageBytes(MSG_INPUT, (client, buf: Uint8Array) => {
      const pkt = decodeInput(buf);
      if (pkt) this.sim.queueInput(client.sessionId, pkt);
    });
    // Clients ask for the current map once their handlers are registered (earlier messages could be dropped).
    this.onMessage('ready', (client) => {
      this.sendMapInfo(client);
      this.sendTileState(client);
    });
    this.onMessage('emote', (client, id: unknown) => {
      if (typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= EMOTE_COUNT) this.sim.emote(client.sessionId, id);
    });
    this.onMessage('start', (client) => {
      if (client.sessionId === this.state.host && this.state.isPrivate) this.match.start();
    });
    this.onMessage('bots', (client, on: unknown) => {
      if (client.sessionId === this.state.host && this.state.isPrivate && this.state.phase === 'lobby' && typeof on === 'boolean') {
        this.state.fillBots = on;
      }
    });

    this.setFixedTimestep(() => this.update(), TICK_RATE);
    roomStats.set(this.roomId, () => ({
      roomId: this.roomId,
      players: [...this.sim.players.values()].filter((p) => !p.bot).length,
      bots: [...this.sim.players.values()].filter((p) => p.bot).length,
      phase: this.state.phase,
      ticks: this.meter.ticks,
      ...this.meter.summary(),
    }));
  }

  private freeSlot(): number {
    const used = new Set<number>();
    this.state.players.forEach((p) => used.add(p.slot));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return -1;
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const slot = this.freeSlot();
    if (slot < 0) throw new Error('room full');
    const fallback = randomIdentity(Math.floor(Math.random() * 1e9));
    const look = options.look ? sanitizeLook(options.look) : fallback.look;
    const ps = new PlayerState();
    ps.slot = slot;
    ps.name = sanitizeName(options.name, fallback.name);
    ps.body = look.body;
    ps.accent = look.accent;
    ps.pattern = look.pattern;
    ps.hat = look.hat;
    ps.status = this.state.phase === 'lobby' ? ST_LOBBY : ST_ELIMINATED;
    this.state.players.set(client.sessionId, ps);
    if (!this.state.host) this.state.host = client.sessionId;

    const sp = this.sim.addPlayer(client.sessionId, slot, null);
    this.simBySession.set(client.sessionId, sp);
    this.match.onJoin(client.sessionId);
    // Map + tile state go out when the client says it is ready (its handlers exist by then).
  }

  onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    const sp = this.simBySession.get(client.sessionId);
    if (sp) sp.connected = false;
    this.allowReconnection(client, 20);
  }

  onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
    const sp = this.simBySession.get(client.sessionId);
    if (sp) {
      sp.connected = true;
      sp.queue.length = 0;
      sp.newestTick = 0;
    }
    this.sendMapInfo(client);
    this.sendTileState(client);
  }

  onLeave(client: Client) {
    this.match.onLeave(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sim.removePlayer(client.sessionId);
    this.simBySession.delete(client.sessionId);
    if (this.state.host === client.sessionId) {
      const next = [...this.state.players.entries()].find(([, p]) => !p.bot);
      this.state.host = next ? next[0] : '';
    }
  }

  onDispose() {
    roomStats.delete(this.roomId);
    this.sim.dispose();
  }

  private onMatchOver() {
    if (this.state.isPrivate) this.match.enterLobby();
    else void this.disconnect();
  }

  private mapInfo(): MapInfo {
    return { v: this.sim.mapVersion, id: this.sim.map.id, start: this.sim.roundStart, freeze: this.sim.freezeUntil };
  }

  private sendMapInfo(client: Client) {
    client.send('map', this.mapInfo());
  }

  private sendTileState(client: Client) {
    const events = this.sim.pw.tiles
      .map((t, tile) => ({ tile, tick: t.triggerTick }))
      .filter((e) => e.tick >= 0);
    if (events.length) client.sendBytes(MSG_TILES, encodeTiles(events));
  }

  private update() {
    const t0 = performance.now();
    this.sim.step();
    if (this.sim.tileEvents.length) {
      this.broadcastBytes(MSG_TILES, encodeTiles(this.sim.tileEvents), {});
      this.sim.tileEvents = [];
    }
    this.match.tick();
    this.sendSnapshots();
    this.meter.sample(performance.now() - t0);
  }

  private sendSnapshots() {
    const shared = encodePlayers(this.sim.entries());
    const tick = this.sim.tick;
    for (const client of this.clients) {
      const sp = this.simBySession.get(client.sessionId);
      const own = sp && sp.active ? this.sim.ownState(sp) : null;
      const lead = sp ? sp.newestTick - tick : 0;
      const bytes = encodeSnapshot(tick, lead, this.sim.mapVersion, own, shared);
      client.sendBytes(MSG_SNAPSHOT, bytes);
      this.meter.addBytes(bytes.byteLength);
    }
  }
}
