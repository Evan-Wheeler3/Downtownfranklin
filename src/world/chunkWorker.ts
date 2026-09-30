/// <reference lib="webworker" />
/**
 * Chunk worker: fetch + parse chunk JSON and build mesh/collision arrays off the main thread.
 * Protocol: in  { reqId, url, lod }  →  out { reqId, data, built } | { reqId, error }.
 * `data` is the parsed chunk minus the terrain payload (heights are returned decoded in `built`).
 */
import { buildChunk, transferables } from './chunkBuild';
import type { ChunkData } from './types';

export interface ChunkRequest {
  reqId: number;
  url: string;
  lod: 0 | 1;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (ev: MessageEvent<ChunkRequest>) => {
  const { reqId, url, lod } = ev.data;
  try {
    const t0 = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`chunk ${url}: HTTP ${res.status}`);
    const data = (await res.json()) as ChunkData;
    const fetchMs = performance.now() - t0;
    const built = buildChunk(data, lod);
    const slim: ChunkData = { ...data, terrain: { ...data.terrain, heightsCm: '' } };
    scope.postMessage({ reqId, data: slim, built, fetchMs }, transferables(built));
  } catch (e) {
    scope.postMessage({ reqId, error: String(e) });
  }
};
