import './style.css';
import { GAME_TITLE, HATS, PATTERNS, getMap, initPhysics, randomIdentity } from '@sp/shared';
import { Input } from './input/Input';
import { TouchControls } from './input/TouchControls';
import { PracticeGame } from './game/PracticeGame';
import { GameRenderer } from './render/Renderer';
import { loadQuality } from './render/quality';

async function boot() {
  document.title = GAME_TITLE;
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  await initPhysics();
  const r = new GameRenderer(canvas, loadQuality());
  const input = new Input(canvas);
  const touch = new TouchControls(input, () => input.pressEmote(1));
  ui.appendChild(touch.root);
  input.onDeviceChange = (d) => touch.setVisible(d === 'touch');
  canvas.addEventListener('click', () => input.requestPointerLock());

  const params = new URLSearchParams(location.search);
  const game = new PracticeGame(r, input, getMap(params.get('map') ?? 'lobby'), randomIdentity(Number(params.get('seed') ?? 7)).look, ui);
  if (params.has('showcase')) {
    const hats = HATS.map((_, h) => ({ body: (h * 3) % 16, accent: (h * 5 + 2) % 16, pattern: h % PATTERNS.length, hat: h }));
    game.showcase(hats);
    game.cam.distance = 9;
  }
  if (params.has('closeup')) {
    game.cam.distance = params.has('showcase') ? 8.5 : 4;
    game.cam.pitch = 0.05;
    game.cam.yaw = Math.PI;
  }
  // Debug / test hook (also used by the Playwright smoke test).
  (window as unknown as { __sp: unknown }).__sp = { game, renderer: r };
  const fps = document.createElement('div');
  fps.className = 'fps';
  ui.appendChild(fps);

  let last = performance.now();
  let frames = 0, acc = 0;
  r.renderer.setAnimationLoop((now) => {
    const ms = now - last;
    last = now;
    game.frame(ms / 1000);
    r.render();
    r.governor(ms);
    frames++;
    acc += ms;
    if (acc > 500) {
      fps.textContent = `${Math.round((frames * 1000) / acc)} fps · ${Math.round(r.resolutionScale * 100)}%`;
      frames = 0;
      acc = 0;
    }
  });
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${String(e?.stack ?? e)}</pre>`);
});
