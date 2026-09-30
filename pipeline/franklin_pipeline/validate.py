"""Stage 3 (NORMALIZED -> VALIDATED): repair, filter and check normalized layers.

Every change is recorded in data/validated/validation_report.json so that nothing is
silently dropped. Hard failures (e.g. empty core layers, broken road topology) exit
non-zero so the build pipeline stops.
"""
from __future__ import annotations

import math
import re
import sys
from collections import Counter, defaultdict

import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform
from shapely.strtree import STRtree

from .common import NORMALIZED, VALIDATED, read_fc, write_fc, write_json

_to_utm = Transformer.from_crs("EPSG:4326", "EPSG:26916", always_xy=True).transform

MIN_BUILDING_AREA_M2 = 6.0
MIN_HEIGHT_M, MAX_HEIGHT_M = 2.5, 80.0
DUPLICATE_IOU = 0.85


def validate_buildings(feats: list[dict], report: dict) -> list[dict]:
    r = Counter()
    kept, geoms_m = [], []
    for f in feats:
        g = shape(f["geometry"])
        if not g.is_valid:
            g = shapely.make_valid(g)
            r["repaired_invalid"] += 1
            if g.geom_type == "GeometryCollection":
                polys = [x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
                g = shapely.union_all(polys) if polys else None
            if g is None or g.is_empty:
                r["dropped_unrepairable"] += 1
                continue
            if g.geom_type == "MultiPolygon":
                g = max(g.geoms, key=lambda p: p.area)
                r["multipolygon_to_largest"] += 1
        gm = transform(_to_utm, g)
        if gm.area < MIN_BUILDING_AREA_M2:
            r["dropped_tiny"] += 1
            continue
        if f["properties"].get("is_underground"):
            r["dropped_underground"] += 1
            continue
        p = dict(f["properties"])
        h = p.get("height_m")
        if h is not None and not (MIN_HEIGHT_M <= h <= MAX_HEIGHT_M):
            p["height_m_original"] = h
            p["height_m"] = min(max(h, MIN_HEIGHT_M), MAX_HEIGHT_M)
            p["height_confidence"] = "INFERRED"
            r["height_clamped"] += 1
        p["area_m2"] = round(gm.area, 1)
        kept.append({**f, "geometry": mapping(g.simplify(0) if g.geom_type == "Polygon" else g), "properties": p})
        geoms_m.append(gm)

    # Near-duplicate footprints (overlapping conflations): keep the one with more attributes.
    tree = STRtree(geoms_m)
    drop = set()
    overlaps = 0
    for i, gi in enumerate(geoms_m):
        if i in drop:
            continue
        for j in tree.query(gi, predicate="intersects"):
            j = int(j)
            if j <= i or j in drop:
                continue
            inter = gi.intersection(geoms_m[j]).area
            if inter <= 0.5:
                continue
            iou = inter / gi.union(geoms_m[j]).area
            if iou >= DUPLICATE_IOU:
                score = lambda k: len(kept[k]["properties"])
                drop.add(j if score(i) >= score(j) else i)
                r["dropped_duplicate"] += 1
            else:
                overlaps += 1
    r["overlapping_pairs_kept"] = overlaps
    out = [f for k, f in enumerate(kept) if k not in drop]
    r["input"] = len(feats)
    r["output"] = len(out)
    report["buildings"] = dict(r)
    return out


def validate_roads(segs: list[dict], conns: list[dict], report: dict) -> tuple[list[dict], list[dict]]:
    r = Counter()
    conn_ids = {c["id"] for c in conns}
    out = []
    for f in segs:
        g = shape(f["geometry"])
        if g.geom_type != "LineString" or g.length == 0:
            r["dropped_bad_geometry"] += 1
            continue
        missing = [c for c in f["properties"]["connectors"] if c["id"] not in conn_ids]
        if missing:
            r["segments_with_missing_connectors"] += 1
        f["properties"]["length_m"] = round(transform(_to_utm, g).length, 2)
        out.append(f)
    used = {c["id"] for f in out for c in f["properties"]["connectors"]}
    conns_out = [c for c in conns if c["id"] in used]

    # Topology: connected components over the drivable network.
    parent: dict[str, str] = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    drivable = [f for f in out if f["properties"]["kind"] == "road" and f["properties"]["class"]
                not in ("footway", "path", "steps", "cycleway", "pedestrian", "bridleway")]
    for f in drivable:
        ids = [c["id"] for c in f["properties"]["connectors"]]
        for a, b in zip(ids, ids[1:]):
            parent[find(a)] = find(b)
    nodes = {x["id"] for f in drivable for x in f["properties"]["connectors"]}
    comps = Counter(find(c) for c in nodes)
    # Segments crossing the fetch bbox reference connectors outside it; expected at edges.
    sizes = sorted(comps.values(), reverse=True)
    r["drivable_components"] = len(sizes)
    r["largest_component_nodes"] = sizes[0] if sizes else 0
    r["largest_component_share"] = round(sizes[0] / max(1, sum(sizes)), 3) if sizes else 0
    r["input"], r["output"] = len(segs), len(out)
    r["connectors_output"] = len(conns_out)
    report["roads"] = dict(r)
    return out, conns_out


_ABBR = {"ST": "STREET", "AVE": "AVENUE", "AV": "AVENUE", "RD": "ROAD", "DR": "DRIVE", "LN": "LANE",
         "BLVD": "BOULEVARD", "CT": "COURT", "PL": "PLACE", "PK": "PIKE", "HWY": "HIGHWAY", "SQ": "SQUARE",
         "N": "NORTH", "S": "SOUTH", "E": "EAST", "W": "WEST", "CIR": "CIRCLE", "PKWY": "PARKWAY"}
_DIRS = {"NORTH", "SOUTH", "EAST", "WEST"}
_TYPES = {"STREET", "AVENUE", "ROAD", "DRIVE", "LANE", "BOULEVARD", "COURT", "PLACE", "PIKE", "HIGHWAY",
          "SQUARE", "CIRCLE", "PARKWAY", "WAY"}
ADDRESS_CONSISTENT_M = 45.0


def _street_key(s: str) -> tuple[str, frozenset]:
    toks = [_ABBR.get(t, t) for t in re.sub(r"[^A-Z0-9 ]", " ", s.upper()).split()]
    core = " ".join(t for t in toks if t not in _DIRS and t not in _TYPES)
    return core, frozenset(t for t in toks if t in _DIRS)


def _parse_freeform(addr: str) -> tuple[str, str] | None:
    m = re.match(r"^\s*(\d+[A-Z]?)\s+(.+?)(?:\s+(?:STE|SUITE|UNIT|APT|#)\b.*)?$", addr.upper())
    return (m.group(1), m.group(2)) if m else None


class AddressIndex:
    """NAD address points keyed by (house number, street core name)."""

    def __init__(self, feats: list[dict]):
        self.idx: dict[tuple[str, str], list[tuple[frozenset, tuple[float, float]]]] = defaultdict(list)
        for f in feats:
            p = f["properties"]
            if not p.get("number") or not p.get("street"):
                continue
            core, dirs = _street_key(p["street"])
            self.idx[(p["number"].upper(), core)].append((dirs, _to_utm(*f["geometry"]["coordinates"][:2])))

    def lookup(self, freeform: str) -> list[tuple[float, float]]:
        parsed = _parse_freeform(freeform)
        if not parsed:
            return []
        core, dirs = _street_key(parsed[1])
        cands = self.idx.get((parsed[0], core), [])
        exact = [xy for d, xy in cands if not dirs or d == dirs or dirs <= d]
        return exact or [xy for _, xy in cands]


def validate_places(feats: list[dict], buildings: list[dict], addresses: list[dict], report: dict) -> list[dict]:
    """Check each place point against NAD address points, attach the containing building
    (INFERRED link) and flag low-confidence records."""
    r = Counter()
    polys = [shape(b["geometry"]) for b in buildings]
    tree = STRtree(polys)
    nad = AddressIndex(addresses)
    _to_ll = Transformer.from_crs("EPSG:26916", "EPSG:4326", always_xy=True).transform
    out = []
    for f in feats:
        p = dict(f["properties"])
        if not p.get("name"):
            r["dropped_unnamed"] += 1
            continue
        pt = shape(f["geometry"])
        if p.get("address"):
            hits = nad.lookup(p["address"])
            if not hits:
                p["address_check"] = "UNMATCHED"
            else:
                ux, uy = _to_utm(pt.x, pt.y)
                d, best = min((math.hypot(ux - x, uy - y), (x, y)) for x, y in hits)
                p["address_check_m"] = round(d, 1)
                if d <= ADDRESS_CONSISTENT_M:
                    p["address_check"] = "CONSISTENT"
                else:
                    # Source point disagrees with the authoritative address point: move the
                    # record to the NAD location and keep the original for audit.
                    p["address_check"] = "MISMATCH_RELOCATED"
                    p["original_coordinates"] = list(f["geometry"]["coordinates"][:2])
                    lon, lat = _to_ll(*best)
                    pt = shapely.geometry.Point(lon, lat)
                    f = {**f, "geometry": mapping(pt)}
            r[f"address_{p['address_check'].lower()}"] += 1
        else:
            r["address_none"] += 1
        hits = [int(i) for i in tree.query(pt, predicate="within")]
        if hits:
            p["building_id"] = buildings[hits[0]]["id"]
            p["building_link"] = "INFERRED:point_in_footprint"
            r["linked_to_building"] += 1
        else:
            near = tree.query_nearest(pt, max_distance=0.0002)  # ~20 m
            if len(near):
                p["building_id"] = buildings[int(near[0])]["id"]
                p["building_link"] = "INFERRED:nearest_footprint_20m"
                r["linked_nearest"] += 1
            else:
                r["unlinked"] += 1
        sc = p.get("source_confidence") or 0
        p["record_confidence"] = "LOW" if sc < 0.5 else ("MEDIUM" if sc < 0.8 else "HIGH")
        r[f"confidence_{p['record_confidence'].lower()}"] += 1
        out.append({**f, "properties": p})
    r["input"], r["output"] = len(feats), len(out)
    report["places"] = dict(r)
    return out


def main() -> int:
    report: dict = {}
    b = validate_buildings(read_fc(NORMALIZED / "buildings.geojson"), report)
    segs, conns = validate_roads(read_fc(NORMALIZED / "road_segments.geojson"),
                                 read_fc(NORMALIZED / "road_connectors.geojson"), report)
    pl = validate_places(read_fc(NORMALIZED / "places.geojson"), b, read_fc(NORMALIZED / "addresses.geojson"), report)
    passthrough = ["addresses", "water", "land_use", "land_cover", "infrastructure"]
    for name in passthrough:
        feats = [f for f in read_fc(NORMALIZED / f"{name}.geojson") if shape(f["geometry"]).is_valid]
        write_fc(VALIDATED / f"{name}.geojson", feats)
        report[name] = {"output": len(feats)}
    write_fc(VALIDATED / "buildings.geojson", b)
    write_fc(VALIDATED / "road_segments.geojson", segs)
    write_fc(VALIDATED / "road_connectors.geojson", conns)
    write_fc(VALIDATED / "places.geojson", pl)

    errors = []
    if len(b) < 500:
        errors.append("too few buildings")
    if report["roads"]["largest_component_share"] < 0.8:
        errors.append("drivable road network is badly fragmented")
    report["errors"] = errors
    write_json(VALIDATED / "validation_report.json", report, pretty=True)
    for k, v in report.items():
        print(f"[validate] {k}: {v}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
