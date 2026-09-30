import { Client, type Room } from '@colyseus/sdk';
import { DEFAULT_PORT, ROOM_NAME, type Look } from '@sp/shared';

/**
 * Game server base URL. Set VITE_SERVER_URL at build time (a full URL, ws(s):// or http(s)://, or a bare
 * Render host name); otherwise the dev server on this machine is used.
 */
export function serverUrl(): string {
  const raw = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (raw) {
    let url = raw.replace(/^ws(s?):\/\//, 'http$1://');
    if (!/^https?:\/\//.test(url)) url = `https://${url.includes('.') ? url : `${url}.onrender.com`}`;
    return url.replace(/\/+$/, '');
  }
  const proto = location.protocol === 'https:' ? 'https:' : 'http:';
  return `${proto}//${location.hostname}:${DEFAULT_PORT}`;
}

/**
 * Waits until /health answers. Free hosting tiers sleep when idle and take up to a minute to wake, so we
 * report progress instead of failing on the first timeout.
 */
export async function waitForServer(onWaiting: (seconds: number) => void, signal?: AbortSignal, limitMs = 120_000) {
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
    if (waited > limitMs) throw new Error('The game server did not respond. Please try again in a minute.');
    if (waited > 1500 || notified) {
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
  return (client ??= new Client(serverUrl()));
}

export function quickPlay(profile: JoinProfile): Promise<Room> {
  return colyseus().joinOrCreate(ROOM_NAME, { ...profile, mode: 'quick' });
}

export function createPrivate(profile: JoinProfile, fillBots: boolean): Promise<Room> {
  return colyseus().create(ROOM_NAME, { ...profile, mode: 'private', fillBots });
}

export function joinByCode(code: string, profile: JoinProfile): Promise<Room> {
  return colyseus().joinById(code.trim().toUpperCase(), profile);
}
