/**
 * Chunk data (real street layout, footprints, terrain) -> stylised voxel volume.
 * Geography is the skeleton; everything visual here is art-directed procedural content.
 * Deterministic: all variation comes from hashes of ids/coordinates.
 */
import { fnv1a } from '../core/hash';
import { decodeTerrain, sampleTerrain, type DecodedTerrain } from '../world/terrain';
import type { AreaRecord, BuildingRecord, ChunkData, RoadRibbon, Vec2 } from '../world/types';
import { B, SLAB } from './blocks';
import { VoxelVolume } from './volume';

// Surface classes per column
export const enum S {
  Grass = 0, Road, Sidewalk, Parking, Water, Park, Path, Curb, LineYellow, LineWhite, Building, Gravel, Plaza,
}

const CHUNK = 128;

export interface GeneratedChunk {
  vol: VoxelVolume;
  /** Column surface heights (metres, quantised to 0.5) for x0..x0+128, z0..z0+128, row-major z. */
  surface: Float32Array;
  surfaceClass: Uint8Array;
  x0: number;
  z0: number;
  stats: { buildings: number; trees: number; lamps: number };
}

function hash2(x: number, z: number, salt = 0): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]!;
}

function pointInRing(x: number, z: number, r: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i]!;
    const [xj, zj] = r[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, z: number, ring: Vec2[], holes?: Vec2[][]): boolean {
  if (!pointInRing(x, z, ring)) return false;
  for (const h of holes ?? []) if (pointInRing(x, z, h)) return false;
  return true;
}

function ringBBox(r: Vec2[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, z] of r) {
    a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z);
  }
  return [a, b, c, d];
}

// ------------------------------------------------------------------------------------
// Building planning

type Archetype = 'shop' | 'block' | 'house' | 'church' | 'garage';

interface Plan {
  b: BuildingRecord;
  cells: Set<number>; // packed (x - bx0) + (z - bz0) * w
  bx0: number;
  bz0: number;
  w: number;
  h: number;
  gy: number; // ground floor level (cell y)
  base: number; // foundation bottom
  H: number; // wall height in blocks
  arch: Archetype;
  seed: number;
  roofRise: number;
}

const SHOP_WALLS = ['brick_red', 'brick_dark', 'brick_orange', 'brick_painted_white', 'stucco_cream', 'stone_tan', 'stucco_sage', 'stucco_peach', 'brick_red', 'brick_orange'];
const BLOCK_WALLS = ['stone_tan', 'stone_grey', 'brick_red', 'stucco_cream', 'concrete', 'brick_painted_white'];
const HOUSE_WALLS = ['clap_white', 'clap_blue', 'clap_yellow', 'clap_green', 'clap_grey', 'stucco_rose', 'stucco_sky', 'brick_red', 'clap_white'];
const TRIMS = ['trim_white', 'trim_cream', 'trim_dark', 'trim_green', 'trim_navy', 'trim_oxblood'];
const ROOFS = ['roof_slate', 'roof_red', 'roof_green', 'roof_brown', 'roof_charcoal'];
const AWNINGS = ['awning_red', 'awning_green', 'awning_blue', 'awning_black', 'awning_yellow'];
const FLAT_ROOFS = ['roof_flat', 'roof_tan', 'roof_tar', 'roof_flat', 'roof_tan', 'roof_garden'];
const SHUTTERS = ['shutter_green', 'shutter_blue', 'shutter_black', 'trim_white'];

function archetypeOf(b: BuildingRecord, area: number): Archetype {
  const cls = b.cls ?? '';
  const name = (b.name ?? '').toLowerCase();
  if (cls === 'parking' || name.includes('garage') || name.includes('parking')) return 'garage';
  if (cls === 'church' || /church|chapel|cathedral/.test(name)) return 'church';
  if (cls === 'house' || cls === 'garage' || cls === 'shed' || cls === 'residential' || cls === 'detached') return 'house';
  if (b.tier === 'BACKGROUND' && area < 260) return 'house';
  if (b.tier !== 'BACKGROUND' && b.height >= 5 && area < 2500) return 'shop';
  return area < 180 ? 'house' : 'block';
}

function planBuilding(b: BuildingRecord): Plan | null {
  const [minx, minz, maxx, maxz] = ringBBox(b.footprint);
  const bx0 = Math.floor(minx), bz0 = Math.floor(minz);
  const w = Math.ceil(maxx) - bx0, h = Math.ceil(maxz) - bz0;
  const cells = new Set<number>();
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (inPolygon(bx0 + i + 0.5, bz0 + j + 0.5, b.footprint, b.holes)) cells.add(i + j * w);
  }
  if (cells.size < 4) return null;
  const seed = fnv1a(b.id);
  const arch = archetypeOf(b, cells.size);
  const H = Math.max(arch === 'house' ? 4 : 5, Math.min(45, Math.round(b.height)));
  const minDim = Math.min(w, h);
  const roofRise = arch === 'house' ? Math.min(6, Math.ceil(minDim / 2) * 0.5) + 1 : arch === 'church' ? 14 : 3;
  return {
    b, cells, bx0, bz0, w, h, seed, arch, H, roofRise,
    gy: Math.round(b.ground), base: Math.floor(b.base) - 1,
  };
}

// ------------------------------------------------------------------------------------

export function generateChunk(data: ChunkData): GeneratedChunk {
  const terrain = decodeTerrain(data.terrain);
  const x0 = data.cx * CHUNK;
  const z0 = data.cz * CHUNK;

  // 1. Terrain surface heights (0.5 m steps) per column
  const surface = new Float32Array(CHUNK * CHUNK);
  let tMin = Infinity, tMax = -Infinity;
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    let h = sampleTerrain(terrain, x0 + i + 0.5, z0 + j + 0.5);
    if (!Number.isFinite(h)) h = 0;
    const q = Math.round(h * 2) / 2;
    surface[j * CHUNK + i] = q;
    tMin = Math.min(tMin, q); tMax = Math.max(tMax, q);
  }

  // 2. Surface classes
  const cls = new Uint8Array(CHUNK * CHUNK); // Grass
  const along = new Float32Array(CHUNK * CHUNK); // distance along road (for dashes)
  rasterizeAreas(data.areas, cls, x0, z0);
  rasterizeRoads(data.roads, cls, along, x0, z0);

  // 3. Buildings
  const plans = data.buildings.map(planBuilding).filter((p): p is Plan => p !== null);
  for (const p of plans) for (const c of p.cells) {
    const i = p.bx0 + (c % p.w) - x0;
    const j = p.bz0 + Math.floor(c / p.w) - z0;
    if (i >= 0 && j >= 0 && i < CHUNK && j < CHUNK) cls[j * CHUNK + i] = S.Building;
  }
  markCurbs(cls);

  // 4. Volume extent
  let vx0 = x0 - 4, vz0 = z0 - 4, vx1 = x0 + CHUNK + 4, vz1 = z0 + CHUNK + 4;
  let yTop = Math.ceil(tMax) + 12;
  let yBot = Math.floor(tMin) - 5;
  for (const p of plans) {
    vx0 = Math.min(vx0, p.bx0 - 2); vz0 = Math.min(vz0, p.bz0 - 2);
    vx1 = Math.max(vx1, p.bx0 + p.w + 2); vz1 = Math.max(vz1, p.bz0 + p.h + 2);
    yTop = Math.max(yTop, p.gy + p.H + Math.ceil(p.roofRise) + 3);
    yBot = Math.min(yBot, p.base - 1);
  }
  const vol = new VoxelVolume(vx0, yBot, vz0, vx1 - vx0, yTop - yBot, vz1 - vz0);

  // 5. Terrain columns
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    writeColumn(vol, x0 + i, z0 + j, surface[j * CHUNK + i]!, cls[j * CHUNK + i]!, along[j * CHUNK + i]!);
  }

  // 6. Buildings
  for (const p of plans) buildStructure(vol, p, cls, x0, z0);

  // 7. Nature and street furniture
  const stats = { buildings: plans.length, trees: 0, lamps: 0 };
  decorate(vol, terrain, surface, cls, x0, z0, stats, data);
  return { vol, surface, surfaceClass: cls, x0, z0, stats };
}

function rasterizeAreas(areas: AreaRecord[], cls: Uint8Array, x0: number, z0: number): void {
  for (const a of areas) {
    let c: S | null = null;
    if (a.layer === 'water') c = S.Water;
    else if (a.layer === 'infrastructure' && a.cls === 'parking') c = S.Parking;
    else if (a.layer === 'land_use' && ['park', 'grass', 'pitch', 'cemetery', 'playground', 'recreation_ground', 'garden'].includes(a.cls ?? '')) c = S.Park;
    if (c === null) continue;
    const [mx, mz, Mx, Mz] = ringBBox(a.ring);
    for (let z = Math.max(z0, Math.floor(mz)); z < Math.min(z0 + CHUNK, Math.ceil(Mz)); z++)
      for (let x = Math.max(x0, Math.floor(mx)); x < Math.min(x0 + CHUNK, Math.ceil(Mx)); x++)
        if (inPolygon(x + 0.5, z + 0.5, a.ring, a.holes)) cls[(z - z0) * CHUNK + (x - x0)] = c;
  }
}

const RANK: Record<number, number> = {
  [S.Grass]: 0, [S.Park]: 1, [S.Parking]: 2, [S.Water]: 2, [S.Path]: 3, [S.Gravel]: 3, [S.Sidewalk]: 4, [S.Plaza]: 4,
  [S.Road]: 5, [S.LineWhite]: 6, [S.LineYellow]: 6,
};

function rasterizeRoads(roads: RoadRibbon[], cls: Uint8Array, along: Float32Array, x0: number, z0: number): void {
  for (const r of roads) {
    const ped = ['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'track'].includes(r.cls);
    const rail = r.kind === 'rail';
    const hw = r.width / 2;
    const swL = r.swL ?? 0, swR = r.swR ?? 0;
    const reach = hw + Math.max(swL, swR) + 1;
    const major = ['primary', 'secondary', 'tertiary'].includes(r.cls) && !r.oneWay && r.width >= 10;
    let mx = Infinity, mz = Infinity, Mx = -Infinity, Mz = -Infinity;
    for (const p of r.pts) { mx = Math.min(mx, p[0]); Mx = Math.max(Mx, p[0]); mz = Math.min(mz, p[2]); Mz = Math.max(Mz, p[2]); }
    // cumulative length for dash pattern
    const cum = [0];
    for (let k = 1; k < r.pts.length; k++) cum.push(cum[k - 1]! + Math.hypot(r.pts[k]![0] - r.pts[k - 1]![0], r.pts[k]![2] - r.pts[k - 1]![2]));
    for (let z = Math.max(z0, Math.floor(mz - reach)); z < Math.min(z0 + CHUNK, Math.ceil(Mz + reach)); z++) {
      for (let x = Math.max(x0, Math.floor(mx - reach)); x < Math.min(x0 + CHUNK, Math.ceil(Mx + reach)); x++) {
        const px = x + 0.5, pz = z + 0.5;
        let best = Infinity, side = 0, t = 0;
        for (let k = 1; k < r.pts.length; k++) {
          const ax = r.pts[k - 1]![0], az = r.pts[k - 1]![2], bx = r.pts[k]![0], bz = r.pts[k]![2];
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
          const u = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
          const qx = ax + u * dx - px, qz = az + u * dz - pz;
          const d = Math.hypot(qx, qz);
          if (d < best) {
            best = d;
            // left-hand perpendicular (dz, -dx) — matches pipeline swL/swR
            side = (px - ax) * dz + (pz - az) * -dx >= 0 ? 1 : -1;
            t = cum[k - 1]! + u * Math.sqrt(l2);
          }
        }
        let c: S | null = null;
        if (best <= hw) {
          if (rail) c = S.Gravel;
          else if (ped) c = r.sub === 'sidewalk' || r.sub === 'crosswalk' ? S.Sidewalk : S.Path;
          else if (major && best < 0.55 && Math.floor(t / 3) % 2 === 0) c = S.LineYellow;
          else c = S.Road;
        } else if (!ped && !rail && best <= hw + (side > 0 ? swL : swR)) {
          c = S.Sidewalk;
        }
        if (c === null) continue;
        const idx = (z - z0) * CHUNK + (x - x0);
        if (RANK[c]! >= RANK[cls[idx]!]!) {
          cls[idx] = c;
          along[idx] = t;
        }
      }
    }
  }
}

/** Sidewalk cells bordering carriageway become kerb stones. */
function markCurbs(cls: Uint8Array): void {
  const out = cls.slice();
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    if (cls[j * CHUNK + i] !== S.Sidewalk) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di!, nj = j + dj!;
      if (ni < 0 || nj < 0 || ni >= CHUNK || nj >= CHUNK) continue;
      const n = cls[nj * CHUNK + ni]!;
      if (n === S.Road || n === S.LineYellow) { out[j * CHUNK + i] = S.Curb; break; }
    }
  }
  cls.set(out);
}

function surfaceBlock(c: number, _x: number, _z: number): number {
  switch (c) {
    case S.Road: return B.asphalt!;
    case S.LineYellow: return B.line_yellow!;
    case S.LineWhite: return B.line_white!;
    case S.Sidewalk: return B.sidewalk!;
    case S.Curb: return B.curb!;
    case S.Parking: return B.asphalt_light!;
    case S.Path: return B.path!;
    case S.Gravel: return B.gravel!;
    case S.Plaza: return B.brick_paver!;
    case S.Park: return B.grass_dark!;
    case S.Building: return B.stone_grey!;
    default: return B.grass!;
  }
}

function writeColumn(vol: VoxelVolume, x: number, z: number, h: number, c: number, _along: number): void {
  const top = Math.floor(h);
  const half = h - top >= 0.5;
  const surf = surfaceBlock(c, x, z);
  if (c === S.Water) {
    for (let y = top - 4; y < top - 1; y++) vol.set(x, y, z, B.sand!);
    vol.set(x, top - 1, z, B.water!);
    return;
  }
  const paved = c !== S.Grass && c !== S.Park && c !== S.Building;
  for (let y = top - 4; y < top; y++) {
    const isTop = y === top - 1 && !half;
    vol.set(x, y, z, isTop ? surf : paved ? B.stone! : y >= top - 2 ? B.dirt! : B.stone!);
  }
  if (half) vol.set(x, top, z, surf | SLAB);
}

// ------------------------------------------------------------------------------------
// Buildings

function buildStructure(vol: VoxelVolume, p: Plan, cls: Uint8Array, x0: number, z0: number): void {
  const { seed, arch, gy, H } = p;
  const r = (salt: number) => hash2(seed & 0xffff, seed >>> 16, salt);
  const has = (i: number, j: number) => i >= 0 && j >= 0 && i < p.w && j < p.h && p.cells.has(i + j * p.w);
  const wallName = arch === 'house' ? pick(HOUSE_WALLS, r(1)) : arch === 'block' ? pick(BLOCK_WALLS, r(1))
    : arch === 'garage' ? 'concrete' : arch === 'church' ? pick(['brick_red', 'stone_tan', 'brick_painted_white'], r(1)) : pick(SHOP_WALLS, r(1));
  const wall = B[wallName]!;
  const trim = B[arch === 'house' ? pick(['trim_white', 'trim_white', 'trim_cream', 'trim_dark'], r(2)) : pick(TRIMS, r(2))]!;
  const roof = B[pick(ROOFS, r(3))]!;
  const flatTop = B[pick(FLAT_ROOFS, r(8))]!;
  const shutter = B[pick(SHUTTERS, r(9))]!;
  const lintels = r(10) < 0.6;
  const awning = B[pick(AWNINGS, r(4))]!;
  const hasAwning = arch === 'shop' && r(5) < 0.7;
  const flatRoof = arch !== 'house' && arch !== 'church';
  const groundH = arch === 'shop' ? 5 : arch === 'garage' ? 3 : arch === 'house' ? 3 : 4;
  const fh = arch === 'house' ? 3 : arch === 'garage' ? 3 : 4;
  const bay = arch === 'house' ? 3 : arch === 'church' ? 3 : 3;
  const S_ = (x: number, y: number, z: number, v: number) => vol.set(x, y, z, v, true);

  // foundation
  for (const c of p.cells) {
    const x = p.bx0 + (c % p.w), z = p.bz0 + Math.floor(c / p.w);
    for (let y = p.base; y < gy; y++) S_(x, y, z, B.stone_grey!);
  }

  const doorPhase = Math.floor(r(6) * 9);
  for (const c of p.cells) {
    const i = c % p.w, j = Math.floor(c / p.w);
    const x = p.bx0 + i, z = p.bz0 + j;
    const outs: [number, number][] = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!has(i + di, j + dj)) outs.push([di, dj]);
    const perimeter = outs.length > 0;
    if (arch === 'garage') {
      // decks every floor, open sides with pillars
      for (let rel = 0; rel < H; rel++) {
        const y = gy + rel;
        if (rel % fh === 0) S_(x, y, z, B.concrete!);
        else if (perimeter) {
          const coord = outs[0]![0] !== 0 ? z : x;
          if (coord % 5 === 0 || outs.length > 1) S_(x, y, z, B.concrete!);
          else if (rel % fh === 1) S_(x, y, z, B.trim_dark!);
        }
      }
      S_(x, gy + H, z, B.concrete!);
      continue;
    }
    if (!perimeter) {
      if (flatRoof) S_(x, gy + H, z, flatTop);
      continue;
    }
    const corner = outs.length > 1 || (outs[0]![0] !== 0 ? !has(i, j + 1) || !has(i, j - 1) : !has(i + 1, j) || !has(i - 1, j));
    const [odi, odj] = outs[0]!;
    const coord = odi !== 0 ? z : x; // position along the facade
    for (let rel = 0; rel < H; rel++) {
      const y = gy + rel;
      let v = wall;
      if (corner) v = arch === 'house' ? trim : rel < groundH && arch === 'shop' ? trim : wall;
      else if (arch === 'shop' && rel < groundH) {
        const pillar = coord % 4 === 0;
        const door = (coord + doorPhase) % 9 === 4;
        if (rel === groundH - 1) v = trim; // sign band
        else if (door && rel <= 2) v = B.wood_door!;
        else if (pillar) v = trim;
        else if (rel === 0) v = trim; // bulkhead
        else v = B.glass_shop!;
      } else {
        const g0 = arch === 'shop' ? groundH : 0;
        const k = rel - g0;
        const rr = ((k % fh) + fh) % fh;
        const winCol = arch === 'house' ? coord % bay === 1 : arch === 'church' ? coord % 3 === 1 : coord % bay !== 0;
        const winRow = arch === 'house' ? rr === 1 : arch === 'church' ? rel >= 2 && rel < H - 2 : rr >= 1 && rr <= fh - 2;
        const shutterCol = arch === 'house' && (coord % bay === 0 || coord % bay === 2);
        if (rel === H - 1 && flatRoof) v = trim; // cornice
        else if (arch !== 'house' && rr === 0 && rel > 0 && r(7) < 0.5) v = trim; // belt course
        else if (winCol && winRow) v = B.glass!;
        else if (shutterCol && winRow && corner === false) v = shutter;
        else if (lintels && winCol && arch !== 'house' && arch !== 'church' && rr === fh - 1) v = trim; // lintel
        if (arch === 'house' && rel <= 1 && (coord + doorPhase) % 7 === 3 && odj !== 0) v = B.wood_door!;
      }
      S_(x, y, z, v);
    }
    // roof edge / parapet
    if (flatRoof) {
      S_(x, gy + H, z, trim);
      S_(x, gy + H + 1, z, trim | SLAB);
    }
    // awnings over the storefront, only toward the street
    if (hasAwning && !corner) {
      const ax = x + odi, az = z + odj;
      const li = ax - x0, lj = az - z0;
      const front = li >= 0 && lj >= 0 && li < CHUNK && lj < CHUNK ? cls[lj * CHUNK + li]! : S.Sidewalk;
      if (front === S.Sidewalk || front === S.Curb || front === S.Plaza) {
        const stripe = coord % 2 === 0 ? awning : B.awning_cream!;
        vol.setIfEmpty(ax, gy + groundH - 1, az, stripe | SLAB, true);
      }
    }
  }

  if (arch === 'house' || arch === 'church') hipRoof(vol, p, roof, arch === 'church' ? 0.5 : 0.5);
  if (arch === 'church') steeple(vol, p, trim, roof);
  if (flatRoof && arch !== 'garage') rooftopClutter(vol, p);
}

function chessDistance(p: Plan): Int16Array {
  const d = new Int16Array(p.w * p.h).fill(0);
  const q: number[] = [];
  for (const c of p.cells) {
    const i = c % p.w, j = Math.floor(c / p.w);
    let edge = false;
    for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= p.w || nj >= p.h || !p.cells.has(ni + nj * p.w)) { edge = true; break; }
    }
    if (edge) { d[c] = 1; q.push(c); } else d[c] = 0;
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    const i = c % p.w, j = Math.floor(c / p.w);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= p.w || nj >= p.h) continue;
      const n = ni + nj * p.w;
      if (p.cells.has(n) && d[n] === 0) { d[n] = d[c]! + 1; q.push(n); }
    }
  }
  return d;
}

/** Stepped hip roof in half-block increments (slabs), with a one-block eave overhang. */
function hipRoof(vol: VoxelVolume, p: Plan, roof: number, step: number): void {
  const d = chessDistance(p);
  const top = p.gy + p.H;
  const maxRise = p.roofRise;
  for (const c of p.cells) {
    const x = p.bx0 + (c % p.w), z = p.bz0 + Math.floor(c / p.w);
    const rise = Math.min(maxRise, d[c]! * step);
    const h = top + rise;
    for (let y = top; y < Math.floor(h); y++) vol.set(x, y, z, roof, true);
    if (h - Math.floor(h) >= 0.5) vol.set(x, Math.floor(h), z, roof | SLAB, true);
    else if (rise === 0) vol.set(x, top, z, roof | SLAB, true);
  }
  // eaves: slab ring just outside the walls at the top of the wall
  for (const c of p.cells) {
    const i = c % p.w, j = Math.floor(c / p.w);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < p.w && nj < p.h && p.cells.has(ni + nj * p.w)) continue;
      vol.setIfEmpty(p.bx0 + ni, top, p.bz0 + nj, roof | SLAB, true);
    }
  }
}

function steeple(vol: VoxelVolume, p: Plan, trim: number, roof: number): void {
  // tower on the footprint cell nearest the bbox centre
  let best = -1, bd = Infinity;
  for (const c of p.cells) {
    const d = Math.hypot((c % p.w) - p.w / 2, Math.floor(c / p.w) - p.h / 2);
    if (d < bd) { bd = d; best = c; }
  }
  const x = p.bx0 + (best % p.w), z = p.bz0 + Math.floor(best / p.w);
  const base = p.gy + p.H;
  for (let y = base; y < base + 7; y++) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) vol.set(x + dx, y, z + dz, y === base + 4 ? B.glass! : trim, true);
  for (let k = 0; k < 4; k++) vol.set(x + (k & 1), base + 7, z + (k >> 1), roof, true);
  vol.set(x, base + 8, z, roof, true);
  vol.set(x, base + 9, z, roof | SLAB, true);
}

function rooftopClutter(vol: VoxelVolume, p: Plan): void {
  const top = p.gy + p.H + 1;
  let placed = 0;
  for (const c of p.cells) {
    if (placed >= Math.max(1, p.cells.size / 180)) break;
    const i = c % p.w, j = Math.floor(c / p.w);
    if (hash2(p.bx0 + i, p.bz0 + j, 41) > 0.02) continue;
    let ok = true;
    for (let dj = -1; dj <= 2 && ok; dj++) for (let di = -1; di <= 2; di++) if (!p.cells.has(i + di + (j + dj) * p.w)) { ok = false; break; }
    if (!ok) continue;
    const v = hash2(i, j, 42) < 0.5 ? B.concrete! : B.stone_grey!;
    for (let di = 0; di < 2; di++) for (let dj = 0; dj < 2; dj++) vol.setIfEmpty(p.bx0 + i + di, top, p.bz0 + j + dj, v, true);
    vol.setIfEmpty(p.bx0 + i, top + 1, p.bz0 + j, B.iron! | SLAB, true);
    placed++;
  }
}

// ------------------------------------------------------------------------------------
// Nature & street furniture

function decorate(
  vol: VoxelVolume, _t: DecodedTerrain, surface: Float32Array, cls: Uint8Array, x0: number, z0: number,
  stats: { trees: number; lamps: number }, data: ChunkData,
): void {
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < CHUNK && j < CHUNK ? cls[j * CHUNK + i]! : 255);
  const clear = (i: number, j: number, r: number, allowed: (c: number) => boolean) => {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const c = at(i + di, j + dj);
      if (c === 255 || !allowed(c)) return false;
    }
    return true;
  };
  const green = (c: number) => c === S.Grass || c === S.Park;

  // Trees on a jittered grid; parks are denser.
  const G = 7;
  for (let gj = 0; gj < CHUNK; gj += G) for (let gi = 0; gi < CHUNK; gi += G) {
    const wx = x0 + gi, wz = z0 + gj;
    const i = gi + Math.floor(hash2(wx, wz, 11) * G);
    const j = gj + Math.floor(hash2(wx, wz, 12) * G);
    const c = at(i, j);
    if (!green(c)) continue;
    const p = c === S.Park ? 0.75 : 0.32;
    if (hash2(wx, wz, 13) > p) continue;
    if (!clear(i, j, 2, green)) continue;
    const y = Math.ceil(surface[j * CHUNK + i]!);
    tree(vol, x0 + i, y, z0 + j, hash2(wx, wz, 14));
    stats.trees++;
  }

  // Street trees and lamps along kerbs
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const c = at(i, j);
    if (c !== S.Sidewalk) continue;
    const nextToCurb = at(i + 1, j) === S.Curb || at(i - 1, j) === S.Curb || at(i, j + 1) === S.Curb || at(i, j - 1) === S.Curb;
    if (!nextToCurb) continue;
    const wx = x0 + i, wz = z0 + j;
    const y = Math.ceil(surface[j * CHUNK + i]!);
    const lattice = ((wx % 22) + 22) % 22 === 0 || ((wz % 22) + 22) % 22 === 0;
    const lattice2 = ((wx % 11) + 11) % 11 === 5 || ((wz % 11) + 11) % 11 === 5;
    if (lattice && hash2(wx, wz, 21) < 0.5 && clear(i, j, 1, (k) => k !== S.Building)) {
      lamp(vol, wx, y, wz);
      stats.lamps++;
    } else if (lattice2 && hash2(wx, wz, 22) < 0.55 && clear(i, j, 1, (k) => k !== S.Building)) {
      streetTree(vol, wx, y, wz, hash2(wx, wz, 23));
      stats.trees++;
    }
  }

  // Ground cover: flowers and tufts
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const c = at(i, j);
    if (!green(c)) continue;
    const wx = x0 + i, wz = z0 + j;
    const h = surface[j * CHUNK + i]!;
    if (h - Math.floor(h) >= 0.5) continue; // slab tops: skip (plant would float)
    const r = hash2(wx, wz, 31);
    const y = Math.floor(h);
    if (r < (c === S.Park ? 0.06 : 0.025)) {
      vol.setIfEmpty(wx, y, wz, pick([B.flower_red!, B.flower_yellow!, B.flower_white!, B.flower_purple!], hash2(wx, wz, 32)));
    } else if (r < 0.08) vol.setIfEmpty(wx, y, wz, B.tuft!);
  }

  // Point features from source data
  for (const pt of data.points ?? []) {
    const wx = Math.floor(pt.pos[0]), wz = Math.floor(pt.pos[2]);
    const i = wx - x0, j = wz - z0;
    if (at(i, j) === 255 || at(i, j) === S.Building) continue;
    const y = Math.ceil(surface[j * CHUNK + i]!);
    if (pt.cls === 'bus_stop' || pt.cls === 'bench') bench(vol, wx, y, wz);
    else if (pt.cls === 'bollard') vol.setIfEmpty(wx, y, wz, B.iron! | SLAB, true);
  }
}

function tree(vol: VoxelVolume, x: number, y: number, z: number, r: number): void {
  const big = r > 0.45;
  const trunkH = big ? 4 + Math.floor(r * 3) : 3 + Math.floor(r * 2);
  const rad = big ? 3 : 2;
  const shades = r < 0.1 ? [B.leaves_autumn!, B.leaves!, B.leaves_light!] : r < 0.16 ? [B.leaves_blossom!, B.leaves_light!, B.leaves_blossom!] : [B.leaves!, B.leaves_light!, B.leaves_dark!];
  for (let k = 0; k < trunkH; k++) vol.set(x, y + k, z, B.trunk!, true);
  const cy = y + trunkH;
  for (let dy = -rad; dy <= rad + 1; dy++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
    const d = dx * dx + dz * dz + (dy - 0.5) * (dy - 0.5) * 1.4;
    const jitter = hash2(x + dx, z + dz, y + dy) * 2.2;
    if (d > rad * rad + 0.8 - jitter) continue;
    const shade = shades[Math.floor(hash2(x + dx * 3, z + dz * 5, dy) * shades.length)]!;
    if (dx === 0 && dz === 0 && dy < 0) continue;
    vol.setIfEmpty(x + dx, cy + dy, z + dz, shade, true);
  }
}

function streetTree(vol: VoxelVolume, x: number, y: number, z: number, r: number): void {
  vol.set(x, y - 1, z, B.planter!, true);
  vol.set(x, y, z, B.grass! | SLAB, false);
  for (let k = 1; k <= 3; k++) vol.set(x, y + k - 0, z, B.trunk!, true);
  const shades = [B.leaves!, B.leaves_light!, B.leaves_dark!];
  const cy = y + 4;
  for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const d = dx * dx + dz * dz + dy * dy * 1.5;
    if (d > 5.2 - hash2(x + dx, z + dz, dy + 7) * 1.5) continue;
    vol.setIfEmpty(x + dx, cy + dy, z + dz, shades[Math.floor(hash2(x + dx, z + dz, dy + r * 9) * 3)]!, true);
  }
}

function lamp(vol: VoxelVolume, x: number, y: number, z: number): void {
  for (let k = 0; k < 3; k++) vol.set(x, y + k, z, B.lamp_post!, true);
  vol.set(x, y + 3, z, B.lamp!, true);
  vol.set(x, y + 4, z, B.lamp_post! | SLAB, true);
}

function bench(vol: VoxelVolume, x: number, y: number, z: number): void {
  vol.setIfEmpty(x, y, z, B.bench_wood! | SLAB, true);
  vol.setIfEmpty(x + 1, y, z, B.bench_wood! | SLAB, true);
}
