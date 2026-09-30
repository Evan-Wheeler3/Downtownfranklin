---
name: runtime-inspect
description: Launch the Downtown Franklin game, take screenshots from chosen viewpoints, read runtime state and measure performance. Use for any visual change, runtime bug, streaming/collision check, or perf work.
---

# Runtime inspection

1. Build and serve: `npx vite build && (npx vite preview --port 4173 --strictPort > /tmp/preview.log 2>&1 &)`
   (dev server `npm run dev` on :5173 also works; set `URL=` for scripts).
2. Screenshot: `node scripts/shot.mjs artifacts/<name>.png "<js run before shot>"`, then **Read the PNG**.
   The script prints `__franklin.state()` (pos, lat/lon, street, chunks, perf, draw calls).
3. Useful JS for viewpoints (window.__franklin):
   - `teleport(x, z, yawDeg)` game metres; `teleportGeo(lon, lat, yawDeg)`
   - `look(yawDeg, pitchDeg)` — yaw 0 = north, 90 = west, -90 = east
   - `setFly(true); setY(80); look(200, -35)` aerial
   - `move({forward: 1, sprint: true})` / `move(null)` scripted walking
4. Perf: `node scripts/perf.mjs` → `artifacts/perf-*.json`. Compare cpuAvg, maxChunkBuildMs, drawCalls, triangles against the previous run in STATUS.md.

Caveats: headless = SwiftShader WebGL2 (~1–2 fps, dt clamped to 50 ms so the sim runs slow). Use `?quality=low` (no shadows) for speed; check shadows with the default quality occasionally. URL flags: `renderer=webgl`, `quality=low`, `nohelp`.
