import type { Input } from './Input';

/**
 * On-screen controls for touchscreens (Chromebooks, tablets): a floating joystick on the left half,
 * drag-to-look on the right half, and big thumb buttons for jump / dive / emote.
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

  constructor(private readonly input: Input, onEmote: () => void) {
    const root = document.createElement('div');
    root.className = 'touch-layer';
    root.innerHTML = `
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <button class="touch-btn touch-jump" aria-label="Jump">⤒</button>
      <button class="touch-btn touch-dive" aria-label="Dive">➜</button>
      <button class="touch-btn touch-emote" aria-label="Emote">☺</button>`;
    this.root = root;
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
      onEmote();
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
    this.stickId = this.lookId = -1;
    this.input.touch.moveX = this.input.touch.moveY = 0;
    this.input.touch.jumpHeld = false;
    this.stick.classList.remove('active');
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    e.preventDefault();
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
