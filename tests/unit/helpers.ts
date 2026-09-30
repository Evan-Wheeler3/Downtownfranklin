import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChunkData, WorldManifest } from '../../src/world/types';

export const WORLD_DIR = resolve(__dirname, '../../public/world');

export function loadManifest(): WorldManifest {
  return JSON.parse(readFileSync(resolve(WORLD_DIR, 'manifest.json'), 'utf8')) as WorldManifest;
}

export function loadChunk(file: string): ChunkData {
  return JSON.parse(readFileSync(resolve(WORLD_DIR, file), 'utf8')) as ChunkData;
}

export function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(WORLD_DIR, file), 'utf8')) as T;
}

/** Chunk containing game point (x, z). */
export function chunkAt(m: WorldManifest, x: number, z: number): ChunkData {
  const cx = Math.floor(x / m.chunkSize);
  const cz = Math.floor(z / m.chunkSize);
  const e = m.chunks.find((c) => c.cx === cx && c.cz === cz);
  if (!e) throw new Error(`no chunk at ${x},${z}`);
  return loadChunk(e.file);
}

/** Signed area of a ring in the (east, north) = (x, -z) plane; >0 means CCW. */
export function signedAreaEN(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i]!;
    const [x2, z2] = ring[(i + 1) % ring.length]!;
    a += x1 * -z2 - x2 * -z1;
  }
  return a / 2;
}

/** Polygon area centroid in (x, z). */
export function areaCentroid(ring: [number, number][]): [number, number] {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i]!;
    const [x2, z2] = ring[(i + 1) % ring.length]!;
    const f = x1 * z2 - x2 * z1;
    a += f;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  return [cx / (3 * a), cz / (3 * a)];
}
