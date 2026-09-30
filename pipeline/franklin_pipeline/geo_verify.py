"""Geo-verification: compare packaged world geometry (public/world) with validated source data.

Outputs artifacts/geo_verify.json (metrics + verdict) and artifacts/geo_verify.svg (overlay map of
the core: source footprints filled, world footprints outlined, roads, hero buildings, spawn).
Exit code 1 if any tolerance is violated. Run: python -m franklin_pipeline.geo_verify
"""
from __future__ import annotations

import json
import math
import sys
from collections import defaultdict

import numpy as np
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import transform

from . import config as C
from .build_world import lonlat_to_game
from .common import REPO_ROOT, VALIDATED, WORLD_OUT, read_fc

TOL = {"centroid_m": 0.05, "area_rel": 0.01, "road_hausdorff_m": 0.5, "building_presence": 0.99}


def _game(g):
    return transform(lambda x, y, z=None: lonlat_to_game(x, y), g)


def main() -> int:
    man = json.loads((WORLD_OUT / "manifest.json").read_text())
    b = man["bounds"]
    world_box = Polygon([(b["minX"], b["minZ"]), (b["maxX"], b["minZ"]), (b["maxX"], b["maxZ"]), (b["minX"], b["maxZ"])])
    core = Polygon(man["core"])

    wb, wr, heroes = {}, defaultdict(list), {}
    dup = 0
    for e in man["chunks"]:
        ch = json.loads((WORLD_OUT / e["file"]).read_text())
        for x in ch["buildings"]:
            if x["id"] in wb:
                dup += 1
            wb[x["id"]] = x
            if x.get("hero"):
                heroes[x["hero"]] = x
        for r in ch["roads"]:
            wr[r["id"]].append(r)

    # Buildings
    cd, ad, missing, checked = [], [], [], 0
    for f in read_fc(VALIDATED / "buildings.geojson"):
        g = _game(shape(f["geometry"]))
        if not world_box.contains(g.centroid):
            continue
        checked += 1
        w = wb.get(f["id"])
        if not w:
            missing.append(f["id"])
            continue
        pw = Polygon(w["footprint"], [h for h in (w.get("holes") or [])])
        cd.append(pw.centroid.distance(g.centroid))
        ad.append(abs(pw.area - g.area) / g.area)
    presence = 1 - len(missing) / max(1, checked)

    # Roads (core only): world ribbons for a segment vs validated centreline within the world box
    hd = []
    for f in read_fc(VALIDATED / "road_segments.geojson"):
        # Full source line: chunk squares extend past `bounds` to the 128 m grid edge.
        g = _game(shape(f["geometry"]))
        if not g.intersects(core) or f["id"] not in wr:
            continue
        for rib in wr[f["id"]]:
            line = LineString([(p[0], p[2]) for p in rib["pts"]])
            # every ribbon vertex must lie on the source centreline
            hd.append(max(g.distance(Point(c)) for c in line.coords))

    # Spawn sanity
    sp = man.get("spawn")
    spawn_inside = None
    if sp:
        pt = Point(sp["pos"][0], sp["pos"][2])
        spawn_inside = any(Polygon(x["footprint"]).contains(pt) for x in wb.values()
                           if abs(x["footprint"][0][0] - pt.x) < 200 and abs(x["footprint"][0][1] - pt.y) < 200)

    hero_cfg = json.loads((REPO_ROOT / "data" / "authored" / "hero_locations.json").read_text())["locations"]
    metrics = {
        "buildings_checked": checked,
        "building_presence": round(presence, 5),
        "buildings_missing": len(missing),
        "buildings_duplicated": dup,
        "centroid_delta_m_max": round(max(cd), 4) if cd else None,
        "area_delta_rel_max": round(max(ad), 5) if ad else None,
        "area_delta_rel_p99": round(float(np.percentile(ad, 99)), 5) if ad else None,
        "road_ribbons_checked": len(hd),
        "road_vertex_offset_m_max": round(max(hd), 4) if hd else None,
        "heroes_configured": len(hero_cfg),
        "heroes_resolved": sorted(heroes),
        "spawn_inside_building": spawn_inside,
    }
    fails = []
    if presence < TOL["building_presence"]:
        fails.append("building presence")
    if dup:
        fails.append("duplicated buildings")
    if cd and max(cd) > TOL["centroid_m"]:
        fails.append("building centroid delta")
    if ad and float(np.percentile(ad, 99)) > TOL["area_rel"]:
        fails.append("building area delta")
    if hd and max(hd) > TOL["road_hausdorff_m"]:
        fails.append("road ribbon offset")
    if len(heroes) != len(hero_cfg):
        fails.append("unresolved hero")
    if spawn_inside:
        fails.append("spawn inside a building")
    metrics["tolerances"] = TOL
    metrics["failures"] = fails
    out = REPO_ROOT / "artifacts"
    out.mkdir(exist_ok=True)
    (out / "geo_verify.json").write_text(json.dumps(metrics, indent=2))
    _svg(out / "geo_verify.svg", core, wb, wr, heroes, sp)
    print(json.dumps(metrics, indent=2))
    return 1 if fails else 0


def _svg(path, core, wb, wr, heroes, sp):
    minx, minz, maxx, maxz = core.bounds
    pad = 40
    s = 1.0
    W, H = (maxx - minx + 2 * pad) * s, (maxz - minz + 2 * pad) * s
    tx = lambda x: (x - minx + pad) * s
    tz = lambda z: (z - minz + pad) * s
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" viewBox="0 0 {W:.0f} {H:.0f}">',
             '<rect width="100%" height="100%" fill="#f4f1ea"/>']
    for ribs in wr.values():
        for r in ribs:
            if not any(core.buffer(pad).contains(Point(p[0], p[2])) for p in r["pts"][:1]):
                continue
            pts = " ".join(f"{tx(p[0]):.1f},{tz(p[2]):.1f}" for p in r["pts"])
            col = "#999" if r.get("kind") == "road" else "#c9a"
            w = max(0.6, r.get("width", 4) * s)
            parts.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="{w:.1f}" stroke-linecap="round" opacity="0.7"/>')
    for x in wb.values():
        fp = x["footprint"]
        if not core.buffer(pad).contains(Point(fp[0])):
            continue
        pts = " ".join(f"{tx(a):.1f},{tz(c):.1f}" for a, c in fp)
        fill = "#d9534f" if x.get("hero") else ("#8a8f98" if x["tier"] == "ORDINARY" else "#b8bcc2")
        parts.append(f'<polygon points="{pts}" fill="{fill}" stroke="#333" stroke-width="0.4"/>')
    for k, x in heroes.items():
        cx = sum(p[0] for p in x["footprint"]) / len(x["footprint"])
        cz = sum(p[1] for p in x["footprint"]) / len(x["footprint"])
        if core.buffer(pad).contains(Point(cx, cz)):
            parts.append(f'<text x="{tx(cx):.0f}" y="{tz(cz):.0f}" font-size="9" font-family="sans-serif" fill="#600">{k}</text>')
    if sp:
        parts.append(f'<circle cx="{tx(sp["pos"][0]):.1f}" cy="{tz(sp["pos"][2]):.1f}" r="4" fill="#0a6"/>')
    ring = " ".join(f"{tx(a):.1f},{tz(c):.1f}" for a, c in core.exterior.coords)
    parts.append(f'<polyline points="{ring}" fill="none" stroke="#06c" stroke-dasharray="6 4" stroke-width="1.5"/>')
    parts.append(f'<text x="8" y="16" font-size="12" font-family="sans-serif">Core area (north up, 1 px = 1 m). Red = HERO, green dot = spawn. Data © OSM contributors, Overture.</text>')
    parts.append("</svg>")
    path.write_text("\n".join(parts))


if __name__ == "__main__":
    sys.exit(main())
