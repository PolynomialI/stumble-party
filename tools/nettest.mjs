// Dev helper: one client runs a scripted input sequence and reports prediction health.
import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1200);
await p.click('[data-act=play]');
await p.waitForTimeout(2500);
const seq = [['KeyW', 900], ['Space', 80], ['KeyW', 700], ['KeyD', 800], ['ShiftLeft', 60], ['wait', 900], ['KeyS', 1500], ['Space', 80], ['KeyA', 1200], ['KeyW', 2000], ['wait', 1000]];
for (const [k, ms] of seq) {
  if (k === 'wait') { await p.waitForTimeout(ms); continue; }
  await p.keyboard.down(k); await p.waitForTimeout(ms); await p.keyboard.up(k);
}
console.log(JSON.stringify(await p.evaluate(() => window.__sp.net())));
console.log(errs.join('\n') || 'no errors');
await b.close();
