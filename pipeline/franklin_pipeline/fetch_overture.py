"""Stage 1 (SOURCE -> RAW): fetch Overture Maps GeoParquet features intersecting a bbox.

Reads Overture's public S3 bucket directly with pyarrow (row-group bbox statistics are
used to skip irrelevant data), and writes one GeoJSON FeatureCollection per type into
data/raw/overture/<release>/ together with a manifest recording provenance.

The STAC catalog host (stac.overturemaps.org) is not reachable from every environment,
so the release is listed straight from the bucket.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq
import shapely

from .config import FETCH_BBOX, REPO_ROOT

BUCKET = "overturemaps-us-west-2"
HTTP_ROOT = f"https://{BUCKET}.s3.amazonaws.com"

# theme -> types we need for the world model
TYPES = {
    "buildings": ["building", "building_part"],
    "transportation": ["segment", "connector"],
    "places": ["place"],
    "addresses": ["address"],
    "base": ["land_use", "water", "infrastructure", "land", "land_cover"],
}

# Overture license per theme (see docs/SOURCE_LEDGER.md; verify on every release bump)
LICENSES = {
    "buildings": "ODbL-1.0 (contains OSM-derived data; other sources carry their own permissive terms)",
    "transportation": "ODbL-1.0",
    "places": "CDLA-Permissive-2.0",
    "addresses": "Varies per source; see per-feature sources",
    "base": "ODbL-1.0",
}


def _s3() -> pafs.S3FileSystem:
    kwargs: dict = {"anonymous": True, "region": "us-west-2"}
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        p = urllib.parse.urlparse(proxy)
        kwargs["proxy_options"] = {"scheme": p.scheme, "host": p.hostname, "port": p.port}
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        kwargs["tls_ca_file_path"] = ca
    return pafs.S3FileSystem(**kwargs)


def _list(prefix: str, delimiter: str | None = None) -> list[str]:
    out, token = [], None
    while True:
        q = {"list-type": "2", "prefix": prefix}
        if delimiter:
            q["delimiter"] = delimiter
        if token:
            q["continuation-token"] = token
        with urllib.request.urlopen(f"{HTTP_ROOT}/?{urllib.parse.urlencode(q)}", timeout=60) as r:
            body = r.read().decode()
        tag = "Prefix" if delimiter else "Key"
        found = re.findall(f"<{tag}>([^<]*)</{tag}>", body)
        out += [f for f in found if f != prefix]
        m = re.search(r"<NextContinuationToken>([^<]*)</NextContinuationToken>", body)
        if not m:
            return out
        token = m.group(1)


def latest_release() -> str:
    rels = sorted(p.split("/")[1] for p in _list("release/", "/"))
    return rels[-1]


def _row_groups(fs, key: str, bbox) -> list[int]:
    xmin, ymin, xmax, ymax = bbox
    md = pq.ParquetFile(fs.open_input_file(f"{BUCKET}/{key}")).metadata
    names = {md.row_group(0).column(i).path_in_schema: i for i in range(md.num_columns)}
    hit = []
    for g in range(md.num_row_groups):
        rg = md.row_group(g)
        s = {k: rg.column(names[f"bbox.{k}"]).statistics for k in ("xmin", "xmax", "ymin", "ymax")}
        if any(v is None or not v.has_min_max for v in s.values()):
            hit.append(g)
            continue
        if s["xmin"].min <= xmax and s["xmax"].max >= xmin and s["ymin"].min <= ymax and s["ymax"].max >= ymin:
            hit.append(g)
    return hit


def _read(fs, key: str, groups: list[int], bbox) -> pa.Table | None:
    if not groups:
        return None
    xmin, ymin, xmax, ymax = bbox
    t = pq.ParquetFile(fs.open_input_file(f"{BUCKET}/{key}")).read_row_groups(groups)
    b = t.column("bbox")
    mask = pc.and_(
        pc.and_(pc.less_equal(pc.struct_field(b, "xmin"), xmax), pc.greater_equal(pc.struct_field(b, "xmax"), xmin)),
        pc.and_(pc.less_equal(pc.struct_field(b, "ymin"), ymax), pc.greater_equal(pc.struct_field(b, "ymax"), ymin)),
    )
    t = t.filter(mask)
    return t if t.num_rows else None


def _jsonable(v):
    if isinstance(v, (bytes, bytearray)):
        return None
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items() if x is not None}
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return v


def to_geojson(table: pa.Table) -> dict:
    geoms = shapely.from_wkb(table.column("geometry").to_numpy(zero_copy_only=False))
    props = table.drop_columns(["geometry", "bbox"]).to_pylist()
    feats = []
    for g, p in zip(geoms, props):
        feats.append({
            "type": "Feature",
            "id": p.get("id"),
            "geometry": json.loads(shapely.to_geojson(g)),
            "properties": _jsonable({k: v for k, v in p.items() if v is not None}),
        })
    return {"type": "FeatureCollection", "features": feats}


def fetch_type(fs, release: str, theme: str, typ: str, bbox, workers: int = 16) -> dict:
    keys = [k for k in _list(f"release/{release}/theme={theme}/type={typ}/") if k.endswith(".parquet")]
    with cf.ThreadPoolExecutor(workers) as ex:
        groups = list(ex.map(lambda k: _row_groups(fs, k, bbox), keys))
    work = [(k, g) for k, g in zip(keys, groups) if g]
    with cf.ThreadPoolExecutor(workers) as ex:
        tables = [t for t in ex.map(lambda kg: _read(fs, kg[0], kg[1], bbox), work) if t is not None]
    if not tables:
        return {"type": "FeatureCollection", "features": []}
    return to_geojson(pa.concat_tables(tables, promote_options="permissive"))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--release", default=None, help="Overture release (default: latest in bucket)")
    ap.add_argument("--only", nargs="*", help="theme/type filters, e.g. buildings/building")
    args = ap.parse_args(argv)

    fs = _s3()
    release = args.release or latest_release()
    out_dir = REPO_ROOT / "data" / "raw" / "overture" / release
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        "source": "Overture Maps Foundation",
        "bucket": f"s3://{BUCKET}/release/{release}/",
        "release": release,
        "bbox_wgs84": FETCH_BBOX,
        "files": {},
    }
    for theme, types in TYPES.items():
        for typ in types:
            if args.only and f"{theme}/{typ}" not in args.only:
                continue
            print(f"[fetch] {theme}/{typ} ...", flush=True)
            fc = fetch_type(fs, release, theme, typ, FETCH_BBOX)
            path = out_dir / f"{theme}.{typ}.geojson"
            data = json.dumps(fc, separators=(",", ":"), sort_keys=True).encode()
            path.write_bytes(data)
            manifest["files"][path.name] = {
                "theme": theme,
                "type": typ,
                "features": len(fc["features"]),
                "sha256": hashlib.sha256(data).hexdigest(),
                "license": LICENSES[theme],
                "fetched_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            }
            print(f"[fetch]   {len(fc['features'])} features -> {path.relative_to(REPO_ROOT)}", flush=True)
            manifest_path.write_text(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
