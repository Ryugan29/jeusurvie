// Mesure de fluidité (pure) : images/s moyennes et « 1 % low » (les à-coups ressentis) sur les N dernières images.

export interface FpsStats {
  readonly fps: number;
  readonly low1: number;
  readonly frames: number;
}

export class FpsMeter {
  private readonly samples: number[] = [];

  constructor(private readonly windowFrames = 600) {}

  record(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.samples.push(frameMs);
    if (this.samples.length > this.windowFrames) this.samples.shift();
  }

  stats(): FpsStats {
    const n = this.samples.length;
    if (n === 0) return { fps: 0, low1: 0, frames: 0 };
    const total = this.samples.reduce((s, v) => s + v, 0);
    const slowest = [...this.samples].sort((a, b) => b - a).slice(0, Math.max(1, Math.floor(n / 100)));
    const slowAvg = slowest.reduce((s, v) => s + v, 0) / slowest.length;
    return { fps: (1000 * n) / total, low1: 1000 / slowAvg, frames: n };
  }
}
