import { describe, expect, it } from 'vitest';
import { buildChunk, transferables } from '../../src/world/chunkBuild';
import { chunkAt, loadManifest } from './helpers';

describe('buildChunk (voxel worker payload)', () => {
  const m = loadManifest();
  const data = chunkAt(m, m.spawn!.pos[0], m.spawn!.pos[2]);
  const b = buildChunk(data, 0);

  it('produces block meshes, glass, lamps and a walkable heightfield', () => {
    expect(b.meshes.opaque!.indices.length).toBeGreaterThan(10_000);
    expect(b.meshes.glass).toBeDefined(); // windows / storefronts downtown
    expect(b.meshes.emissive).toBeDefined(); // street lamps
    expect(b.heights.length).toBe(b.hfN * b.hfN);
    expect(b.stats.buildings).toBeGreaterThan(5);
    expect(b.stats.trees + b.stats.lamps).toBeGreaterThan(3);
    for (const v of b.heights) expect(Number.isFinite(v)).toBe(true);
  });

  it('collision voxels are exposed structure cells only, and LOD1 has none', () => {
    expect(b.voxels.length % 3).toBe(0);
    expect(b.voxels.length / 3).toBeGreaterThan(500);
    expect(buildChunk(data, 1).voxels.length).toBe(0);
  });

  it('is deterministic', () => {
    const b2 = buildChunk(data, 0);
    expect(b2.meshes.opaque!.positions).toEqual(b.meshes.opaque!.positions);
  });

  it('transferables are unique buffers', () => {
    const t = transferables(b);
    expect(new Set(t).size).toBe(t.length);
  });
});
