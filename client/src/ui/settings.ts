import type { Quality } from '../render/quality';
import type { Settings } from '../settings';

/** Settings dialog. Graphics quality is only offered from the menu (changing it rebuilds the page). */
export class SettingsPanel {
  readonly root: HTMLDivElement;
  private readonly qualityRow: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly s: Settings, private readonly apply: (s: Settings, reload: boolean) => void) {
    this.root = document.createElement('div');
    this.root.className = 'overlay settings hidden';
    this.root.innerHTML = `
      <div class="card settings-card" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <div class="set-row quality-row">
          <span>Graphics</span>
          <div class="seg">
            <button data-q="low">Low</button><button data-q="medium">Medium</button><button data-q="high">High</button>
          </div>
        </div>
        <label class="set-row"><span>Camera speed</span><input type="range" min="0.2" max="3" step="0.1" data-k="sensitivity" /></label>
        <label class="set-row"><span>Invert camera Y</span><input type="checkbox" data-k="invertY" /></label>
        <label class="set-row"><span>Sound effects</span><input type="range" min="0" max="1" step="0.05" data-k="sfx" /></label>
        <label class="set-row"><span>Music</span><input type="range" min="0" max="1" step="0.05" data-k="music" /></label>
        <label class="set-row"><span>Show FPS</span><input type="checkbox" data-k="showFps" /></label>
        <p class="set-note">WASD move · Space jump · Shift dive · 1–4 emotes</p>
        <button class="btn btn-play small" data-act="close">Done</button>
      </div>`;
    this.qualityRow = this.root.querySelector('.quality-row')!;
    this.root.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const q = b.dataset.q as Quality;
      if (q === this.s.quality) return;
      this.s.quality = q;
      this.sync();
      this.apply(this.s, true);
    }));
    this.root.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k as keyof Settings;
      if (inp.type === 'checkbox') (this.s as unknown as Record<string, unknown>)[k] = inp.checked;
      else (this.s as unknown as Record<string, unknown>)[k] = Number(inp.value);
      this.apply(this.s, false);
    }));
    this.root.querySelector('[data-act=close]')!.addEventListener('click', () => this.show(false));
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.show(false); });
    parent.appendChild(this.root);
    this.sync();
  }

  private sync() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => {
      b.classList.toggle('on', b.dataset.q === this.s.quality);
      b.setAttribute('aria-pressed', String(b.dataset.q === this.s.quality));
    });
    this.root.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
      const v = (this.s as unknown as Record<string, unknown>)[inp.dataset.k!];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else inp.value = String(v);
    });
  }

  show(v: boolean, allowQuality = true) {
    this.qualityRow.style.display = allowQuality ? '' : 'none';
    this.sync();
    this.root.classList.toggle('hidden', !v);
  }
}
