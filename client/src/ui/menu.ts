import { GAME_TITLE, NAME_MAX, sanitizeName } from '@sp/shared';
import type { Profile } from '../profile';

export interface MenuActions {
  play(): void;
  createPrivate(fillBots: boolean): void;
  joinCode(code: string): void;
  practice(): void;
  rename(name: string): void;
  customize(): void;
  settings(): void;
}

/** Cog icon (inline SVG, no icon font to load). */
export const GEAR_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="currentColor">${
  [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="10.2" y="1.6" width="3.6" height="4.4" rx="0.9" transform="rotate(${a} 12 12)"/>`).join('')
}</g><circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" stroke-width="4.4"/></svg>`;

/** Title screen over the live 3D island. */
export class Menu {
  readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly privatePanel: HTMLDivElement;
  private readonly codeInput: HTMLInputElement;

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
        <div class="btn-row">
          <button class="btn btn-sec" data-act="private">Private room</button>
          <button class="btn btn-sec" data-act="practice">Practice</button>
        </div>
        <div class="private-panel hidden">
          <button class="btn btn-alt" data-act="create">Create a room</button>
          <label class="check"><input type="checkbox" class="bots-check" checked /> Fill empty spots with bots</label>
          <div class="join-row">
            <input class="code-input" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code" />
            <button class="btn btn-alt" data-act="join">Join</button>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-pink" data-act="customize">Customize</button>
          <button class="btn btn-light" data-act="settings">${GEAR_SVG}Settings</button>
        </div>
        <p class="menu-hint">WASD / arrows move · Space jump · Shift dive · 1–4 emotes</p>
      </div>`;
    this.nameInput = this.root.querySelector('.name-input')!;
    this.privatePanel = this.root.querySelector('.private-panel')!;
    this.codeInput = this.root.querySelector('.code-input')!;
    const bots = this.root.querySelector<HTMLInputElement>('.bots-check')!;
    this.nameInput.value = profile.name;
    this.nameInput.addEventListener('change', () => {
      const n = sanitizeName(this.nameInput.value, profile.name);
      this.nameInput.value = n;
      actions.rename(n);
    });
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    const join = () => {
      const code = this.codeInput.value.trim();
      if (code.length === 5) actions.joinCode(code);
      else this.codeInput.focus();
    };
    const on = (act: string, fn: () => void) => this.root.querySelector(`[data-act=${act}]`)!.addEventListener('click', fn);
    on('play', () => actions.play());
    on('practice', () => actions.practice());
    on('private', () => {
      this.privatePanel.classList.toggle('hidden');
      if (!this.privatePanel.classList.contains('hidden')) this.codeInput.focus();
    });
    on('create', () => actions.createPrivate(bots.checked));
    on('customize', () => actions.customize());
    on('settings', () => actions.settings());
    on('join', join);
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
