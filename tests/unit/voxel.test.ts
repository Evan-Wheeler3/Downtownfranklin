import { describe, expect, it } from 'vitest';
import { B, SLAB } from '../../src/voxel/blocks';
import { meshVolume } from '../../src/voxel/mesher';
import { VoxelVolume } from '../../src/voxel/volume';

function faceNormal(pos: number[], a: number, b: number, c: number): [number, number, number] {
  const ux = pos[b * 3]! - pos[a * 3]!, uy = pos[b * 3 + 1]! - pos[a * 3 + 1]!, uz = pos[b * 3 + 2]! - pos[a * 3 + 2]!;
  const vx = pos[c * 3]! - pos[a * 3]!, vy = pos[c * 3 + 1]! - pos[a * 3 + 1]!, vz = pos[c * 3 + 2]! - pos[a * 3 + 2]!;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

describe('voxel mesher', () => {
  it('a single cube emits 6 outward faces', () => {
    const v = new VoxelVolume(-2, -2, -2, 5, 5, 5);
    v.set(0, 0, 0, B.brick_red!);
    const m = meshVolume(v);
    const g = m.groups.opaque;
    expect(m.quads).toBe(6);
    expect(g.indices.length).toBe(36);
    for (let i = 0; i < g.indices.length; i += 3) {
      const n = faceNormal(g.positions, g.indices[i]!, g.indices[i + 1]!, g.indices[i + 2]!);
      const a = g.indices[i]!;
      // stored normal and winding agree, and point away from the cube centre
      const sn = [g.normals[a * 3]!, g.normals[a * 3 + 1]!, g.normals[a * 3 + 2]!];
      expect(n[0] * sn[0]! + n[1] * sn[1]! + n[2] * sn[2]!).toBeGreaterThan(0);
      const cx = g.positions[a * 3]! - 0.5, cy = g.positions[a * 3 + 1]! - 0.5, cz = g.positions[a * 3 + 2]! - 0.5;
      expect(cx * sn[0]! + cy * sn[1]! + cz * sn[2]!).toBeGreaterThan(0);
    }
  });

  it('greedy-merges a flat floor into one top quad and hides shared faces', () => {
    const v = new VoxelVolume(0, 0, 0, 10, 3, 10);
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) v.set(x, 0, z, B.sidewalk!);
    const m = meshVolume(v);
    // top 1 + bottom 1 + 4 sides (each a 10x1 strip)
    expect(m.quads).toBe(6);
  });

  it('bakes ambient occlusion into the floor next to a wall', () => {
    const v = new VoxelVolume(0, 0, 0, 6, 4, 6);
    for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) v.set(x, 0, z, B.sidewalk!);
    for (let z = 0; z < 6; z++) v.set(3, 1, z, B.brick_red!);
    const g = meshVolume(v).groups.opaque;
    let minTop = Infinity, maxTop = 0;
    for (let i = 0; i < g.positions.length / 3; i++) {
      if (g.normals[i * 3 + 1] !== 1 || g.positions[i * 3 + 1] !== 1) continue;
      minTop = Math.min(minTop, g.colors[i * 3]!);
      maxTop = Math.max(maxTop, g.colors[i * 3]!);
    }
    expect(minTop).toBeLessThan(maxTop * 0.9);
  });

  it('slabs are half height and glass does not show internal faces', () => {
    const v = new VoxelVolume(0, 0, 0, 4, 4, 4);
    v.set(1, 1, 1, B.grass! | SLAB);
    const s = meshVolume(v).groups.opaque;
    const ys = s.positions.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBe(1.5);
    const w = new VoxelVolume(0, 0, 0, 4, 4, 4);
    w.set(1, 1, 1, B.glass!);
    w.set(2, 1, 1, B.glass!);
    expect(meshVolume(w).quads).toBe(6); // merged pane, no faces between the two blocks
  });
});
