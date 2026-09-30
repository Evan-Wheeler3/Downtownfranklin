# Status

_Last updated: 2026-09-30 (session 1)._ Read this first. Then ROADMAP.md → "Next".

## Where we are
- **M0 Foundation — done.** Stack chosen (D-001…D-003), docs, skills (`.claude/skills`), subagents
  (`.claude/agents`), Gauntlet (`scripts/gauntlet.mjs`), SessionStart hook, tests.
- **M1 Geographic data pipeline — done.** Overture 2026-09-23.1 + USGS 1 m DEM → normalized →
  validated (NAD address cross-check) → `public/world` (528 chunks, 2,771 buildings, 2,747 road
  ribbons, road graph 1,869 nodes / 2,484 edges, 1,627 business seeds, 8 HERO buildings).
- **M2 Geographic world slice — done.** Streamed first-person downtown from data: terrain from
  lidar DEM, extruded buildings with procedural facades/storefronts, roads with facade-derived
  sidewalks, parks/parking/water areas, Rapier collision (terrain + buildings, kerb autostep),
  LOD rings, spawn on Main Street facing the Franklin Theatre, HUD (lat/lon, street, perf), attribution.

## Evidence (session 1)
- Unit: 19 vitest (projection parity < 1 cm vs PROJ, streaming policy, winding/normals, world data
  contract, Rapier collision incl. wall block + kerb step) · 8 pytest (pipeline transforms, report, manifest).
- e2e (Playwright, WebGL2/SwiftShader): boot on Main Street grounded; walking; buildings block;
  far teleport streams in/out with physics ≤ 16 chunks — 4/4 pass.
- Validation report: 0 errors; drivable network 99.4 % in one component; places: 1,264 address-consistent,
  114 relocated to NAD, 170 unmatched, 80 without address.
- Visual inspection: street view at spawn (storefront row across Main St), aerial (real skewed
  downtown grid, building massing, sidewalks, parks). Screenshots in `artifacts/` (not committed).
- Perf (SwiftShader, not a GPU benchmark): see "Perf baseline" below.

## Perf baseline
Session-1 major Gauntlet (`scripts/perf.mjs`, SwiftShader WebGL2, 1280×720, `quality=low`, main-thread chunk builds):

| Scenario | draw calls | triangles | resident chunks | max chunk build (main thread) |
|---|---|---|---|---|
| idle at spawn | 284 | 193 k | 184 | 43 ms |
| walking Main St | 273 | 176 k | 184 | 43 ms |
| looking west | 300 | 171 k | 184 | 43 ms |
| aerial 60 m | 286 | 192 k | 184 | 43 ms |

Frame times (~600 ms) are SwiftShader software rendering, not representative.
After moving chunk builds to workers (M3.2, 3 workers): worker build max 33 ms (off-thread);
**main-thread apply max 29.5 ms** — still a hitch; likely Rapier trimesh collider creation /
GPU upload on first frames. Next step: split apply timing (GPU vs collider) and budget colliders.

Geo verification (`python -m franklin_pipeline.geo_verify`): 2,771/2,771 buildings present, 0
duplicates, centroid Δ max 9.5 mm, area Δ p99 0.12 %; 1,070 core road ribbons, max vertex offset
from source centreline 6.9 mm; 8/8 heroes resolved; spawn not inside a building. Overlay map:
`artifacts/geo_verify.svg`.

## Known issues / debt
- Chunk mesh building runs on the main thread (12–37 ms per chunk) → hitches while streaming (M3.2).
- Road/sidewalk layering relies on polygon offset; intersections are overlapping ribbons.
- Place label shows nearest place point (can pick mis-geocoded records; 170 unmatched addresses).
- `generatedUtc` changes on every pipeline run (manifest only; chunk output is deterministic — checked by Gauntlet major).
- Rendering never profiled on a real GPU (none in this environment).

## Next
M3 — Street-level fidelity + geo verification (see ROADMAP.md). Start with M3.2 (worker chunk
building, measured) and M3.1 (geo-verify report), then kerbs, crossings, street furniture.
