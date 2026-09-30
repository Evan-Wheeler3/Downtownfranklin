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
- Unit: 24 vitest (projection parity < 1 cm vs PROJ, streaming policy, winding/normals, world data
  contract, Rapier collision incl. wall block + kerb step) · 10 pytest (pipeline transforms incl. address matching, report, manifest).
- e2e (Playwright, WebGL2/SwiftShader): boot on Main Street grounded; walking; buildings block (player
  ends < 0.6 m from a facade, never inside a footprint);
  far teleport streams in/out with physics ≤ 16 chunks — 4/4 pass.
- Validation report: 0 errors; drivable network 99.4 % in one component; places: 1,279 address-consistent,
  112 relocated to NAD, 157 unmatched, 80 without address (after D-020 fix).
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
After moving chunk builds to workers (M3.2, 3 workers): worker build max 22–34 ms (off-thread);
main-thread apply max was 29.5 ms, traced to terrain trimesh colliders (5–12 ms each) → switched to
heightfields (0.3 ms): **main-thread apply max 7.8 ms**. Remaining: first-ever physics step ~100 ms
one-off (WASM warm-up), GPU upload cost unmeasured (needs real GPU).

Geo verification (`python -m franklin_pipeline.geo_verify`): 2,771/2,771 buildings present, 0
duplicates, centroid Δ max 9.5 mm, area Δ p99 0.12 %; 1,070 core road ribbons, max vertex offset
from source centreline 6.9 mm; 8/8 heroes resolved; spawn not inside a building. Overlay map:
`artifacts/geo_verify.svg`.

## Adversarial review (session 1)
Independent reviewer subagent found 11 issues; all fixed and covered by tests (mutation-checked where
applicable): wrong-street address relocation, inverted courtyard walls, stale-LOD result stripping
collision, collider/teleport query staleness, ground ray hitting the player capsule, suite regex,
worker-crash stall + no retry backoff, in-flight cap bypass, weak e2e/unit assertions, Gauntlet leaking
the preview server; minor: duplicate-removal loop, uncounted passthrough drops, DEM out-of-raster clamping.
Open from review: LOD0/LOD1 terrain T-junction cracks at the 320 m ring (add skirts, M3).

## Known issues / debt
- Terrain LOD seams (T-junctions) at the detail ring; no skirts yet.
- Road/sidewalk layering relies on polygon offset; intersections are overlapping ribbons.
- Place label shows nearest place point (can pick mis-geocoded records; 157 unmatched addresses).
- `generatedUtc` changes on every pipeline run (manifest only; chunk output is deterministic — checked by Gauntlet major).
- Rendering never profiled on a real GPU (none in this environment).

## Next
M3 — Street-level fidelity (see ROADMAP.md). Done in session 1: M3.1 geo-verify report (in Gauntlet
major) and M3.2 worker chunk building + heightfield collision. Next: terrain skirts, kerbs as geometry
(M3.3), crosswalks/markings (M3.4), street furniture from point data (M3.5), pitched roofs, theatre marquee.
