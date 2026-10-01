# Status

_Last updated: 2026-10-01 (session 3)._ Read this first, then ROADMAP.md → "Next".

## Direction (session 2)
Product owner redirected the project (D-021): an aesthetically pleasing, thoughtful **RPG through a
stylised voxel town** — "beautifully shaded, almost Minecraft-style, detailed but clean and artsy".
Downtown Franklin's real street grid, footprints, heights and terrain remain the layout skeleton.

## Where we are
- **M0–M2 done (session 1):** stack, docs, data pipeline (Overture + USGS → validated → chunks), streaming,
  Rapier character, tests, Gauntlet. See git history / DECISIONS D-001…D-020.
- **M3-V Stylised voxel world — done (session 2):**
  - World rotated −59° so the downtown grid is axis-aligned (D-022); 256 chunks.
  - Runtime voxel generation in workers (D-023): terrain with half-slab steps; asphalt with yellow centre
    dashes, sidewalks, kerbs; parks, parking, water; buildings by archetype (shop rows with storefront glass,
    doors, striped awnings, sign bands; houses with shutters and stepped hip roofs + eaves; civic blocks with
    belt courses/lintels/parapets; churches with steeples; parking decks); trees, street trees in planters,
    lamps, flowers, benches.
  - Greedy mesher with vertex AO; slab-top merging; LOD1 without AO/plants. Triangles at street level
    2.7 M → ~1.2 M (low quality) after moving colour variation into the shader.
  - Look (D-024): TSL block shader (per-block tint + soft bevels), fresnel glass and animated water, glowing
    lamps + bloom, gradient sky with sun glow, blocky clouds, warm light, soft shadows, horizon fog.
  - Collision: block-surface heightfield + voxel collider of exposed structure blocks; autostep 0.55 m.

## Evidence (session 2)
- Unit 24/24 (voxel mesher: outward winding, greedy merge, AO, slabs, glass culling; chunk build payload,
  determinism; voxel-wall collision; projection with rotation) · pipeline 10/10 · e2e 4/4.
- Screenshots inspected (artifacts/, not committed): `vox-aerial.png` (downtown from 45 m),
  `vox-street-hq.png` (Main St, shadows + bloom), seam investigation `seam-all.png` (real shadow edges).
- Perf (SwiftShader, not a GPU benchmark): ~76 chunks resident, 85–120 draw calls, 1.16 M tris (low
  quality, aerial) / 1.7–1.9 M (full quality incl. shadow pass); worker chunk build ~200 ms warm,
  up to 1.4 s under SwiftShader CPU contention.

## Session 3 — "painted film" look (D-025)
- Cozier, saturated palette; procedural brick/siding/shingle/paver/grass/leaf/bark textures in the shader;
  painterly mottle; swaying, backlit foliage; flower window boxes; denser trees.
- Aerial-perspective haze fog node, deep-blue sky with sun glow, towering voxel cumulus.
- Golden sun with cool shadow fill; post: bloom, sun shafts, saturation, split toning, vignette, grain.
- Screenshots: `artifacts/ghibli-pair.png` (street + low aerial), `ghibli-aerial.png`.
- Investigated a "centre seam": it is the kerb line converging to the vanishing point when standing on
  the kerb looking down the street — real geometry, not an artifact.

## Known issues
- First load streams for several seconds; generator + mesher need optimisation (see ROADMAP debt).
- Player spawns hugging a facade (spawn uses pipeline sidewalk widths; voxel sidewalks differ slightly).
- Buildings are hollow shells you can't enter yet (doors are solid) — interiors are M5.
- Debug HUD hidden by default (`?debug` or H).

## Next
M4 — time of day, night lighting (window glow), weather. Then M5 interiors.
