import math

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture()
def client(offline_network, monkeypatch):
    from catalog import TleCatalog
    monkeypatch.setattr(main, "catalog", TleCatalog())
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["satellite_count"] >= 5


def test_list_satellites_contract(client):
    r = client.get("/api/satellites")
    assert r.status_code == 200
    body = r.json()
    assert {g["key"] for g in body["groups"]} == {"stations", "science",
                                                  "navigation", "starlink"}
    sat = body["satellites"][0]
    assert set(sat) >= {"id", "norad_id", "name", "group", "line1", "line2",
                        "inclination_deg", "epoch"}


def test_positions_defaults_are_sane(client):
    """AC-2: finite geodetic state, plausible altitudes and LEO velocity."""
    r = client.get("/api/satellites/positions")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 5
    assert body["skipped"] == []
    iss = next(p for p in body["positions"] if p["id"] == "norad-25544")
    assert -90 <= iss["latitude"] <= 90
    assert -180 <= iss["longitude"] <= 180
    assert iss["altitude_km"] > 160
    assert iss["velocity_km_s"] > 6.0  # LEO
    for p in body["positions"]:
        assert all(math.isfinite(c) for c in p["eci_km"])


def test_positions_accepts_explicit_timestamp(client):
    r = client.get("/api/satellites/positions",
                   params={"timestamp": "2026-10-01T12:00:00Z"})
    assert r.status_code == 200
    assert r.json()["timestamp"].startswith("2026-10-01T12:00:00")


def test_positions_rejects_bad_timestamp(client):
    r = client.get("/api/satellites/positions", params={"timestamp": "not-a-date"})
    assert r.status_code == 422


def test_orbit_endpoint_returns_requested_steps(client):
    """AC-5: a +90 minute window returns exactly `steps` continuous points."""
    r = client.get("/api/satellites/norad-25544/orbit",
                   params={"minutes": 90, "steps": 60})
    assert r.status_code == 200
    body = r.json()
    assert body["steps_returned"] == 60 == body["steps_requested"]
    radii = [math.sqrt(sum(c * c for c in p["eci_km"])) for p in body["points"]]
    assert all(6600 < x < 7000 for x in radii)
    offsets = [p["time_offset_s"] for p in body["points"]]
    assert offsets == sorted(offsets) and offsets[0] == 0


def test_orbit_unknown_satellite_404(client):
    r = client.get("/api/satellites/norad-999999/orbit")
    assert r.status_code == 404


def test_orbit_steps_clamped(client):
    r = client.get("/api/satellites/norad-25544/orbit",
                   params={"minutes": 9999})
    assert r.status_code == 422  # FastAPI Query validation bounds
    r = client.get("/api/satellites/norad-25544/orbit", params={"steps": 1})
    assert r.status_code == 422
