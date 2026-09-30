"""Stage 1 (SOURCE -> RAW): crop USGS 3DEP 1 m lidar DEM for the fetch bbox.

Source: USGS National Map staged products (public domain), project TN_Middle_B2_2018,
tile x51y398 (UTM 16N / NAD83, EPSG:26916). Written as a compressed GeoTIFF with a
provenance manifest into data/raw/usgs_3dep/.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import sys

import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer

from .config import FETCH_BBOX, REPO_ROOT

TILES = [
    "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/TN_Middle_B2_2018/TIFF/USGS_one_meter_x51y398_TN_Middle_B2_2018.tif",
]


def _gdal_env() -> None:
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        os.environ.setdefault("GDAL_HTTP_PROXY", proxy.split("://", 1)[-1])
    if os.path.exists("/root/.ccr/ca-bundle.crt"):
        os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")


def main() -> int:
    _gdal_env()
    out_dir = REPO_ROOT / "data" / "raw" / "usgs_3dep"
    out_dir.mkdir(parents=True, exist_ok=True)
    url = TILES[0]
    with rasterio.open("/vsicurl/" + url) as src:
        tf = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
        xs, ys = zip(*[tf.transform(x, y) for x in FETCH_BBOX[0::2] for y in FETCH_BBOX[1::2]])
        bounds = (min(xs), min(ys), max(xs), max(ys))
        if not (src.bounds.left <= bounds[0] and src.bounds.right >= bounds[2]
                and src.bounds.bottom <= bounds[1] and src.bounds.top >= bounds[3]):
            print("fetch bbox exceeds the single configured DEM tile; add tiles", file=sys.stderr)
            return 1
        win = from_bounds(*bounds, transform=src.transform).round_offsets().round_lengths()
        data = src.read(1, window=win)
        prof = src.profile.copy()
        prof.update(width=data.shape[1], height=data.shape[0], transform=src.window_transform(win),
                    compress="deflate", predictor=3, tiled=True, blockxsize=256, blockysize=256)
        path = out_dir / "dem_1m_franklin.tif"
        with rasterio.open(path, "w", **prof) as dst:
            dst.write(data, 1)
        manifest = {
            "source": "USGS 3D Elevation Program (3DEP) 1 meter DEM",
            "project": "TN_Middle_B2_2018",
            "url": url,
            "license": "Public domain (USGS)",
            "crs": str(src.crs),
            "bounds_native": bounds,
            "shape": list(data.shape),
            "nodata": src.nodata,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "fetched_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        }
        (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"[dem] {data.shape} min={data.min():.1f} max={data.max():.1f} -> {path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
