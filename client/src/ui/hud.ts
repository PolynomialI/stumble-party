/** In-game overlay: round timer, status line and big animated banners (countdown, QUALIFIED!, ...). */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private bannerTimeout = 0;
  private lastTimer = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top"><div class="hud-timer"></div><div class="hud-status"></div></div>
      <div class="hud-banner"></div>
      <div class="hud-sub"></div>`;
    this.timer = this.root.querySelector('.hud-timer')!;
    this.status = this.root.querySelector('.hud-status')!;
    this.banner = this.root.querySelector('.hud-banner')!;
    this.sub = this.root.querySelector('.hud-sub')!;
    parent.appendChild(this.root);
  }

  setTimer(seconds: number | null) {
    const text = seconds === null ? '' : formatTime(seconds);
    if (text === this.lastTimer) return;
    this.lastTimer = text;
    this.timer.textContent = text;
    this.timer.style.display = text ? '' : 'none';
    this.timer.classList.toggle('urgent', seconds !== null && seconds <= 10);
  }

  setStatus(text: string) {
    if (this.status.textContent !== text) this.status.textContent = text;
    this.status.style.display = text ? '' : 'none';
  }

  /** Pops a big banner; `ms` 0 keeps it until replaced. */
  showBanner(text: string, kind: 'count' | 'go' | 'good' | 'bad' | 'info' = 'info', ms = 1400, sub = '') {
    clearTimeout(this.bannerTimeout);
    this.banner.textContent = text;
    this.banner.className = `hud-banner show ${kind}`;
    // Restart the pop animation.
    void this.banner.offsetWidth;
    this.banner.classList.add('pop');
    this.sub.textContent = sub;
    this.sub.classList.toggle('show', !!sub);
    if (ms > 0) this.bannerTimeout = window.setTimeout(() => this.hideBanner(), ms);
  }

  hideBanner() {
    this.banner.className = 'hud-banner';
    this.sub.classList.remove('show');
  }

  dispose() {
    clearTimeout(this.bannerTimeout);
    this.root.remove();
  }
}

export function formatTime(s: number): string {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
