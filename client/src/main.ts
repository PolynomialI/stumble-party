import './style.css';
import { GAME_TITLE, HATS, PATTERNS, getMap, initPhysics } from '@sp/shared';
import { App } from './app';
import { OnlineGame } from './game/OnlineGame';
import { PracticeGame } from './game/PracticeGame';
import { Input } from './input/Input';
import { TouchControls } from './input/TouchControls';
import { GameRenderer } from './render/Renderer';
import { loadQuality } from './render/quality';

async function boot() {
  document.title = GAME_TITLE;
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  await initPhysics();
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  const r = new GameRenderer(canvas, forced === 'low' || forced === 'medium' || forced === 'high' ? forced : loadQuality());
  const input = new Input(canvas);
  const touch = new TouchControls(input, () => input.pressEmote(1));
  ui.appendChild(touch.root);
  canvas.addEventListener('click', () => { if (input.enabled) input.requestPointerLock(); });

  const app = new App(r, input, ui);
  if (params.has('map')) app.practice(getMap(params.get('map')!).id);
  if (params.has('showcase') && app.game instanceof PracticeGame) {
    app.game.showcase(HATS.map((_, h) => ({ body: (h * 3) % 16, accent: (h * 5 + 2) % 16, pattern: h % PATTERNS.length, hat: h })));
  }

  // Debug / test hook (used by the Playwright smoke test).
  (window as unknown as { __sp: unknown }).__sp = {
    app,
    renderer: r,
    get game() { return app.game; },
    /** Remote players as the local client currently draws them. */
    remotes() {
      const g = app.game;
      if (!(g instanceof OnlineGame)) return [];
      return [...g.tracks.entries()].filter(([, t]) => t.visible).map(([slot, t]) => ({
        slot, name: g.slots.get(slot)?.name ?? '', x: t.pos.x, y: t.pos.y, z: t.pos.z,
      }));
    },
    net() {
      const g = app.game;
      return g instanceof OnlineGame ? { ...g.netStats, rtt: g.rttMs } : null;
    },
    self() {
      const g = app.game;
      if (!(g instanceof OnlineGame) || !g.ownActive) return null;
      return { slot: g.mySlot, x: g.own.px, y: g.own.py, z: g.own.pz };
    },
  };

  const fps = document.createElement('div');
  fps.className = 'fps';
  ui.appendChild(fps);
  let last = performance.now();
  let frames = 0, acc = 0;
  r.renderer.setAnimationLoop((now) => {
    const ms = Math.min(now - last, 250);
    last = now;
    touch.setVisible(input.lastDevice === 'touch' && input.enabled);
    app.frame(ms / 1000);
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
