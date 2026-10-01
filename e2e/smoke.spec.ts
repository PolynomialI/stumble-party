import { expect, test, type Page } from '@playwright/test';

interface Remote { name: string; x: number; y: number; z: number }

declare global {
  interface Window { __sp: { remotes(): Remote[]; self(): { x: number; z: number } | null } }
}

async function join(page: Page, name: string) {
  // Low quality keeps software-rendered test browsers responsive.
  await page.goto('http://localhost:5173/?quality=low');
  await page.fill('.name-input', name);
  await page.press('.name-input', 'Tab');
  await page.click('[data-act=play]');
}

const seen = (page: Page, name: string) =>
  page.evaluate((n) => window.__sp.remotes().find((r) => r.name === n) ?? null, name);

async function walk(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test('two browser clients see each other move', async ({ browser }) => {
  // Unique names: players from an earlier run may still sit in the room during their reconnection window.
  const tag = Math.random().toString(36).slice(2, 6);
  const A = `Alpha${tag}`, B = `Bravo${tag}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await join(a, A);
  await join(b, B);

  // Both end up in the same room and can see each other.
  await expect.poll(() => seen(b, A), { timeout: 30_000 }).not.toBeNull();
  await expect.poll(() => seen(a, B), { timeout: 30_000 }).not.toBeNull();

  // Alpha runs forward; Bravo's view of Alpha must follow.
  const before = (await seen(b, A))!;
  await walk(a, 'KeyW', 1500);
  await expect.poll(async () => {
    const now = await seen(b, A);
    return now ? Math.hypot(now.x - before.x, now.z - before.z) : 0;
  }, { timeout: 15_000 }).toBeGreaterThan(3);

  // And the other way round.
  const before2 = (await seen(a, B))!;
  await walk(b, 'KeyD', 1200);
  await expect.poll(async () => {
    const now = await seen(a, B);
    return now ? Math.hypot(now.x - before2.x, now.z - before2.z) : 0;
  }, { timeout: 15_000 }).toBeGreaterThan(2);

  // What Bravo sees of Alpha matches where Alpha thinks it is (within interpolation slack).
  const aSelf = (await a.evaluate(() => window.__sp.self()))!;
  const aSeen = (await seen(b, A))!;
  expect(Math.hypot(aSelf.x - aSeen.x, aSelf.z - aSeen.z)).toBeLessThan(1.5);
});
