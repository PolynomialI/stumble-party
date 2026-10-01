// Dev helper: host a private room with bots, start it, and screenshot every phase until the podium.
import { chromium } from '@playwright/test';
const out = process.argv[2];
const b = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1500);
await p.click('[data-act=private]');
await p.click('[data-act=create]');
await p.waitForSelector('.room-code', { timeout: 30000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}-lobby.png` });
await p.click('[data-act=start]');
const seen = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 6 * 60 * 1000) {
  const s = await p.evaluate(() => { const st = window.__sp.app.game?.room?.state; return st ? `${st.phase}:${st.round}` : 'none'; });
  if (s === 'none') break;
  if (!seen.has(s)) {
    seen.add(s);
    await p.waitForTimeout(s.startsWith('playing') ? 2500 : 700);
    await p.screenshot({ path: `${out}-${s.replace(':', '-')}.png` });
    console.log('phase', s, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    if (s.startsWith('podium')) break;
  }
  await p.waitForTimeout(250);
}
console.log(errs.slice(0, 20).join('\n') || 'no errors');
await b.close();
