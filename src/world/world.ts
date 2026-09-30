import * as THREE from 'three/webgpu';
import type { PhysicsWorld } from '../physics/physics';
import { groundTexture, roofTexture, storefrontTexture, upperFacadeTexture } from '../render/textures';
import { buildChunk, type BuiltChunk, type MeshArrays, type MeshName } from './chunkBuild';
import { StreamingPolicy, type StreamingRadii, DEFAULT_RADII } from './streaming';
import { sampleTerrain, type DecodedTerrain } from './terrain';
import { WORLD_SCHEMA_VERSION, type ChunkData, type WorldManifest } from './types';
import { ChunkWorkerPool, type ChunkResult } from './workerPool';

interface ResidentChunk {
  id: string;
  data: ChunkData;
  terrain: DecodedTerrain;
  group: THREE.Group;
  lod: 0 | 1;
  physics: boolean;
  collision: BuiltChunk['collision'];
}

export interface WorldStats {
  resident: number;
  loading: number;
  physicsChunks: number;
  buildingsResident: number;
  /** Worker-side (or fallback) geometry build time. */
  lastChunkBuildMs: number;
  maxChunkBuildMs: number;
  /** Main-thread time to apply a built chunk (GPU buffers + colliders). */
  lastApplyMs: number;
  maxApplyMs: number;
  chunksBuilt: number;
  staleResults: number;
  workers: number;
}

const MATERIAL_FOR: Record<MeshName, string> = {
  terrain: 'terrain',
  'buildings.upper': 'upper',
  'buildings.storefront': 'storefront',
  'buildings.roof': 'roof',
  roads: 'road',
  areas: 'area',
};

function toGeometry(m: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  if (m.colors) g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Streams world chunks around a focus point. Chunk JSON is fetched and turned into
 * typed arrays by a worker pool; the main thread only creates GPU buffers and colliders,
 * within a per-frame budget. Stale results (chunk no longer wanted, or superseded LOD)
 * are discarded.
 */
export class World {
  readonly root = new THREE.Group();
  readonly policy: StreamingPolicy;
  private resident = new Map<string, ResidentChunk>();
  /** id -> LOD currently being built for it. */
  private inflight = new Map<string, 0 | 1>();
  private ready: { id: string; lod: 0 | 1; result: ChunkResult }[] = [];
  /** Exponential backoff for chunks whose fetch/build failed: id -> earliest retry time. */
  private failures = new Map<string, number>();
  private failCounts = new Map<string, number>();
  private readonly maxInflight: number;
  private readonly materials: Record<string, THREE.Material>;
  private readonly pool: ChunkWorkerPool | null;
  readonly stats: WorldStats = {
    resident: 0, loading: 0, physicsChunks: 0, buildingsResident: 0, lastChunkBuildMs: 0,
    maxChunkBuildMs: 0, lastApplyMs: 0, maxApplyMs: 0, chunksBuilt: 0, staleResults: 0, workers: 0,
  };
  focus = { x: 0, z: 0 };

  constructor(
    readonly manifest: WorldManifest,
    private readonly baseUrl: string,
    private readonly physics: PhysicsWorld,
    radii: StreamingRadii = DEFAULT_RADII,
    opts: { workers?: boolean } = {},
  ) {
    if (manifest.schemaVersion !== WORLD_SCHEMA_VERSION) {
      throw new Error(`world schema ${manifest.schemaVersion} != runtime ${WORLD_SCHEMA_VERSION}`);
    }
    this.policy = new StreamingPolicy(manifest.chunks, manifest.chunkSize, radii);
    this.root.name = 'world';
    this.pool = opts.workers !== false && typeof Worker !== 'undefined' ? new ChunkWorkerPool() : null;
    this.stats.workers = this.pool?.size ?? 0;
    this.maxInflight = Math.max(4, (this.pool?.size ?? 1) * 3);
    this.materials = {
      terrain: new THREE.MeshStandardMaterial({ color: 0x7d9a5b, map: groundTexture(), roughness: 0.95 }),
      upper: new THREE.MeshStandardMaterial({ vertexColors: true, map: upperFacadeTexture(), roughness: 0.85 }),
      storefront: new THREE.MeshStandardMaterial({ vertexColors: true, map: storefrontTexture(), roughness: 0.6 }),
      roof: new THREE.MeshStandardMaterial({ vertexColors: true, map: roofTexture(), roughness: 0.9 }),
      road: new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
      area: new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }),
    };
  }

  static async load(baseUrl: string, physics: PhysicsWorld, radii?: StreamingRadii, opts?: { workers?: boolean }): Promise<World> {
    const res = await fetch(`${baseUrl}/manifest.json`);
    if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
    return new World((await res.json()) as WorldManifest, baseUrl, physics, radii, opts);
  }

  private chunkIdAt(x: number, z: number): string {
    const s = this.manifest.chunkSize;
    return `c_${Math.floor(x / s)}_${Math.floor(z / s)}`;
  }

  /** Terrain height (datum-relative) at x/z from any resident chunk; NaN if not resident. */
  heightAt(x: number, z: number): number {
    const c = this.resident.get(this.chunkIdAt(x, z));
    return c ? sampleTerrain(c.terrain, x, z) : Number.NaN;
  }

  isPhysicsReadyAt(x: number, z: number): boolean {
    return this.resident.get(this.chunkIdAt(x, z))?.physics === true;
  }

  /** Call every frame. `budgetMs` bounds main-thread time spent applying built chunks. */
  update(budgetMs = 4): void {
    const wants = this.policy.evaluate(this.focus.x, this.focus.z, this.resident);
    const wanted = new Map(wants.map((w) => [w.id, w]));

    for (const [id, c] of this.resident) {
      const w = wanted.get(id);
      if (!w) {
        this.unload(id);
        continue;
      }
      const needLod = World.neededLod(w);
      if (needLod !== c.lod) {
        if (this.inflight.size < this.maxInflight) this.request(id, needLod);
      } else {
        // Resident LOD is what we want: cancel any in-flight rebuild to another LOD, so a late
        // result can never replace (and strip collision from) the current chunk.
        this.inflight.delete(id);
        if (w.physics !== c.physics) this.setPhysics(c, w.physics);
      }
    }
    for (const w of wants) {
      if (this.inflight.size >= this.maxInflight) break;
      if (!this.resident.has(w.id)) this.request(w.id, World.neededLod(w));
    }

    // Apply finished builds nearest-first within the frame budget (always at least one).
    if (this.ready.length) {
      this.ready.sort((a, b) => (wanted.get(a.id)?.dist ?? 1e9) - (wanted.get(b.id)?.dist ?? 1e9));
      const t0 = performance.now();
      while (this.ready.length && (performance.now() - t0 < budgetMs)) {
        const item = this.ready.shift()!;
        const w = wanted.get(item.id);
        if (!w || World.neededLod(w) !== item.lod) {
          this.stats.staleResults++;
          continue;
        }
        const t1 = performance.now();
        this.apply(item.id, item.lod, item.result, w.physics);
        const dt = performance.now() - t1;
        this.stats.lastApplyMs = dt;
        this.stats.maxApplyMs = Math.max(this.stats.maxApplyMs, dt);
      }
    }
    this.stats.resident = this.resident.size;
    this.stats.loading = this.inflight.size + this.ready.length;
    let phys = 0;
    let b = 0;
    for (const c of this.resident.values()) {
      if (c.physics) phys++;
      b += c.data.buildings.length;
    }
    this.stats.physicsChunks = phys;
    this.stats.buildingsResident = b;
  }

  /** Physics needs LOD0 collision arrays, so a physics chunk is always built at LOD0. */
  static neededLod(w: { lod: 0 | 1; physics: boolean }): 0 | 1 {
    return w.physics ? 0 : w.lod;
  }

  /** Whether every chunk the policy wants is resident at the wanted LOD/physics state. */
  get settled(): boolean {
    const wants = this.policy.evaluate(this.focus.x, this.focus.z, this.resident);
    return wants.every((w) => {
      const c = this.resident.get(w.id);
      return c && c.lod === World.neededLod(w) && c.physics === w.physics;
    });
  }

  private request(id: string, lod: 0 | 1): void {
    if (this.inflight.get(id) === lod) return;
    const retryAt = this.failures.get(id);
    if (retryAt !== undefined && performance.now() < retryAt) return;
    if (this.ready.some((r) => r.id === id && r.lod === lod)) return;
    const entry = this.policy.get(id);
    if (!entry) return;
    this.inflight.set(id, lod);
    const url = new URL(`${this.baseUrl}/${entry.file}`, location.href).href;
    const job: Promise<ChunkResult> = this.pool
      ? this.pool.request(url, lod)
      : fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`chunk ${id}: ${r.status}`);
            return r.json() as Promise<ChunkData>;
          })
          .then((data) => ({ data, built: buildChunk(data, lod), fetchMs: 0 }));
    job
      .then((result) => {
        // Superseded by a newer request for a different LOD?
        if (this.inflight.get(id) !== lod) {
          this.stats.staleResults++;
          return;
        }
        this.inflight.delete(id);
        this.failures.delete(id);
        this.failCounts.delete(id);
        this.ready.push({ id, lod, result });
        this.stats.lastChunkBuildMs = result.built.buildMs;
        this.stats.maxChunkBuildMs = Math.max(this.stats.maxChunkBuildMs, result.built.buildMs);
      })
      .catch((e) => {
        if (this.inflight.get(id) === lod) this.inflight.delete(id);
        const n = (this.failCounts.get(id) ?? 0) + 1;
        this.failCounts.set(id, n);
        this.failures.set(id, performance.now() + Math.min(30_000, 500 * 2 ** n));
        console.error(e);
      });
  }

  private apply(id: string, lod: 0 | 1, r: ChunkResult, physics: boolean): void {
    const old = this.resident.get(id);
    const n = r.data.terrain.n;
    const terrain: DecodedTerrain = {
      ox: r.data.terrain.origin[0], oz: r.data.terrain.origin[1], spacing: r.data.terrain.spacing, n, heights: r.built.heights,
    };
    const group = new THREE.Group();
    group.name = id;
    for (const [name, arrays] of Object.entries(r.built.meshes) as [MeshName, MeshArrays | undefined][]) {
      if (!arrays) continue;
      const mesh = new THREE.Mesh(toGeometry(arrays), this.materials[MATERIAL_FOR[name]]!);
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.castShadow = lod === 0 && name.startsWith('buildings');
      group.add(mesh);
    }
    if (old) {
      if (old.physics) this.physics.removeOwner(id);
      this.disposeGroup(old.group);
      this.root.remove(old.group);
    }
    const c: ResidentChunk = { id, data: r.data, terrain, group, lod, physics: false, collision: r.built.collision };
    this.root.add(group);
    this.resident.set(id, c);
    if (physics && lod === 0) this.setPhysics(c, true);
    this.stats.chunksBuilt++;
  }

  private setPhysics(c: ResidentChunk, on: boolean): void {
    if (on === c.physics) return;
    if (on) {
      if (c.lod !== 0) return; // caller requests LOD0 first
      this.physics.addHeightfield(c.id, c.terrain);
      for (const m of c.collision) this.physics.addStaticTriMesh(c.id, m);
    } else {
      this.physics.removeOwner(c.id);
    }
    c.physics = on;
  }

  private unload(id: string): void {
    const c = this.resident.get(id);
    if (!c) return;
    if (c.physics) this.physics.removeOwner(id);
    this.disposeGroup(c.group);
    this.root.remove(c.group);
    this.resident.delete(id);
    this.inflight.delete(id);
  }

  private disposeGroup(g: THREE.Group): void {
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
  }

  residentChunks(): Iterable<ResidentChunk> {
    return this.resident.values();
  }
}
