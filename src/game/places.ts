import { profileFor, type ShopProfile } from '../content/shops';
import type { Vec3 } from '../world/types';

/** A business you can visit: real name/position from world data + FICTIONAL shop profile. */
export interface Place {
  id: string;
  name: string;
  category: string;
  address?: string;
  stand: Vec3;
  wall: [number, number];
  normal: [number, number];
  profile: ShopProfile;
  hero?: string;
}

interface BusinessRecord {
  id: string;
  name: string;
  category?: string;
  categoryPath?: string[];
  address?: string;
  status?: string;
  inCore?: boolean;
  confidence?: string;
  hero?: string;
  door?: { wall: [number, number]; normal: [number, number]; stand: Vec3 };
}

export class PlaceDirectory {
  readonly all: Place[];
  private readonly byId = new Map<string, Place>();

  constructor(records: BusinessRecord[]) {
    this.all = records
      .filter((b) => b.inCore && b.door && b.status !== 'closed' && b.confidence !== 'LOW' && b.name)
      .map((b) => ({
        id: b.id, name: b.name, category: b.category ?? 'business', address: b.address,
        stand: b.door!.stand, wall: b.door!.wall, normal: b.door!.normal,
        profile: profileFor(b.category, b.categoryPath), hero: b.hero,
      }));
    for (const p of this.all) this.byId.set(p.id, p);
  }

  static async load(url: string): Promise<PlaceDirectory> {
    const r = await fetch(url);
    const j = (await r.json()) as { businesses: BusinessRecord[] };
    return new PlaceDirectory(j.businesses);
  }

  get(id: string): Place | undefined {
    return this.byId.get(id);
  }

  /** Nearest place whose door the player is standing at (within `radius` m of the stand point). */
  nearestDoor(x: number, z: number, radius = 2.6): Place | null {
    let best: Place | null = null;
    let bd = radius;
    for (const p of this.all) {
      const d = Math.hypot(p.stand[0] - x, p.stand[2] - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  withStock(): Place[] {
    return this.all.filter((p) => p.profile.stock.length > 0);
  }
}
