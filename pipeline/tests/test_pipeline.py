"""Unit tests for pipeline transforms (run: python -m pytest pipeline/tests)."""
import json
import math

from franklin_pipeline import build_world, config
from franklin_pipeline.common import VALIDATED, WORLD_OUT, stable_hash
from franklin_pipeline.normalize import _one_way, _speed_mph
from franklin_pipeline.validate import AddressIndex, _parse_freeform, _street_key


def test_one_way_from_heading_denial():
    p = {"access_restrictions": [{"access_type": "denied", "when": {"heading": "backward"}}]}
    assert _one_way(p) == "forward"
    p = {"access_restrictions": [{"access_type": "denied", "when": {"heading": "forward"}}]}
    assert _one_way(p) == "backward"
    # mode-specific denials are not one-way streets
    p = {"access_restrictions": [{"access_type": "denied", "when": {"heading": "backward", "mode": ["hgv"]}}]}
    assert _one_way(p) is None


def test_speed_units():
    assert _speed_mph({"speed_limits": [{"max_speed": {"unit": "mph", "value": 25}}]}) == 25
    assert _speed_mph({"speed_limits": [{"max_speed": {"unit": "km/h", "value": 50}}]}) == 31.1


def test_street_normalisation_matches_nad_style():
    assert _street_key("4th Ave S") == _street_key("4TH Avenue South")
    assert _street_key("E Main St") == _street_key("East MAIN Street")
    assert _street_key("Main St")[0] == _street_key("West MAIN Street")[0]
    assert _parse_freeform("125 5th Ave S Ste 200") == ("125", "5TH AVE S")


def test_address_index_lookup():
    feats = [{"geometry": {"coordinates": [-86.87, 35.924]}, "properties": {"number": "419", "street": "MAIN Street"}}]
    idx = AddressIndex(feats)
    assert len(idx.lookup("419 Main St")) == 1
    assert idx.lookup("421 Main St") == []


def test_projection_origin_and_axes():
    x, z = build_world.lonlat_to_game(config.ORIGIN_LON, config.ORIGIN_LAT)
    assert abs(x) < 1e-6 and abs(z) < 1e-6
    x, z = build_world.lonlat_to_game(config.ORIGIN_LON, config.ORIGIN_LAT + 0.001)
    e, n = build_world.game_to_local(x, z)
    assert n > 100 and abs(e) < 0.5  # inverse rotation recovers north
    a = math.degrees(math.atan2(z, x))
    assert abs(a - (-90 + config.GRID_ROTATION_DEG)) < 0.5


def test_stable_hash_matches_runtime_fnv1a():
    # Reference values computed by src/core/hash.ts fnv1a (FNV-1a 32-bit).
    assert stable_hash("") == 0x811C9DC5
    assert stable_hash("a") == 0xE40C292C


def test_validated_outputs_and_report():
    rep = json.loads((VALIDATED / "validation_report.json").read_text())
    assert rep["errors"] == []
    assert rep["roads"]["largest_component_share"] > 0.9
    assert rep["places"]["address_consistent"] > rep["places"]["address_mismatch_relocated"]


def test_world_manifest_bounds_cover_core():
    from shapely.geometry import Polygon, box
    m = json.loads((WORLD_OUT / "manifest.json").read_text())
    core = Polygon(m["core"])
    b = m["bounds"]
    inside = core.intersection(box(b["minX"], b["minZ"], b["maxX"], b["maxZ"])).area / core.area
    # The rotated (axis-aligned) world rectangle must contain nearly all of the downtown core.
    assert inside > 0.95
    assert m["spawn"] and math.isfinite(m["spawn"]["yawDeg"])


def test_address_lookup_requires_matching_direction_and_type():
    pt = {"coordinates": [-86.87, 35.924]}
    feats = [
        {"geometry": pt, "properties": {"number": "137", "street": "4TH Avenue North"}},
        {"geometry": pt, "properties": {"number": "10", "street": "REYNOLDS Drive"}},
        {"geometry": pt, "properties": {"number": "339", "street": "MAIN Street"}},
        {"geometry": pt, "properties": {"number": "5", "street": "3RD Avenue South"}},
    ]
    idx = AddressIndex(feats)
    assert idx.lookup("137 4th Ave S") == []  # wrong directional: never relocate across streets
    assert len(idx.lookup("137 4th Ave N")) == 1
    assert idx.lookup("10 Reynolds Rd") == []  # wrong street type
    assert len(idx.lookup("339 Main St  # 2")) == 1  # suite marker stripped
    assert len(idx.lookup("5 Third Ave S")) == 1  # ordinal words normalised


def test_parse_freeform_suites():
    assert _parse_freeform("339 Main St  # 2") == ("339", "MAIN ST")
    assert _parse_freeform("100 E Main St, Suite 4") == ("100", "E MAIN ST")
