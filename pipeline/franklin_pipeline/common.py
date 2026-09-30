"""Shared helpers for pipeline stages."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from .config import REPO_ROOT

RAW = REPO_ROOT / "data" / "raw"
NORMALIZED = REPO_ROOT / "data" / "normalized"
VALIDATED = REPO_ROOT / "data" / "validated"
AUTHORED = REPO_ROOT / "data" / "authored"
WORLD_OUT = REPO_ROOT / "public" / "world"


def read_fc(path: Path) -> list[dict]:
    return json.loads(path.read_text())["features"]


def write_json(path: Path, obj: Any, pretty: bool = False) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if pretty:
        data = json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False)
    else:
        data = json.dumps(obj, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
    path.write_text(data + "\n")
    return hashlib.sha256(data.encode()).hexdigest()


def write_fc(path: Path, features: Iterable[dict], meta: dict | None = None) -> str:
    fc = {"type": "FeatureCollection", "features": list(features)}
    if meta:
        fc["meta"] = meta
    return write_json(path, fc)


def feature(fid: str, geometry: dict, props: dict) -> dict:
    return {"type": "Feature", "id": fid, "geometry": geometry,
            "properties": {k: v for k, v in props.items() if v is not None}}


def overture_release_dir() -> Path:
    rels = sorted(p for p in (RAW / "overture").iterdir() if p.is_dir())
    if not rels:
        raise SystemExit("no raw Overture release found; run fetch_overture first")
    return rels[-1]


def stable_hash(s: str) -> int:
    """Deterministic 32-bit hash (FNV-1a) — mirrored in src/core/hash.ts."""
    h = 0x811C9DC5
    for b in s.encode():
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h
