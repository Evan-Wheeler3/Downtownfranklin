# Source ledger

Every external fact or dataset the project uses. Classification:
**VERIFIED** (confirmed from an authoritative/primary source or ≥2 independent sources) ·
**INFERRED** (derived by us from sources; method stated) · **REFERENCE ONLY** (may be looked at, not
copied/redistributed) · **UNKNOWN**. "VERIFIED\*" = from a search excerpt, full page not read.

Detailed research notes: `docs/research/franklin-research-2026-09-30.md`.

## Datasets in use

| ID | Dataset | Publisher | Access | Version / date | License | Class | Used for |
|---|---|---|---|---|---|---|---|
| S-01 | Overture Maps `buildings/building` | Overture Maps Foundation (OSM + Microsoft ML Buildings) | `s3://overturemaps-us-west-2/release/2026-09-23.1/` | 2026-09-23.1, fetched 2026-09-30 | ODbL-1.0 | VERIFIED (source data) | footprints, heights (MS heights = model estimates → INFERRED), names, classes |
| S-02 | Overture `transportation/segment`, `connector` | Overture (OSM-derived) | same | same | ODbL-1.0 | VERIFIED | road centrelines, names, classes, one-way, speed, road graph |
| S-03 | Overture `places/place` | Overture (Meta, Microsoft, others) | same | same; per-record `update_time` ≈ 2026-09 | CDLA-Permissive-2.0 | VERIFIED (as a dataset); per-record locations checked vs NAD | business seeds, hero candidates |
| S-04 | Overture `addresses/address` | Overture ← USDOT National Address Database (NAD, v20250924) | same | same | Public domain (US) | VERIFIED | address cross-check of places |
| S-05 | Overture `base/*` (water, land_use, land_cover, infrastructure) | Overture (OSM-derived) | same | same | ODbL-1.0 | VERIFIED | river/stream centrelines, parks, parking lots, signals, crossings, bus stops |
| S-06 | USGS 3DEP 1 m DEM, project TN_Middle_B2_2018, tile x51y398 | USGS | `https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/TN_Middle_B2_2018/TIFF/USGS_one_meter_x51y398_TN_Middle_B2_2018.tif` | 2018 collection; cropped 2026-09-30 | Public domain (USGS; credit requested) | VERIFIED | terrain, building base elevations, road elevations |

Attribution shown in-game: `public/world/manifest.json › attribution`.

## Derived values (INFERRED — method documented)

| ID | Value | Method | Where |
|---|---|---|---|
| I-01 | Core area bbox `(-86.8770, 35.9190, -86.8580, 35.9290)` | Research §1.4 recommended playable box from anchor coordinates | `pipeline/…/config.py` CORE_BBOX |
| I-02 | Carriageway widths by class (primary 12 m … service 4.5 m) | Typical US urban widths; not measured | `config.py` ROAD_WIDTH_M |
| I-03 | Sidewalk widths per street side | Median centreline→first facade distance minus half carriageway, clamped 1.5–6 m | `build_world.py facade_distances` |
| I-04 | Building heights where missing | floors×3.4+1, else class default (house 6.5 m …) | `build_world._default_height`, `heightConf` field |
| I-05 | Building base elevation | min DEM sample over footprint vertices + centroid | `build`: `base`, `ground` (median) |
| I-06 | Place→building link | point-in-footprint, else nearest footprint ≤ ~20 m | `places.building_link` |
| I-07 | Waterway widths (river 24 m, stream 4 m) | Nominal; Harpeth is a centreline only in source | `WATERWAY_WIDTH_M` |
| I-08 | Place relocations (114) | Overture point > 45 m from its NAD address point → moved to NAD point | `address_check`, `original_coordinates` |
| I-09 | Facade colours/storefront bands | Stylistic palette; no source facade colours for most buildings | `src/world/geometry.ts` |

## Facts about places (see also `data/authored/hero_locations.json`)

| Fact | Class | Evidence |
|---|---|---|
| Franklin Theatre at 419 Main St, operating | VERIFIED | Overture place (Meta, conf 0.92, `open`, 2026-09); NAD point 3 m away; OSM building name; research §4 (2026 calendar) |
| Puckett's at 120 4th Ave S | VERIFIED | place + NAD + OSM building name + research |
| Masonic Hall (Hiram Lodge No. 7), 115 2nd Ave S, built 1823 (NHL) | VERIFIED (location); VERIFIED\* (history) | place + NAD + OSM name; research |
| St. Paul's Episcopal, 510 W Main St | VERIFIED | place + NAD + OSM name + research |
| Landmark Booksellers, 114 E Main St | VERIFIED | place + NAD + research |
| Kimbro's Pickin' Parlor, 214 S Margin St | VERIFIED | place + NAD + OSM name + research |
| 4th Ave S garage (115 4th Ave S), 2nd Ave S garage (108 2nd Ave S) | VERIFIED | place + NAD + OSM names + research |
| Williamson County Courthouse (1858) location | **UNKNOWN** | Research coordinate 35.92389,-86.86917 lands on the OSM "Williamson County Judicial Center" footprint; two Overture courthouse records disagree |
| "Gray's on Main" vs OSM "Grey's on Main" | UNKNOWN (spelling) | conflict between research and OSM |
| Public Square monument/markers/statue | VERIFIED\* (existence, research §4) · geometry UNKNOWN | no geometry source yet |
| 2026 event dates (Main Street Festival Apr 25–26, PumpkinFest Oct 24–25, Dickens Dec 12–13) | VERIFIED\* | research §4 excerpts; re-verify before use |
| Downtown street one-way status | Data: OSM/Overture access restrictions (e.g. Public Square ring one-way) · otherwise UNKNOWN | research §5 found no official source |

## REFERENCE ONLY (do not ingest/copy)

| Source | Why |
|---|---|
| City of Franklin GIS (publicmaps.franklintn.gov REST, maps.franklintn.gov) | Data sold for a fee; license unknown; host unreachable here |
| Williamson County Property Assessor / maps | No terms found |
| Google Maps / Street View, Apple, Bing imagery | Proprietary ToS forbids scraping/3D reconstruction |
| Wikimedia Commons photos | Per-file licenses; none ingested |

## Open questions (UNKNOWN)
- Authoritative historic-district / CBD polygon (city GIS zoning layer; licensing needed).
- Per-street carriageway widths, parking lanes, curb lines (city Sidewalks layer is reference-only).
- Business hours (no licensed source).
- Courthouse exact footprint/address; Public Square interior features.
