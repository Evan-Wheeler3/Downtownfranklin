# Roadmap

Vertical milestones; each must leave the game runnable and pass its acceptance criteria
(docs/ACCEPTANCE.md). Order revised as dependencies become clear — record changes in DECISIONS.

| # | Milestone | Status | Delivers |
|---|---|---|---|
| M0 | Foundation | ✅ done | repo, docs, stack decision, skills/agents, Gauntlet, app scaffold, CI-able tests |
| M1 | Geographic data pipeline | ✅ done | Overture + USGS fetch, normalize, validate (incl. NAD address check), game coords, chunks, road graph, business seeds, source ledger |
| M2 | Geographic world slice | ✅ done (perf follow-ups in M3) | streamed downtown from data, first-person walking, Rapier collision (terrain, buildings, kerbs), LOD rings, spawn on Main St, HUD with lat/lon + street, e2e tests |
| M3 | Street-level fidelity + geo verification | ⛔ superseded by M3-V (D-021) | geo-verify report and worker builds kept |
| **M3-V** | **Stylised voxel world overhaul** | ✅ done (session 2) | rotated axis-aligned grid, voxel generator + greedy AO mesher, TSL block shading, sky/clouds/bloom, voxel collision |
| M4 | Look & feel II: time of day + atmosphere | ✅ day/night done (weather pending) | sim clock, sun path, golden hour/dusk/night palettes, window + lamp glow at night, weather (rain/overcast), ambient sound hooks |
| **M4-P** | **First playable loop** | ✅ done (session 3) | title/pause, clock, money/energy/mood, shops at real business doors, odd-jobs phone (parcel runs, errands, rush), beacon + compass, versioned save/continue |
| **M5** | **Living town I: places you can enter** | ⏭ next | shop/house interiors as voxel rooms generated per archetype (FICTIONAL, art-directed), door portals, signage from place names, business categories → interaction profiles |
| M6 | RPG depth: progression, reputation, home base | planned | character state, wallet, inventory, buy/sell/eat/drink, versioned save/migrations |
| M7 | Quests & jobs | planned | data-driven quest graph, job board, errands/deliveries across town, waypoints, journal UI |
| M8 | Townsfolk (NPCs) | planned | voxel-styled characters, schedules, homes/workplaces, dialogue, relationship meters, crowd LOD |
| M9 | Traffic & life on the streets | planned | voxel cars on the road graph, signals, parking; birds, ambient props |
| M10 | Entertainment & events | planned | theatre shows, live music, festivals, tickets |
| M11 | Housing | planned | rent/buy, decorate (block placement inside your home), access |
| M12 | Polish & performance | planned | binary chunks, instancing, far-LOD impostors, GPU profiling on real hardware, settings, accessibility |
| M13+ | Expansion & release | planned | more neighbourhoods, onboarding, packaging |

## M4 — Look & feel II (next)
1. `src/sim/clock.ts`: game time (configurable day length), date; drives sun azimuth/elevation and `LOOK` presets (dawn, day, golden hour, dusk, night) interpolated.
2. Night: emissive window glow (per-building lit-window hash, warmer interiors), lamps brighter, bloom up, stars/moon in the sky shader.
3. Weather state machine: clear / overcast / rain (particle rain, wet darkened materials, puddle sheen), fog density.
4. Atmosphere details: chimney smoke voxels, drifting leaves, birds.
5. Acceptance: screenshot set at 4 times of day from 3 viewpoints; perf capture unchanged ±10 %.

## Known debt
- Voxel chunk build ~200 ms warm per chunk in a worker (gen ≈ mesh); first load of ~75 chunks takes several seconds. Optimise generator rasterisation + mesher y-range culling.
- ~1.2–1.8 M triangles resident at street level; add far-LOD (2 m blocks) or impostors in M12.
- Diagonal (off-grid) streets render as stair-stepped voxels by design.
- 5 MB JS bundle (three/webgpu + inlined Rapier WASM) → code-split in M14.
- Sidewalk/road overlap at intersections is a painter's-order hack (polygon offset) → proper junction polygons in M3/M13.
- Rendering FPS never measured on real GPU hardware (environment has none).
