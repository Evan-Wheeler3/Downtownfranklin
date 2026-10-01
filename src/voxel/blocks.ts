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
}

export const SLAB = 0x100;
export const ID_MASK = 0xff;

const defs: [string, number, BlockKind, boolean?][] = [
  ['air', 0x000000, 'solid', false],
  // ground
  ['grass', 0x7fb35a, 'solid'],
  ['grass_dark', 0x6a9e4c, 'solid'],
  ['dirt', 0x8a6a4a, 'solid'],
  ['stone', 0x8f8c86, 'solid'],
  ['sand', 0xd9c79a, 'solid'],
  ['gravel', 0x9c968c, 'solid'],
  ['path', 0xc9b48a, 'solid'],
  ['water', 0x4f9fc4, 'water', false],
  // streets
  ['asphalt', 0x5b5e66, 'solid'],
  ['asphalt_light', 0x585b63, 'solid'],
  ['line_yellow', 0xe8c14a, 'solid'],
  ['line_white', 0xe9e6dc, 'solid'],
  ['sidewalk', 0xc8c2b4, 'solid'],
  ['sidewalk_alt', 0xbdb6a6, 'solid'],
  ['curb', 0xa7a196, 'solid'],
  ['brick_paver', 0xb0705a, 'solid'],
  // walls
  ['brick_red', 0xa4503c, 'solid'],
  ['brick_dark', 0x7e3f33, 'solid'],
  ['brick_orange', 0xbf7048, 'solid'],
  ['brick_painted_white', 0xe8e2d4, 'solid'],
  ['stucco_cream', 0xeadcb8, 'solid'],
  ['stucco_peach', 0xe9b996, 'solid'],
  ['stucco_sage', 0xb7c4a0, 'solid'],
  ['stucco_rose', 0xdba3a0, 'solid'],
  ['stucco_sky', 0xa9c3d6, 'solid'],
  ['clap_white', 0xf0ede4, 'solid'],
  ['clap_blue', 0x8fb0c8, 'solid'],
  ['clap_yellow', 0xeed58a, 'solid'],
  ['clap_green', 0x9cbf9a, 'solid'],
  ['clap_grey', 0xb4b8bb, 'solid'],
  ['stone_tan', 0xcdbb98, 'solid'],
  ['stone_grey', 0xa9a7a1, 'solid'],
  ['concrete', 0xb9b6ae, 'solid'],
  // trims & details
  ['trim_white', 0xf5f1e8, 'solid'],
  ['trim_cream', 0xe9dcc0, 'solid'],
  ['trim_dark', 0x3c3a3f, 'solid'],
  ['trim_green', 0x3f5e4a, 'solid'],
  ['trim_navy', 0x34445e, 'solid'],
  ['trim_oxblood', 0x6a2e2e, 'solid'],
  ['wood_door', 0x7a5236, 'solid'],
  ['wood_planks', 0xa77c52, 'solid'],
  ['glass', 0x9fc7dc, 'glass'],
  ['glass_shop', 0xbcd8e4, 'glass'],
  // roofs
  ['roof_slate', 0x5d6470, 'solid'],
  ['roof_red', 0xa5493b, 'solid'],
  ['roof_green', 0x5f7f62, 'solid'],
  ['roof_brown', 0x7b5a44, 'solid'],
  ['roof_charcoal', 0x45474d, 'solid'],
  ['roof_flat', 0x8d8a84, 'solid'],
  ['roof_copper', 0x6fa596, 'solid'],
  ['roof_tan', 0xb3a587, 'solid'],
  ['roof_tar', 0x6c6a6a, 'solid'],
  ['roof_terracotta', 0xb86c4e, 'solid'],
  ['roof_garden', 0x86ad5e, 'solid'],
  ['lamp_post', 0x2f4038, 'solid'],
  ['shutter_green', 0x4d6b55, 'solid'],
  ['shutter_blue', 0x4e6a8a, 'solid'],
  ['shutter_black', 0x34363b, 'solid'],
  // awnings
  ['awning_red', 0xc4473d, 'solid'],
  ['awning_cream', 0xf1e6cf, 'solid'],
  ['awning_green', 0x3f7d5a, 'solid'],
  ['awning_blue', 0x3f6f9e, 'solid'],
  ['awning_yellow', 0xe7b847, 'solid'],
  ['awning_black', 0x2e2f33, 'solid'],
  // nature
  ['trunk', 0x6b4a32, 'solid'],
  ['leaves', 0x5f9a48, 'leaves'],
  ['leaves_light', 0x7db45a, 'leaves'],
  ['leaves_dark', 0x4a7f3c, 'leaves'],
  ['leaves_autumn', 0xd08a3c, 'leaves'],
  ['leaves_blossom', 0xeab3c4, 'leaves'],
  ['hedge', 0x557f43, 'leaves'],
  ['flower_red', 0xe0524a, 'plant', false],
  ['flower_yellow', 0xf2cf4a, 'plant', false],
  ['flower_white', 0xf6f3ea, 'plant', false],
  ['flower_purple', 0x9b7ad0, 'plant', false],
  ['tuft', 0x6fa64e, 'plant', false],
  // street furniture
  ['iron', 0x2f3236, 'solid'],
  ['lamp', 0xffd890, 'emissive'],
  ['bench_wood', 0x9a6a42, 'solid'],
  ['planter', 0x8c7a66, 'solid'],
];

export const BLOCKS: BlockDef[] = defs.map(([name, color, kind, collide]) => ({
  name,
  color,
  kind,
  collide: collide ?? kind !== 'plant',
}));

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
