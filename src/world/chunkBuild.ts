/**
 * Chunk data -> render/collision arrays. Pure and DOM-free so it runs in a Web Worker
 * (chunkWorker.ts) or on the main thread (fallback, tests).
 */
import { appendArea, appendBuilding, appendRoad, MeshBuilder, newBuildingMeshes } from './geometry';
import { decodeTerrain, sampleTerrain, terrainMeshArrays } from './terrain';
import type { ChunkData } from './types';

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  colors?: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export type MeshName = 'terrain' | 'buildings.upper' | 'buildings.storefront' | 'buildings.roof' | 'roads' | 'areas';

export interface BuiltChunk {
  id: string;
  lod: 0 | 1;
  /** Decoded terrain heights (metres rel. datum), row-major n*n. */
  heights: Float32Array;
  meshes: Partial<Record<MeshName, MeshArrays>>;
  /** Static collision soups (only for LOD0). References the same buffers as meshes where possible. */
  collision: { positions: Float32Array; indices: Uint32Array }[];
  buildMs: number;
}

function pack(m: MeshBuilder): MeshArrays | undefined {
  if (!m.indices.length) return undefined;
  return {
    positions: new Float32Array(m.positions),
    normals: new Float32Array(m.normals),
    colors: new Float32Array(m.colors),
    uvs: new Float32Array(m.uvs),
    indices: new Uint32Array(m.indices),
  };
}

export function buildChunk(data: ChunkData, lod: 0 | 1): BuiltChunk {
  const t0 = performance.now();
  const terrain = decodeTerrain(data.terrain);
  const meshes: BuiltChunk['meshes'] = {};
  const collision: BuiltChunk['collision'] = [];

  const ta = terrainMeshArrays(terrain, lod === 0 ? 1 : 4);
  meshes.terrain = { positions: ta.positions, normals: ta.normals, uvs: ta.uvs, indices: ta.indices };
  if (lod === 0) collision.push({ positions: ta.positions, indices: ta.indices });

  const bm = newBuildingMeshes();
  for (const b of data.buildings) appendBuilding(bm, b);
  meshes['buildings.upper'] = pack(bm.upper);
  meshes['buildings.storefront'] = pack(bm.storefront);
  meshes['buildings.roof'] = pack(bm.roof);
  if (lod === 0) {
    for (const k of ['buildings.upper', 'buildings.storefront', 'buildings.roof'] as const) {
      const m = meshes[k];
      if (m) collision.push({ positions: m.positions, indices: m.indices });
    }
  }

  const rm = new MeshBuilder();
  for (const r of data.roads) appendRoad(rm, r);
  meshes.roads = pack(rm);
  const am = new MeshBuilder();
  for (const a of data.areas) appendArea(am, a, (x, z) => sampleTerrain(terrain, x, z));
  meshes.areas = pack(am);

  return { id: data.id, lod, heights: terrain.heights, meshes, collision, buildMs: performance.now() - t0 };
}

/** Transferable buffers of a built chunk (deduplicated). */
export function transferables(b: BuiltChunk): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>([b.heights.buffer as ArrayBuffer]);
  for (const m of Object.values(b.meshes)) {
    if (!m) continue;
    for (const a of [m.positions, m.normals, m.colors, m.uvs, m.indices]) if (a) set.add(a.buffer as ArrayBuffer);
  }
  return [...set];
}
