// Dev helper: teleport around a map in practice mode and screenshot. usage: node tools/tour.mjs <out-prefix> <mapId> '<json stops>'
import { chromium } from '@playwright/test';
const [out, mapId, stopsJson] = process.argv.slice(2);
const stops = JSON.parse(stopsJson);
const b = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') logs.push('[console.error] ' + m.text()); });
await p.goto(`http://localhost:5173/?map=${mapId}`);
await p.waitForTimeout(2500);
let i = 0;
for (const [x, y, z, yaw, pitch, dist, wait] of stops) {
  await p.evaluate(([x, y, z, yaw, pitch, dist]) => {
    const g = window.__sp.game;
    g.state.spawn(x, y, z, yaw);
    g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.distance = dist; g.cam.snap();
  }, [x, y, z, yaw, pitch, dist]);
  await p.waitForTimeout(wait ?? 900);
  await p.screenshot({ path: `${out}-${mapId}-${i++}.png` });
}
console.log(logs.join('\n') || 'no errors');
await b.close();
