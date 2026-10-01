/**
 * Block palette for the stylised voxel town. A voxel value is a Uint16:
 *   bits 0-7  block id (index into BLOCKS)
 *   bit  8    SLAB flag (occupies the lower half of the cell)
 * Colours are art-directed sRGB; converted to linear for vertex colours.
 */
export type BlockKind = 'solid' | 'glass' | 'water' | 'leaves' | 'emissive' | 'plant';

export interface BlockDef {
  name: string;
  color: number; // sRGB hex
  kind: BlockKind;
  /** Solid for the player (voxel collider). */
  collide: boolean;
  /** Procedural surface pattern class used by the block shader (see TEX). */
  tex: number;
}

/** Shader texture classes (src/render/voxelMaterials.ts). */
export const TEX = { plain: 0, brick: 1, siding: 2, grass: 3, shingle: 4, paver: 5, grain: 6, leaves: 7, bark: 8 } as const;

function texOf(name: string): number {
  if (name.startsWith('brick_paver') || ['sidewalk', 'sidewalk_alt', 'curb', 'stone', 'stone_grey', 'stone_tan', 'roof_flat', 'roof_tan', 'concrete'].includes(name)) return TEX.paver;
  if (name.startsWith('brick')) return TEX.brick;
  if (name.startsWith('clap') || name.startsWith('wood') || name.startsWith('shutter') || name === 'bench_wood') return TEX.siding;
  if (name.startsWith('grass') || name === 'roof_garden') return TEX.grass;
  if (['asphalt', 'asphalt_light', 'gravel', 'dirt', 'sand', 'path', 'roof_tar'].includes(name)) return TEX.grain;
  if (name.startsWith('roof')) return TEX.shingle;
  if (name.startsWith('leaves') || name === 'hedge' || name.startsWith('flower_box')) return TEX.leaves;
  if (name === 'trunk') return TEX.bark;
  return TEX.plain;
}

export const SLAB = 0x100;
export const ID_MASK = 0xff;

const defs: [string, number, BlockKind, boolean?][] = [
  ['air', 0x000000, 'solid', false],
  // ground
  ['grass', 0x86c14a, 'solid'],
  ['grass_dark', 0x6aad3d, 'solid'],
  ['dirt', 0x9a6b45, 'solid'],
  ['stone', 0x9a958c, 'solid'],
  ['sand', 0xe8d3a0, 'solid'],
  ['gravel', 0xa8a092, 'solid'],
  ['path', 0xd9bd8a, 'solid'],
  ['water', 0x46b3c6, 'water', false],
  // streets
  ['asphalt', 0x6d6a70, 'solid'],
  ['asphalt_light', 0x76737a, 'solid'],
  ['line_yellow', 0xf2c64a, 'solid'],
  ['line_white', 0xf3efe2, 'solid'],
  ['sidewalk', 0xddd0b5, 'solid'],
  ['sidewalk_alt', 0xd2c4a6, 'solid'],
  ['curb', 0xbcb2a0, 'solid'],
  ['brick_paver', 0xc27a5c, 'solid'],
  // walls
  ['brick_red', 0xba573c, 'solid'],
  ['brick_dark', 0x8f4636, 'solid'],
  ['brick_orange', 0xd07a4a, 'solid'],
  ['brick_painted_white', 0xf3ecdc, 'solid'],
  ['stucco_cream', 0xf5e3bd, 'solid'],
  ['stucco_peach', 0xf4b58a, 'solid'],
  ['stucco_sage', 0xb7d39a, 'solid'],
  ['stucco_rose', 0xeea6a0, 'solid'],
  ['stucco_sky', 0xa6cbe6, 'solid'],
  ['clap_white', 0xf7f2e6, 'solid'],
  ['clap_blue', 0x86b6dc, 'solid'],
  ['clap_yellow', 0xf6d77c, 'solid'],
  ['clap_green', 0x9fd09a, 'solid'],
  ['clap_grey', 0xbfc4c6, 'solid'],
  ['stone_tan', 0xdcc394, 'solid'],
  ['stone_grey', 0xb4afa5, 'solid'],
  ['concrete', 0xc6c0b4, 'solid'],
  // trims & details
  ['trim_white', 0xfbf7ee, 'solid'],
  ['trim_cream', 0xf1e2c2, 'solid'],
  ['trim_dark', 0x3f3a40, 'solid'],
  ['trim_green', 0x2f6e57, 'solid'],
  ['trim_navy', 0x2f4b7a, 'solid'],
  ['trim_oxblood', 0x7d2f2f, 'solid'],
  ['wood_door', 0x8a5532, 'solid'],
  ['wood_planks', 0xb98552, 'solid'],
  ['glass', 0x8fd0ec, 'glass'],
  ['glass_shop', 0xb4e0ee, 'glass'],
  // roofs
  ['roof_slate', 0x4f6488, 'solid'],
  ['roof_red', 0xc8523b, 'solid'],
  ['roof_green', 0x3f8a72, 'solid'],
  ['roof_brown', 0x8d5a3c, 'solid'],
  ['roof_charcoal', 0x4a4c58, 'solid'],
  ['roof_flat', 0xa29b8e, 'solid'],
  ['roof_copper', 0x5fb3a0, 'solid'],
  ['roof_tan', 0xc4b08a, 'solid'],
  ['roof_tar', 0x77727a, 'solid'],
  ['roof_terracotta', 0xd27149, 'solid'],
  ['roof_garden', 0x7dbf4f, 'solid'],
  ['lamp_post', 0x2c4a3e, 'solid'],
  ['shutter_green', 0x3f7a58, 'solid'],
  ['shutter_blue', 0x3f6fa0, 'solid'],
  ['shutter_black', 0x34363d, 'solid'],
  // awnings
  ['awning_red', 0xd94a3d, 'solid'],
  ['awning_cream', 0xfaf0d8, 'solid'],
  ['awning_green', 0x2f8a5c, 'solid'],
  ['awning_blue', 0x3577b8, 'solid'],
  ['awning_yellow', 0xf2b93b, 'solid'],
  ['awning_black', 0x2f3038, 'solid'],
  // nature
  ['trunk', 0x7a4e30, 'solid'],
  ['leaves', 0x55a93a, 'leaves'],
  ['leaves_light', 0x82c84e, 'leaves'],
  ['leaves_dark', 0x3f8a34, 'leaves'],
  ['leaves_autumn', 0xe88a32, 'leaves'],
  ['leaves_blossom', 0xf4b6cc, 'leaves'],
  ['hedge', 0x4f9a3a, 'leaves'],
  ['flower_box_green', 0x4f9e3c, 'leaves'],
  ['flower_box_pink', 0xf08fb0, 'leaves'],
  ['flower_box_red', 0xe8544a, 'leaves'],
  ['flower_box_yellow', 0xf6cf4c, 'leaves'],
  ['flower_box_purple', 0xb08ae6, 'leaves'],
  ['flower_red', 0xf04a42, 'plant', false],
  ['flower_yellow', 0xffd23f, 'plant', false],
  ['flower_white', 0xfffaf0, 'plant', false],
  ['flower_purple', 0xa57be0, 'plant', false],
  ['tuft', 0x79bf43, 'plant', false],
  // street furniture
  ['iron', 0x2f3438, 'solid'],
  ['lamp', 0xffcf7a, 'emissive'],
  ['bench_wood', 0xa86c3c, 'solid'],
  ['planter', 0x9c7c62, 'solid'],
];

export const BLOCKS: BlockDef[] = defs.map(([name, color, kind, collide]) => ({
  name,
  color,
  kind,
  collide: collide ?? kind !== 'plant',
  tex: texOf(name),
}));

/** Texture class per block id (Float32 for direct use as a vertex attribute value). */
export const TEX_OF: Uint8Array = Uint8Array.from(BLOCKS.map((b) => b.tex));

export const B: Record<string, number> = Object.fromEntries(BLOCKS.map((b, i) => [b.name, i]));

export function blockId(name: string): number {
  const id = B[name];
  if (id === undefined) throw new Error(`unknown block ${name}`);
  return id;
}

/** Linear-space colour table (r,g,b per id) for vertex colours. */
export const LINEAR_RGB: Float32Array = (() => {
  const out = new Float32Array(BLOCKS.length * 3);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  BLOCKS.forEach((b, i) => {
    out[i * 3] = lin(((b.color >> 16) & 255) / 255);
    out[i * 3 + 1] = lin(((b.color >> 8) & 255) / 255);
    out[i * 3 + 2] = lin((b.color & 255) / 255);
  });
  return out;
})();

/** Full opaque cube that hides neighbouring faces and casts ambient occlusion. */
export function isOpaqueCube(v: number): boolean {
  if (v === 0 || v & SLAB) return false;
  const k = BLOCKS[v & ID_MASK]!.kind;
  return k === 'solid' || k === 'leaves' || k === 'emissive';
}
