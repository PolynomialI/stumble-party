import { Client, type Room } from '@colyseus/sdk';
import { DEFAULT_PORT, ROOM_NAME, type Look } from '@sp/shared';

/** Server URL baked in at build time (a hosted server), if any. */
const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();

/**
 * Game server base URL. Set VITE_SERVER_URL at build time (a full URL, ws(s):// or http(s)://, or a bare
 * Render host name); otherwise the dev server on this machine is used.
 */
export function serverUrl(): string {
  if (configured) {
    let url = configured.replace(/^ws(s?):\/\//, 'http$1://');
    if (!/^https?:\/\//.test(url)) url = `https://${url.includes('.') ? url : `${url}.onrender.com`}`;
    return url.replace(/\/+$/, '');
  }
  const proto = location.protocol === 'https:' ? 'https:' : 'http:';
  // Opened straight from disk (file://) there is no host name: look for a server on this computer.
  return `${proto}//${location.hostname || 'localhost'}:${DEFAULT_PORT}`;
}

/**
 * Waits until /health answers. A hosted server may be asleep or mid-deploy (Render's free tier can take
 * over two minutes to answer), so we report progress for up to five. A local one is up or it isn't.
 */
export async function waitForServer(onWaiting: (seconds: number) => void, signal?: AbortSignal, limitMs = configured ? 300_000 : 6_000) {
  const base = serverUrl();
  const t0 = performance.now();
  let notified = false;
  for (;;) {
    if (signal?.aborted) throw new Error('cancelled');
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(`${base}/health`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    const waited = performance.now() - t0;
    if (waited > limitMs) {
      throw new Error(configured
        ? 'The game server did not respond. Please try again in a minute.'
        : `No game server is running at ${base}.\nStart one with "npm run dev", or play Practice instead.`);
    }
    if (configured && (waited > 1500 || notified)) {
      notified = true;
      onWaiting(Math.round(waited / 1000));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export interface JoinProfile {
  name: string;
  look: Look;
}

let client: Client | null = null;
function colyseus(): Client {
  // We use no cookies, so send none: a credentialed cross-origin request is the strictest kind a browser
  // makes, and privacy extensions or filtering proxies that touch its CORS headers would break it.
  return (client ??= new Client(serverUrl(), { fetchFn: (url, init) => fetch(url, { ...init, credentials: 'omit' }) }));
}

/** The server never answered: it is restarting or asleep, or the network dropped. Worth retrying. */
export class Unreachable extends Error {}

/** Server refusals carry a numeric code; anything else means the request got no answer at all. */
async function reach(join: Promise<Room>): Promise<Room> {
  try {
    return await join;
  } catch (e) {
    if (typeof (e as { code?: unknown })?.code === 'number') throw e;
    throw new Unreachable(`Could not reach the game server. Check your connection and try again.\n(${(e as Error)?.message ?? e})`);
  }
}

export function quickPlay(profile: JoinProfile): Promise<Room> {
  return reach(colyseus().joinOrCreate(ROOM_NAME, { ...profile, mode: 'quick' }));
}

export function createPrivate(profile: JoinProfile, fillBots: boolean): Promise<Room> {
  return reach(colyseus().create(ROOM_NAME, { ...profile, mode: 'private', fillBots }));
}

export function joinByCode(code: string, profile: JoinProfile): Promise<Room> {
  return reach(colyseus().joinById(code.trim().toUpperCase(), profile));
}
