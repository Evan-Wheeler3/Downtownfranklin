import { beforeAll, describe, expect, it } from 'vitest';
import { initRapier, PhysicsWorld, type Rapier } from '../../src/physics/physics';
import { PlayerController, type MoveIntent } from '../../src/player/controller';
import { decodeTerrain, sampleTerrain, terrainMeshArrays } from '../../src/world/terrain';
import { chunkAt, loadManifest } from './helpers';

let R: Rapier;
beforeAll(async () => {
  R = await initRapier();
});

const still: MoveIntent = { forward: 0, right: 0, sprint: false, jump: false, fly: false, up: 0 };

describe('collision', () => {
  it('terrain heightfield raycast matches terrain samples (layout check)', () => {
    const m = loadManifest();
    const c = chunkAt(m, m.spawn!.pos[0], m.spawn!.pos[2]);
    const t = decodeTerrain(c.terrain);
    const phys = new PhysicsWorld(R);
    phys.addHeightfield(c.id, t);
    // asymmetric sample points so a transposed/flipped layout would fail
    for (const [fx, fz] of [[0.1, 0.8], [0.5, 0.7], [0.9, 0.1], [0.33, 0.05], [0.77, 0.95]] as const) {
      const x = t.ox + fx * 128;
      const z = t.oz + fz * 128;
      const hit = phys.groundAt(x, z);
      expect(hit).not.toBeNull();
      expect(Math.abs(hit! - sampleTerrain(t, x, z))).toBeLessThan(0.05);
    }
  });

  it('terrain trimesh raycast matches terrain samples', () => {
    const m = loadManifest();
    const c = chunkAt(m, m.spawn!.pos[0], m.spawn!.pos[2]);
    const t = decodeTerrain(c.terrain);
    const phys = new PhysicsWorld(R);
    const a = terrainMeshArrays(t, 1);
    phys.addStaticTriMesh(c.id, { positions: a.positions, indices: a.indices });
    // no step: queries must see freshly added colliders
    for (const [fx, fz] of [[0.25, 0.25], [0.5, 0.7], [0.9, 0.1]] as const) {
      const x = t.ox + fx * 128;
      const z = t.oz + fz * 128;
      const hit = phys.groundAt(x, z);
      expect(hit).not.toBeNull();
      expect(Math.abs(hit! - sampleTerrain(t, x, z))).toBeLessThan(0.05);
    }
    phys.removeOwner(c.id);
    expect(phys.colliderCount).toBe(0);
  });

  it('player stands on ground, is blocked by a building wall, and steps up a kerb', () => {
    const phys = new PhysicsWorld(R);
    // flat ground 200x200
    const g = new Float32Array([-100, 0, -100, 100, 0, -100, 100, 0, 100, -100, 0, 100]);
    phys.addStaticTriMesh('ground', { positions: g, indices: new Uint32Array([0, 3, 1, 1, 3, 2]) });
    // a voxel wall whose south face is at z = -10 (cells z in [-20, -10), 8 high)
    const wall: number[] = [];
    for (let x = -10; x < 10; x++) for (let y = 0; y < 8; y++) for (let z = -20; z < -10; z++) wall.push(x, y, z);
    phys.addVoxels('b', new Int32Array(wall));
    // a 0.15 m kerb slab to the east: x in [20, 40]
    const k = new Float32Array([20, 0.15, -30, 40, 0.15, -30, 40, 0.15, 30, 20, 0.15, 30, 20, 0, -30, 20, 0, 30]);
    phys.addStaticTriMesh('kerb', { positions: k, indices: new Uint32Array([0, 3, 1, 1, 3, 2, 4, 5, 0, 0, 5, 3]) });

    const p = new PlayerController(phys);
    p.teleport(0, 1, 0);
    // the ground ray must ignore the player's own capsule
    expect(phys.groundAt(0, 0)!).toBeCloseTo(0, 2);
    // first update after teleport starts from the new position (not reported grounded mid-air)
    p.update(1 / 60, still, true);
    expect(p.grounded).toBe(false);
    phys.step(1 / 60);
    for (let i = 0; i < 120; i++) {
      p.update(1 / 60, still, true);
      phys.step(1 / 60);
    }
    expect(p.grounded).toBe(true);
    expect(Math.abs(p.pos.y)).toBeLessThan(0.1);

    // walk north (yaw 0 looks toward -z) into the wall for 20 s
    p.yaw = 0;
    for (let i = 0; i < 1200; i++) {
      p.update(1 / 60, { ...still, forward: 1, sprint: true }, true);
      phys.step(1 / 60);
    }
    expect(p.pos.z).toBeGreaterThan(-10); // never passed the facade
    expect(p.pos.z).toBeLessThan(-9); // but did reach it

    // walk east onto the kerb
    p.teleport(15, 0.02, 0);
    p.yaw = -Math.PI / 2; // looking toward +x
    for (let i = 0; i < 300; i++) {
      p.update(1 / 60, { ...still, forward: 1 }, true);
      phys.step(1 / 60);
    }
    expect(p.pos.x).toBeGreaterThan(20.5);
    expect(p.pos.y).toBeGreaterThan(0.1);
  });
});
