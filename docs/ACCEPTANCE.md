# Acceptance framework

A feature is **complete** only when it is implemented, integrated, works at runtime, relevant
tests pass, its acceptance criteria below pass, it doesn't obviously damage existing systems, and
docs/STATUS.md is updated. Evidence (test output, screenshots in `artifacts/`, perf JSON) is
recorded in STATUS.md for each milestone.

## Universal criteria (every milestone)
- U1 `npm run build` succeeds (includes strict typecheck).
- U2 `npm test` and `pytest pipeline/tests` pass.
- U3 `npm run e2e` passes (runtime boot, no page errors).
- U4 No new real-world fact without a ledger entry and classification.
- U5 No geographic constants in `src/` (grep for lat/lon literals; only tests may contain them).
- U6 In-game attribution visible.
- U7 Visual changes: screenshot(s) inspected and saved under `artifacts/` (not committed) and described in STATUS.

## M1 — Geographic data pipeline ✅
| # | Criterion | Evidence |
|---|---|---|
| M1.1 | Raw snapshots with manifest (release, bbox, sha256, license, time) | `data/raw/*/manifest.json` |
| M1.2 | Normalize/validate/build are separate stages, re-runnable offline | `python -m franklin_pipeline build` |
| M1.3 | Validation report with zero errors; drivable network ≥ 90 % in one component | `validation_report.json` (0.994) |
| M1.4 | Places cross-checked against NAD; mismatches relocated with audit trail | report: consistent 1279 / relocated 112 |
| M1.5 | Runtime projection parity with PROJ < 1 cm | `tests/unit/geo.test.ts` |
| M1.6 | Business records carry source, date, confidence; hours never invented | `worldData.test.ts` |

## M2 — Geographic world slice ✅
| # | Criterion | Evidence |
|---|---|---|
| M2.1 | World streams from `public/world`; nearest chunks first; distant released | e2e "teleporting far away…" |
| M2.2 | Spawn on Main Street near Franklin Theatre, grounded | e2e boot test (street = Main Street, lat/lon window) |
| M2.3 | Walking moves player, stays grounded over real terrain | e2e walking test |
| M2.4 | Buildings block movement; kerb-height steps climbable | `physics.test.ts`, e2e "buildings block movement" |
| M2.5 | Physics only near player (≤ 16 chunks) | e2e teleport test |
| M2.6 | Buildings/roads visually align (inspection from street + aerial) | `artifacts/spawn.png`, `artifacts/aerial.png` |
| M2.7 | Perf measured: CPU ms/frame, chunk build ms, draw calls, triangles | `scripts/perf.mjs` output in STATUS |

## M3-V — Stylised voxel world ✅
| # | Criterion | Evidence |
|---|---|---|
| V.1 | Downtown grid axis-aligned; geometry still matches source after rotation | geo-verify passes; `geo.test.ts` rotation test |
| V.2 | Voxel meshes: outward faces, greedy merging, AO, slabs, glass culling | `voxel.test.ts` |
| V.3 | Deterministic chunk generation incl. buildings, trees, lamps, glass | `chunkBuild.test.ts` |
| V.4 | Walls block, terrain walkable, half-slab steps climbable | `physics.test.ts`, e2e |
| V.5 | Visual review: aerial + street-level screenshots read as "clean, artsy voxel town" | STATUS session 2 |

## M4-P — First playable loop ✅
| # | Criterion | Evidence |
|---|---|---|
| P.1 | Start → title → play; pause/resume; quit to title | manual + debug API |
| P.2 | Shops sell items with money checks; closed outside FICTIONAL hours | `gameplay.test.ts`, e2e buy test |
| P.3 | Energy drains and food restores it; no sprint at 0 | `gameplay.test.ts`, e2e |
| P.4 | Job board: deterministic per day, 3 kinds; full delivery through UI pays out | `gameplay.test.ts`, e2e delivery test |
| P.5 | Save versioned, migrations tested, Continue restores progress after reload | `gameplay.test.ts`, e2e |
| P.6 | Day/night visibly changes the world (lit windows, lamps, stars) | `artifacts/tod-pair.png` |

## M3 — Street-level fidelity + geo verification (superseded by M3-V)
- M3.1 Geo-verify report: ≥ 99 % of validated core footprints present in world chunks, centroid Δ < 0.05 m, area Δ < 1 %; every HERO resolved.
- M3.2 Chunk build off main thread: max main-thread stall from streaming < 4 ms (measured).
- M3.3 Kerbs render and collide; player steps up/down in e2e.
- M3.4 Crosswalks appear at ≥ 90 % of core `crossing` points (count test).
- M3.5 Street-level screenshot review at 5 fixed viewpoints (spawn, Public Square, 4th Ave garage, 2nd Ave, Bicentennial Park approach).

## Performance budgets (targets; verify on real hardware when available)
- Desktop mid-range GPU, 1080p: ≥ 60 fps at street level in the core; p95 frame < 20 ms.
- CPU (measurable here): main-thread cpu ms/frame < 6 ms steady state; streaming stall < 4 ms (M3+).
- Draw calls < 400 at street level; resident triangles < 1.5 M.
