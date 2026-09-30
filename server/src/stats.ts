/** Per-room performance counters, exposed at /metrics for the load-test script. */
export interface RoomStats {
  roomId: string;
  players: number;
  bots: number;
  phase: string;
  ticks: number;
  tickAvgMs: number;
  tickP95Ms: number;
  tickMaxMs: number;
  /** Snapshot payload bytes sent per second (all clients). */
  bytesOutPerSec: number;
}

const WINDOW = 300;

export class TickMeter {
  private readonly samples = new Float64Array(WINDOW);
  private n = 0;
  private i = 0;
  private bytes = 0;
  private bytesT0 = Date.now();
  private bytesRate = 0;
  ticks = 0;

  sample(ms: number) {
    this.samples[this.i] = ms;
    this.i = (this.i + 1) % WINDOW;
    this.n = Math.min(this.n + 1, WINDOW);
    this.ticks++;
  }

  addBytes(n: number) {
    this.bytes += n;
    const now = Date.now();
    if (now - this.bytesT0 >= 2000) {
      this.bytesRate = (this.bytes * 1000) / (now - this.bytesT0);
      this.bytes = 0;
      this.bytesT0 = now;
    }
  }

  summary() {
    const arr = Array.from(this.samples.subarray(0, this.n)).sort((a, b) => a - b);
    const avg = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    return {
      tickAvgMs: +avg.toFixed(3),
      tickP95Ms: +(arr[Math.floor(arr.length * 0.95)] ?? 0).toFixed(3),
      tickMaxMs: +(arr[arr.length - 1] ?? 0).toFixed(3),
      bytesOutPerSec: Math.round(this.bytesRate),
    };
  }
}

export const roomStats = new Map<string, () => RoomStats>();
