/**
 * Dense voxel volume over an axis-aligned box of 1 m cells in world (game) coordinates.
 * Cell (x, y, z) spans [x, x+1) × [y, y+1) × [z, z+1). Values: see blocks.ts.
 */
export class VoxelVolume {
  readonly data: Uint16Array;
  /** Cells written by structures (buildings, trees, props) — used for collision. */
  readonly structure: Uint8Array;

  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
  ) {
    this.data = new Uint16Array(sx * sy * sz);
    this.structure = new Uint8Array(sx * sy * sz);
  }

  /** Index for world cell, or -1 if outside. Layout: x fastest, then z, then y. */
  index(x: number, y: number, z: number): number {
    const lx = x - this.ox;
    const ly = y - this.oy;
    const lz = z - this.oz;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.sx || ly >= this.sy || lz >= this.sz) return -1;
    return (ly * this.sz + lz) * this.sx + lx;
  }

  get(x: number, y: number, z: number): number {
    const i = this.index(x, y, z);
    return i < 0 ? 0 : this.data[i]!;
  }

  set(x: number, y: number, z: number, v: number, structure = false): void {
    const i = this.index(x, y, z);
    if (i < 0) return;
    this.data[i] = v;
    this.structure[i] = structure && v !== 0 ? 1 : 0;
  }

  /** Set only if the cell is currently air. */
  setIfEmpty(x: number, y: number, z: number, v: number, structure = false): boolean {
    const i = this.index(x, y, z);
    if (i < 0 || this.data[i] !== 0) return false;
    this.data[i] = v;
    this.structure[i] = structure && v !== 0 ? 1 : 0;
    return true;
  }
}
