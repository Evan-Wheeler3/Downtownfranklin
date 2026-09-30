/** Rolling frame-time statistics (last N frames). */
export class FrameStats {
  private frames: number[] = [];
  private cpu: number[] = [];
  constructor(private readonly size = 240) {}

  push(frameMs: number, cpuMs: number): void {
    this.frames.push(frameMs);
    this.cpu.push(cpuMs);
    if (this.frames.length > this.size) {
      this.frames.shift();
      this.cpu.shift();
    }
  }

  reset(): void {
    this.frames = [];
    this.cpu = [];
  }

  summary(): { fps: number; p50: number; p95: number; max: number; cpuAvg: number; n: number } {
    const n = this.frames.length;
    if (!n) return { fps: 0, p50: 0, p95: 0, max: 0, cpuAvg: 0, n };
    const s = [...this.frames].sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / n;
    return {
      fps: 1000 / avg,
      p50: s[Math.floor(n * 0.5)]!,
      p95: s[Math.min(n - 1, Math.floor(n * 0.95))]!,
      max: s[n - 1]!,
      cpuAvg: this.cpu.reduce((a, b) => a + b, 0) / n,
      n,
    };
  }
}
