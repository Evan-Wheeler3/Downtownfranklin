# Downtown Franklin

A first-person life simulator set in a geographically grounded recreation of historic downtown
Franklin, Tennessee — built in the browser with TypeScript, three.js (WebGPU with WebGL2 fallback)
and Rapier physics. The street grid, building footprints and terrain come from open geographic data
(OpenStreetMap/Overture Maps, Microsoft building footprints, USDOT NAD addresses, USGS 3DEP lidar DEM),
processed by a provenance-tracking pipeline. Gameplay content layered on top is fictional and labelled as such.

```bash
npm install
npm run dev        # http://127.0.0.1:5173 — click to look, WASD to walk, Shift to run, F to fly
```

- Project state: [`docs/STATUS.md`](docs/STATUS.md) · plan: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Data sources and licensing: [`docs/SOURCE_LEDGER.md`](docs/SOURCE_LEDGER.md)
- Verification: [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md), [`docs/GAUNTLET.md`](docs/GAUNTLET.md)

## Data attribution
Map data © OpenStreetMap contributors (ODbL 1.0), via Overture Maps Foundation. Building footprints
and heights include Microsoft ML Buildings (ODbL). Places: Overture Maps Foundation (CDLA-Permissive-2.0).
Addresses: U.S. DOT National Address Database (public domain). Elevation: USGS 3D Elevation Program (public domain).
The derived map database in `data/` and `public/world/` is made available under the ODbL 1.0.
