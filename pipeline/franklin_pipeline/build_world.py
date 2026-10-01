"""Stage 4 (VALIDATED -> GAME COORDINATES): project, chunk and package the world.

Output (public/world/):
  manifest.json            world-level metadata, chunk index, projection, attribution
  chunks/c_<cx>_<cz>.json  per-chunk terrain heightfield, buildings, road ribbons, areas
  roads/graph.json         routable road graph (nodes/edges split at Overture connectors)
  businesses.json          business seed records derived from places (+ authored overrides)

Game axes: x = east (m), y = up (m, elevation minus datum), z = south (m) (= -north),
matching three.js' right-handed, y-up convention.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import math
import sys
from collections import defaultdict

import numpy as np
import rasterio
import shapely
import shapely.ops
from pyproj import Transformer
from shapely.geometry import LineString, Polygon, box, mapping, shape
from shapely.ops import substring, transform
from shapely.strtree import STRtree

from . import config as C
from .common import AUTHORED, RAW, VALIDATED, WORLD_OUT, read_fc, write_json

SCHEMA_VERSION = 1

# Point features carried into chunks (street furniture / traffic control seeds).
POINT_CLASSES = {"traffic_signals", "crossing", "stop", "bus_stop", "bollard", "street_lamp", "bench",
                 "waste_basket", "fire_hydrant", "drinking_water", "bicycle_parking", "give_way"}
# Nominal channel widths for waterway centrelines, metres. INFERRED (see SOURCE_LEDGER).
WATERWAY_WIDTH_M = {"river": 24.0, "stream": 4.0}
PIPELINE_VERSION = "0.1.0"

_to_local = Transformer.from_crs("EPSG:4326", C.PROJ_LOCAL, always_xy=True)


_ROT = math.radians(C.GRID_ROTATION_DEG)
_COS, _SIN = math.cos(_ROT), math.sin(_ROT)


def lonlat_to_game(lon, lat):
    """Local tmerc (east, -north), then rotated by GRID_ROTATION_DEG so the downtown grid is axis-aligned."""
    e, n = _to_local.transform(lon, lat)
    x, z = e, -n
    return x * _COS - z * _SIN, x * _SIN + z * _COS


def game_to_local(x, z):
    """Inverse rotation: game (x, z) -> (east, north) in the local tmerc."""
    lx, lz = x * _COS + z * _SIN, -x * _SIN + z * _COS
    return lx, -lz


def _geom_to_game(g):
    return transform(lambda x, y, z=None: lonlat_to_game(x, y), g)


class Dem:
    """Bilinear sampler over the raw USGS 1 m DEM, in game coordinates."""

    def __init__(self):
        path = RAW / "usgs_3dep" / "dem_1m_franklin.tif"
        with rasterio.open(path) as ds:
            self.data = ds.read(1).astype(np.float64)
            self.inv = ~ds.transform
            self.nodata = ds.nodata
            self.crs = ds.crs
        self.game_to_utm = Transformer.from_crs(C.PROJ_LOCAL, self.crs, always_xy=True)

    def sample(self, xs, zs) -> np.ndarray:
        xs, zs = np.asarray(xs, float), np.asarray(zs, float)
        le, ln = game_to_local(xs, zs)
        e, n = self.game_to_utm.transform(le, ln)
        col, row = self.inv * (np.asarray(e), np.asarray(n))
        col, row = np.asarray(col) - 0.5, np.asarray(row) - 0.5
        h, w = self.data.shape
        outside = (col < 0) | (row < 0) | (col > w - 1) | (row > h - 1)
        c0 = np.clip(np.floor(col).astype(int), 0, w - 2)
        r0 = np.clip(np.floor(row).astype(int), 0, h - 2)
        fc = np.clip(col - c0, 0, 1)
        fr = np.clip(row - r0, 0, 1)
        d = self.data
        v = (d[r0, c0] * (1 - fc) * (1 - fr) + d[r0, c0 + 1] * fc * (1 - fr)
             + d[r0 + 1, c0] * (1 - fc) * fr + d[r0 + 1, c0 + 1] * fc * fr)
        if self.nodata is not None:
            corners = np.stack([d[r0, c0], d[r0, c0 + 1], d[r0 + 1, c0], d[r0 + 1, c0 + 1]])
            v = np.where(np.isclose(corners, self.nodata).any(axis=0) | (corners < -1000).any(axis=0), np.nan, v)
        return np.where(outside, np.nan, v)


def _r(v, nd=2):
    return round(float(v), nd)


def _chunk_of(x, z):
    return int(math.floor(x / C.CHUNK_SIZE_M)), int(math.floor(z / C.CHUNK_SIZE_M))


def _default_height(p: dict) -> tuple[float, str]:
    if p.get("height_m"):
        return float(p["height_m"]), p.get("height_confidence") or "INFERRED"
    if p.get("num_floors"):
        return 3.4 * p["num_floors"] + 1.0, "INFERRED:floors"
    by_class = {"house": 6.5, "garage": 3.2, "shed": 2.8, "church": 12.0, "commercial": 8.0,
                "retail": 7.0, "school": 8.0, "civic": 10.0, "parking": 10.0, "roof": 4.0}
    return by_class.get(p.get("class"), 6.0), "INFERRED:class_default"


def _road_width(p: dict) -> float:
    return C.SUBCLASS_WIDTH_M.get(p.get("subclass")) or C.ROAD_WIDTH_M.get(p.get("class"), 6.0)


def _load_authored() -> dict:
    out = {}
    for name in ("hero_locations", "business_overrides", "world_settings"):
        f = AUTHORED / f"{name}.json"
        out[name] = json.loads(f.read_text()) if f.exists() else {}
    return out


def _resolve_spawn(cfg: dict | None, places: dict, edges: list[dict], datum: float) -> dict | None:
    """Stand on the named street's curb-side nearest the referenced place, facing it."""
    if not cfg:
        return None
    pl = places.get(cfg["near_place_id"])
    if not pl:
        print(f"[world] WARNING spawn place {cfg['near_place_id']} missing")
        return None
    px, pz = lonlat_to_game(*pl["geometry"]["coordinates"][:2])
    target = shapely.geometry.Point(px, pz)
    best = None
    for e in edges:
        if e.get("name") != cfg["snap_to_street"]:
            continue
        line = LineString([(q[0], q[2]) for q in e["pts"]])
        d = line.distance(target)
        if best is None or d < best[0]:
            best = (d, line, e)
    if best is None:
        print(f"[world] WARNING spawn street {cfg['snap_to_street']} not found")
        return None
    d, line, e = best
    foot = line.interpolate(line.project(target))
    dx, dz = px - foot.x, pz - foot.y
    n = math.hypot(dx, dz) or 1.0
    # Stand on the far side of the street (middle of the opposite sidewalk band) so the
    # place's frontage is in view.
    side = -1.0 if cfg.get("stand") == "opposite" else 1.0
    off = e["width"] / 2 + C.SIDEWALK_MIN_M / 2
    sx, sz = foot.x + side * dx / n * off, foot.y + side * dz / n * off
    # yaw: three.js camera looks down -z at yaw 0; yaw = atan2(-dx, -dz)
    yaw = math.degrees(math.atan2(-(px - sx), -(pz - sz)))
    return {"pos": [_r(sx), 0.0, _r(sz)], "yawDeg": _r(yaw, 1), "note": cfg.get("note", "")}


def main() -> int:
    dem = Dem()
    authored = _load_authored()
    places_by_id = {f["id"]: f for f in read_fc(VALIDATED / "places.geojson")}
    hero_buildings, hero_by_place = {}, {}
    for h in authored["hero_locations"].get("locations", []):
        pl = places_by_id.get(h.get("place_id"))
        if not pl:
            print(f"[world] WARNING hero {h['key']}: place {h.get('place_id')} not in validated data")
            continue
        hero_by_place[pl["id"]] = h
        bid = h.get("building_id") or pl["properties"].get("building_id")
        if bid:
            hero_buildings[bid] = h

    datum = float(np.round(dem.sample([0.0], [0.0])[0]))
    # Playable bounds: the largest square (centred on the core) inside the rotated fetch area,
    # so every chunk has source + DEM coverage.
    fetch_poly = _geom_to_game(box(*C.FETCH_BBOX).segmentize(0.0005))
    core_c = _geom_to_game(box(*C.CORE_BBOX)).centroid
    r = [core_c.x - 50, core_c.y - 50, core_c.x + 50, core_c.y + 50]
    grew = True
    while grew:  # grow each side in 10 m steps while the rectangle stays inside the fetch area
        grew = False
        for i, d in ((0, -10), (1, -10), (2, 10), (3, 10)):
            t = list(r)
            t[i] += d
            if fetch_poly.contains(box(*t)):
                r, grew = t, True
    bounds = {"minX": math.ceil(r[0]), "maxX": math.floor(r[2]), "minZ": math.ceil(r[1]), "maxZ": math.floor(r[3])}
    world_box = box(bounds["minX"], bounds["minZ"], bounds["maxX"], bounds["maxZ"])
    core_poly = _geom_to_game(box(*C.CORE_BBOX))

    cx_min, cz_min = _chunk_of(bounds["minX"], bounds["minZ"])
    cx_max, cz_max = _chunk_of(bounds["maxX"] - 1e-6, bounds["maxZ"] - 1e-6)
    chunks: dict[tuple[int, int], dict] = {}
    for cx in range(cx_min, cx_max + 1):
        for cz in range(cz_min, cz_max + 1):
            chunks[(cx, cz)] = {"buildings": [], "roads": [], "areas": [], "places": [], "points": []}

    # --- Buildings ------------------------------------------------------------------
    b_stats = defaultdict(int)
    for f in read_fc(VALIDATED / "buildings.geojson"):
        g = _geom_to_game(shape(f["geometry"]))
        if not world_box.contains(g.centroid):
            b_stats["outside_world"] += 1
            continue
        # Game z = -north, so CW in (x, z) is CCW in (east, north) — the schema's convention.
        g = shapely.geometry.polygon.orient(g, -1.0)
        ring = list(g.exterior.coords)[:-1]
        xs, zs = zip(*ring)
        cxz = g.centroid
        gs = dem.sample(list(xs) + [cxz.x], list(zs) + [cxz.y])
        gs = gs[~np.isnan(gs)]
        if gs.size == 0:
            b_stats["no_dem"] += 1
            continue
        p = f["properties"]
        h, hconf = _default_height(p)
        tier = "HERO" if f["id"] in hero_buildings else ("ORDINARY" if core_poly.contains(cxz) else "BACKGROUND")
        b_stats[tier] += 1
        b = {
            "id": f["id"], "tier": tier, "hero": hero_buildings[f["id"]]["key"] if tier == "HERO" else None,
            # Footprint winding: CCW in the (x, -z) = (east, north) plane.
            "footprint": [[_r(x), _r(z)] for x, z in ring],
            "holes": [[[_r(x), _r(z)] for x, z in list(i.coords)[:-1]] for i in g.interiors] or None,
            "base": _r(gs.min() - datum),
            "ground": _r(np.median(gs) - datum),
            "height": _r(h, 1),
            "heightConf": hconf,
            "cls": p.get("class"),
            "name": p.get("name"),
            "roof": p.get("roof_shape"),
            "floors": p.get("num_floors"),
            "src": p.get("footprint_source"),
        }
        chunks[_chunk_of(cxz.x, cxz.y)]["buildings"].append({k: v for k, v in b.items() if v is not None})

    # --- Street corridor: measured centreline-to-facade distance per side ----------
    fp_polys = [Polygon(b["footprint"]) for ch in chunks.values() for b in ch["buildings"]]
    fp_by_id = {b["id"]: Polygon(b["footprint"]) for ch in chunks.values() for b in ch["buildings"]}
    street_lines: list[LineString] = []
    fp_tree = STRtree(fp_polys)

    def facade_distances(line: LineString, reach: float = 30.0) -> tuple[float | None, float | None]:
        """Median distance from the centreline to the first facade on the left/right."""
        left, right = [], []
        n = max(2, int(line.length // 6))
        for k in range(n):
            a = line.interpolate(k / n, normalized=True)
            b = line.interpolate(min(1.0, (k + 1) / n), normalized=True)
            dx, dz = b.x - a.x, b.y - a.y
            ln = math.hypot(dx, dz)
            if ln < 0.5:
                continue
            m = shapely.geometry.Point((a.x + b.x) / 2, (a.y + b.y) / 2)
            px, pz = dz / ln, -dx / ln  # left-hand perpendicular (matches runtime ribbons)
            for sign, acc in ((1, left), (-1, right)):
                ray = LineString([(m.x, m.y), (m.x + sign * px * reach, m.y + sign * pz * reach)])
                hits = [m.distance(fp_polys[j].intersection(ray)) for j in fp_tree.query(ray)
                        if fp_polys[j].intersects(ray)]
                if hits:
                    acc.append(min(hits))
        med = lambda v: float(np.median(v)) if len(v) >= max(2, n // 3) else None
        return med(left), med(right)

    # --- Roads: ribbons per chunk + routable graph ----------------------------------
    conn_xy = {}
    for f in read_fc(VALIDATED / "road_connectors.geojson"):
        x, z = lonlat_to_game(*f["geometry"]["coordinates"][:2])
        conn_xy[f["id"]] = (x, z)
    nodes, edges = {}, []
    r_stats = defaultdict(int)
    for f in read_fc(VALIDATED / "road_segments.geojson"):
        p = f["properties"]
        line = _geom_to_game(shape(f["geometry"]))
        if p.get("kind") == "road" and p.get("class") in C.SIDEWALK_CLASSES and not p.get("subclass"):
            street_lines.append(line)
        width = _road_width(p)
        in_core = line.intersects(core_poly)
        sw_l = sw_r = None
        if in_core and p.get("kind") == "road" and p.get("class") in C.SIDEWALK_CLASSES and not p.get("subclass"):
            # INFERRED: sidewalk runs from the kerb to the facade line when facades are near,
            # else a nominal width. Widths are clamped to plausible bounds.
            dl, dr = facade_distances(line)
            fit = lambda d: _r(min(max(d - width / 2, C.SIDEWALK_MIN_M), C.SIDEWALK_MAX_M), 1) \
                if d is not None and d - width / 2 <= C.SIDEWALK_MAX_M + 1 else C.SIDEWALK_WIDTH_M
            sw_l, sw_r = fit(dl), fit(dr)
            r_stats["sidewalks_from_facades"] += (dl is not None) + (dr is not None)
        base = {
            "id": f["id"], "kind": p.get("kind"), "cls": p.get("class"), "sub": p.get("subclass"),
            "name": p.get("name"), "width": width, "oneWay": p.get("one_way"), "level": p.get("level"),
            "swL": sw_l, "swR": sw_r,
            "flags": p.get("flags"),
        }
        # Densify so the ribbon follows terrain (~4 m spacing).
        dense = line.segmentize(4.0)
        for (cx, cz), ch in chunks.items():
            cb = box(cx * C.CHUNK_SIZE_M, cz * C.CHUNK_SIZE_M, (cx + 1) * C.CHUNK_SIZE_M, (cz + 1) * C.CHUNK_SIZE_M)
            if not dense.intersects(cb):
                continue
            part = dense.intersection(cb)
            parts = [part] if part.geom_type == "LineString" else [
                gg for gg in getattr(part, "geoms", []) if gg.geom_type == "LineString"]
            for pl in parts:
                if pl.length < 0.05:
                    continue
                xs, zs = zip(*pl.coords)
                ys = dem.sample(xs, zs)
                if np.isnan(ys).any():
                    continue
                ch["roads"].append({k: v for k, v in {**base, "pts": [[_r(x), _r(y - datum), _r(z)] for x, y, z in
                                                                     zip(xs, ys, zs)]}.items() if v is not None})
                r_stats["ribbons"] += 1
        # Graph edges between consecutive connectors.
        cons = sorted(p["connectors"], key=lambda c: c["at"])
        for a, b in zip(cons, cons[1:]):
            if a["id"] not in conn_xy or b["id"] not in conn_xy:
                r_stats["edges_skipped_missing_connector"] += 1
                continue
            sub = substring(line, a["at"], b["at"], normalized=True)
            if sub.geom_type != "LineString" or sub.length < 0.01:
                continue
            xs, zs = zip(*sub.coords)
            ys = dem.sample(xs, zs)
            ys = np.where(np.isnan(ys), datum, ys)
            for cid in (a["id"], b["id"]):
                if cid not in nodes:
                    x, z = conn_xy[cid]
                    y = dem.sample([x], [z])[0]
                    nodes[cid] = [_r(x), _r((datum if np.isnan(y) else y) - datum), _r(z)]
            edges.append({k: v for k, v in {
                "id": f"{f['id']}:{len(edges)}", "seg": f["id"], "from": a["id"], "to": b["id"],
                "kind": p.get("kind"), "cls": p.get("class"), "sub": p.get("subclass"), "name": p.get("name"),
                "oneWay": p.get("one_way"), "speedMph": p.get("speed_limit_mph"), "width": width,
                "len": _r(sub.length), "private": p.get("private"),
                "pts": [[_r(x), _r(y - datum), _r(z)] for x, y, z in zip(xs, ys, zs)],
            }.items() if v is not None})

    # --- Areas (water, land use, land cover) ----------------------------------------
    for layer in ("water", "land_use", "land_cover", "infrastructure"):
        for f in read_fc(VALIDATED / f"{layer}.geojson"):
            g = _geom_to_game(shape(f["geometry"]))
            fp = f["properties"]
            if g.geom_type == "Point":
                if layer == "infrastructure" and fp.get("class") in POINT_CLASSES:
                    cxz = _chunk_of(g.x, g.y)
                    if cxz in chunks:
                        y = dem.sample([g.x], [g.y])[0]
                        if not np.isnan(y):
                            chunks[cxz]["points"].append({"id": f["id"], "cls": fp.get("class"),
                                                          "pos": [_r(g.x), _r(y - datum), _r(g.y)]})
                continue
            if g.geom_type == "LineString" and layer == "water" and fp.get("class") in WATERWAY_WIDTH_M:
                # Waterway centrelines only: buffer by an INFERRED nominal width.
                g = g.buffer(WATERWAY_WIDTH_M[fp["class"]] / 2, cap_style="flat")
                fp = {**fp, "class": fp["class"], "inferredWidth": True}
            if g.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            if layer == "infrastructure" and fp.get("class") != "parking":
                continue
            for (cx, cz), ch in chunks.items():
                cb = box(cx * C.CHUNK_SIZE_M, cz * C.CHUNK_SIZE_M, (cx + 1) * C.CHUNK_SIZE_M, (cz + 1) * C.CHUNK_SIZE_M)
                if not g.intersects(cb):
                    continue
                part = g.intersection(cb)
                polys = [part] if part.geom_type == "Polygon" else [
                    q for q in getattr(part, "geoms", []) if q.geom_type == "Polygon"]
                for q in polys:
                    if q.area < 1:
                        continue
                    q = shapely.geometry.polygon.orient(q.simplify(0.3), 1.0)
                    ch["areas"].append({k: v for k, v in {
                        "id": f["id"], "layer": layer, "subtype": f["properties"].get("subtype"),
                        "cls": f["properties"].get("class"),
                        "ring": [[_r(x, 1), _r(z, 1)] for x, z in list(q.exterior.coords)[:-1]],
                        "holes": [[[_r(x, 1), _r(z, 1)] for x, z in list(i.coords)[:-1]] for i in q.interiors] or None,
                    }.items() if v is not None})

    # --- Businesses (from places) ---------------------------------------------------
    overrides = {o["place_id"]: o for o in authored["business_overrides"].get("overrides", [])}
    businesses = []
    street_tree = STRtree(street_lines)
    used_doors: dict[str, list] = defaultdict(list)

    def door_for(building_id: str | None):
        """Street-facing entrance on the building footprint: the wall point nearest a street,
        nudged along the wall if another business already uses that spot. Returns
        (wall point (x, z), outward unit normal) or None. INFERRED placement (FICTIONAL gameplay)."""
        poly = fp_by_id.get(building_id or "")
        if poly is None:
            return None
        near = [street_lines[int(i)] for i in street_tree.query(poly.buffer(40))]
        if not near:
            return None
        streets = shapely.union_all(near)
        ring = poly.exterior
        wall_pt, _ = shapely.ops.nearest_points(ring, streets)
        t = ring.project(wall_pt)
        for k in range(8):
            if all(abs(t - u) > 3.0 for u in used_doors[building_id]):
                break
            t = (t + (4.0 if k % 2 == 0 else -8.0 * (k // 2 + 1))) % ring.length
        used_doors[building_id].append(t)
        wall_pt = ring.interpolate(t)
        a, b = ring.interpolate(max(0.0, t - 0.5)), ring.interpolate(min(ring.length, t + 0.5))
        dx, dz = b.x - a.x, b.y - a.y
        ln = math.hypot(dx, dz) or 1.0
        nx, nz = dz / ln, -dx / ln
        probe = shapely.geometry.Point(wall_pt.x + nx * 0.5, wall_pt.y + nz * 0.5)
        if poly.contains(probe):
            nx, nz = -nx, -nz
        return (wall_pt.x, wall_pt.y), (nx, nz)
    for f in places_by_id.values():
        p = f["properties"]
        x, z = lonlat_to_game(*f["geometry"]["coordinates"][:2])
        if not world_box.contains(shapely.geometry.Point(x, z)):
            continue
        y = dem.sample([x], [z])[0]
        in_core = core_poly.contains(shapely.geometry.Point(x, z))
        rec = {
            "id": f"place:{f['id']}", "placeId": f["id"], "name": p.get("name"), "category": p.get("category"),
            "categoryPath": p.get("category_hierarchy"), "address": p.get("address"),
            "pos": [_r(x), _r((0 if np.isnan(y) else y - datum)), _r(z)],
            "buildingId": p.get("building_id"), "buildingLink": p.get("building_link"),
            "status": p.get("operating_status") or "unknown",
            "hours": None,  # UNKNOWN: no hours source ingested; runtime uses FICTIONAL category defaults.
            "website": p.get("website"),
            "source": "Overture Maps places (" + ", ".join(sorted({s["dataset"] for s in p.get("sources", [])})) + ")",
            "sourceDate": p.get("source_date"), "confidence": p.get("record_confidence"),
            "addressCheck": p.get("address_check"), "addressCheckM": p.get("address_check_m"),
            "inCore": in_core, "interiorTier": 0, "tags": [],
            "hero": hero_by_place[f["id"]]["key"] if f["id"] in hero_by_place else None,
        }
        d = door_for(p.get("building_id")) if in_core else None
        if d:
            (wx, wz), (nx, nz) = d
            sx, sz = wx + nx * 1.4, wz + nz * 1.4
            sy = dem.sample([sx], [sz])[0]
            rec["door"] = {"wall": [_r(wx), _r(wz)], "normal": [_r(nx, 3), _r(nz, 3)],
                           "stand": [_r(sx), _r(0 if np.isnan(sy) else sy - datum), _r(sz)]}
        if f["id"] in overrides:
            rec.update({k: v for k, v in overrides[f["id"]].items() if k != "place_id"})
            rec["authored"] = True
        businesses.append({k: v for k, v in rec.items() if v is not None})
        cxz = _chunk_of(x, z)
        if cxz in chunks and in_core:
            chunks[cxz]["places"].append({k: v for k, v in {
                "id": rec["id"], "name": rec["name"], "cat": rec.get("category"), "pos": rec["pos"],
                "door": rec.get("door")}.items() if v is not None})

    # --- Terrain + write chunks -----------------------------------------------------
    n = int(C.CHUNK_SIZE_M / C.TERRAIN_SPACING_M) + 1
    (WORLD_OUT / "chunks").mkdir(parents=True, exist_ok=True)
    for old in (WORLD_OUT / "chunks").glob("*.json"):
        old.unlink()
    index = []
    for (cx, cz), ch in sorted(chunks.items()):
        ox, oz = cx * C.CHUNK_SIZE_M, cz * C.CHUNK_SIZE_M
        gx, gz = np.meshgrid(ox + np.arange(n) * C.TERRAIN_SPACING_M, oz + np.arange(n) * C.TERRAIN_SPACING_M)
        hs = dem.sample(gx.ravel(), gz.ravel())
        if np.isnan(hs).all():
            continue
        hs = np.where(np.isnan(hs), np.nanmin(hs), hs) - datum
        body = {"schemaVersion": SCHEMA_VERSION, "id": f"c_{cx}_{cz}", "cx": cx, "cz": cz,
                "terrain": {"origin": [ox, oz], "spacing": C.TERRAIN_SPACING_M, "n": n,
                            # int16 little-endian centimetres relative to datum, row-major (z rows, x cols)
                            "heightsCm": base64.b64encode(np.round(hs * 100).astype("<i2").tobytes()).decode()},
                **ch}
        fname = f"chunks/c_{cx}_{cz}.json"
        write_json(WORLD_OUT / fname, body)
        index.append({"id": body["id"], "cx": cx, "cz": cz, "file": fname,
                      "minY": _r(hs.min()), "maxY": _r(max([hs.max()] + [b["ground"] + b["height"] for b in ch["buildings"]])),
                      "counts": {k: len(ch[k]) for k in ("buildings", "roads", "areas", "places", "points")}})

    write_json(WORLD_OUT / "roads" / "graph.json", {"schemaVersion": SCHEMA_VERSION, "nodes": nodes, "edges": edges})
    write_json(WORLD_OUT / "businesses.json", {"schemaVersion": SCHEMA_VERSION, "businesses": businesses})

    control = []
    for lon, lat in [(C.ORIGIN_LON, C.ORIGIN_LAT), (-86.8800, 35.9200), (-86.8600, 35.9330), (-86.8710, 35.9245)]:
        x, z = lonlat_to_game(lon, lat)
        control.append({"lon": lon, "lat": lat, "x": round(x, 4), "z": round(z, 4)})

    spawn = _resolve_spawn(authored["world_settings"].get("spawn"), places_by_id, edges, datum)

    manifest = {
        "schemaVersion": SCHEMA_VERSION, "pipelineVersion": PIPELINE_VERSION,
        "generatedUtc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "origin": {"lon": C.ORIGIN_LON, "lat": C.ORIGIN_LAT, "elevationDatum": datum,
                   "gridRotationDeg": C.GRID_ROTATION_DEG},
        "projection": C.PROJ_LOCAL,
        "axes": "x=east m; y=up m (NAVD88 elevation minus datum); z=south m",
        "chunkSize": C.CHUNK_SIZE_M, "bounds": bounds,
        "core": [[_r(x), _r(z)] for x, z in list(core_poly.exterior.coords)[:-1]],
        "controlPoints": control,
        "spawn": spawn,
        "chunks": index,
        "stats": {"buildings": dict(b_stats), "roads": dict(r_stats), "graphNodes": len(nodes),
                  "graphEdges": len(edges), "businesses": len(businesses)},
        "attribution": [
            "Buildings, roads and base layers: © OpenStreetMap contributors (ODbL), via Overture Maps Foundation",
            "Building footprints/heights: Microsoft ML Buildings (ODbL), via Overture Maps Foundation",
            "Places: Overture Maps Foundation (CDLA-Permissive-2.0), incl. Meta and Microsoft sources",
            "Addresses: U.S. DOT National Address Database (public domain), via Overture Maps Foundation",
            "Elevation: USGS 3D Elevation Program 1 m DEM (public domain)",
        ],
    }
    write_json(WORLD_OUT / "manifest.json", manifest, pretty=True)
    print(f"[world] datum={datum} bounds={bounds} chunks={len(index)} buildings={dict(b_stats)} "
          f"ribbons={r_stats['ribbons']} graph={len(nodes)}n/{len(edges)}e businesses={len(businesses)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
