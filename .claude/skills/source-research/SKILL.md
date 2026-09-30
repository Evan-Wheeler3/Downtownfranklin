---
name: source-research
description: Research real-world facts about Franklin, Tennessee (places, businesses, history, geography, licensing) and record them with provenance. Use before adding any real-world name, address, date, hours, or claim to data or docs.
---

# Source research

Classify every fact: **VERIFIED** (authoritative/primary source read, or ≥ 2 independent sources agree) ·
**INFERRED** (derived; state the method) · **REFERENCE ONLY** (may look, may not copy) · **UNKNOWN**.
Use `VERIFIED*` when only a search excerpt was seen.

Procedure:
1. Prefer data we can cross-check mechanically: Overture place ↔ NAD address point ↔ OSM building name
   (see `data/validated/places.geojson` fields `address_check`, `building_id`).
2. Web research via WebSearch/WebFetch (container network is restricted). Record URL, publisher, access date.
3. Conflicts: record both versions; mark UNKNOWN until resolved. Never pick the convenient one silently.
4. Write results to `docs/SOURCE_LEDGER.md` (and `docs/research/<topic>-<date>.md` for long notes).
   Hero candidates go to `data/authored/hero_locations.json` only with ≥ 2 corroborating sources; otherwise to `pending_verification`.
5. Real-world time-varying info (business status, hours, rentals, events) is a dated snapshot: store `sourceDate`, never treat as permanent truth.
6. Imagery: never copy Google/Apple/Bing/Street View or unlicensed photos. Record any licensed asset's license.

Delegate large sweeps to the `source-researcher` subagent.
