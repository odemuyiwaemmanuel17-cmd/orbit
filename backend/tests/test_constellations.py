"""Constellation layer tests: bundle fallback provenance, validation, HTTP surface.

The autouse `offline_network` fixture blocks CelesTrak, so every request here
exercises the honest degradation path: bundle data with source="bundle".
"""


import pytest
from fastapi.testclient import TestClient

from constellations import ConstellationCatalog

import main


@pytest.fixture()
def client(offline_network, monkeypatch):
    monkeypatch.setattr(main, "constellations", ConstellationCatalog())
    with TestClient(main.app) as c:
        yield c


def test_constellation_summary_lists_all_keys(client):
    r = client.get("/api/constellations")
    assert r.status_code == 200
    keys = {c["key"] for c in r.json()["constellations"]}
    assert {"test", "gps", "weather", "starlink"} <= keys


def test_constellation_bundle_fallback_is_labeled(client):
    r = client.get("/api/constellations/gps")
    assert r.status_code == 200
    body = r.json()
    # Offline tests must never pretend the data is live.
    assert body["source"] == "bundle"
    assert body["satellites"], "bundle seed should exist after tool run"
    assert "at" not in body  # internal cache stamp never leaks


def test_constellation_entries_are_validated_and_decorated(client):
    r = client.get("/api/constellations/test")
    sats = r.json()["satellites"]
    ids = [s["id"] for s in sats]
    assert len(ids) == len(set(ids)), "duplicate NORAD ids in one layer"
    for s in sats:
        assert s["id"] == f"norad-{s['norad_id']}"
        assert s["group"] == "test"
        assert 0.0 <= s["inclination_deg"] <= 180.0
        assert "T" in s["epoch"]


def test_constellation_unknown_key_404(client):
    r = client.get("/api/constellations/quebec-1")
    assert r.status_code == 404


def test_constellation_respects_cap(client):
    body = client.get("/api/constellations/test").json()
    assert len(body["satellites"]) <= body["cap"] == 8
