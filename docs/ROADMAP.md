# Roadmap

Vertical milestones; each must leave the game runnable and pass its acceptance criteria
(docs/ACCEPTANCE.md). Order revised as dependencies become clear — record changes in DECISIONS.

| # | Milestone | Status | Delivers |
|---|---|---|---|
| M0 | Foundation | ✅ done | repo, docs, stack decision, skills/agents, Gauntlet, app scaffold, CI-able tests |
| M1 | Geographic data pipeline | ✅ done | Overture + USGS fetch, normalize, validate (incl. NAD address check), game coords, chunks, road graph, business seeds, source ledger |
| M2 | Geographic world slice | ✅ done (perf follow-ups in M3) | streamed downtown from data, first-person walking, Rapier collision (terrain, buildings, kerbs), LOD rings, spawn on Main St, HUD with lat/lon + street, e2e tests |
| **M3** | **Street-level fidelity + geo verification** | ⏭ next | see below |
| M4 | Time, sky and weather core | planned | sim clock/date, sun position for Franklin lat/lon, day/night lighting, weather state machine (rain/overcast/clear), street lights at night; all systems subscribe to the clock |
| M5 | Business framework + Tier-1 interiors | planned | business registry from `businesses.json` + authored overrides, category→interaction profiles, FICTIONAL default hours, open/closed signage, enter/exit portals, streamable Tier-1 interior kit |
| M6 | Economy + inventory + save v1 | planned | wallet, prices, transactions, inventory, buy/order/eat/drink, versioned save with migrations (player, money, inventory, time) |
| M7 | Tasks/jobs/quests framework | planned | data-driven quest graph (steps, conditions, rewards), job board, first jobs: deliveries/errands between real addresses; waypoints |
| M8 | NPC simulation (tiers) | planned | pedestrians on a sidewalk graph, identity/archetype/home/work/schedule, near/mid/far simulation tiers, crowd LOD, interaction stub (talk) |
| M9 | Traffic | planned | vehicles on `roads/graph.json` with one-way/turn restrictions, intersections/signals from point data, parking, traffic LOD |
| M10 | Entertainment + hero interiors | planned | Franklin Theatre Tier-3 (fictionalised interior, labelled), event schedules (FICTIONAL unless sourced), tickets, movies/live music gameplay, event NPC behaviour |
| M11 | Housing | planned | rentals/ownership (game state separate from real-world property snapshots), moving, furnishing, access permissions |
| M12 | Social + relationships | planned | relationship model, dialogue system, social tasks |
| M13 | Visual fidelity pass 2 | planned | authored materials, vegetation, props, vehicles/pedestrian art, atmosphere, weather VFX, hero exteriors |
| M14 | Performance hardening | planned | worker-based chunk building, binary chunks, instancing, GPU profiling on real hardware, memory budgets |
| M15 | Expanded world | planned | fetch/stream beyond downtown (Five Points, Hincheyville, Pinkerton Park, Harpeth riverfront) |
| M16+ | Deeper simulation, polish, release readiness | planned | balancing, accessibility, settings, onboarding, packaging |

## M3 — Street-level fidelity + geo verification (next)
1. **Geo-verification report** (`scripts/geo_verify.py` or pipeline stage): overlay of generated chunk geometry vs validated source (footprint area/centroid deltas, road polyline deltas, HERO presence), output an SVG/PNG map + JSON to `artifacts/`; wire into Gauntlet `major`.
2. **Worker chunk building**: move `populate()` geometry generation into a Web Worker (transferable typed arrays) to remove the 12–37 ms main-thread hitches; measure before/after with `scripts/perf.mjs`.
3. **Kerbs as geometry**: raised sidewalk edge (0.15 m) along facade-derived sidewalks; collider included; verify autostep in e2e.
4. **Street markings & crossings**: centre lines from one-way/class, crosswalks at `crossing` points, stop bars at `traffic_signals`.
5. **Street furniture from point data** (signals, bus stops, bollards) as instanced meshes; trees from land cover (INFERRED placement) only where sourced.
6. **Pitched roofs** where `roof_shape` is known; parapets for commercial core buildings.
7. **Hero exterior pass 1**: Franklin Theatre marquee/sign volume (authored, labelled as stylised).
8. Resolve `pending_verification` items where evidence allows (courthouse footprint).

## Known debt
- Main-thread chunk builds (hitches) → M3.2.
- 5 MB JS bundle (three/webgpu + inlined Rapier WASM) → code-split in M14.
- Sidewalk/road overlap at intersections is a painter's-order hack (polygon offset) → proper junction polygons in M3/M13.
- Rendering FPS never measured on real GPU hardware (environment has none).
