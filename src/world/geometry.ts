/**
 * Pure geometry builders (no three.js scene objects): chunk data -> typed arrays.
 * Kept renderer-agnostic so they can be unit-tested and reused for collision.
 */
import { ShapeUtils, Vector2 } from 'three';
import { fnv1a } from '../core/hash';
import type { AreaRecord, BuildingRecord, RoadRibbon, Vec2 } from './types';

export class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB, u = 0, v = 0): number {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.colors.push(c[0], c[1], c[2]);
    this.uvs.push(u, v);
    return this.vertexCount - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }
}

export type RGB = [number, number, number];

/** sRGB hex -> linear RGB (vertex colours are interpreted as linear by the renderer). */
function hexRgb(hex: number): RGB {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
}

// Plausible palette for a Middle Tennessee historic commercial district (brick reds,
// painted brick, limestone). Used only where source data gives no facade colour.
const FACADE_PALETTE = [0x9b4a36, 0x8a3f2e, 0xa65a3f, 0xb8735a, 0xc9b79c, 0xe3dccb, 0xd8d0c0, 0x7d4a3a, 0xb9a58a, 0x9c8f7d]
  .map(hexRgb);
const HOUSE_PALETTE = [0xe8e4da, 0xd9d2c3, 0xc4ccd0, 0xb7c2b0, 0xe0d2b4, 0xa9b4bd, 0xf0ece2].map(hexRgb);
const ROOF_PALETTE = [0x4a4a4c, 0x3c3f44, 0x57534f, 0x5e4b42, 0x3a3a3a].map(hexRgb);

export const STOREFRONT_HEIGHT = 4.2;
export const FLOOR_HEIGHT = 3.5;
export const BAY_WIDTH = 3.0;

function parseColor(s: string | undefined): RGB | null {
  if (!s) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  return m ? hexRgb(parseInt(m[1]!, 16)) : null;
}

export interface BuildingStyle {
  wall: RGB;
  roof: RGB;
  storefront: boolean;
}

export function buildingStyle(b: BuildingRecord): BuildingStyle {
  const h = fnv1a(b.id);
  const residential = b.cls === 'house' || b.cls === 'garage' || b.cls === 'shed' || b.cls === 'residential';
  const pal = residential ? HOUSE_PALETTE : FACADE_PALETTE;
  const wall = parseColor((b as { facadeColor?: string }).facadeColor) ?? pal[h % pal.length]!;
  const roof = ROOF_PALETTE[(h >>> 8) % ROOF_PALETTE.length]!;
  // Storefront ground floors are an INFERRED stylistic choice for non-residential core buildings.
  const storefront = b.tier !== 'BACKGROUND' && !residential && b.height >= 5;
  return { wall, roof, storefront };
}

/**
 * Extruded building: walls (grouped: upper facade / storefront band) + flat roof.
 * Footprint is CCW in the (east, north) plane, i.e. (x, -z).
 */
export interface BuildingMeshes {
  upper: MeshBuilder;
  storefront: MeshBuilder;
  roof: MeshBuilder;
}

export function newBuildingMeshes(): BuildingMeshes {
  return { upper: new MeshBuilder(), storefront: new MeshBuilder(), roof: new MeshBuilder() };
}

function wallRing(out: BuildingMeshes, ring: Vec2[], b: BuildingRecord, st: BuildingStyle, outward: boolean): void {
  const bottom = b.base - 0.6; // sink below lowest ground sample to hide slope gaps
  const top = b.ground + b.height;
  const split = st.storefront ? Math.min(b.ground + STOREFRONT_HEIGHT, top) : bottom;
  let run = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p0 = outward ? ring[i]! : ring[(i + 1) % n]!;
    const p1 = outward ? ring[(i + 1) % n]! : ring[i]!;
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    const nx = -dz / len;
    const nz = dx / len;
    const u0 = run / BAY_WIDTH;
    const u1 = (run + len) / BAY_WIDTH;
    run += len;
    const quad = (m: MeshBuilder, y0: number, y1: number, v0: number, v1: number) => {
      if (y1 - y0 < 0.01) return;
      const a = m.vertex(p0[0], y0, p0[1], nx, 0, nz, st.wall, u0, v0);
      const bb = m.vertex(p1[0], y0, p1[1], nx, 0, nz, st.wall, u1, v0);
      const c = m.vertex(p1[0], y1, p1[1], nx, 0, nz, st.wall, u1, v1);
      const d = m.vertex(p0[0], y1, p0[1], nx, 0, nz, st.wall, u0, v1);
      m.tri(a, bb, c);
      m.tri(a, c, d);
    };
    if (st.storefront) {
      // storefront texture spans exactly one tile vertically from ground level
      quad(out.storefront, bottom, split, (bottom - b.ground) / STOREFRONT_HEIGHT, (split - b.ground) / STOREFRONT_HEIGHT);
    }
    const y0 = st.storefront ? split : bottom;
    quad(out.upper, y0, top, (y0 - b.ground) / FLOOR_HEIGHT, (top - b.ground) / FLOOR_HEIGHT);
  }
}

export function appendBuilding(out: BuildingMeshes, b: BuildingRecord): void {
  const st = buildingStyle(b);
  wallRing(out, b.footprint, b, st, true);
  for (const hole of b.holes ?? []) wallRing(out, hole, b, st, false);

  const top = b.ground + b.height;
  const contour = b.footprint.map(([x, z]) => new Vector2(x, -z));
  const holes = (b.holes ?? []).map((h) => h.map(([x, z]) => new Vector2(x, -z)));
  let tris: number[][];
  try {
    tris = ShapeUtils.triangulateShape(contour, holes);
  } catch {
    return;
  }
  const all = [...contour, ...holes.flat()];
  const r = out.roof;
  const base = r.vertexCount;
  for (const p of all) r.vertex(p.x, top, -p.y, 0, 1, 0, st.roof, p.x / 4, p.y / 4);
  for (const t of tris) {
    const [a, bb, c] = t as [number, number, number];
    const pa = all[a]!;
    const pb = all[bb]!;
    const pc = all[c]!;
    // cross in (east, north): positive => CCW => facing up after z = -north mapping
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (cross >= 0) r.tri(base + a, base + bb, base + c);
    else r.tri(base + a, base + c, base + bb);
  }
}

// ---------------------------------------------------------------------------------
// Roads

const ROAD_COLORS: Record<string, RGB> = {
  asphalt: hexRgb(0x3b3d40),
  asphaltLight: hexRgb(0x4a4c4f),
  service: hexRgb(0x55575a),
  concrete: hexRgb(0xa9a59c),
  footway: hexRgb(0xb3ada1),
  path: hexRgb(0x9c8d72),
  rail: hexRgb(0x5a5048),
};

const PEDESTRIAN = new Set(['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'track']);

export interface RoadLayerStyle {
  color: RGB;
  lift: number;
}

export function roadStyle(r: RoadRibbon): RoadLayerStyle {
  if (r.kind === 'rail') return { color: ROAD_COLORS.rail!, lift: 0.1 };
  if (r.sub === 'sidewalk' || r.sub === 'crosswalk') return { color: ROAD_COLORS.concrete!, lift: 0.16 };
  if (PEDESTRIAN.has(r.cls)) return { color: r.cls === 'path' || r.cls === 'track' ? ROAD_COLORS.path! : ROAD_COLORS.footway!, lift: 0.14 };
  if (r.cls === 'service' || r.cls === 'unknown') return { color: ROAD_COLORS.service!, lift: 0.1 };
  if (r.cls === 'primary' || r.cls === 'secondary') return { color: ROAD_COLORS.asphalt!, lift: 0.13 };
  return { color: ROAD_COLORS.asphaltLight!, lift: 0.12 };
}

/**
 * Flat-topped ribbon following the polyline, extending `left`/`right` metres either side
 * of the centreline, with round-ish end caps (symmetric ribbons) to close joints.
 */
export function appendRibbon(
  m: MeshBuilder,
  pts: [number, number, number][],
  width: number,
  lift: number,
  color: RGB,
  left = width / 2,
  right = width / 2,
): void {
  if (pts.length < 2) return;
  const n = pts.length;
  let prevL = -1;
  let prevR = -1;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0];
    let dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // left-hand perpendicular in (x,z)
    const px = dz;
    const pz = -dx;
    const y = p[1] + lift;
    const l = m.vertex(p[0] + px * left, y, p[2] + pz * left, 0, 1, 0, color, 0, 0);
    const r = m.vertex(p[0] - px * right, y, p[2] - pz * right, 0, 1, 0, color, 1, 0);
    if (prevL >= 0) {
      m.tri(prevL, prevR, r);
      m.tri(prevL, r, l);
    }
    prevL = l;
    prevR = r;
  }
  if (Math.abs(left - right) < 1e-6) for (const idx of [0, n - 1]) appendDisc(m, pts[idx]!, left, lift - 0.004, color);
}

function appendDisc(m: MeshBuilder, p: [number, number, number], radius: number, lift: number, color: RGB): void {
  const seg = 10;
  const c = m.vertex(p[0], p[1] + lift, p[2], 0, 1, 0, color);
  const first = m.vertexCount;
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    m.vertex(p[0] + Math.cos(t) * radius, p[1] + lift, p[2] + Math.sin(t) * radius, 0, 1, 0, color);
  }
  for (let i = 0; i < seg; i++) {
    // Going around increasing angle in (x,z) is CW seen from +y; wind (c, next, cur) to face up.
    m.tri(c, first + ((i + 1) % seg), first + i);
  }
}

export function appendRoad(m: MeshBuilder, r: RoadRibbon): void {
  const st = roadStyle(r);
  // Sidewalk band sits below the carriageway layer so the carriageway always draws on top.
  const hasSw = r.swL !== undefined || r.swR !== undefined;
  if (hasSw) {
    const hw = r.width / 2;
    appendRibbon(m, r.pts, r.width, 0.09, ROAD_COLORS.concrete!, hw + (r.swL ?? 0), hw + (r.swR ?? 0));
  }
  appendRibbon(m, r.pts, r.width, st.lift + (hasSw ? 0.03 : 0), st.color);
}

// ---------------------------------------------------------------------------------
// Areas (water, parking, parks) draped via a height sampler

const AREA_COLORS: Record<string, RGB> = {
  water: hexRgb(0x3f6f86),
  parking: hexRgb(0x56585b),
  park: hexRgb(0x5f8a45),
  grass: hexRgb(0x6a9450),
  cemetery: hexRgb(0x66885a),
  pitch: hexRgb(0x5a9a48),
  playground: hexRgb(0x8a7a5a),
};

export function areaStyle(a: AreaRecord): { color: RGB; lift: number } | null {
  if (a.layer === 'water') return { color: AREA_COLORS.water!, lift: 0.06 };
  if (a.layer === 'infrastructure' && a.cls === 'parking') return { color: AREA_COLORS.parking!, lift: 0.08 };
  if (a.layer === 'land_use' && a.cls && AREA_COLORS[a.cls]) return { color: AREA_COLORS[a.cls]!, lift: 0.04 };
  return null;
}

export function appendArea(m: MeshBuilder, a: AreaRecord, heightAt: (x: number, z: number) => number): void {
  const st = areaStyle(a);
  if (!st) return;
  const contour = a.ring.map(([x, z]) => new Vector2(x, -z));
  const holes = (a.holes ?? []).map((h) => h.map(([x, z]) => new Vector2(x, -z)));
  let tris: number[][];
  try {
    tris = ShapeUtils.triangulateShape(contour, holes);
  } catch {
    return;
  }
  const all = [...contour, ...holes.flat()];
  const base = m.vertexCount;
  const flat = a.layer === 'water' ? Math.min(...all.map((p) => heightAt(p.x, -p.y)).filter(Number.isFinite)) : NaN;
  for (const p of all) {
    const h = Number.isFinite(flat) ? flat : heightAt(p.x, -p.y);
    m.vertex(p.x, (Number.isFinite(h) ? h : 0) + st.lift, -p.y, 0, 1, 0, st.color);
  }
  for (const t of tris) {
    const [i, j, k] = t as [number, number, number];
    const pa = all[i]!;
    const pb = all[j]!;
    const pc = all[k]!;
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (cross >= 0) m.tri(base + i, base + j, base + k);
    else m.tri(base + i, base + k, base + j);
  }
}
