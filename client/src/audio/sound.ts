/**
 * Every sound in the game is synthesised with WebAudio: no audio files to load or license.
 * The context is created on the first user gesture (browsers block audio before that).
 */
export type Sfx =
  | 'jump' | 'land' | 'dive' | 'bounce' | 'hit' | 'bump' | 'tick' | 'go' | 'qualify' | 'eliminated' | 'win' | 'click';

export class Sound {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sfxVol = 0.8;
  private musicVol = 0.35;
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  private wantMusic = false;

  constructor() {
    const unlock = () => {
      this.init();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
  }

  private init() {
    if (this.ctx) return;
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const master = ctx.createDynamicsCompressor();
      master.threshold.value = -12;
      master.connect(ctx.destination);
      this.sfxGain = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.sfxGain.connect(master);
      this.musicGain.connect(master);
      this.applyVolumes();
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.wantMusic) this.startMusic();
    } catch {
      this.ctx = null; // no audio support: stay silent
    }
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    this.sfxGain!.gain.value = this.sfxVol * 0.6;
    this.musicGain!.gain.value = this.musicVol * 0.22;
  }

  private osc(type: OscillatorType, t: number, dur: number, f0: number, f1: number, vol: number, dest?: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfxGain!);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  private burst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Plays a sound; `volume` scales it (e.g. by distance for other players). */
  play(name: Sfx, volume = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || volume <= 0.01) return;
    const t = this.ctx.currentTime + 0.005;
    const v = (x: number) => Math.min(1, x * volume);
    switch (name) {
      case 'jump':
        this.osc('triangle', t, 0.16, 330, 760, v(0.35));
        this.osc('sine', t, 0.12, 660, 1400, v(0.08));
        break;
      case 'land':
        this.osc('sine', t, 0.1, 150, 55, v(0.45));
        this.burst(t, 0.06, 'lowpass', 900, 300, v(0.12));
        break;
      case 'dive':
        this.burst(t, 0.28, 'bandpass', 1400, 380, v(0.32));
        this.osc('sine', t, 0.18, 420, 240, v(0.08));
        break;
      case 'bounce': {
        const o = this.osc('sine', t, 0.42, 180, 420, v(0.4));
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(760, t + 0.13);
        o.frequency.exponentialRampToValueAtTime(420, t + 0.4);
        const lfo = this.ctx.createOscillator();
        const depth = this.ctx.createGain();
        lfo.frequency.value = 17;
        depth.gain.value = 30;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + 0.45);
        break;
      }
      case 'hit':
        this.osc('triangle', t, 0.18, 240, 85, v(0.5));
        this.burst(t, 0.08, 'highpass', 2500, 1200, v(0.18));
        break;
      case 'bump':
        this.osc('sine', t, 0.09, 280, 170, v(0.22));
        break;
      case 'tick':
        this.osc('sine', t, 0.14, 660, 660, v(0.3));
        break;
      case 'go':
        this.osc('triangle', t, 0.5, 880, 880, v(0.3));
        this.osc('triangle', t, 0.5, 1318, 1318, v(0.22));
        break;
      case 'qualify':
        [523, 659, 784, 1047].forEach((f, i) => this.osc('triangle', t + i * 0.085, i === 3 ? 0.45 : 0.12, f, f, v(0.3)));
        break;
      case 'eliminated':
        [392, 349, 311, 262].forEach((f, i) => this.osc('sawtooth', t + i * 0.16, i === 3 ? 0.5 : 0.15, f, f * 0.94, v(0.12)));
        break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.osc('triangle', t + i * 0.11, i === 5 ? 0.8 : 0.14, f, f, v(0.3)));
        [523, 659, 784].forEach((f) => this.osc('sine', t + 0.66, 0.9, f, f, v(0.12)));
        break;
      case 'click':
        this.osc('sine', t, 0.04, 1800, 1500, v(0.12));
        break;
    }
  }

  // ------------------------------------------------------------------ music

  /** A bouncy loop: C - Am - F - G, bass on the beat, chord stabs on the offbeat, a little pentatonic tune. */
  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || this.musicTimer) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 100);
  }

  stopMusic() {
    this.wantMusic = false;
    clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / 124 / 2; // eighth notes at 124 bpm
    const chords = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
    const tune = [72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 69, 72, 0, 74, 76, 0, 77, 0, 76, 74, 0, 72, 74, 0, 79, 0, 77, 76, 74, 0, 72, 0];
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextBeat < ctx.currentTime + 0.35) {
      const t = this.nextBeat;
      const step = this.beat % 32;
      const chord = chords[Math.floor(step / 8) % 4];
      const g = this.musicGain!;
      if (step % 2 === 0) this.osc('triangle', t, spb * 1.6, hz(chord[0] - 12), hz(chord[0] - 12), 0.5, g);
      else for (const n of chord) this.osc('square', t, spb * 0.5, hz(n + 12), hz(n + 12), 0.05, g);
      const m = tune[step];
      if (m) this.osc('triangle', t, spb * 0.9, hz(m), hz(m), 0.18, g);
      this.nextBeat += spb;
      this.beat++;
    }
  }
}

export const sound = new Sound();
