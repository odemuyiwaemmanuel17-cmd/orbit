from datetime import datetime, timezone

from catalog import GROUPS, TleCatalog


def test_fallback_catalog_meets_min_count(offline_network):
    """AC-1: with CelesTrak unreachable the fallback yields a full catalog."""
    cat = TleCatalog()
    data = cat.get()
    assert data["source"] == "fallback"
    assert len(data["satellites"]) >= 5
    for s in data["satellites"]:
        assert s["line1"].startswith("1 ")
        assert s["line2"].startswith("2 ")
        assert s["id"] == f"norad-{s['norad_id']}"
        assert s["group"] in GROUPS
        assert 0 <= s["inclination_deg"] <= 180


def test_catalog_epoch_rewritten_to_now(offline_network):
    cat = TleCatalog()
    data = cat.get()
    year = datetime.now(timezone.utc).year
    for s in data["satellites"]:
        epoch = datetime.fromisoformat(s["epoch"])
        assert abs((epoch - datetime.now(timezone.utc)).days) <= 2
        assert epoch.year == year


def test_parse_tle_file_happy_path():
    from catalog import parse_tle_file
    sample = (
        "ISS (ZARYA)\n"
        "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927\n"
        "2 25544  51.6416 247.4627 0001400  87.7906 235.3495 15.72125391563537\n"
        "NOAA 19\n"
        "1 33591U 09005A   08263.40065564  .00000055  00000-0  11936-4 0  8681\n"
        "2 33591  99.1860 137.7949 0015911 126.3386  23.7262 10.20846605531759\n"
    )
    entries = parse_tle_file(sample, "stations", max_count=10)
    assert len(entries) == 2
    assert entries[0]["norad_id"] == 25544
    assert entries[1]["name"] == "NOAA 19"


def test_parse_tle_file_respects_max_count():
    from catalog import parse_tle_file
    block = ("SAT\n"
             "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927\n"
             "2 25544  51.6416 247.4627 0001400  87.7906 235.3495 15.72125391563537\n") * 5
    assert len(parse_tle_file(block, "starlink", max_count=3)) == 3


def test_whole_catalog_propagates_fast(offline_network):
    """AC-6: SGP4 propagation of one epoch for the catalog stays under 50 ms."""
    import time
    from propagation import propagate_state, tle_to_satrec
    cat = TleCatalog().get()["satellites"]
    now = datetime.now(timezone.utc)
    start = time.perf_counter()
    for s in cat:
        propagate_state(tle_to_satrec(s["line1"], s["line2"]), now)
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert elapsed_ms < 50.0, f"propagation took {elapsed_ms:.1f} ms"
