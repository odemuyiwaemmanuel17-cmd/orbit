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


# ------------------------------------------- mission-analysis endpoints ----

def test_footprint_endpoint(client):
    r = client.get("/api/satellites/norad-25544/footprint")
    assert r.status_code == 200
    body = r.json()
    for key in ("sub_lat_deg", "sub_lon_deg", "altitude_km", "horizon_deg",
                "footprint_radius_km", "slant_range_max_km"):
        assert key in body
    assert body["footprint_radius_km"] > 1000


def test_footprint_unknown_sat_404(client):
    assert client.get("/api/satellites/norad-999999/footprint").status_code == 404


def test_passes_endpoint_requires_observer(client):
    assert client.get("/api/satellites/norad-25544/passes").status_code == 422
    r = client.get("/api/satellites/norad-25544/passes",
                   params={"lat": -1.29, "lon": 36.82, "hours": 24})
    assert r.status_code == 200
    body = r.json()
    assert body["observer"]["lat"] == pytest.approx(-1.29)
    assert isinstance(body["passes"], list)
    if body["passes"]:
        p = body["passes"][0]
        assert p["max_elevation_deg"] >= body["min_elevation_deg"]
        assert {"rise_utc", "max_utc", "set_utc", "azimuth_at_max_deg"} <= set(p)


def test_passes_rejects_bad_lat(client):
    r = client.get("/api/satellites/norad-25544/passes",
                   params={"lat": 999, "lon": 0})
    assert r.status_code == 422


def test_conjunctions_endpoint(client):
    r = client.get("/api/conjunctions", params={"hours": 2, "threshold_km": 50})
    assert r.status_code == 200
    body = r.json()
    assert body["threshold_km"] == 50
    assert body["scanned_pairs"] >= 60  # 12 fallback sats -> 66 pairs
    dists = [e["distance_km"] for e in body["events"]]
    assert dists == sorted(dists)


def test_groundtrack_endpoint(client):
    r = client.get('/api/satellites/norad-25544/groundtrack',
                   params={'past_minutes': 45, 'future_minutes': 90})
    assert r.status_code == 200
    body = r.json()
    assert body['past_minutes'] == 45
    assert len(body['segments']) >= 1
    for seg in body['segments']:
        lons = [p['lon'] for p in seg]
        assert all(abs(b - a) <= 180 for a, b in zip(lons, lons[1:]))


def test_groundtrack_unknown_sat_404(client):
    assert client.get('/api/satellites/norad-777777/groundtrack').status_code == 404


def test_space_weather_endpoint(client, monkeypatch):
    import httpx as _httpx
    orig = _httpx.Client.send

    def _fail_swpc(self, request, *a, **k):
        if 'swpc' in str(request.url) or 'noaa' in str(request.url):
            raise _httpx.ConnectError('offline')
        return orig(self, request, *a, **k)

    monkeypatch.setattr(_httpx.Client, 'send', _fail_swpc)
    r = client.get("/api/space-weather")
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["kp_index"] <= 9
    assert body["density_multiplier"] >= 1.0
    assert body["condition"]
