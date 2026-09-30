"""Stage 2 (RAW -> NORMALIZED): map source schemas onto the project's own layer schemas.

Normalized layers stay in WGS84 and keep full provenance: every feature carries the
source dataset(s), source record ids, source update time and license, plus a
`confidence` classification (VERIFIED / INFERRED / UNKNOWN) for derived attributes.
No geometry repair happens here — that is the validation stage's job.
"""
from __future__ import annotations

import sys

from .common import NORMALIZED, feature, overture_release_dir, read_fc, write_fc, write_json


def _sources(p: dict) -> list[dict]:
    out = []
    for s in p.get("sources", []):
        out.append({k: s[k] for k in ("dataset", "record_id", "license", "update_time", "property") if s.get(k)})
    return out


def _name(p: dict) -> str | None:
    return (p.get("names") or {}).get("primary")


def buildings(rel) -> list[dict]:
    out = []
    for f in read_fc(rel / "buildings.building.geojson"):
        p = f["properties"]
        srcs = _sources(p)
        height_src = next((s["dataset"] for s in srcs if s.get("property") == "/properties/height"), None)
        if p.get("height") is not None and height_src is None:
            height_src = srcs[0]["dataset"] if srcs else None
        out.append(feature(p["id"], f["geometry"], {
            "name": _name(p),
            "class": p.get("class"),
            "subtype": p.get("subtype"),
            "height_m": p.get("height"),
            # Microsoft ML heights are model estimates, OSM heights are mapper-entered.
            "height_confidence": None if p.get("height") is None else (
                "INFERRED" if height_src and "Microsoft" in height_src else "VERIFIED_SOURCE"),
            "height_source": height_src,
            "num_floors": p.get("num_floors"),
            "roof_shape": p.get("roof_shape"),
            "roof_material": p.get("roof_material"),
            "facade_material": p.get("facade_material"),
            "facade_color": p.get("facade_color"),
            "roof_color": p.get("roof_color"),
            "is_underground": p.get("is_underground") or None,
            "footprint_source": srcs[0]["dataset"] if srcs else None,
            "sources": srcs,
        }))
    return out


def _one_way(p: dict) -> str | None:
    """Overture expresses one-way travel as a heading-scoped denial of access."""
    for r in p.get("access_restrictions", []) or []:
        when = r.get("when") or {}
        if r.get("access_type") == "denied" and when.get("heading") and not when.get("mode") \
                and not when.get("using") and not when.get("recognized") and not r.get("between"):
            return "forward" if when["heading"] == "backward" else "backward"
    return None


def _speed_mph(p: dict) -> float | None:
    for s in p.get("speed_limits", []) or []:
        ms = s.get("max_speed")
        if ms and not s.get("between") and not s.get("when"):
            return ms["value"] if ms.get("unit") == "mph" else round(ms["value"] * 0.621371, 1)
    return None


def segments(rel) -> list[dict]:
    out = []
    for f in read_fc(rel / "transportation.segment.geojson"):
        p = f["properties"]
        flags = sorted({v for rf in (p.get("road_flags") or []) for v in rf.get("values", [])})
        levels = [lr.get("value") for lr in (p.get("level_rules") or []) if not lr.get("between")]
        out.append(feature(p["id"], f["geometry"], {
            "kind": p.get("subtype"),
            "class": p.get("class"),
            "subclass": p.get("subclass"),
            "name": _name(p),
            "one_way": _one_way(p),
            "speed_limit_mph": _speed_mph(p),
            "surface": next((s.get("value") for s in (p.get("road_surface") or []) if not s.get("between")), None),
            "flags": flags or None,
            "level": levels[0] if levels else None,
            "private": any((r.get("when") or {}).get("recognized") == ["as_private"]
                           for r in (p.get("access_restrictions") or [])) or None,
            "connectors": [{"id": c["connector_id"], "at": c["at"]} for c in p.get("connectors", [])],
            "routes": sorted({r.get("ref") for r in (p.get("routes") or []) if r.get("ref")}) or None,
            "sources": _sources(p),
        }))
    return out


def connectors(rel) -> list[dict]:
    return [feature(f["properties"]["id"], f["geometry"], {"sources": _sources(f["properties"])})
            for f in read_fc(rel / "transportation.connector.geojson")]


def places(rel) -> list[dict]:
    out = []
    for f in read_fc(rel / "places.place.geojson"):
        p = f["properties"]
        tax = p.get("taxonomy") or {}
        addr = (p.get("addresses") or [{}])[0]
        srcs = _sources(p)
        # Contact phone/email are deliberately not carried forward (not needed for gameplay).
        out.append(feature(p["id"], f["geometry"], {
            "name": _name(p),
            "category": tax.get("primary") or p.get("basic_category"),
            "category_hierarchy": tax.get("hierarchy"),
            "basic_category": p.get("basic_category"),
            "brand": _name(p.get("brand") or {}),
            "address": addr.get("freeform"),
            "postcode": addr.get("postcode"),
            "website": (p.get("websites") or [None])[0],
            "operating_status": p.get("operating_status"),
            "source_confidence": round(p["confidence"], 3) if p.get("confidence") is not None else None,
            "source_date": max((s.get("update_time", "") for s in srcs), default=None) or None,
            "sources": srcs,
        }))
    return out


def addresses(rel) -> list[dict]:
    out = []
    for f in read_fc(rel / "addresses.address.geojson"):
        p = f["properties"]
        out.append(feature(p["id"], f["geometry"], {
            "number": p.get("number"),
            "street": p.get("street"),
            "unit": p.get("unit"),
            "postcode": p.get("postcode"),
            "city": p.get("postal_city"),
            "sources": _sources(p),
        }))
    return out


def base_layer(rel, typ: str) -> list[dict]:
    out = []
    for f in read_fc(rel / f"base.{typ}.geojson"):
        p = f["properties"]
        out.append(feature(p["id"], f["geometry"], {
            "subtype": p.get("subtype"), "class": p.get("class"), "name": _name(p),
            "surface": p.get("surface"), "sources": _sources(p),
        }))
    return out


def main() -> int:
    rel = overture_release_dir()
    meta = {"overture_release": rel.name, "crs": "EPSG:4326"}
    layers = {
        "buildings": buildings(rel),
        "road_segments": segments(rel),
        "road_connectors": connectors(rel),
        "places": places(rel),
        "addresses": addresses(rel),
        "water": base_layer(rel, "water"),
        "land_use": base_layer(rel, "land_use"),
        "land_cover": base_layer(rel, "land_cover"),
        "infrastructure": base_layer(rel, "infrastructure"),
    }
    summary = {}
    for name, feats in layers.items():
        write_fc(NORMALIZED / f"{name}.geojson", feats, meta)
        summary[name] = len(feats)
        print(f"[normalize] {name}: {len(feats)}")
    write_json(NORMALIZED / "summary.json", {"meta": meta, "counts": summary}, pretty=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
