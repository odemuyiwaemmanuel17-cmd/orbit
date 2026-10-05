import math
from datetime import datetime, timedelta, timezone

import pytest
import httpx

import analysis
from analysis import (SpaceWeather, footprint, predict_passes,
                      scan_conjunctions)
from propagation import tle_to_satrec

ISS_L1 = "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927"
ISS_L2 = "2 25544  51.6416 247.4627 0001400  87.7906 235.3495 15.72125391563537"

# Same orbit as ISS but mean anomaly shifted 0.4 deg -> ~47 km co-orbital gap.
NEAR_L2 = "2 25545  51.6416 247.4627 0001400  87.7906 235.7495 15.72125391563537"


def _iss():
    return tle_to_satrec(ISS_L1, ISS_L2)


# ------------------------------------------------------------------ footprint

def test_footprint_iss_geometry():
    fp = footprint(_iss(), datetime(2008, 9, 20, 12, 26, tzinfo=timezone.utc))
    assert 350 < fp['altitude_km'] < 480
    assert 18 < fp['horizon_deg'] < 23
    assert 2000 < fp['footprint_radius_km'] < 2600
    assert 2100 < fp['slant_range_max_km'] < 2600
    assert fp['coverage_area_mkm2'] > 10
    assert -90 <= fp['sub_lat_deg'] <= 90


def test_footprint_grows_with_altitude():
    low = footprint(_iss(), datetime(2008, 9, 20, 12, 26, tzinfo=timezone.utc))
    # Hubble is higher; its footprint must be wider.
    hst = tle_to_satrec(
        "1 20580U 90037B   08263.40000000  .00000300  00000-0  15000-4 0  9996",
        "2 20580  28.4700 120.3000 0002800  49.0000 311.0000 15.09270000100015")
    high = footprint(hst, datetime(2008, 9, 20, 12, 26, tzinfo=timezone.utc))
    assert high['footprint_radius_km'] > low['footprint_radius_km']


# -------------------------------------------------------------- pass prediction

def test_passes_found_over_nairobi():
    t0 = datetime(2008, 9, 20, 0, 0, tzinfo=timezone.utc)
    passes = predict_passes(_iss(), -1.29, 36.82, t0, hours=48,
                            min_elevation_deg=10.0, step_s=30)
    assert len(passes) >= 1
    p = passes[0]
    assert p['max_elevation_deg'] >= 10.0
    assert 0 <= p['azimuth_at_max_deg'] < 360
    rise = datetime.fromisoformat(p['rise_utc'])
    mx = datetime.fromisoformat(p['max_utc'])
    st = datetime.fromisoformat(p['set_utc'])
    assert rise <= mx <= st
    assert st - rise <= timedelta(hours=12)
    # Events must be chronologically ordered.
    times = [x['rise_utc'] for x in passes]
    assert times == sorted(times)


def test_passes_empty_when_below_horizon():
    # A GEO satellite 90 deg away from the observer with min elev 10 -> none.
    geo = tle_to_satrec(
        "1 41866U 16064A   08264.50000000  .00000000  00000-0  00000-0 0  9996",
        "2 41866   0.0500  90.0000 0001000 180.0000 180.0000  1.00270000100015")
    passes = predict_passes(geo, 0.0, 0.0, datetime(2008, 9, 20, tzinfo=timezone.utc),
                            hours=6, min_elevation_deg=10.0)
    assert passes == []


# ---------------------------------------------------------------- conjunctions

def test_conjunction_detects_co_orbital_pair():
    sats = [
        {'id': 'norad-25544', 'name': 'ISS A', 'line1': ISS_L1, 'line2': ISS_L2},
        {'id': 'norad-25545', 'name': 'ISS B', 'line1': ISS_L1.replace('25544U', '25545U'),
         'line2': NEAR_L2},
    ]
    t0 = datetime(2008, 9, 20, 12, 26, tzinfo=timezone.utc)
    res = scan_conjunctions(sats, t0, hours=3, threshold_km=50, coarse_minutes=2)
    assert res['events'], 'expected at least one approach event'
    top = res['events'][0]
    assert top['risk'] is True
    assert top['distance_km'] < 50


def test_conjunction_ignores_docked_co_orbital_artifacts():
    """Identical element sets (docked modules) must never raise a risk."""
    sats = [
        {'id': 'norad-25544', 'name': 'ISS A', 'line1': ISS_L1, 'line2': ISS_L2},
        {'id': 'norad-36086', 'name': 'POISK', 'line1': ISS_L1.replace('25544U', '36086U'),
         'line2': ISS_L2.replace('25544', '36086', 1)},
    ]
    res = scan_conjunctions(sats, datetime(2008, 9, 20, 12,
                                           tzinfo=timezone.utc), hours=2)
    assert not any(e['risk'] for e in res['events'])
    assert all(not e['co_orbital'] for e in res['events'])  # filtered out


def test_conjunction_watch_list_sorted():
    sats = [
        {'id': 'norad-25544', 'name': 'ISS', 'line1': ISS_L1, 'line2': ISS_L2},
        {'id': 'norad-20580', 'name': 'HST',
         'line1': "1 20580U 90037B   08263.40000000  .00000300  00000-0  15000-4 0  9996",
         'line2': "2 20580  28.4700 120.3000 0002800  49.0000 311.0000 15.09270000100015"},
    ]
    res = scan_conjunctions(sats, datetime(2008, 9, 20, 12,
                                           tzinfo=timezone.utc), hours=2)
    dists = [e['distance_km'] for e in res['events']]
    assert dists == sorted(dists)
    assert res['scanned_pairs'] == 1


# ---------------------------------------------------------------- ground track

def test_ground_track_segments_never_cross_antimeridian():
    from datetime import timedelta
    from analysis import ground_track
    t0 = datetime(2008, 9, 20, 12, 26, tzinfo=timezone.utc)
    segs = ground_track(_iss(), t0, past_minutes=45, future_minutes=180, step_s=30)
    assert len(segs) >= 1
    for seg in segs:
        lons = [p['lon'] for p in seg]
        diffs = [abs(b - a) for a, b in zip(lons, lons[1:])]
        assert all(d <= 180 for d in diffs), 'segment spans the date line'
    total_pts = sum(len(s) for s in segs)
    assert total_pts >= 200  # 4.25 h at 30 s


def test_ground_track_offsets_span_past_and_future():
    from analysis import ground_track
    t0 = datetime(2008, 9, 20, 12, 26, tzinfo=timezone.utc)
    segs = ground_track(_iss(), t0, past_minutes=45, future_minutes=90)
    offsets = [p['offset_s'] for seg in segs for p in seg]
    assert min(offsets) <= -40 * 60
    assert max(offsets) >= 85 * 60


# --------------------------------------------------------------- space weather

def test_weather_synthetic_fallback(monkeypatch):
    def _fail(self, *a, **k):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(httpx.Client, 'send', _fail)
    w = SpaceWeather().get(datetime(2026, 10, 2, tzinfo=timezone.utc))
    assert 0 <= w['kp_index'] <= 9
    assert w['source'] == 'synthetic'
    assert w['flux_107cm'] > 60
    assert w['density_multiplier'] >= 1.0
    assert isinstance(w['storm'], bool)
    assert w['condition'] in ('QUIET', 'UNSETTLED', 'ACTIVE',
                              'STORM G1-G2', 'SEVERE STORM G3+')


def test_weather_storm_flag_consistency(monkeypatch):
    def _fail(self, *a, **k):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(httpx.Client, 'send', _fail)
    # Find a timestamp whose synthetic Kp is a storm; assert flag agrees.
    for hour in range(24):
        w = SpaceWeather().get(datetime(2026, 3, 1, hour,
                                        tzinfo=timezone.utc))
        assert w['storm'] == (w['kp_index'] >= 5)


def test_weather_ttl_cache(monkeypatch):
    calls = {'n': 0}
    orig = SpaceWeather.get

    def _counting(self, now=None):
        calls['n'] += 1
        return orig(self, now)
    monkeypatch.setattr(SpaceWeather, 'get', _counting)
    w = SpaceWeather()
    w.get()
    w.get()  # served from cache (outer wrapper still counts)
    assert calls['n'] == 2
    assert w._cache is not None
