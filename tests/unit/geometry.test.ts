import { describe, expect, it } from 'vitest';
import { appendBuilding, appendRibbon, MeshBuilder, newBuildingMeshes } from '../../src/world/geometry';
import { decodeTerrain, terrainMeshArrays } from '../../src/world/terrain';
import type { BuildingRecord } from '../../src/world/types';
import { chunkAt, loadManifest } from './helpers';

function faceNormal(pos: ArrayLike<number>, a: number, b: number, c: number): [number, number, number] {
  const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!;
  const ux = pos[b * 3]! - ax, uy = pos[b * 3 + 1]! - ay, uz = pos[b * 3 + 2]! - az;
  const vx = pos[c * 3]! - ax, vy = pos[c * 3 + 1]! - ay, vz = pos[c * 3 + 2]! - az;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

const box: BuildingRecord = {
  id: 'test', tier: 'ORDINARY', heightConf: 'TEST', base: 0, ground: 0, height: 10, cls: 'commercial',
  // CCW in (east, north): (0,0) -> (10,0) -> (10,N=10 => z=-10) -> (0,-10)
  footprint: [[0, 0], [10, 0], [10, -10], [0, -10]],
};

describe('building geometry', () => {
  it('walls face outward and roof faces up', () => {
    const m = newBuildingMeshes();
    appendBuilding(m, box);
    for (const mb of [m.upper, m.storefront]) {
      for (let i = 0; i < mb.indices.length; i += 3) {
        const [a, b, c] = [mb.indices[i]!, mb.indices[i + 1]!, mb.indices[i + 2]!];
        const n = faceNormal(mb.positions, a, b, c);
        const cx = (mb.positions[a * 3]! + mb.positions[b * 3]! + mb.positions[c * 3]!) / 3 - 5;
        const cz = (mb.positions[a * 3 + 2]! + mb.positions[b * 3 + 2]! + mb.positions[c * 3 + 2]!) / 3 + 5;
        expect(n[0] * cx + n[2] * cz).toBeGreaterThan(0); // points away from centre
        // stored vertex normal agrees with winding
        expect(n[0] * mb.normals[a * 3]! + n[2] * mb.normals[a * 3 + 2]!).toBeGreaterThan(0);
      }
    }
    expect(m.roof.indices.length).toBe(6);
    for (let i = 0; i < m.roof.indices.length; i += 3) {
      const n = faceNormal(m.roof.positions, m.roof.indices[i]!, m.roof.indices[i + 1]!, m.roof.indices[i + 2]!);
      expect(n[1]).toBeGreaterThan(0);
    }
  });

  it('courtyard (hole) walls face into the courtyard', () => {
    // Outer 30x30 CCW (east,north); hole 10x10 stored CW (east,north), as the pipeline emits.
    const holed: BuildingRecord = {
      ...box, id: 'holed',
      footprint: [[0, 0], [30, 0], [30, -30], [0, -30]],
      holes: [[[10, -10], [10, -20], [20, -20], [20, -10]]],
    };
    const m = newBuildingMeshes();
    appendBuilding(m, holed);
    let inner = 0;
    for (const mb of [m.upper, m.storefront]) {
      for (let i = 0; i < mb.indices.length; i += 3) {
        const [a, b, c] = [mb.indices[i]!, mb.indices[i + 1]!, mb.indices[i + 2]!];
        const px = (mb.positions[a * 3]! + mb.positions[b * 3]! + mb.positions[c * 3]!) / 3;
        const pz = (mb.positions[a * 3 + 2]! + mb.positions[b * 3 + 2]! + mb.positions[c * 3 + 2]!) / 3;
        const onHole = px > 9.9 && px < 20.1 && pz < -9.9 && pz > -20.1;
        if (!onHole) continue;
        inner++;
        const n = faceNormal(mb.positions, a, b, c);
        // courtyard centre is (15, -15): hole walls must face toward it
        expect(n[0] * (15 - px) + n[2] * (-15 - pz)).toBeGreaterThan(0);
      }
    }
    expect(inner).toBeGreaterThan(0);
  });

  it('real downtown buildings produce upward roofs', () => {
    const man = loadManifest();
    const c = chunkAt(man, man.spawn!.pos[0], man.spawn!.pos[2]);
    const m = newBuildingMeshes();
    for (const b of c.buildings) appendBuilding(m, b);
    expect(m.roof.indices.length).toBeGreaterThan(0);
    let down = 0;
    for (let i = 0; i < m.roof.indices.length; i += 3) {
      const n = faceNormal(m.roof.positions, m.roof.indices[i]!, m.roof.indices[i + 1]!, m.roof.indices[i + 2]!);
      if (n[1] < 0) down++;
    }
    expect(down).toBe(0);
  });
});

describe('ribbons and terrain', () => {
  it('ribbon faces up for any direction', () => {
    for (const pts of [
      [[0, 0, 0], [10, 0, 0], [20, 0, 5]],
      [[0, 0, 0], [0, 0, -10]],
      [[5, 1, 5], [-5, 1, -5]],
    ] as [number, number, number][][]) {
      const m = new MeshBuilder();
      appendRibbon(m, pts, 6, 0.1, [1, 1, 1], 4, 2);
      for (let i = 0; i < m.indices.length; i += 3) {
        const n = faceNormal(m.positions, m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!);
        expect(n[1]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('terrain mesh faces up', () => {
    const man = loadManifest();
    const c = chunkAt(man, 0, 0);
    const t = decodeTerrain(c.terrain);
    const a = terrainMeshArrays(t, 4);
    for (let i = 0; i < a.indices.length; i += 3) {
      const n = faceNormal(a.positions, a.indices[i]!, a.indices[i + 1]!, a.indices[i + 2]!);
      expect(n[1]).toBeGreaterThan(0);
    }
  });
});
