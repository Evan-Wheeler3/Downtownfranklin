import type { ChunkIndexEntry } from './types';

/**
 * Pure spatial streaming policy: decides which chunks should be resident, which
 * should carry physics, and at which render LOD — from the viewer position only.
 * Hysteresis prevents thrashing at ring boundaries. No rendering or IO here.
 */
export interface StreamingRadii {
  /** Chunks nearer than this are rendered. */
  render: number;
  /** Chunks nearer than this get full-detail meshes (LOD0). */
  detail: number;
  /** Chunks nearer than this get colliders. */
  physics: number;
  /** Extra distance before a resident chunk is released from a ring. */
  hysteresis: number;
}

export const DEFAULT_RADII: StreamingRadii = { render: 560, detail: 280, physics: 96, hysteresis: 40 };

export interface ChunkWant {
  id: string;
  dist: number;
  lod: 0 | 1;
  physics: boolean;
}

export class StreamingPolicy {
  private readonly byId = new Map<string, ChunkIndexEntry>();

  constructor(
    readonly chunks: ChunkIndexEntry[],
    readonly chunkSize: number,
    readonly radii: StreamingRadii = DEFAULT_RADII,
  ) {
    for (const c of chunks) this.byId.set(c.id, c);
  }

  /** Distance on the ground plane from (x, z) to the chunk's square. */
  distanceTo(c: ChunkIndexEntry, x: number, z: number): number {
    const s = this.chunkSize;
    const dx = Math.max(c.cx * s - x, 0, x - (c.cx + 1) * s);
    const dz = Math.max(c.cz * s - z, 0, z - (c.cz + 1) * s);
    return Math.hypot(dx, dz);
  }

  /**
   * Desired residency given the viewer position and what is currently resident.
   * Result is sorted nearest-first so loaders can prioritise.
   */
  evaluate(x: number, z: number, resident: ReadonlyMap<string, { lod: 0 | 1; physics: boolean }>): ChunkWant[] {
    const r = this.radii;
    const out: ChunkWant[] = [];
    for (const c of this.chunks) {
      const d = this.distanceTo(c, x, z);
      const cur = resident.get(c.id);
      const renderR = cur ? r.render + r.hysteresis : r.render;
      if (d > renderR) continue;
      const detailR = cur?.lod === 0 ? r.detail + r.hysteresis : r.detail;
      const physR = cur?.physics ? r.physics + r.hysteresis : r.physics;
      out.push({ id: c.id, dist: d, lod: d <= detailR ? 0 : 1, physics: d <= physR });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  get(id: string): ChunkIndexEntry | undefined {
    return this.byId.get(id);
  }
}
