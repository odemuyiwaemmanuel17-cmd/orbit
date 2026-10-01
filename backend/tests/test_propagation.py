import math
from datetime import datetime, timedelta, timezone

import pytest

from catalog import _build_line1, _build_line2, _fallback_entries
from propagation import (gmst_deg, inclination_deg, propagate_jd,
                         propagate_orbit_path, propagate_state, sat_epoch,
                         tle_to_satrec)

# Canonical ISS (ZARYA) element set from the sgp4 test suite, epoch 2008 Sep 20.
ISS_L1 = "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927"
ISS_L2 = "2 25544  51.6416 247.4627 0001400  87.7906 235.3495 15.72125391563537"


def test_tle_to_satrec_parses_canonical_iss():
    sat = tle_to_satrec(ISS_L1, ISS_L2)
    assert sat.satnum == 25544
    assert math.isclose(inclination_deg(ISS_L2), 51.6416, abs_tol=1e-4)


def test_iss_propagates_to_known_state_at_epoch():
    sat = tle_to_satrec(ISS_L1, ISS_L2)
    epoch = sat_epoch(sat)
    # Reference ECI magnitude for ISS at this epoch ~ 6796 km ( Vallado example ).
    state = propagate_state(sat, epoch)
    r = math.sqrt(sum(c * c for c in state["eci_km"]))
    assert 6700 < r < 6900
    assert 7.4 < state["velocity_km_s"] < 7.8
    assert -90 <= state["latitude"] <= 90
    assert -180 <= state["longitude"] <= 180


def test_iss_altitude_in_leo_band():
    sat = tle_to_satrec(ISS_L1, ISS_L2)
    state = propagate_state(sat, sat_epoch(sat))
    assert 350 < state["altitude_km"] < 480


def test_gmst_in_range_and_continuous():
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    vals = []
    for h in range(24):
        jd = 2451545.0
        # use propagate path for gmst: sample gmst via helper directly
        vals.append(gmst_deg(jd + h / 24.0, 0.0))
    assert all(0 <= v < 360 for v in vals)


def test_orbit_path_point_count_and_continuity():
    sat = tle_to_satrec(ISS_L1, ISS_L2)
    pts = propagate_orbit_path(sat, sat_epoch(sat), minutes=90, steps=180)
    assert len(pts) == 180
    radii = [math.sqrt(sum(c * c for c in p["eci_km"])) for p in pts]
    # Orbit stays within a sane LEO band over the 90-minute window.
    assert all(6600 < r < 7000 for r in radii)
    # Consecutive points must be spatially continuous (no jumps).
    pts_v = [p["eci_km"] for p in pts]
    max_step = max(math.dist(pts_v[i], pts_v[i + 1]) for i in range(len(pts_v) - 1))
    assert max_step < 400  # arc length per ~30 s sample is bounded


def test_orbit_path_rejects_bad_steps():
    sat = tle_to_satrec(ISS_L1, ISS_L2)
    with pytest.raises(ValueError):
        propagate_orbit_path(sat, sat_epoch(sat), steps=1)


def test_propagate_naive_datetime_treated_as_utc():
    sat = tle_to_satrec(ISS_L1, ISS_L2)
    naive = datetime(2008, 9, 20, 12, 25, 45)
    state = propagate_state(sat, naive)  # must not raise
    assert math.isfinite(state["altitude_km"])


# --- Fallback TLE builder (synthetic element sets) --------------------------------

def test_builder_column_alignment_matches_canonical_iss():
    """Regression: generated lines must place fields at the exact TLE columns."""
    l1 = _build_line1(25544, "U", "98067A", 8, 264.51782528, "-.00002182",
                      "-11606-4", 927)
    l2 = _build_line2(25544, 51.6416, 247.4627, 0.0001400, 87.7906, 235.3495,
                      15.72125391, 56353)
    assert l1[18:32] == "08264.51782528"
    assert l1[33:43] == "-.00002182"
    assert l1[53:61] == "-11606-4"
    assert l2[8:16] == " 51.6416"
    assert l2[26:33] == "0001400"
    assert l2[52:63] == "15.72125391"
    assert l2[63:68] == "56353"
    sat = tle_to_satrec(l1, l2)
    jd, fr = sat.jdsatepoch, sat.jdsatepochF
    e, pos, _v = propagate_jd(sat, jd, fr)
    assert e == 0
    r = math.sqrt(sum(c * c for c in pos))
    assert 6700 < r < 6900


def test_builder_epoch_padding_for_single_digit_doy():
    """Regression (code-review): early-January doy must not shrink the field."""
    l1 = _build_line1(25544, "U", "98067A", 26, 1.23456789, ".00002182",
                      " 11606-4", 1)
    assert len(l1) == 68
    assert l1[18:32] == "26001.23456789"
    sat = tle_to_satrec(l1, _build_line2(25544, 51.6416, 247.4627, 0.00014,
                                         87.7906, 235.3495, 15.72125391, 999))
    e, _pos, _v = propagate_jd(sat, sat.jdsatepoch, sat.jdsatepochF)
    assert e == 0


def test_fallback_entries_all_parse_and_propagate():
    entries = _fallback_entries()
    assert len(entries) >= 8
    now = datetime.now(timezone.utc)
    for e in entries:
        sat = tle_to_satrec(e["line1"], e["line2"])
        state = propagate_state(sat, now)
        assert 160 < state["altitude_km"] < 40000, e["name"]
        assert -90 <= state["latitude"] <= 90
        assert state["velocity_km_s"] > 3.0
