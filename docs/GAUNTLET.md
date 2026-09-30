# The Gauntlet — verification by task size

Run with `npm run gauntlet -- <level>` (script: `scripts/gauntlet.mjs`). Levels are cumulative.

| Level | When | Steps |
|---|---|---|
| `small` | single-file fix, docs+code tweak | typecheck · unit tests (vitest) · pipeline tests (pytest, if pipeline touched) |
| `feature` | a feature or data change | small + production build + e2e (Playwright on preview build) + screenshot set (`artifacts/gauntlet/`) |
| `major` | milestone / major system | feature + pipeline rebuild determinism check (chunk hashes identical across two builds) + perf capture (`scripts/perf.mjs`) + manual steps below |

## Manual steps for `major` (not automatable here)
1. **Visual review**: open the screenshots; compare against the previous milestone's; note regressions.
2. **Geographic review**: spot-check 3+ locations against source data (HUD lat/lon vs NAD/Overture record), or run the `geo-verifier` subagent.
3. **Architecture review**: layers respected (no geo facts in `src/`, pipeline stages separate, schema versions in sync).
4. **Adversarial review**: run the `adversarial-reviewer` subagent on the milestone diff; fix confirmed findings; re-run the Gauntlet.
5. Update STATUS.md with evidence (test counts, perf numbers, screenshots described).

## Notes
- The cloud environment has no GPU: e2e runs WebGL2 on SwiftShader (~1–2 fps). Treat FPS as
  non-representative; CPU timings and draw/triangle counts are meaningful.
- e2e takes ~3 min; don't run `feature` for doc-only changes.
