import { BTN_DIVE, BTN_JUMP, BTN_JUMP_PRESS, clamp, type InputCmd } from '@sp/shared';

/** Latest analog/button state from touch controls (written by TouchControls). */
export interface TouchState {
  moveX: number;
  moveY: number;
  lookDX: number;
  lookDY: number;
  jumpHeld: boolean;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const JUMP_KEYS = new Set(['Space']);
const DIVE_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const EMOTE_KEYS: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4 };

/**
 * Keyboard + mouse (pointer lock) + touch. Button presses are latched until the next simulation tick
 * consumes them, so a tap shorter than one 33 ms tick is never lost.
 */
export class Input {
  readonly keys = new Set<string>();
  readonly touch: TouchState = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, jumpHeld: false };
  /** Camera look delta accumulated since the last frame (pixels). */
  lookDX = 0;
  lookDY = 0;
  zoomDelta = 0;
  sensitivity = 1;
  invertY = false;
  enabled = true;
  /** Latched presses. */
  private jumpPressed = false;
  private divePressed = false;
  private emote = 0;
  private dragging = false;
  lastDevice: 'keyboard' | 'touch' = 'keyboard';
  onDeviceChange: ((d: 'keyboard' | 'touch') => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', this.onMouseDown);
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.zoomDelta += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('pointerdown', (e) => this.setDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard'), true);
  }

  private setDevice(d: 'keyboard' | 'touch') {
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    this.onDeviceChange?.(d);
  }

  get pointerLocked() {
    return document.pointerLockElement === this.canvas;
  }

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    this.setDevice('keyboard');
    if (MOVE_KEYS[e.code] || JUMP_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (!this.enabled) return;
    if (JUMP_KEYS.has(e.code)) this.jumpPressed = true;
    if (DIVE_KEYS.has(e.code)) this.divePressed = true;
    if (EMOTE_KEYS[e.code]) this.emote = EMOTE_KEYS[e.code];
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.pointerLocked) {
      if (this.enabled) this.divePressed = true;
      return;
    }
    if (e.button === 0) this.dragging = true;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.pointerLocked || this.dragging) {
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    }
  };

  requestPointerLock() {
    if (this.pointerLocked || this.lastDevice === 'touch') return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* pointer lock unavailable (e.g. iframe) — drag-to-look still works */
    }
  }

  pressJump() { if (this.enabled) this.jumpPressed = true; }
  pressDive() { if (this.enabled) this.divePressed = true; }
  pressEmote(id: number) { if (this.enabled) this.emote = id; }

  /** Consumes and returns the camera look delta for this frame (radians). */
  takeLook(): [number, number] {
    const k = 0.0024 * this.sensitivity;
    const dx = (this.lookDX + this.touch.lookDX * 2.2) * k;
    const dy = (this.lookDY + this.touch.lookDY * 2.2) * k * (this.invertY ? -1 : 1);
    this.lookDX = this.lookDY = 0;
    this.touch.lookDX = this.touch.lookDY = 0;
    return [dx, dy];
  }

  takeEmote(): number {
    const e = this.emote;
    this.emote = 0;
    return e;
  }

  /**
   * Builds this tick's command. Movement is made camera-relative here (camYaw = direction the camera faces)
   * and quantised exactly like the network encoding, so prediction and server see the same numbers.
   */
  sample(camYaw: number, out: InputCmd): InputCmd {
    let ax = 0, ay = 0;
    if (this.enabled) {
      for (const k of this.keys) {
        const m = MOVE_KEYS[k];
        if (m) { ax += m[0]; ay += m[1]; }
      }
      ax += this.touch.moveX;
      ay += this.touch.moveY;
    }
    const len = Math.hypot(ax, ay);
    if (len > 1) { ax /= len; ay /= len; }
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx; // camera right = forward x up
    out.mx = quant(fx * ay + rx * ax);
    out.mz = quant(fz * ay + rz * ax);
    let b = 0;
    if (this.enabled) {
      const held = [...JUMP_KEYS].some((k) => this.keys.has(k)) || this.touch.jumpHeld;
      if (held) b |= BTN_JUMP;
      if (this.jumpPressed) b |= BTN_JUMP_PRESS | BTN_JUMP;
      if (this.divePressed) b |= BTN_DIVE;
    }
    this.jumpPressed = false;
    this.divePressed = false;
    out.buttons = b;
    return out;
  }
}

/** Same int8 quantisation as the wire format. */
export function quant(v: number): number {
  return Math.round(clamp(v, -1, 1) * 127) / 127;
}
