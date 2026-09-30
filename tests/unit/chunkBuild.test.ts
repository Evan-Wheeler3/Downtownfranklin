import { describe, expect, it } from 'vitest';
import { buildChunk, transferables } from '../../src/world/chunkBuild';
import { chunkAt, loadManifest } from './helpers';

describe('buildChunk (worker payload)', () => {
  const m = loadManifest();
  const data = chunkAt(m, m.spawn!.pos[0], m.spawn!.pos[2]);

  it('LOD0 builds all mesh groups and collision soups', () => {
    const b = buildChunk(data, 0);
    expect(b.meshes.terrain).toBeDefined();
    expect(b.meshes['buildings.upper']).toBeDefined();
    expect(b.meshes.roads).toBeDefined();
    expect(b.collision.length).toBeGreaterThanOrEqual(2);
    expect(b.heights.length).toBe(data.terrain.n ** 2);
    const t = b.meshes.terrain!;
    expect(t.normals.length).toBe(t.positions.length);
    // terrain normals point up
    for (let i = 1; i < t.normals.length; i += 3) expect(t.normals[i]!).toBeGreaterThan(0.5);
  });

  it('LOD1 is coarser and carries no collision', () => {
    const b0 = buildChunk(data, 0);
    const b1 = buildChunk(data, 1);
    expect(b1.collision.length).toBe(0);
    expect(b1.meshes.terrain!.indices.length).toBeLessThan(b0.meshes.terrain!.indices.length / 8);
  });

  it('transferables are unique buffers', () => {
    const b = buildChunk(data, 0);
    const t = transferables(b);
    expect(new Set(t).size).toBe(t.length);
    expect(t.length).toBeGreaterThan(5);
  });
});
