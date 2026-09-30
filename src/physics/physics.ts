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
  /** Colliders added/removed since the last step are invisible to queries until the next step. */
  private dirty = false;

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
    this.dirty = true;
  }

  /**
   * Static heightfield for a square terrain patch. `heights` is row-major with rows along +z
   * (index = iz * n + ix), as produced by decodeTerrain. Rapier wants an (n x n) column-major
   * matrix whose rows run along x, centred on the collider origin — hence the transpose below.
   * Layout verified by tests/unit/physics.test.ts (raycast == bilinear terrain sample).
   */
  addHeightfield(owner: string, t: { ox: number; oz: number; spacing: number; n: number; heights: Float32Array }): void {
    const n = t.n;
    const size = (n - 1) * t.spacing;
    const hf = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) hf[ix * n + iz] = t.heights[iz * n + ix]!;
    const desc = this.R.ColliderDesc.heightfield(n - 1, n - 1, hf, { x: size, y: 1, z: size })
      .setTranslation(t.ox + size / 2, 0, t.oz + size / 2);
    this.track(owner, this.world.createCollider(desc));
  }

  private track(owner: string, col: RAPIER.Collider): void {
    let list = this.owners.get(owner);
    if (!list) this.owners.set(owner, (list = []));
    list.push(col);
    this.dirty = true;
  }

  removeOwner(owner: string): void {
    const list = this.owners.get(owner);
    if (!list) return;
    for (const c of list) this.world.removeCollider(c, false);
    this.owners.delete(owner);
    this.dirty = true;
  }

  /**
   * Make pending collider/body changes visible to scene queries (ray casts, the character
   * controller). Rapier only updates its broad phase during a step, so this performs a
   * negligible step when something changed. Kinematic targets are absolute, so this is safe.
   */
  sync(): void {
    if (!this.dirty) return;
    this.world.timestep = 1e-5;
    this.world.step();
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }

  hasOwner(owner: string): boolean {
    return this.owners.has(owner);
  }

  get colliderCount(): number {
    let n = 0;
    for (const l of this.owners.values()) n += l.length;
    return n;
  }

  /** Downward ray cast against static geometry only (ignores the player's kinematic capsule). */
  groundAt(x: number, z: number, fromY = 500, maxDist = 1000): number | null {
    this.sync();
    const ray = new this.R.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, maxDist, true, this.R.QueryFilterFlags.EXCLUDE_KINEMATIC | this.R.QueryFilterFlags.EXCLUDE_DYNAMIC);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
    this.dirty = false;
  }
}
