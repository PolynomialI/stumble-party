/**
 * Load test: N headless clients join one private match and play it with the same bot AI the server uses
 * for its own bots, sending real input packets at 30 Hz. Meanwhile we sample the server's tick time from
 * /metrics and count every byte on every client's WebSocket.
 *
 *   npm run loadtest -- [--url http://localhost:2567] [--clients 32] [--seconds 0]
 *
 * --seconds 0 (the default) plays the whole match through to the podium. Exits non-zero if not every
 * client got in, or if the server's 95th-percentile tick time exceeds the 33 ms budget.
 */
import { Client, type Room } from '@colyseus/sdk';
import {
  BotBrain, CharState, DEFAULT_PORT, MSG_INPUT, MSG_SNAPSHOT, MSG_TILES, PhysicsWorld, ROOM_NAME, TICK_RATE,
  decodeSnapshot, decodeTiles, encodeInput, getMap, initPhysics, randomIdentity, type InputCmd, type MapDef,
  type MapInfo,
} from '@sp/shared';

const opt = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = opt('url', `http://localhost:${DEFAULT_PORT}`).replace(/\/+$/, '');
const CLIENTS = Number(opt('clients', '32'));
const SECONDS = Number(opt('seconds', '0'));
const REPORT_MS = 5000;
const BUDGET_MS = 1000 / TICK_RATE;

/** WebSocket frame header size for a payload of n bytes (client frames also carry a 4-byte mask). */
const wsHeader = (n: number) => (n < 126 ? 2 : n < 65536 ? 4 : 10);

/** One copy of the current round's physics, shared by every bot in this process (they all play the same map). */
let world: { v: number; info: MapInfo; map: MapDef; pw: PhysicsWorld } | null = null;

function loadWorld(info: MapInfo) {
  if (world && world.v === info.v) return;
  world?.pw.free();
  const map = getMap(info.id);
  world = { v: info.v, info, map, pw: new PhysicsWorld(map) };
}

class LoadBot {
  room!: Room;
  private readonly brain: BotBrain;
  private readonly cmd: InputCmd = { mx: 0, mz: 0, buttons: 0 };
  private readonly buf = new Uint8Array(11);
  /** Map version this connection is on (messages on one connection arrive in order). */
  private v = -1;
  private active = false;
  private lastX = 0;
  private lastZ = 0;
  down = 0;
  up = 0;
  snapshots = 0;

  constructor(readonly i: number) {
    this.brain = new BotBrain(9000 + i * 7919, 0.5 + (i % 5) * 0.1);
  }

  get name() {
    return `LoadBot${String(this.i + 1).padStart(2, '0')}`;
  }

  async connect(client: Client, code: string | null) {
    const profile = { name: this.name, look: randomIdentity(this.i * 7919 + 17).look };
    this.room = code
      ? await client.joinById(code, profile)
      : await client.create(ROOM_NAME, { ...profile, mode: 'private', fillBots: false });
    this.meter();
    this.room.onMessage('map', (info: MapInfo) => {
      this.v = info.v;
      this.active = false;
      loadWorld(info);
    });
    this.room.onMessage(MSG_TILES, (buf: Uint8Array) => {
      if (!world || world.v !== this.v) return;
      for (const e of decodeTiles(buf)) {
        const t = world.pw.tiles[e.tile];
        if (t) t.triggerTick = e.tick;
      }
    });
    this.room.onMessage(MSG_SNAPSHOT, (buf: Uint8Array) => this.onSnapshot(buf));
    this.room.send('ready');
  }

  /** Counts every byte through this client's socket, including WebSocket framing. */
  private meter() {
    const conn = this.room.connection as unknown as {
      events: { onmessage?: (e: { data: ArrayBuffer }) => void };
      send(d: Uint8Array): void;
    };
    const onmessage = conn.events.onmessage!;
    conn.events.onmessage = (e) => {
      const n = e.data.byteLength;
      this.down += n + wsHeader(n);
      onmessage(e);
    };
    const send = conn.send.bind(conn);
    conn.send = (d) => {
      this.up += d.byteLength + wsHeader(d.byteLength) + 4;
      send(d);
    };
  }

  private onSnapshot(buf: Uint8Array) {
    const snap = decodeSnapshot(buf);
    this.snapshots++;
    const w = world;
    const own = snap.own;
    if (!own || !w || w.v !== this.v || snap.mapVersion !== this.v) {
      this.active = false;
      return;
    }
    // New round, or put back at a checkpoint: pick up the course path again.
    if (!this.active || Math.hypot(own.px - this.lastX, own.pz - this.lastZ) > 3) this.brain.reset(w.map, own);
    this.active = true;
    this.lastX = own.px;
    this.lastZ = own.pz;
    // Obstacles where they are at this tick, as the server's bots see them.
    w.pw.setTime(snap.tick - w.info.start);
    const cmd = this.brain.think(w.pw, own as CharState, this.cmd);
    const pkt = { tick: snap.tick + 2, mx: cmd.mx, mz: cmd.mz, buttons: cmd.buttons, viewTick: Math.max(0, snap.tick - 3) };
    this.room.sendBytes(MSG_INPUT, encodeInput(pkt, this.buf));
  }
}

interface RoomMetrics {
  roomId: string;
  players: number;
  bots: number;
  phase: string;
  tickAvgMs: number;
  tickP95Ms: number;
  tickMaxMs: number;
}

async function metrics(code: string): Promise<{ rssMB: number; room: RoomMetrics | undefined }> {
  const res = await fetch(`${BASE}/metrics`);
  const m = (await res.json()) as { rssMB: number; rooms: RoomMetrics[] };
  return { rssMB: m.rssMB, room: m.rooms.find((r) => r.roomId === code) };
}

const kb = (bytes: number) => (bytes / 1024).toFixed(1);

async function main() {
  await initPhysics();
  try {
    await fetch(`${BASE}/health`);
  } catch {
    console.error(`No game server at ${BASE}. Start one with "npm run dev" (or pass --url).`);
    process.exit(1);
  }

  const client = new Client(BASE);
  const bots = Array.from({ length: CLIENTS }, (_, i) => new LoadBot(i));
  const t0 = Date.now();
  await bots[0].connect(client, null);
  const host = bots[0].room;
  const code = host.roomId;
  // The rest join by code in small waves, like friends arriving.
  for (let i = 1; i < CLIENTS; i += 8) {
    await Promise.all(bots.slice(i, i + 8).map((b) => b.connect(client, code)));
  }
  console.log(`${CLIENTS} clients joined room ${code} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const state = () => host.state as unknown as { phase: string; round: number; rounds: number; winner: string; players: Map<string, { name: string }> };
  await new Promise((r) => setTimeout(r, 1500));
  host.send('start');
  const start = Date.now();
  for (const b of bots) b.down = b.up = b.snapshots = 0;

  interface Sample { phase: string; avg: number; p95: number; max: number; down: number }
  const samples: Sample[] = [];
  let lastDown = 0, lastUp = 0, lastT = Date.now(), rss = 0, sawMatch = false, winner = '';
  for (;;) {
    await new Promise((r) => setTimeout(r, REPORT_MS));
    const now = Date.now();
    const down = bots.reduce((a, b) => a + b.down, 0);
    const up = bots.reduce((a, b) => a + b.up, 0);
    const secs = (now - lastT) / 1000;
    const perDown = (down - lastDown) / secs / CLIENTS, perUp = (up - lastUp) / secs / CLIENTS;
    lastDown = down; lastUp = up; lastT = now;
    const { rssMB, room } = await metrics(code);
    rss = Math.max(rss, rssMB);
    const st = state();
    if (st.phase !== 'lobby') sawMatch = true;
    // The room forgets the champion once it is back in the lobby, so note them during the podium.
    if (st.phase === 'podium') st.players?.forEach?.((p, id) => { if (id === st.winner) winner = p.name; });
    samples.push({
      phase: st.phase, avg: room?.tickAvgMs ?? 0, p95: room?.tickP95Ms ?? 0, max: room?.tickMaxMs ?? 0,
      down: perDown,
    });
    const t = ((now - start) / 1000).toFixed(0).padStart(4);
    console.log(
      `[${t}s] ${st.phase.padEnd(9)} round ${st.round}/${st.rounds}  ` +
      `tick avg ${room?.tickAvgMs.toFixed(2)} ms  p95 ${room?.tickP95Ms.toFixed(2)}  max ${room?.tickMaxMs.toFixed(2)}  ` +
      `per client ↓ ${kb(perDown)} KB/s ↑ ${kb(perUp)} KB/s  server rss ${rssMB} MB`,
    );
    const done = SECONDS > 0 ? now - start >= SECONDS * 1000 : sawMatch && st.phase === 'lobby';
    if (done) break;
  }

  // Summary.
  const elapsed = (Date.now() - start) / 1000;
  const playing = samples.filter((s) => s.phase === 'playing');
  const set = playing.length ? playing : samples;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const worstP95 = Math.max(...set.map((s) => s.p95));
  const worstMax = Math.max(...set.map((s) => s.max));
  const down = bots.reduce((a, b) => a + b.down, 0) / elapsed / CLIENTS;
  const up = bots.reduce((a, b) => a + b.up, 0) / elapsed / CLIENTS;
  const peakDown = Math.max(...samples.map((s) => s.down));
  const snapRate = mean(bots.map((b) => b.snapshots)) / elapsed;

  console.log(`
=== ${CLIENTS} clients, one match, ${elapsed.toFixed(0)} s ===
Server tick (budget ${BUDGET_MS.toFixed(1)} ms at ${TICK_RATE} Hz), ${playing.length ? 'while playing' : 'whole run'}:
  avg ${mean(set.map((s) => s.avg)).toFixed(2)} ms · worst p95 ${worstP95.toFixed(2)} ms (${((worstP95 / BUDGET_MS) * 100).toFixed(0)}% of budget) · worst max ${worstMax.toFixed(2)} ms
Bandwidth per client (WebSocket payload + framing):
  down ${kb(down)} KB/s avg, ${kb(peakDown)} KB/s peak · up ${kb(up)} KB/s
  whole room ≈ ${((down * CLIENTS * 8) / 1e6).toFixed(2)} Mbit/s out of the server
Snapshots per client: ${snapRate.toFixed(1)}/s (server sends ${TICK_RATE}/s)
Server memory peak: ${rss} MB RSS${winner ? `\nWinner: ${winner}` : ''}`);

  await Promise.all(bots.map((b) => b.room.leave().catch(() => {})));
  const ok = worstP95 <= BUDGET_MS;
  if (!ok) console.error('FAIL: server tick time over budget');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
