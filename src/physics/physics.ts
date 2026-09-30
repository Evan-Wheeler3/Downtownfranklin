import RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;

let ready: Promise<Rapier> | null = null;

/** Initialise the Rapier WASM module once. */
export function initRapier(): Promise<Rapier> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

export interface TriMeshArrays {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Owns the Rapier world. Static colliders are grouped by an owner key (a chunk id)
 * so streaming can add/remove a chunk's collision in one call.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private readonly owners = new Map<string, RAPIER.Collider[]>();

  constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
  }

  addStaticTriMesh(owner: string, mesh: TriMeshArrays): void {
    if (mesh.indices.length === 0) return;
    const desc = this.R.ColliderDesc.trimesh(mesh.positions, mesh.indices);
    const col = this.world.createCollider(desc);
    let list = this.owners.get(owner);
    if (!list) this.owners.set(owner, (list = []));
    list.push(col);
  }

  removeOwner(owner: string): void {
    const list = this.owners.get(owner);
    if (!list) return;
    for (const c of list) this.world.removeCollider(c, false);
    this.owners.delete(owner);
  }

  hasOwner(owner: string): boolean {
    return this.owners.has(owner);
  }

  get colliderCount(): number {
    let n = 0;
    for (const l of this.owners.values()) n += l.length;
    return n;
  }

  /** Downward ray cast; returns hit y or null. */
  groundAt(x: number, z: number, fromY = 500, maxDist = 1000): number | null {
    const ray = new this.R.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, maxDist, true);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }
}
