/**
 * Local transverse Mercator (GRS80) matching the pipeline's PROJ string
 * (`+proj=tmerc +lat_0 +lon_0 +k=1`). Game axes: x = east, z = south (= -north).
 * Forward uses Snyder (1987) eqs. 8-9/8-10; inverse is Newton iteration on the forward.
 * Accuracy vs PROJ is verified against manifest control points in tests.
 */
const A = 6378137.0;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const DEG = Math.PI / 180;

function meridianArc(phi: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return (
    A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

export interface GeoOrigin {
  lon: number;
  lat: number;
  /** Rotation applied after projection so the town grid is axis-aligned (degrees). */
  gridRotationDeg?: number;
}

export class LocalProjection {
  private readonly lon0: number;
  private readonly m0: number;
  private readonly cos: number;
  private readonly sin: number;

  constructor(readonly origin: GeoOrigin) {
    this.lon0 = origin.lon * DEG;
    this.m0 = meridianArc(origin.lat * DEG);
    const r = (origin.gridRotationDeg ?? 0) * DEG;
    this.cos = Math.cos(r);
    this.sin = Math.sin(r);
  }

  /** lon/lat -> game x/z (projection, then grid rotation). */
  toGame(lon: number, lat: number): { x: number; z: number } {
    const p = this.toLocal(lon, lat);
    return { x: p.x * this.cos - p.z * this.sin, z: p.x * this.sin + p.z * this.cos };
  }

  /** WGS84/GRS80 lon/lat (degrees) -> unrotated local x (east) and z (south), metres. */
  toLocal(lon: number, lat: number): { x: number; z: number } {
    const phi = lat * DEG;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    const tan = Math.tan(phi);
    const n = A / Math.sqrt(1 - E2 * sin * sin);
    const t = tan * tan;
    const c = EP2 * cos * cos;
    const a = (lon * DEG - this.lon0) * cos;
    const a2 = a * a;
    const east =
      n * (a + ((1 - t + c) * a2 * a) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a2 * a2 * a) / 120);
    const north =
      meridianArc(phi) -
      this.m0 +
      n *
        tan *
        (a2 / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a2 * a2) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a2 * a2 * a2) / 720);
    return { x: east, z: -north };
  }

  /** Game x/z (metres) -> lon/lat degrees. */
  toGeo(gx: number, gz: number): { lon: number; lat: number } {
    const x = gx * this.cos + gz * this.sin;
    const z = -gx * this.sin + gz * this.cos;
    let lon = this.origin.lon + x / (111320 * Math.cos(this.origin.lat * DEG));
    let lat = this.origin.lat - z / 110574;
    for (let i = 0; i < 8; i++) {
      const p = this.toLocal(lon, lat);
      const ex = x - p.x;
      const ez = z - p.z;
      if (Math.abs(ex) < 1e-6 && Math.abs(ez) < 1e-6) break;
      const h = 1e-7;
      const px = this.toLocal(lon + h, lat);
      const pz = this.toLocal(lon, lat + h);
      // Jacobian of (x, z) w.r.t. (lon, lat)
      const j11 = (px.x - p.x) / h;
      const j12 = (pz.x - p.x) / h;
      const j21 = (px.z - p.z) / h;
      const j22 = (pz.z - p.z) / h;
      const det = j11 * j22 - j12 * j21;
      lon += (j22 * ex - j12 * ez) / det;
      lat += (-j21 * ex + j11 * ez) / det;
    }
    return { lon, lat };
  }
}
