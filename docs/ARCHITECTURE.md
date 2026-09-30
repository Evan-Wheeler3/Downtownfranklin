# Architecture

## 1. Data pipeline (Python, `pipeline/franklin_pipeline`)

| Stage | Module | Input → Output | Responsibility |
|---|---|---|---|
| 1 Fetch | `fetch_overture.py`, `fetch_dem.py` | sources → `data/raw/…` | Byte-for-byte snapshots, manifest with release, bbox, sha256, license, fetch time |
| 2 Normalize | `normalize.py` | raw → `data/normalized/*.geojson` | Map source schemas to project layer schemas (WGS84). Keep provenance. No repair. |
| 3 Validate | `validate.py` | normalized → `data/validated/*.geojson` + `validation_report.json` | Repair/drop invalid geometry, dedupe, clamp, topology checks, NAD address cross-check, place→building linkage. Every change counted in the report; hard failures exit non-zero. |
| 4 Game coords | `build_world.py` | validated + `data/authored` → `public/world` | Project to local tmerc, sample DEM, tier buildings, chunk, road ribbons + routable graph, business seeds, spawn, attribution. |

Intermediate layers (`normalized`, `validated`) are regenerable and git-ignored except
`validated/validation_report.json` and `normalized/summary.json`.

### Coordinate system
- Local transverse Mercator on GRS80 centred at `config.ORIGIN_*` (an arbitrary datum, not a landmark).
- Game axes: **x = east, y = up, z = south** (metres). y = NAVD88 elevation − `elevationDatum`.
- Runtime `src/core/geo.ts` re-implements the projection (Snyder) and is tested against pipeline control points (< 1 cm).

### World package (`public/world`, schema v1 — `src/world/types.ts`)
- `manifest.json`: origin, projection, bounds, core polygon, chunk index (bounds, counts, y-range), spawn, control points, attribution.
- `chunks/c_<cx>_<cz>.json` (128 m squares): terrain heightfield (2 m, int16 cm base64), buildings (footprint, base/ground, height, tier, hero key, provenance-derived fields), road ribbons clipped to the chunk (with INFERRED widths and facade-derived sidewalks), areas (water, parking, parks), places (core only), point features (signals, crossings, bus stops…).
- `roads/graph.json`: nodes (Overture connectors) and edges (segments split at connectors) with one-way, speed, class, polyline — the future traffic/pathing graph.
- `businesses.json`: business seed records (name, category, address, pos, building link, status, hours=null, website, source, sourceDate, confidence, addressCheck, interiorTier, hero).

## 2. Runtime (TypeScript, `src/`)

```
main.ts → Game (game/game.ts)
  ├─ RenderContext (render/renderer.ts): three.js WebGPURenderer (WebGL2 fallback), sun/hemi, fog
  ├─ PhysicsWorld (physics/physics.ts): Rapier; static trimesh colliders grouped by chunk owner
  ├─ World (world/world.ts): streaming + chunk mesh build
  │    ├─ StreamingPolicy (world/streaming.ts): pure ring policy (render/detail/physics radii + hysteresis)
  │    ├─ terrain.ts: decode/sample/mesh heightfields
  │    └─ geometry.ts: pure builders (buildings, ribbons, areas) → typed arrays
  ├─ PlayerController (player/controller.ts): Rapier kinematic capsule (autostep kerbs, snap to ground)
  ├─ InputState (player/input.ts): pointer lock + keys; scriptable for automation
  ├─ Hud (ui/hud.ts): debug readout, location label, attribution
  └─ debugApi.ts: window.__franklin automation surface
```

### Streaming tiers (current defaults, `DEFAULT_RADII`)
| Ring | Radius | What |
|---|---|---|
| physics | 160 m | terrain + building colliders |
| detail (LOD0) | 320 m | full-res terrain (2 m), shadows cast |
| render (LOD1) | 900 m | terrain at 8 m step, no shadow casting |
| hysteresis | +48 m | release distance margin |

Per chunk: one mesh per material (terrain, facade-upper, storefront, roof, roads, areas) → ~6 draw calls.
Chunk building is on the main thread with a per-frame budget (known hitch source; worker planned).

### Content tiers
- **BACKGROUND**: outside the core polygon — procedural massing only.
- **ORDINARY**: inside the core — procedural facades with storefront band, sidewalks.
- **HERO**: `data/authored/hero_locations.json`, corroborated by ≥ 2 independent sources; authored detail later.

### Interior tiers (planned, data field `interiorTier` already present)
0 exterior only · 1 simple functional · 2 detailed gameplay · 3 hero. Interiors will be separate
streamable units keyed by building id, entered via portals; never claimed accurate without evidence.

## 3. Future simulation layers (planned, see ROADMAP)
- `src/sim/clock` (time/date, day-night, weather) drives lighting, business hours, schedules.
- `src/sim/npc` tiered simulation (near: agents with navmesh/sidewalk graph; mid: path-following
  tokens; far: statistical occupancy per block).
- `src/sim/traffic` on `roads/graph.json` (one-way, turn restrictions from Overture `prohibited_transitions`).
- `src/game/economy`, `quests`, `housing`, `save` — data-driven registries; save state versioned with migrations.
