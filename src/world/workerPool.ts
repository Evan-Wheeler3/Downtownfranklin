import type { BuiltChunk } from './chunkBuild';
import type { ChunkRequest } from './chunkWorker';
import type { ChunkData } from './types';

export interface ChunkResult {
  data: ChunkData;
  built: BuiltChunk;
  fetchMs: number;
}

interface Pending {
  resolve: (r: ChunkResult) => void;
  reject: (e: Error) => void;
}

/** Small pool of chunk workers; requests are assigned round-robin to the least-busy worker. */
export class ChunkWorkerPool {
  private workers: { w: Worker; busy: number }[] = [];
  private pending = new Map<number, Pending & { worker: number }>();
  private nextId = 1;

  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => this.onMessage(ev.data);
      w.onerror = (ev) => console.error('chunk worker error', ev.message);
      this.workers.push({ w, busy: 0 });
    }
  }

  get size(): number {
    return this.workers.length;
  }

  request(url: string, lod: 0 | 1): Promise<ChunkResult> {
    const reqId = this.nextId++;
    let best = 0;
    for (let i = 1; i < this.workers.length; i++) if (this.workers[i]!.busy < this.workers[best]!.busy) best = i;
    const slot = this.workers[best]!;
    slot.busy++;
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject, worker: best });
      const msg: ChunkRequest = { reqId, url, lod };
      slot.w.postMessage(msg);
    });
  }

  private onMessage(m: { reqId: number; error?: string } & Partial<ChunkResult>): void {
    const p = this.pending.get(m.reqId);
    if (!p) return;
    this.pending.delete(m.reqId);
    this.workers[p.worker]!.busy--;
    if (m.error || !m.data || !m.built) p.reject(new Error(m.error ?? 'bad worker reply'));
    else p.resolve({ data: m.data, built: m.built, fetchMs: m.fetchMs ?? 0 });
  }

  dispose(): void {
    for (const { w } of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.reject(new Error('pool disposed'));
    this.pending.clear();
  }
}
