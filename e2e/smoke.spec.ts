import { expect, test, type Page } from '@playwright/test';

interface Remote { name: string; x: number; y: number; z: number }

declare global {
  interface Window { __sp: { remotes(): Remote[]; self(): { x: number; z: number } | null } }
}

/** Opens the game and names the player. Low quality keeps software-rendered test browsers responsive. */
async function open(page: Page, name: string) {
  await page.goto('http://localhost:5173/?quality=low');
  await page.fill('.name-input', name);
  await page.press('.name-input', 'Tab');
  await page.click('[data-act=private]');
}

/** Retries `read` until it yields a value: a stuttering test browser can lose sight of a player for a moment. */
async function eventually<T>(read: () => Promise<T | null>): Promise<T> {
  let value: T | null = null;
  await expect.poll(async () => (value = await read()), { timeout: 30_000 }).not.toBeNull();
  return value!;
}

/** Where `page` currently draws the player called `name`. */
const seen = (page: Page, name: string) =>
  eventually(() => page.evaluate((n) => window.__sp.remotes().find((r) => r.name === n) ?? null, name));

async function walk(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test('two browser clients see each other move', async ({ browser }) => {
  const A = 'Alpha', B = 'Bravo';
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  // A private room of their own: Alpha creates it, Bravo joins with the code. (A shared quick-play lobby
  // could start its match in the middle of the test.)
  await open(a, A);
  await a.click('[data-act=create]');
  const code = (await a.textContent('.room-code', { timeout: 30_000 }))!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await open(b, B);
  await b.fill('.code-input', code);
  await b.click('[data-act=join]');

  // Both are in the room and can see each other.
  await seen(a, B);
  const before = await seen(b, A);

  // Alpha runs forward; Bravo's view of Alpha must follow.
  await walk(a, 'KeyW', 1500);
  await expect.poll(async () => {
    const now = await seen(b, A);
    return Math.hypot(now.x - before.x, now.z - before.z);
  }, { timeout: 15_000 }).toBeGreaterThan(3);

  // And the other way round.
  const before2 = await seen(a, B);
  await walk(b, 'KeyD', 1200);
  await expect.poll(async () => {
    const now = await seen(a, B);
    return Math.hypot(now.x - before2.x, now.z - before2.z);
  }, { timeout: 15_000 }).toBeGreaterThan(2);

  // What Bravo sees of Alpha matches where Alpha thinks it is (within interpolation slack).
  await expect.poll(async () => {
    const aSelf = await eventually(() => a.evaluate(() => window.__sp.self()));
    const aSeen = await seen(b, A);
    return Math.hypot(aSelf.x - aSeen.x, aSelf.z - aSeen.z);
  }, { timeout: 15_000 }).toBeLessThan(1.5);
});
