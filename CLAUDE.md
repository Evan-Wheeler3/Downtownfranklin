# Downtown Franklin — project guide for Claude

First-person RPG / life sim through a beautifully shaded, stylised voxel town ("almost
Minecraft — detailed but clean and artsy"), laid out on the real street grid of downtown
Franklin, Tennessee. Geography is the skeleton; visuals and gameplay are art-directed (D-021).
Browser-based (TypeScript, three.js WebGPU/WebGL2 + TSL, Rapier).
Long-running, multi-session project: **the repository is the memory**. Read
`docs/STATUS.md` first in every new session, then `docs/ROADMAP.md` for the next milestone.

## Commands

```bash
npm install                      # JS deps (SessionStart hook does this on the web)
npm run dev                      # dev server http://127.0.0.1:5173
npm run build                    # typecheck + production build
npm test                         # vitest unit tests (tests/unit)
npm run e2e                      # Playwright runtime tests (builds + previews; ~3 min on SwiftShader)
npm run gauntlet -- small|feature|major   # verification by task size (docs/GAUNTLET.md)

# Geographic pipeline (Python 3.11+, venv at .venv)
python -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
cd pipeline && ../.venv/bin/python -m franklin_pipeline build   # normalize → validate → world
cd pipeline && ../.venv/bin/python -m franklin_pipeline fetch   # re-download raw sources (network)
.venv/bin/python -m pytest pipeline/tests
node scripts/shot.mjs out.png "<js>"   # screenshot a running preview (see skill runtime-inspect)
node scripts/perf.mjs                  # scripted perf capture -> artifacts/perf-*.json
```

URL params: `?renderer=webgl` (force WebGL2), `?quality=low` (no shadows/post, 1x DPR), `?post=0`, `?debug` (HUD stats; H toggles), `?nohelp`.
Automation surface: `window.__franklin` (src/game/debugApi.ts).

## Architecture (see docs/ARCHITECTURE.md)

```
SOURCE → data/raw → data/normalized → data/validated → public/world (game coords) → runtime
         fetch_*     normalize.py      validate.py       build_world.py              src/
```
- `pipeline/franklin_pipeline/` — Python. All geographic facts enter here, with provenance.
- `data/raw/` — committed source snapshots + manifests (hashes, licenses, dates).
- `data/authored/` — hand-authored overlays (hero locations, spawn, overrides). Reference
  source records by id; never raw coordinates unless the entry says why.
- `public/world/` — committed pipeline output consumed by the game (schema in `src/world/types.ts`).
- `src/voxel` block palette, volume, chunk generator (buildings/streets/nature), greedy AO mesher ·
  `src/render/voxelMaterials.ts` TSL block/glass/water shaders, sky, clouds ·
- `src/core` math/hash/geo · `src/world` streaming + worker chunk builds · `src/physics` Rapier ·
  `src/player` controller/input · `src/render` renderer/textures · `src/game` loop, perf, debug API · `src/ui` HUD.

## Rules (non-negotiable)

1. **Art direction first.** The look is stylised voxel; tune it in data/`LOOK`/palette, and judge
   changes by screenshots (street level + aerial). Clean > busy; vary colour in the shader, not
   the palette, so greedy meshing keeps triangle counts low.
2. **Never fabricate facts** in docs/data: real-world claims keep their VERIFIED / INFERRED / UNKNOWN
   labels (`docs/SOURCE_LEDGER.md`); invented content is simply fiction, labelled FICTIONAL in data.
   Layout facts (coordinates, names) come from the pipeline, not from game code.
3. Keep pipeline layers separate; runtime only reads `public/world`. Bump
   `SCHEMA_VERSION` (build_world.py) and `WORLD_SCHEMA_VERSION` (types.ts) together.
4. Invented gameplay content (fictional hours, interiors, NPCs) is labelled FICTIONAL in data.
5. No copyrighted imagery (Google/Apple/Bing/Street View are reference only). Textures are
   procedural or from clearly licensed sources recorded in the ledger.
6. ODbL attribution must stay visible in-game (HUD footer from `manifest.attribution`).
7. Don't declare work done on a green typecheck: run the Gauntlet level that fits, look at the
   running app for visual work, measure for perf work (docs/ACCEPTANCE.md).
8. End meaningful work by updating docs/STATUS.md (+ DECISIONS/ROADMAP/SOURCE_LEDGER as needed)
   and committing on the working branch.

## Environment notes

- Headless Chromium has no GPU: WebGL2 via SwiftShader, ~2 fps. FPS from tests is not a GPU
  benchmark; CPU-side timings (chunk build ms, cpu ms/frame) are meaningful. Use `/opt/pw-browsers/chromium`.
- Network egress may be restricted. Overture S3 (`overturemaps-us-west-2.s3.amazonaws.com`) and USGS
  (`prd-tnm.s3.amazonaws.com`) have worked; City of Franklin GIS, OSM APIs and most web hosts did not.
- Skills: `.claude/skills/` (gauntlet, world-pipeline, runtime-inspect, source-research).
  Subagents: `.claude/agents/` (adversarial-reviewer, geo-verifier, source-researcher).
