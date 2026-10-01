import { HATS, PALETTE, PATTERNS, randomIdentity, type Look } from '@sp/shared';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Outfit editor. Every change is applied immediately to the 3D preview behind it. */
export class Customizer {
  readonly root: HTMLDivElement;
  private look: Look;

  constructor(parent: HTMLElement, look: Look, private readonly onChange: (look: Look) => void, onClose: () => void) {
    this.look = { ...look };
    this.root = document.createElement('div');
    this.root.className = 'customizer hidden';
    this.root.innerHTML = `
      <div class="cz-panel" role="dialog" aria-label="Customize your character">
        <div class="cz-head">
          <button class="btn btn-alt small" data-act="random">Shuffle</button>
          <button class="btn btn-play small" data-act="done">Done</button>
        </div>
        <div class="cz-group"><div class="cz-label">Suit</div><div class="swatches" data-key="body"></div></div>
        <div class="cz-group"><div class="cz-label">Accent</div><div class="swatches" data-key="accent"></div></div>
        <div class="cz-group"><div class="cz-label">Pattern</div><div class="chips" data-key="pattern"></div></div>
        <div class="cz-group"><div class="cz-label">Hat</div><div class="chips" data-key="hat"></div></div>
      </div>`;
    const swatches = (key: 'body' | 'accent') => {
      const el = this.root.querySelector<HTMLDivElement>(`.swatches[data-key=${key}]`)!;
      el.innerHTML = PALETTE.map((c, i) =>
        `<button class="swatch" data-i="${i}" style="--c:${hex(c.hex)}" aria-label="${c.name}" title="${c.name}"></button>`).join('');
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.swatch');
        if (b) this.set({ [key]: Number(b.dataset.i) });
      });
    };
    const chips = (key: 'pattern' | 'hat', names: readonly string[]) => {
      const el = this.root.querySelector<HTMLDivElement>(`.chips[data-key=${key}]`)!;
      el.innerHTML = names.map((n, i) => `<button class="chip" data-i="${i}">${n}</button>`).join('');
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
        if (b) this.set({ [key]: Number(b.dataset.i) });
      });
    };
    swatches('body');
    swatches('accent');
    chips('pattern', PATTERNS);
    chips('hat', HATS);
    this.root.querySelector('[data-act=random]')!.addEventListener('click', () =>
      this.set(randomIdentity(Math.floor(Math.random() * 1e9)).look));
    this.root.querySelector('[data-act=done]')!.addEventListener('click', onClose);
    parent.appendChild(this.root);
    this.refresh();
  }

  private set(part: Partial<Look>) {
    this.look = { ...this.look, ...part };
    this.refresh();
    this.onChange({ ...this.look });
  }

  private refresh() {
    for (const key of ['body', 'accent', 'pattern', 'hat'] as const) {
      this.root.querySelectorAll<HTMLButtonElement>(`[data-key=${key}] [data-i]`).forEach((b) => {
        const on = Number(b.dataset.i) === this.look[key];
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
  }

  show(v: boolean, look?: Look) {
    if (look) {
      this.look = { ...look };
      this.refresh();
    }
    this.root.classList.toggle('hidden', !v);
  }
}
