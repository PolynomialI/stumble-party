import { EMOTES } from '@sp/shared';
import type { Input } from './Input';

const ICON_JUMP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5 20 12h-5v5.5H9V12H4z"/><rect fill="currentColor" x="7" y="19" width="10" height="2.4" rx="1.2"/></svg>';
const ICON_DIVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M5 6l6 6-6 6M12.5 6l6 6-6 6"/></svg>';
const ICON_EMOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path d="M7.8 14a4.6 4.6 0 0 0 8.4 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

/**
 * On-screen controls for touchscreens (Chromebooks, tablets): a floating joystick on the left half,
 * drag-to-look on the right half, and big thumb buttons for jump / dive / emote (which opens a picker).
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  private readonly radius = 56;
  private readonly emotes: HTMLDivElement;

  constructor(private readonly input: Input) {
    const root = document.createElement('div');
    root.className = 'touch-layer';
    root.innerHTML = `
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <button class="touch-btn touch-jump" aria-label="Jump">${ICON_JUMP}</button>
      <button class="touch-btn touch-dive" aria-label="Dive">${ICON_DIVE}</button>
      <button class="touch-btn touch-emote" aria-label="Emotes">${ICON_EMOTE}</button>
      <div class="touch-emotes hidden">${EMOTES.slice(1).map((n, i) => `<button class="touch-em" data-e="${i + 1}">${n}</button>`).join('')}</div>`;
    this.root = root;
    this.emotes = root.querySelector('.touch-emotes')!;
    this.stick = root.querySelector('.touch-stick')!;
    this.knob = root.querySelector('.touch-knob')!;
    const jump = root.querySelector<HTMLButtonElement>('.touch-jump')!;
    const dive = root.querySelector<HTMLButtonElement>('.touch-dive')!;
    const emote = root.querySelector<HTMLButtonElement>('.touch-emote')!;

    jump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.pressJump();
      input.touch.jumpHeld = true;
      jump.classList.add('down');
    });
    const release = () => { input.touch.jumpHeld = false; jump.classList.remove('down'); };
    jump.addEventListener('pointerup', release);
    jump.addEventListener('pointercancel', release);
    jump.addEventListener('pointerleave', release);
    dive.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.pressDive();
    });
    emote.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.emotes.classList.toggle('hidden');
    });
    this.emotes.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-e]');
      if (!b) return;
      input.pressEmote(Number(b.dataset.e));
      this.emotes.classList.add('hidden');
    });

    root.addEventListener('pointerdown', this.onDown);
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerup', this.onUp);
    root.addEventListener('pointercancel', this.onUp);
    this.setVisible(false);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? 'block' : 'none';
    if (!v) this.reset();
  }

  private reset() {
    this.emotes.classList.add('hidden');
    this.stickId = this.lookId = -1;
    this.input.touch.moveX = this.input.touch.moveY = 0;
    this.input.touch.jumpHeld = false;
    this.stick.classList.remove('active');
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    e.preventDefault();
    this.emotes.classList.add('hidden');
    this.root.setPointerCapture?.(e.pointerId);
    if (e.clientX < innerWidth * 0.45 && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.stickX = e.clientX;
      this.stickY = e.clientY;
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickX, dy = e.clientY - this.stickY;
      const d = Math.hypot(dx, dy);
      if (d > this.radius) { dx *= this.radius / d; dy *= this.radius / d; }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      // Small dead zone, then full analog range.
      const m = Math.max(0, Math.min(1, (Math.hypot(dx, dy) / this.radius - 0.12) / 0.88));
      const a = Math.atan2(dx, -dy);
      this.input.touch.moveX = Math.sin(a) * m;
      this.input.touch.moveY = Math.cos(a) * m;
    } else if (e.pointerId === this.lookId) {
      this.input.touch.lookDX += e.clientX - this.lookX;
      this.input.touch.lookDY += e.clientY - this.lookY;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.input.touch.moveX = this.input.touch.moveY = 0;
      this.stick.classList.remove('active');
    } else if (e.pointerId === this.lookId) {
      this.lookId = -1;
    }
  };
}
