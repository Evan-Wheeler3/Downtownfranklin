---
name: gauntlet
description: Verify work on the Downtown Franklin project at the right depth before declaring it done. Use after any code or data change, before commits, and at milestone completion (small / feature / major levels).
---

# Gauntlet

Pick the level by blast radius (full table in `docs/GAUNTLET.md`):

- **small** — one module, no runtime-visible change: `npm run gauntlet -- small`
- **feature** — anything visible at runtime or any `public/world` change: `npm run gauntlet -- feature`
  (adds build, Playwright e2e, screenshots in `artifacts/gauntlet/`). **Open and look at the screenshots** with the Read tool.
- **major** — milestone/system: `npm run gauntlet -- major` (adds pipeline determinism + perf capture), then:
  1. Read screenshots and compare with the previous milestone; describe differences in STATUS.md.
  2. Spawn the `geo-verifier` subagent for geographic changes; `adversarial-reviewer` on the milestone diff.
  3. Fix confirmed findings, re-run the level, then record evidence in `docs/STATUS.md`.

Rules:
- A failing step is a stop: fix the cause, never skip/disable tests.
- FPS from this environment (SwiftShader) is not a GPU benchmark — report CPU ms/frame, chunk build ms, draw calls, triangles.
- e2e needs port 4173 free. Don't `pkill -f vite` from Bash (it matches and kills the shell itself); find PIDs with `ps aux | grep "[v]ite"`.
