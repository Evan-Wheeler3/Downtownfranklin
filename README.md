# Downtown Franklin

A cozy first-person RPG through a hand-painted voxel town, laid out on the real street grid of downtown
Franklin, Tennessee — built in the browser with TypeScript, three.js (WebGPU with WebGL2 fallback, TSL
shaders) and Rapier physics. Run errands and deliveries for real downtown businesses, buy coffee and
pastries, watch golden hour turn into a lantern-lit night. Street layout, footprints and terrain come
from open data (OpenStreetMap/Overture Maps, Microsoft footprints, USDOT NAD, USGS 3DEP lidar); all
gameplay content (stock, prices, hours, jobs) is fictional.

```bash
npm install
npm run dev        # http://127.0.0.1:5173 — Begin, click to look, WASD walk, Shift run, E interact, Tab phone, Esc pause
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
