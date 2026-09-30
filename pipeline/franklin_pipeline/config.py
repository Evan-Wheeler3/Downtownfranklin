"""Pipeline configuration. Geographic constants live here (and in data), never in game code."""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# WGS84 (lon/lat) bbox fetched from sources: (xmin, ymin, xmax, ymax).
# Deliberately larger than the playable core so edges have context and so that
# expansion does not immediately require a re-fetch. See docs/DECISIONS.md.
FETCH_BBOX = (-86.885, 35.912, -86.855, 35.938)

# Game-coordinate origin (an arbitrary survey datum near the downtown grid; it is NOT a
# claim about any landmark). Local transverse Mercator on GRS80, metres.
ORIGIN_LON, ORIGIN_LAT = -86.8690, 35.9250
PROJ_LOCAL = (f"+proj=tmerc +lat_0={ORIGIN_LAT} +lon_0={ORIGIN_LON} +k=1 +x_0=0 +y_0=0 "
              "+ellps=GRS80 +units=m +no_defs")

# Core (ORDINARY-tier) area: see docs/research and SOURCE_LEDGER. Buildings outside it
# are BACKGROUND tier. (xmin, ymin, xmax, ymax) WGS84.
CORE_BBOX = (-86.8770, 35.9190, -86.8580, 35.9290)  # INFERRED, docs/research/franklin-research-2026-09-30.md §1

CHUNK_SIZE_M = 128.0
TERRAIN_SPACING_M = 2.0

# Carriageway widths by road class, metres. INFERRED defaults (no authoritative per-street
# widths ingested yet); see SOURCE_LEDGER "road widths".
ROAD_WIDTH_M = {
    "motorway": 14.0, "trunk": 13.0, "primary": 12.0, "secondary": 11.0, "tertiary": 10.0,
    "residential": 8.0, "unclassified": 7.0, "living_street": 6.0, "service": 4.5,
    "unknown": 6.0, "pedestrian": 5.0, "footway": 2.0, "path": 1.8, "steps": 2.0,
    "cycleway": 2.5, "track": 3.0, "bridleway": 2.0,
}
SUBCLASS_WIDTH_M = {"alley": 4.0, "driveway": 3.5, "parking_aisle": 6.0, "sidewalk": 2.2, "crosswalk": 3.0}
# Classes that get INFERRED sidewalks on both sides inside the core area.
SIDEWALK_CLASSES = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
SIDEWALK_WIDTH_M = 2.5
SIDEWALK_MIN_M, SIDEWALK_MAX_M = 1.5, 6.0
