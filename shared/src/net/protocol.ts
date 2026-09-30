import { clamp } from '../math';
import { CharState, type InputCmd } from '../sim/character';

/** Binary message ids (Colyseus byte messages). */
export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;
export const MSG_TILES = 3;

/** Positions are quantised to 1/POS_SCALE m in int16 (range about +-512 m, 1.6 cm steps). */
const POS_SCALE = 64;
export const NO_OBSTACLE = 255;

// ---------------------------------------------------------------------------------------------
// Input: client -> server, one per client tick.
// ---------------------------------------------------------------------------------------------

export interface InputPacket extends InputCmd {
  /** Server tick this input is meant for. */
  tick: number;
  /** Server tick of the remote players the client was looking at (lag compensation). */
  viewTick: number;
}

export const INPUT_BYTES = 11;

export function quantAxis(v: number): number {
  return Math.round(clamp(Number.isFinite(v) ? v : 0, -1, 1) * 127);
}

export function encodeInput(p: InputPacket, out = new Uint8Array(INPUT_BYTES)): Uint8Array {
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  v.setUint32(0, p.tick >>> 0, true);
  v.setInt8(4, quantAxis(p.mx));
  v.setInt8(5, quantAxis(p.mz));
  v.setUint8(6, p.buttons & 0xff);
  v.setUint32(7, p.viewTick >>> 0, true);
  return out;
}

/** Decodes an untrusted input packet; returns null if malformed. */
export function decodeInput(buf: Uint8Array): InputPacket | null {
  if (!(buf instanceof Uint8Array) || buf.byteLength < INPUT_BYTES) return null;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    tick: v.getUint32(0, true),
    mx: v.getInt8(4) / 127,
    mz: v.getInt8(5) / 127,
    buttons: v.getUint8(6) & 0x07,
    viewTick: v.getUint32(7, true),
  };
}

// ---------------------------------------------------------------------------------------------
// Snapshot: server -> client, every tick. Header + (optional) the recipient's full state + all players.
// ---------------------------------------------------------------------------------------------

export interface RemoteEntry {
  slot: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: number;
  grounded: boolean;
  emote: number;
  groundObs: number;
}

export interface Snapshot {
  tick: number;
  /** Which map load this snapshot belongs to (see MapInfo.v). */
  mapVersion: number;
  /** How many ticks ahead of the server the recipient's newest input was (negative = late). */
  lead: number;
  own: CharState | null;
  players: RemoteEntry[];
}

const OWN_BYTES = 15 * 4 + 1 + 1 + 2 + 2 + 1;
const ENTRY_BYTES = 10;

/** Encodes the shared part (every active player). Reused for all recipients of a tick. */
export function encodePlayers(entries: readonly RemoteEntry[]): Uint8Array {
  const out = new Uint8Array(1 + entries.length * ENTRY_BYTES);
  const v = new DataView(out.buffer);
  v.setUint8(0, entries.length);
  let o = 1;
  for (const e of entries) {
    v.setUint8(o, e.slot);
    v.setInt16(o + 1, clamp(Math.round(e.x * POS_SCALE), -32768, 32767), true);
    v.setInt16(o + 3, clamp(Math.round(e.y * POS_SCALE), -32768, 32767), true);
    v.setInt16(o + 5, clamp(Math.round(e.z * POS_SCALE), -32768, 32767), true);
    const yaw = ((e.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    v.setUint8(o + 7, Math.round((yaw / (Math.PI * 2)) * 256) & 0xff);
    v.setUint8(o + 8, (e.mode & 0x07) | (e.grounded ? 0x08 : 0) | ((e.emote & 0x0f) << 4));
    v.setUint8(o + 9, e.groundObs < 0 || e.groundObs >= NO_OBSTACLE ? NO_OBSTACLE : e.groundObs);
    o += ENTRY_BYTES;
  }
  return out;
}

function writeOwn(v: DataView, o: number, c: CharState): number {
  const f = [c.px, c.py, c.pz, c.vx, c.vy, c.vz, c.yaw, c.modeT, c.stunDur, c.airT, c.jumpBuf, c.convX, c.convZ, c.hitCd, 0];
  for (const x of f) { v.setFloat32(o, x, true); o += 4; }
  v.setUint8(o++, c.mode);
  v.setUint8(o++, (c.grounded ? 1 : 0) | (c.diveUsed ? 2 : 0));
  v.setInt16(o, c.groundObs, true); o += 2;
  v.setInt16(o, c.groundTile, true); o += 2;
  v.setUint8(o++, c.groundSurf);
  return o;
}

function readOwn(v: DataView, o: number, c: CharState): number {
  c.px = v.getFloat32(o, true); c.py = v.getFloat32(o + 4, true); c.pz = v.getFloat32(o + 8, true);
  c.vx = v.getFloat32(o + 12, true); c.vy = v.getFloat32(o + 16, true); c.vz = v.getFloat32(o + 20, true);
  c.yaw = v.getFloat32(o + 24, true); c.modeT = v.getFloat32(o + 28, true); c.stunDur = v.getFloat32(o + 32, true);
  c.airT = v.getFloat32(o + 36, true); c.jumpBuf = v.getFloat32(o + 40, true); c.convX = v.getFloat32(o + 44, true);
  c.convZ = v.getFloat32(o + 48, true); c.hitCd = v.getFloat32(o + 52, true);
  o += 60;
  c.mode = v.getUint8(o++);
  const b = v.getUint8(o++);
  c.grounded = (b & 1) !== 0;
  c.diveUsed = (b & 2) !== 0;
  c.groundObs = v.getInt16(o, true); o += 2;
  c.groundTile = v.getInt16(o, true); o += 2;
  c.groundSurf = v.getUint8(o++);
  c.fx = 0;
  return o;
}

/** Full snapshot for one recipient: [u32 tick][i8 lead][u8 hasOwn][u8 mapVersion][own?][players]. */
export function encodeSnapshot(tick: number, lead: number, mapVersion: number, own: CharState | null, players: Uint8Array): Uint8Array {
  const out = new Uint8Array(7 + (own ? OWN_BYTES : 0) + players.byteLength);
  const v = new DataView(out.buffer);
  v.setUint32(0, tick >>> 0, true);
  v.setInt8(4, clamp(Math.round(lead), -128, 127));
  v.setUint8(5, own ? 1 : 0);
  v.setUint8(6, mapVersion & 0xff);
  let o = 7;
  if (own) o = writeOwn(v, o, own);
  out.set(players, o);
  return out;
}

export function decodeSnapshot(buf: Uint8Array): Snapshot {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tick = v.getUint32(0, true);
  const lead = v.getInt8(4);
  const mapVersion = v.getUint8(6);
  let own: CharState | null = null;
  let o = 7;
  if (v.getUint8(5) & 1) {
    own = new CharState();
    o = readOwn(v, o, own);
  }
  const n = v.getUint8(o++);
  const players: RemoteEntry[] = [];
  for (let i = 0; i < n; i++) {
    const s = v.getUint8(o + 8);
    const g = v.getUint8(o + 9);
    players.push({
      slot: v.getUint8(o),
      x: v.getInt16(o + 1, true) / POS_SCALE,
      y: v.getInt16(o + 3, true) / POS_SCALE,
      z: v.getInt16(o + 5, true) / POS_SCALE,
      yaw: (v.getUint8(o + 7) / 256) * Math.PI * 2,
      mode: s & 0x07,
      grounded: (s & 0x08) !== 0,
      emote: s >> 4,
      groundObs: g === NO_OBSTACLE ? -1 : g,
    });
    o += ENTRY_BYTES;
  }
  return { tick, lead, mapVersion, own, players };
}

/** Sent (reliably, in order with snapshots) whenever the room switches maps, and to every joiner. */
export interface MapInfo {
  /** Map load counter (wraps at 256); snapshots carry it so stale ones can be dropped. */
  v: number;
  id: string;
  /** Server tick at which this map's clock reads zero. */
  start: number;
  /** Inputs are ignored up to and including this server tick (intro + countdown). */
  freeze: number;
}

/** Tile drop events: [u16 count]([u16 tile][u32 triggerTick])*. Trigger ticks are round-relative. */
export function encodeTiles(events: readonly { tile: number; tick: number }[]): Uint8Array {
  const out = new Uint8Array(2 + events.length * 6);
  const v = new DataView(out.buffer);
  v.setUint16(0, events.length, true);
  events.forEach((e, i) => {
    v.setUint16(2 + i * 6, e.tile, true);
    v.setInt32(4 + i * 6, e.tick, true);
  });
  return out;
}

export function decodeTiles(buf: Uint8Array): { tile: number; tick: number }[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = v.getUint16(0, true);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ tile: v.getUint16(2 + i * 6, true), tick: v.getInt32(4 + i * 6, true) });
  return out;
}
