import { GAME_TITLE, NAME_MAX, sanitizeName } from '@sp/shared';
import type { Profile } from '../profile';

export interface MenuActions {
  play(): void;
  practice(): void;
  rename(name: string): void;
}

/** Title screen over the live 3D island. */
export class Menu {
  readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;

  constructor(parent: HTMLElement, profile: Profile, actions: MenuActions) {
    const [a, b] = GAME_TITLE.toUpperCase().split(' ');
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="logo"><span class="logo-a">${a ?? ''}</span><span class="logo-b">${b ?? ''}</span></h1>
        <label class="field">
          <span>Nickname</span>
          <input class="name-input" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" />
        </label>
        <button class="btn btn-play" data-act="play">Play</button>
        <button class="btn btn-sec" data-act="practice">Practice course</button>
        <p class="menu-hint">WASD / arrows move · Space jump · Shift dive · 1–4 emotes</p>
      </div>`;
    this.nameInput = this.root.querySelector('.name-input')!;
    this.nameInput.value = profile.name;
    this.nameInput.addEventListener('change', () => {
      const n = sanitizeName(this.nameInput.value, profile.name);
      this.nameInput.value = n;
      actions.rename(n);
    });
    this.root.querySelector('[data-act=play]')!.addEventListener('click', () => actions.play());
    this.root.querySelector('[data-act=practice]')!.addEventListener('click', () => actions.practice());
    parent.appendChild(this.root);
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }
}

/** Modal status card (connecting, waking the server, errors). */
export class Overlay {
  readonly root: HTMLDivElement;
  private readonly msg: HTMLParagraphElement;
  private readonly btn: HTMLButtonElement;
  private onButton: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `<div class="card"><div class="spinner"></div><p class="msg"></p><button class="btn btn-sec small">Cancel</button></div>`;
    this.msg = this.root.querySelector('.msg')!;
    this.btn = this.root.querySelector('button')!;
    this.btn.addEventListener('click', () => this.onButton?.());
    parent.appendChild(this.root);
  }

  show(text: string, button: string | null = null, onButton: (() => void) | null = null, busy = true) {
    this.root.classList.remove('hidden');
    this.root.classList.toggle('busy', busy);
    this.msg.textContent = text;
    this.btn.style.display = button ? '' : 'none';
    this.btn.textContent = button ?? '';
    this.onButton = onButton;
  }

  hide() {
    this.root.classList.add('hidden');
  }
}
