/**
 * Chunk data -> stylised voxel meshes + collision. Pure and DOM-free so it runs in a Web
 * Worker (chunkWorker.ts) or on the main thread (fallback, tests).
 */
import { BLOCKS, ID_MASK, isOpaqueCube } from '../voxel/blocks';
import { generateChunk } from '../voxel/generate';
import { meshVolume, type GroupBuilder, type MeshGroup } from '../voxel/mesher';
import type { ChunkData } from './types';

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  tex: Float32Array;
  indices: Uint32Array;
}

export type MeshName = MeshGroup;

export interface BuiltChunk {
  id: string;
  lod: 0 | 1;
  /** Walkable ground heightfield: (n x n) vertices on integer cells, row-major z, metres rel. datum. */
  heights: Float32Array;
  hfOrigin: [number, number];
  hfN: number;
  meshes: Partial<Record<MeshName, MeshArrays>>;
  /** Exposed collidable structure voxels (x,y,z world cell triples). Only for LOD0. */
  voxels: Int32Array;
  stats: { quads: number; buildings: number; trees: number; lamps: number; voxels: number; genMs: number; meshMs: number };
  buildMs: number;
}

function pack(g: GroupBuilder): MeshArrays | undefined {
  if (!g.indices.length) return undefined;
  return {
    positions: new Float32Array(g.positions),
    normals: new Float32Array(g.normals),
    colors: new Float32Array(g.colors),
    tex: new Float32Array(g.tex),
    indices: new Uint32Array(g.indices),
  };
}

export function buildChunk(data: ChunkData, lod: 0 | 1): BuiltChunk {
  const t0 = performance.now();
  const gen = generateChunk(data);
  const t1 = performance.now();
  const mesh = meshVolume(gen.vol, lod === 0 ? {} : { ao: false, plants: false });
  const t2 = performance.now();

  const meshes: BuiltChunk['meshes'] = {};
  for (const k of Object.keys(mesh.groups) as MeshGroup[]) meshes[k] = pack(mesh.groups[k]);

  // Ground heightfield on the integer lattice: average of the (up to) four adjacent columns.
  const C = 128;
  const n = C + 1;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let s = 0, k = 0;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
      const ci = i + di, cj = j + dj;
      if (ci < 0 || cj < 0 || ci >= C || cj >= C) continue;
      s += gen.surface[cj * C + ci]!;
      k++;
    }
    heights[j * n + i] = s / k;
  }

  // Exposed collidable structure voxels (hollow interiors keep this small).
  const vol = gen.vol;
  const vox: number[] = [];
  if (lod === 0) {
    for (let y = 0; y < vol.sy; y++) for (let z = 0; z < vol.sz; z++) for (let x = 0; x < vol.sx; x++) {
      const idx = (y * vol.sz + z) * vol.sx + x;
      if (!vol.structure[idx]) continue;
      const v = vol.data[idx]!;
      if (!BLOCKS[v & ID_MASK]!.collide) continue;
      const wx = vol.ox + x, wy = vol.oy + y, wz = vol.oz + z;
      let exposed = false;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        if (!isOpaqueCube(vol.get(wx + dx, wy + dy, wz + dz))) { exposed = true; break; }
      }
      if (exposed) vox.push(wx, wy, wz);
    }
  }

  return {
    id: data.id, lod, heights, hfOrigin: [gen.x0, gen.z0], hfN: n, meshes, voxels: new Int32Array(vox),
    stats: { quads: mesh.quads, ...gen.stats, voxels: vox.length / 3, genMs: t1 - t0, meshMs: t2 - t1 },
    buildMs: performance.now() - t0,
  };
}

/** Transferable buffers of a built chunk (deduplicated). */
export function transferables(b: BuiltChunk): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>([b.heights.buffer as ArrayBuffer, b.voxels.buffer as ArrayBuffer]);
  for (const m of Object.values(b.meshes)) {
    if (!m) continue;
    for (const a of [m.positions, m.normals, m.colors, m.tex, m.indices]) set.add(a.buffer as ArrayBuffer);
  }
  return [...set];
}
