import type { TerrainPatch } from './types';

export interface DecodedTerrain {
  ox: number;
  oz: number;
  spacing: number;
  n: number;
  /** metres relative to datum, row-major: index = iz * n + ix */
  heights: Float32Array;
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function decodeTerrain(p: TerrainPatch): DecodedTerrain {
  const bytes = b64ToBytes(p.heightsCm);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = p.n * p.n;
  if (bytes.byteLength !== count * 2) throw new Error(`terrain size mismatch: ${bytes.byteLength} != ${count * 2}`);
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) heights[i] = view.getInt16(i * 2, true) / 100;
  return { ox: p.origin[0], oz: p.origin[1], spacing: p.spacing, n: p.n, heights };
}

/** Bilinear height at world x/z, or NaN if outside this patch. */
export function sampleTerrain(t: DecodedTerrain, x: number, z: number): number {
  const fx = (x - t.ox) / t.spacing;
  const fz = (z - t.oz) / t.spacing;
  const max = t.n - 1;
  if (fx < 0 || fz < 0 || fx > max || fz > max) return Number.NaN;
  const ix = Math.min(Math.floor(fx), max - 1);
  const iz = Math.min(Math.floor(fz), max - 1);
  const ax = fx - ix;
  const az = fz - iz;
  const h = t.heights;
  const i00 = iz * t.n + ix;
  return (
    h[i00]! * (1 - ax) * (1 - az) +
    h[i00 + 1]! * ax * (1 - az) +
    h[i00 + t.n]! * (1 - ax) * az +
    h[i00 + t.n + 1]! * ax * az
  );
}

/** Grid mesh arrays for the patch at a given vertex step (1 = full resolution). */
export function terrainMeshArrays(t: DecodedTerrain, step: number) {
  const m = Math.floor((t.n - 1) / step) + 1;
  const positions = new Float32Array(m * m * 3);
  const uvs = new Float32Array(m * m * 2);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const k = j * m + i;
      const gi = Math.min(i * step, t.n - 1);
      const gj = Math.min(j * step, t.n - 1);
      const x = t.ox + gi * t.spacing;
      const z = t.oz + gj * t.spacing;
      positions[k * 3] = x;
      positions[k * 3 + 1] = t.heights[gj * t.n + gi]!;
      positions[k * 3 + 2] = z;
      uvs[k * 2] = x / 8;
      uvs[k * 2 + 1] = z / 8;
    }
  }
  // Normals by central differences on the full-resolution grid (continuous across chunks
  // except at the outermost ring, where one-sided differences are used).
  const normals = new Float32Array(m * m * 3);
  const H = (i: number, j: number) => t.heights[Math.min(t.n - 1, Math.max(0, j)) * t.n + Math.min(t.n - 1, Math.max(0, i))]!;
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const gi = Math.min(i * step, t.n - 1);
      const gj = Math.min(j * step, t.n - 1);
      const i0 = Math.max(0, gi - 1), i1 = Math.min(t.n - 1, gi + 1);
      const j0 = Math.max(0, gj - 1), j1 = Math.min(t.n - 1, gj + 1);
      const dhdx = (H(i1, gj) - H(i0, gj)) / ((i1 - i0) * t.spacing);
      const dhdz = (H(gi, j1) - H(gi, j0)) / ((j1 - j0) * t.spacing);
      const len = Math.hypot(dhdx, 1, dhdz);
      const k = (j * m + i) * 3;
      normals[k] = -dhdx / len;
      normals[k + 1] = 1 / len;
      normals[k + 2] = -dhdz / len;
    }
  }
  const indices = new Uint32Array((m - 1) * (m - 1) * 6);
  let o = 0;
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < m - 1; i++) {
      const a = j * m + i;
      const b = a + 1;
      const c = a + m;
      const d = c + 1;
      // CCW when viewed from +y with z pointing south
      indices[o++] = a;
      indices[o++] = c;
      indices[o++] = b;
      indices[o++] = b;
      indices[o++] = c;
      indices[o++] = d;
    }
  }
  return { positions, normals, uvs, indices, gridSize: m };
}
