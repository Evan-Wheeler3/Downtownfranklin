---
name: world-pipeline
description: Fetch, rebuild or extend the geographic data pipeline (Overture Maps, USGS DEM → normalized → validated → public/world chunks). Use when changing world data, adding a data layer, changing the chunk schema, or re-fetching sources.
---

# World pipeline

Layers (never mix): `data/raw` → `data/normalized` → `data/validated` → `public/world`. Modules in `pipeline/franklin_pipeline/`.

Commands (from `pipeline/`, venv at `../.venv`):
- Rebuild everything offline: `../.venv/bin/python -m franklin_pipeline build`
- Re-fetch sources (network): `../.venv/bin/python -m franklin_pipeline fetch` — pins nothing by default; pass `--release` to `fetch_overture` to pin. Record the new release in `docs/SOURCE_LEDGER.md` and DECISIONS if it changes.
- Tests: `../.venv/bin/python -m pytest -q tests`

Adding a layer or field:
1. Fetch → keep raw untouched; manifest must record license + hash.
2. Normalize: map to our schema with `sources` provenance; mark derived attributes INFERRED.
3. Validate: count every drop/repair in `validation_report.json`; add a hard error if the layer can be silently broken.
4. build_world: add to chunk/graph output; update `src/world/types.ts`. If the change is breaking, bump
   `SCHEMA_VERSION` (build_world.py) **and** `WORLD_SCHEMA_VERSION` (types.ts).
5. Tests: `pipeline/tests/test_pipeline.py` for transforms, `tests/unit/worldData.test.ts` for the contract.
6. Ledger: new dataset → S-row; new derived value → I-row with method.

Authored data (`data/authored/*.json`) references source records by id (place_id, building_id), is resolved by build_world, and warns loudly if an id disappears after a re-fetch.

Network: Overture S3 and USGS S3 are reachable from the cloud env; City of Franklin GIS is REFERENCE ONLY (paid data, no license) — never ingest it.
