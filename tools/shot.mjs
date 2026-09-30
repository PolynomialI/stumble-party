// Dev helper: screenshot the running client in Playwright's Chromium.
// usage: node tools/shot.mjs <url> <out.png> [waitMs] [keys...]   keys like "KeyW:1500" hold W for 1.5 s
import { chromium } from '@playwright/test';

const [url, out, waitMs = '4000', ...keys] = process.argv.slice(2);
const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(Number(waitMs));
for (const k of keys) {
  const [code, ms] = k.split(':');
  if (code === 'wait') { await page.waitForTimeout(Number(ms)); continue; }
  if (code === 'eval') { logs.push('[eval] ' + JSON.stringify(await page.evaluate(ms))); continue; }
  await page.keyboard.down(code);
  await page.waitForTimeout(Number(ms ?? 100));
  await page.keyboard.up(code);
}
const info = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  const d = c?.getExtension('WEBGL_debug_renderer_info');
  return { gl: d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a', fps: document.querySelector('.fps')?.textContent };
});
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
console.log(logs.slice(-40).join('\n'));
await browser.close();
