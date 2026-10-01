# Decision log

Format: ID · date · decision · context/alternatives · consequences. Newest last. Supersede, don't delete.

### D-001 · 2026-09-30 · Rendering: three.js `WebGPURenderer` (WebGPU first, automatic WebGL2 fallback)
- **Context.** Need a browser 3D stack for a large streamed city with long-term viability, WebGPU with fallback, testability in headless CI, and a large ecosystem.
- **Alternatives.** Babylon.js 9 (strong WebGPU, batteries-included, Havok physics; heavier, more opinionated scene graph); PlayCanvas (editor-centric workflow); Unity/Godot web exports (large WASM payloads, weak browser integration, poor fit for data-driven streaming from JSON, harder automated testing).
- **Why three.js.** Minimal core we control (custom streaming, merged chunk geometry); `three/webgpu` gives one code path over WebGPU and WebGL2 (verified: headless SwiftShader runs the WebGL2 backend); TSL node materials for future custom shading; largest ecosystem; r186 current (2026-09).
- **Consequences.** We own scene management, LOD and streaming (intended). Postprocessing must use the node-based pipeline. `PCFSoftShadowMap` is not supported by WebGPURenderer → PCF.

### D-002 · 2026-09-30 · Physics/collision: Rapier (`@dimforge/rapier3d-compat` 0.21)
- Deterministic WASM physics with a built-in kinematic character controller (autostep, snap-to-ground, slope limits) — exactly what first-person city walking needs. Compat build inlines WASM (works in Vite and Node tests).
- Alternatives: cannon-es (unmaintained-ish, no KCC), Jolt WASM (excellent but heavier integration), Havok (Babylon-centric licensing/packaging), custom raycast walker (would not scale to vehicles/props).

### D-003 · 2026-09-30 · Language/tooling: TypeScript 6, Vite 8, Vitest 5, Playwright 1.56
- TS 7 (Go port) released today; staying on 6.0.x until its ecosystem settles. Playwright pinned to the version matching the preinstalled Chromium (1194) in the cloud environment.

### D-004 · 2026-09-30 · Geographic pipeline in Python (pyarrow, shapely, pyproj, rasterio)
- Mature GIS libraries (GEOS, PROJ, GDAL) → correct projections, geometry repair, raster sampling. Pipeline is offline/build-time; runtime stays pure TS. Contract between them is the versioned `public/world` schema plus tests on both sides.

### D-005 · 2026-09-30 · Primary sources: Overture Maps (OSM + Microsoft + Meta + NAD) and USGS 3DEP 1 m DEM
- City of Franklin GIS data is sold for a fee with no open license found (research §2.1) and its hosts are unreachable from this environment → REFERENCE ONLY until permission. OSM APIs/Geofabrik unreachable; Overture's S3 mirror of OSM-derived data is reachable and adds Microsoft footprints/heights, Meta places and NAD addresses. USGS 3DEP 1 m DEM (TN_Middle_B2_2018, public domain) for terrain.
- Release pinned in `data/raw/overture/<release>/manifest.json` (currently `2026-09-23.1`).

### D-006 · 2026-09-30 · Extents: fetch bbox ≫ core
- Fetch bbox `(-86.885, 35.912, -86.855, 35.938)` (~2.7 × 2.9 km) so edges have context and expansion needn't re-fetch. Core (ORDINARY tier) = research-recommended playable box `(-86.8770, 35.9190, -86.8580, 35.9290)` — INFERRED; replace with an authoritative historic-district polygon when licensed data is available.

### D-007 · 2026-09-30 · Game coordinates: local tmerc (GRS80) at an arbitrary origin, x=E, y=up, z=S, metres
- Sub-cm distortion over the area; matches three.js right-handed y-up; `z=-north` recorded in manifest. Elevation datum = DEM at origin (196 m). Runtime reimplements the projection; parity tested.

### D-008 · 2026-09-30 · Chunks: 128 m squares, JSON, terrain int16 cm base64
- Simple, debuggable, gzip-friendly; ~12 MB total for 528 chunks. Revisit binary (e.g. FlatBuffers/custom) when the world grows or parse cost shows up in profiles.

### D-009 · 2026-09-30 · Git policy for data
- Commit: `data/raw` snapshots (27 MB; sources change and may disappear → reproducibility), `data/authored`, `public/world` (runtime needs it). Ignore regenerable `data/normalized` and `data/validated` except their summary/report files.

### D-010 · 2026-09-30 · Terrain collision via trimesh, not Rapier heightfield
- Avoids heightfield row/column layout ambiguity; test verifies raycast = sampled height (< 5 cm). Cost acceptable at the 160 m physics radius. Revisit if collider build time matters.

### D-011 · 2026-09-30 · Places are cross-checked against NAD address points
- Overture place points are sometimes wrong (e.g. a garage 271 m off). Validation matches `freeform` addresses to NAD points; > 45 m → relocate to the NAD point (`MISMATCH_RELOCATED`, original kept). Result (after D-020): 1,279 consistent, 112 relocated, 157 unmatched.

### D-012 · 2026-09-30 · Street widths INFERRED by class; sidewalks derived from measured facade distance
- No licensed per-street width data. Carriageway width by OSM class; within the core, each side's sidewalk runs from the kerb to the median centreline-to-facade distance (clamped 1.5–6 m), else 2.5 m. All marked INFERRED in the ledger.

### D-013 · 2026-09-30 · Business hours: never invented
- `hours: null` (UNKNOWN) in data. Gameplay will use category-default hours explicitly flagged FICTIONAL until a licensed/verified hours source exists.

### D-014 · 2026-09-30 · HERO criterion: ≥ 2 independent corroborating sources
- E.g. Overture place + NAD address point + OSM building name + research. Entries not meeting this go in `pending_verification` (courthouse location, Gray's on Main spelling, Public Square features).

### D-015 · 2026-09-30 · Procedural textures only (for now)
- Facade/storefront/roof/ground textures generated on canvas at runtime; no external imagery. Future authored textures must come from CC0/owned sources recorded in the ledger.

### D-016 · 2026-09-30 · Automation surface `window.__franklin`
- Stable debug API for Playwright (state, teleport, look, scripted move). Keeps e2e tests independent of DOM/pointer-lock.

### D-017 · 2026-09-30 · Terrain collision → Rapier heightfield (supersedes D-010)
- Measured: 8,192-tri terrain trimesh collider costs 5–12 ms to build on the main thread vs 0.3 ms for a heightfield; it was the main source of the 29.5 ms apply spike. Layout (transpose to column-major, centred) is locked by an asymmetric raycast test. Buildings stay trimeshes (~0.2 ms each).

### D-018 · 2026-09-30 · Chunk geometry built in Web Workers
- `chunkWorker.ts` fetches + builds typed arrays (transferred, zero-copy); main thread only creates buffers/colliders under a 4 ms/frame budget. Stale results (unloaded chunk, superseded LOD) are dropped; resident LOD that matches the wanted LOD cancels in-flight rebuilds; failures back off exponentially; worker crashes reject their requests. Main-thread fallback path uses the same `buildChunk`.

### D-019 · 2026-09-30 · Physics query consistency
- Rapier only updates its broad phase in `step()`. `PhysicsWorld.sync()` performs a negligible step when colliders changed, before ray casts and character-controller queries; teleports propagate body→collider immediately. Ground rays exclude kinematic/dynamic bodies (never hit the player capsule).

### D-020 · 2026-09-30 · Address matching must agree on directional and street type
- Adversarial review found "137 4th Ave S" relocated 335 m to "137 4th Ave N". Matching now requires equal directionals and street types when given; ordinals ("Third") and suite markers ("# 2") normalised. Result: 1,279 consistent / 112 relocated / 157 unmatched.

### D-021 · 2026-10-01 · Direction: stylised voxel RPG town (supersedes the fidelity goal)
- Product owner direction: the game is an aesthetically pleasing, thoughtfully designed RPG through a town, not an exact recreation. Visual target: "beautifully shaded, almost Minecraft-style world — detailed but clean and artsy".
- Real geography stays as the **skeleton** (street grid, block layout, building footprints/heights, terrain, place names as seeds); everything visual is art-directed procedural content. Provenance tooling is kept (cheap, useful for seeding), but geographic exactness is no longer an acceptance goal. Fictional content still never masquerades as fact in docs.

### D-022 · 2026-10-01 · World grid rotated −59° so downtown streets are axis-aligned
- Length-weighted bearing histogram of core streets peaks at 59° (mod 90). Rotation applied in `build_world.lonlat_to_game` and `LocalProjection.toGame` (manifest `origin.gridRotationDeg`); parity tests updated. World bounds = largest axis-aligned rectangle inside the rotated fetch area (97 % of the core; 256 chunks).

### D-023 · 2026-10-01 · Voxel world generated at runtime in workers
- 1 m blocks + half-slabs (terrain quantised to 0.5 m). `src/voxel/generate.ts` turns chunk data into a volume (terrain columns, rasterised streets/sidewalks/kerbs/lane dashes, parks/parking/water, procedural buildings by archetype — shop/block/house/church/garage — with storefront glass, doors, awnings, sign bands, belt courses, lintels, shutters, parapets, stepped hip roofs, steeples, rooftop units; voxel trees, street trees, lamps, flowers, benches).
- `src/voxel/mesher.ts`: greedy meshing with Minecraft-style vertex AO; slab tops greedy too; LOD1 drops AO and plants. Surface colour variation lives in the shader (not the palette) so faces merge — this halved triangle counts.
- Collision: walkable heightfield from the block surface (1 m lattice) + Rapier voxel collider of exposed structure cells (hollow buildings keep it small; measured 30k voxels ≈ 9 ms).

### D-024 · 2026-10-01 · Look: TSL block shader, warm light, gradient sky, bloom
- Block material = palette colour × baked AO × per-block hash tint × soft bevel computed from world position (reads as blocks even after greedy merging). Glass/water use fresnel toward the sky colour; lamps are emissive and picked up by bloom. Neutral tone mapping, soft (0.72) PCF shadows, warm sun at 235°/38°, warm-ground hemisphere light, distance fog matched to the horizon, blocky clouds. All tunables in `LOOK` (src/render/renderer.ts).

### D-025 · 2026-10-01 · "Painted film" look (cozier, saturated, textured, hazy, sunlit)
- Product owner direction: cozier, more saturated, Ghibli-like; more texture, haze, sunlight, real-world effects.
- Palette re-saturated and warmed (blocks.ts). Block shader adds procedural surface patterns per texture class (brick bond with mortar, lap siding, shingles, pavers, asphalt grain, grass speckle with soil sides, leaf dapples, bark) faded with distance, plus a painterly low-frequency mottle (MaterialX noise) — all in the shader so greedy meshing is unaffected.
- Foliage is its own mesh group: wind sway in the vertex stage and warm translucency when backlit by the sun. Window boxes with flowers; denser trees.
- Atmosphere: custom `scene.fogNode` aerial-perspective haze (height falloff, warm toward the sun, cool away), deep-blue gradient sky with layered sun glow, towering voxel cumulus with warm tops and cool undersides.
- Light: golden sun (azimuth 210°, elevation 33°), cool sky fill + warm ground bounce (soft blue-violet shadows), ACES filmic.
- Post (full quality only): bloom on HDR highlights, raymarched sun shafts (built lazily once the shadow map exists), saturation 1.32, warm-highlight/cool-shadow split toning, vignette, fine grain. All tunables in `LOOK`. `?rays=0` disables shafts.
- Tuning lessons (screenshots): haze density > 0.002 and bloom threshold < 1 washed the image out; additive shafts must stay ≲ 0.2.
