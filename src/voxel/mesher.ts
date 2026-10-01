/**
 * Greedy voxel mesher with Minecraft-style per-vertex ambient occlusion.
 * Full cubes are greedy-merged per slice (merging only faces with identical block + AO);
 * slabs, water surfaces and plants are emitted per cell. Output is grouped by material.
 */
import { BLOCKS, ID_MASK, isOpaqueCube, LINEAR_RGB, SLAB, TEX_OF } from './blocks';
import type { VoxelVolume } from './volume';

export type MeshGroup = 'opaque' | 'foliage' | 'glass' | 'water' | 'emissive';

export class GroupBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  /** Texture class per vertex (TEX in blocks.ts). */
  tex: number[] = [];
  indices: number[] = [];
  get vertexCount(): number {
    return this.positions.length / 3;
  }
}

export interface VoxelMesh {
  groups: Record<MeshGroup, GroupBuilder>;
  quads: number;
}

const AO_CURVE = [0.5, 0.68, 0.84, 1.0];

/** 1 if the voxel value is an opaque full cube (indexed by full Uint16 value incl. SLAB bit). */
const OPAQUE_TABLE = new Uint8Array(0x200);
/** 1 if the voxel value is greedy-meshed as a full cube (not slab/plant/water/air). */
const GREEDY_TABLE = new Uint8Array(0x200);
for (let v = 1; v < 0x200; v++) {
  if ((v & ID_MASK) >= BLOCKS.length) continue;
  OPAQUE_TABLE[v] = isOpaqueCube(v) ? 1 : 0;
  const k = BLOCKS[v & ID_MASK]!.kind;
  GREEDY_TABLE[v] = !(v & SLAB) && k !== 'plant' && k !== 'water' ? 1 : 0;
}

const groupOf = (v: number): MeshGroup | null => {
  const k = BLOCKS[v & ID_MASK]!.kind;
  if (k === 'glass') return 'glass';
  if (k === 'water') return 'water';
  if (k === 'emissive') return 'emissive';
  if (k === 'plant') return null;
  if (k === 'leaves') return 'foliage';
  return 'opaque';
};

/** Whether a full-cube face of block `a` toward neighbour `b` is visible. */
function faceVisible(a: number, b: number): boolean {
  if (b === 0) return true;
  if (isOpaqueCube(b)) return false;
  const ka = BLOCKS[a & ID_MASK]!.kind;
  const kb = BLOCKS[b & ID_MASK]!.kind;
  if (ka === 'glass' && kb === 'glass') return false;
  if (ka === 'water') return kb === 'plant' || (b & SLAB) !== 0 ? kb === 'plant' : false;
  return true; // b is slab, plant, glass or water: face shows
}

function pushQuad(
  g: GroupBuilder,
  corners: [number, number, number][],
  n: [number, number, number],
  rgb: [number, number, number],
  ao: [number, number, number, number],
  tex = 0,
): void {
  const base = g.vertexCount;
  // Ensure CCW winding as seen from the normal side.
  const [p0, p1, , p3] = corners;
  const ux = p1![0] - p0![0], uy = p1![1] - p0![1], uz = p1![2] - p0![2];
  const vx = p3![0] - p0![0], vy = p3![1] - p0![1], vz = p3![2] - p0![2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const flipWinding = cx * n[0] + cy * n[1] + cz * n[2] < 0;
  for (let i = 0; i < 4; i++) {
    const c = corners[i]!;
    g.positions.push(c[0], c[1], c[2]);
    g.normals.push(n[0], n[1], n[2]);
    const f = AO_CURVE[ao[i]!]!;
    g.colors.push(rgb[0] * f, rgb[1] * f, rgb[2] * f);
    g.tex.push(tex);
  }
  // Split along the diagonal that keeps AO gradients smooth (avoids anisotropy).
  const altDiag = ao[0]! + ao[2]! < ao[1]! + ao[3]!;
  const tris = altDiag ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
  if (flipWinding) for (let i = 0; i < tris.length; i += 3) [tris[i + 1], tris[i + 2]] = [tris[i + 2]!, tris[i + 1]!];
  for (const t of tris) g.indices.push(base + t);
}

function rgbOf(v: number): [number, number, number] {
  const i = (v & ID_MASK) * 3;
  return [LINEAR_RGB[i]!, LINEAR_RGB[i + 1]!, LINEAR_RGB[i + 2]!];
}

export interface MeshOptions {
  /** Bake per-vertex ambient occlusion (off for distant LOD: merges far better). */
  ao?: boolean;
  /** Emit small plants (flowers, tufts). */
  plants?: boolean;
}

export function meshVolume(vol: VoxelVolume, opts: MeshOptions = {}): VoxelMesh {
  const useAO = opts.ao ?? true;
  const usePlants = opts.plants ?? true;
  const groups: Record<MeshGroup, GroupBuilder> = {
    opaque: new GroupBuilder(),
    foliage: new GroupBuilder(),
    glass: new GroupBuilder(),
    water: new GroupBuilder(),
    emissive: new GroupBuilder(),
  };
  let quads = 0;
  const dims = [vol.sx, vol.sy, vol.sz];
  const org = [vol.ox, vol.oy, vol.oz];
  const st = [1, vol.sx * vol.sz, vol.sx]; // strides for x, y, z
  const data = vol.data;
  const OPQ = OPAQUE_TABLE;
  const GREEDY = GREEDY_TABLE;

  // ---- greedy full-cube faces ----
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const du = dims[u]!, dv = dims[v]!, dd = dims[d]!;
    const sd = st[d]!, su = st[u]!, sv = st[v]!;
    const mask = new Int32Array(du * dv);
    for (const s of [1, -1] as const) {
      const n: [number, number, number] = [0, 0, 0];
      n[d] = s;
      for (let c = 0; c < dd; c++) {
        const cn = c + s;
        const inN = cn >= 0 && cn < dd;
        let any = false;
        for (let j = 0; j < dv; j++) {
          const rowBase = c * sd + j * sv;
          for (let i = 0; i < du; i++) {
            const idx = rowBase + i * su;
            const a = data[idx]!;
            let key = 0;
            if (GREEDY[a]) {
              const qi = idx + s * sd;
              const b = inN ? data[qi]! : 0;
              if (faceVisible(a, b)) {
                let ao = 0xff;
                if (useAO && BLOCKS[a & ID_MASK]!.kind !== 'emissive' && inN) {
                  ao = 0;
                  const um = i > 0, up = i < du - 1, vm = j > 0, vp = j < dv - 1;
                  const oU0 = um ? OPQ[data[qi - su]!]! : 0;
                  const oU1 = up ? OPQ[data[qi + su]!]! : 0;
                  const oV0 = vm ? OPQ[data[qi - sv]!]! : 0;
                  const oV1 = vp ? OPQ[data[qi + sv]!]! : 0;
                  const c00 = um && vm ? OPQ[data[qi - su - sv]!]! : 0;
                  const c10 = up && vm ? OPQ[data[qi + su - sv]!]! : 0;
                  const c11 = up && vp ? OPQ[data[qi + su + sv]!]! : 0;
                  const c01 = um && vp ? OPQ[data[qi - su + sv]!]! : 0;
                  const a0 = oU0 && oV0 ? 0 : 3 - (oU0 + oV0 + c00);
                  const a1 = oU1 && oV0 ? 0 : 3 - (oU1 + oV0 + c10);
                  const a2 = oU1 && oV1 ? 0 : 3 - (oU1 + oV1 + c11);
                  const a3 = oU0 && oV1 ? 0 : 3 - (oU0 + oV1 + c01);
                  ao = a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
                }
                key = ((a & ID_MASK) + 1) | (ao << 9);
                any = true;
              }
            }
            mask[j * du + i] = key;
          }
        }
        if (!any) continue;
        // Greedy merge
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du; ) {
            const key = mask[j * du + i]!;
            if (!key) { i++; continue; }
            let w = 1;
            while (i + w < du && mask[j * du + i + w] === key) w++;
            let h = 1;
            outer: while (j + h < dv) {
              for (let k = 0; k < w; k++) if (mask[(j + h) * du + i + k] !== key) break outer;
              h++;
            }
            for (let jj = 0; jj < h; jj++) mask.fill(0, (j + jj) * du + i, (j + jj) * du + i + w);
            const id = (key & 0x1ff) - 1;
            const aoBits = key >>> 9;
            const ao: [number, number, number, number] = [aoBits & 3, (aoBits >> 2) & 3, (aoBits >> 4) & 3, (aoBits >> 6) & 3];
            const plane = org[d]! + c + (s > 0 ? 1 : 0);
            const mk = (uu: number, vv: number): [number, number, number] => {
              const r: [number, number, number] = [0, 0, 0];
              r[d] = plane;
              r[u] = org[u]! + uu;
              r[v] = org[v]! + vv;
              return r;
            };
            const corners = [mk(i, j), mk(i + w, j), mk(i + w, j + h), mk(i, j + h)];
            pushQuad(groups[groupOf(id)!], corners, n, rgbOf(id), ao, TEX_OF[id]);
            quads++;
            i += w;
          }
        }
      }
    }
  }

  // ---- greedy slab tops (plane y + 0.5) ----
  {
    const du = vol.sx, dv = vol.sz;
    const mask = new Int32Array(du * dv);
    for (let y = 0; y < vol.sy; y++) {
      let any = false;
      for (let z = 0; z < dv; z++) for (let x = 0; x < du; x++) {
        const idx = y * st[1]! + z * vol.sx + x;
        const a = data[idx]!;
        let key = 0;
        if (a & SLAB && BLOCKS[a & ID_MASK]!.kind !== 'plant') {
          const above = y + 1 < vol.sy ? data[idx + st[1]!]! : 0;
          if (!OPQ[above]) { key = (a & ID_MASK) + 1; any = true; }
        }
        mask[z * du + x] = key;
      }
      if (!any) continue;
      for (let j = 0; j < dv; j++) for (let i = 0; i < du; ) {
        const key = mask[j * du + i]!;
        if (!key) { i++; continue; }
        let w = 1;
        while (i + w < du && mask[j * du + i + w] === key) w++;
        let h = 1;
        outer2: while (j + h < dv) {
          for (let k = 0; k < w; k++) if (mask[(j + h) * du + i + k] !== key) break outer2;
          h++;
        }
        for (let jj = 0; jj < h; jj++) mask.fill(0, (j + jj) * du + i, (j + jj) * du + i + w);
        const id = key - 1;
        const yy = vol.oy + y + 0.5;
        const x0 = vol.ox + i, z0 = vol.oz + j;
        const grp = groupOf(id) ?? 'opaque';
        pushQuad(groups[grp], [[x0, yy, z0], [x0 + w, yy, z0], [x0 + w, yy, z0 + h], [x0, yy, z0 + h]], [0, 1, 0], rgbOf(id), [3, 3, 3, 3], TEX_OF[id]);
        quads++;
        i += w;
      }
    }
  }

  // ---- per-cell shapes: slab sides/bottoms, water, plants ----
  const NB: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let y = 0; y < vol.sy; y++) {
    for (let z = 0; z < vol.sz; z++) {
      for (let x = 0; x < vol.sx; x++) {
        const a = vol.data[(y * vol.sz + z) * vol.sx + x]!;
        if (!a) continue;
        const wx = vol.ox + x, wy = vol.oy + y, wz = vol.oz + z;
        const kind = BLOCKS[a & ID_MASK]!.kind;
        if (a & SLAB) {
          quads += emitBox(groups[groupOf(a) ?? 'opaque'], wx, wy, wz, wx + 1, wy + 0.5, wz + 1, rgbOf(a), (dir) => {
            const b = vol.get(wx + NB[dir]![0], wy + NB[dir]![1], wz + NB[dir]![2]);
            if (dir === 2) return false; // top: emitted by the greedy slab pass
            if (dir === 3) return !isOpaqueCube(b);
            return !(isOpaqueCube(b) || (b & SLAB) !== 0);
          }, TEX_OF[a & ID_MASK]);
        } else if (kind === 'water') {
          const above = vol.get(wx, wy + 1, wz);
          if (BLOCKS[above & ID_MASK]!.kind !== 'water' && !isOpaqueCube(above)) {
            quads += emitBox(groups.water, wx, wy, wz, wx + 1, wy + 0.85, wz + 1, rgbOf(a), (dir) => dir === 2);
          }
        } else if (kind === 'plant' && usePlants) {
          quads += emitPlant(groups.opaque, wx, wy, wz, a);
        }
      }
    }
  }
  return { groups, quads };
}

/** Axis-aligned box faces (no AO); `show(dir)` filters faces: 0 +x,1 -x,2 +y,3 -y,4 +z,5 -z. */
function emitBox(
  g: GroupBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  rgb: [number, number, number], show: (dir: number) => boolean, tex = 0,
): number {
  const faces: [number, [number, number, number], [number, number, number][]][] = [
    [0, [1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [1, [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [2, [0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
    [3, [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [4, [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [5, [0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
  ];
  let n = 0;
  for (const [dir, normal, corners] of faces) {
    if (!show(dir)) continue;
    pushQuad(g, corners, normal, rgb, [3, 3, 3, 3], tex);
    n++;
  }
  return n;
}

/** Small decorative plants: stem + head, or a grass tuft — tiny boxes, deterministic jitter. */
function emitPlant(g: GroupBuilder, x: number, y: number, z: number, v: number): number {
  const h = ((x * 73856093) ^ (z * 19349663)) >>> 0;
  const jx = ((h & 7) - 3.5) * 0.05;
  const jz = (((h >> 3) & 7) - 3.5) * 0.05;
  const cx = x + 0.5 + jx;
  const cz = z + 0.5 + jz;
  const stem: [number, number, number] = [0.25, 0.45, 0.18];
  const all = (dir: number) => dir !== 3;
  const noBottom = all;
  const name = BLOCKS[v & ID_MASK]!.name;
  if (name === 'tuft') {
    let n = 0;
    for (const [ox, oz, hh] of [[-0.12, -0.08, 0.34], [0.1, 0.1, 0.26]] as const) {
      n += emitBox(g, cx + ox - 0.05, y, cz + oz - 0.05, cx + ox + 0.05, y + hh, cz + oz + 0.05, rgbOf(v), noBottom);
    }
    return n;
  }
  let n = emitBox(g, cx - 0.04, y, cz - 0.04, cx + 0.04, y + 0.42, cz + 0.04, stem, all);
  n += emitBox(g, cx - 0.14, y + 0.38, cz - 0.14, cx + 0.14, y + 0.62, cz + 0.14, rgbOf(v), all);
  return n;
}
