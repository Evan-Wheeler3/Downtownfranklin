/** World data schema (pipeline output, public/world). Keep in sync with build_world.py. */
export const WORLD_SCHEMA_VERSION = 1;

export type ContentTier = 'BACKGROUND' | 'ORDINARY' | 'HERO';
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface ChunkIndexEntry {
  id: string;
  cx: number;
  cz: number;
  file: string;
  minY: number;
  maxY: number;
  counts: { buildings: number; roads: number; areas: number; places: number; points: number };
}

export interface WorldManifest {
  schemaVersion: number;
  pipelineVersion: string;
  generatedUtc: string;
  origin: { lon: number; lat: number; elevationDatum: number; gridRotationDeg?: number };
  projection: string;
  axes: string;
  chunkSize: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  core: Vec2[];
  spawn?: { pos: Vec3; yawDeg: number; note: string };
  controlPoints: { lon: number; lat: number; x: number; z: number }[];
  chunks: ChunkIndexEntry[];
  attribution: string[];
}

export interface BuildingRecord {
  id: string;
  tier: ContentTier;
  hero?: string;
  footprint: Vec2[];
  holes?: Vec2[][];
  base: number;
  ground: number;
  height: number;
  heightConf: string;
  cls?: string;
  name?: string;
  roof?: string;
  floors?: number;
  src?: string;
}

export interface RoadRibbon {
  id: string;
  kind: string;
  cls: string;
  sub?: string;
  name?: string;
  width: number;
  oneWay?: 'forward' | 'backward';
  level?: number;
  /** INFERRED sidewalk widths left/right of the pts direction (kerb to facade), metres. */
  swL?: number;
  swR?: number;
  flags?: string[];
  pts: Vec3[];
}

export interface AreaRecord {
  id: string;
  layer: 'water' | 'land_use' | 'land_cover' | 'infrastructure';
  subtype?: string;
  cls?: string;
  ring: Vec2[];
  holes?: Vec2[][];
}

export interface DoorInfo {
  /** Point on the facade (x, z). */
  wall: Vec2;
  /** Outward unit normal of the facade at the door (x, z). */
  normal: Vec2;
  /** Where a visitor stands, outside the door. */
  stand: Vec3;
}

export interface PlaceMarker {
  id: string;
  name: string;
  cat?: string;
  pos: Vec3;
  door?: DoorInfo;
}

export interface TerrainPatch {
  origin: Vec2;
  spacing: number;
  n: number;
  /** base64 int16 LE centimetres relative to datum; row-major, rows along +z. */
  heightsCm: string;
}

export interface ChunkData {
  schemaVersion: number;
  id: string;
  cx: number;
  cz: number;
  terrain: TerrainPatch;
  buildings: BuildingRecord[];
  roads: RoadRibbon[];
  areas: AreaRecord[];
  places: PlaceMarker[];
  points: PointFeature[];
}

export interface PointFeature {
  id: string;
  cls: string;
  pos: Vec3;
}
