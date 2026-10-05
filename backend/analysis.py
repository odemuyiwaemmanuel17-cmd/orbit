"""
OrbitalPulse — mission-analysis routines.

Four engineering capabilities layered on the tested SGP4 core:

1. Ground footprint / line-of-sight cone geometry (radio + optical horizon).
2. Conjunction screening across the active catalog (coarse scan -> refine).
3. Space-weather ingest (NOAA SWPC Kp) with offline synthetic fallback.
4. Flyover pass prediction for an observer on the ground.

Geometry uses a spherical Earth (consistent with the visualization layer);
for the altitudes involved this keeps footprint/pass errors well under the
width of the alert thresholds. All routines are pure computation and safe to
unit-test offline.
"""

from __future__ import annotations

import math
import random
import time
from datetime import datetime, timedelta, timezone

import httpx

from propagation import (EARTH_RADIUS_KM, propagate_jd, teme_to_geodetic,
                         tle_to_satrec)
from sgp4.api import jday

MIN_PER_DAY = 1440.0


def _jd_fr(dt: datetime) -> tuple[float, float]:
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                dt.second + dt.microsecond * 1e-6)


def _state_eci_km(sat, when: datetime) -> tuple[tuple, tuple] | None:
    jd, fr = _jd_fr(when)
    err, pos, vel = propagate_jd(sat, jd, fr)
    if err != 0:
        return None
    return pos, vel


def _geodetic(pos_km, when: datetime) -> tuple[float, float, float]:
    jd, fr = _jd_fr(when)
    return teme_to_geodetic(pos_km, jd, fr)


def _ecef_unit(lat_deg: float, lon_deg: float) -> tuple[float, float, float]:
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    return (math.cos(lat) * math.cos(lon),
            math.cos(lat) * math.sin(lon),
            math.sin(lat))


# ------------------------------------------------------------------ 1. Footprint

def footprint(sat, when: datetime) -> dict:
    """Sub-satellite point + circular horizon footprint at `when`.

    The radio/optical horizon half-angle theta satisfies cos(theta) = Re/(Re+h);
    the ground projection is a circle of radius Re*theta centered on the
    sub-satellite point.
    """
    st = _state_eci_km(sat, when)
    if st is None:
        raise RuntimeError('propagation failed at requested time')
    pos, _vel = st
    lat, lon, alt = _geodetic(pos, when)
    horizon_rad = math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + alt))
    return {
        'sub_lat_deg': round(lat, 4),
        'sub_lon_deg': round(lon, 4),
        'altitude_km': round(alt, 2),
        'horizon_deg': round(math.degrees(horizon_rad), 3),
        'footprint_radius_km': round(EARTH_RADIUS_KM * horizon_rad, 1),
        'slant_range_max_km': round(
            math.sqrt((EARTH_RADIUS_KM + alt) ** 2 - EARTH_RADIUS_KM ** 2), 1),
        'coverage_area_mkm2': round(
            2 * math.pi * EARTH_RADIUS_KM ** 2 * (1 - math.cos(horizon_rad)) / 1e6, 1),
    }


# --------------------------------------------------- 2. Conjunction screening

def _pair_closest_approach(sat_a, sat_b, t0: datetime, hours: float,
                           coarse_s: float) -> dict | None:
    """Coarse scan then golden-refine the minimum separation in [t0, t0+hours]."""
    span = timedelta(hours=hours)
    steps = max(2, int(span.total_seconds() // coarse_s))
    best_d, best_t = float('inf'), None
    for i in range(steps + 1):
        t = t0 + timedelta(seconds=i * coarse_s)
        a, b = _state_eci_km(sat_a, t), _state_eci_km(sat_b, t)
        if not a or not b:
            continue
        d = math.dist(a[0], b[0])
        if d < best_d:
            best_d, best_t = d, t
    if best_t is None:
        return None
    # Refine around the coarse minimum.
    lo, hi = best_t - timedelta(seconds=coarse_s), best_t + timedelta(seconds=coarse_s)
    for _ in range(12):
        m1 = lo + (hi - lo) / 3
        m2 = hi - (hi - lo) / 3
        a1, b1 = _state_eci_km(sat_a, m1), _state_eci_km(sat_b, m1)
        a2, b2 = _state_eci_km(sat_a, m2), _state_eci_km(sat_b, m2)
        if not (a1 and b1 and a2 and b2):
            break
        if math.dist(a1[0], b1[0]) < math.dist(a2[0], b2[0]):
            hi = m2
        else:
            lo = m1
    t_ca = lo + (hi - lo) / 2
    a, b = _state_eci_km(sat_a, t_ca), _state_eci_km(sat_b, t_ca)
    if a and b:
        d = math.dist(a[0], b[0])
        if d < best_d:
            best_d, best_t = d, t_ca
    mid = None
    if a and b:
        mid = [(x + y) / 2 for x, y in zip(a[0], b[0])]
    return {'t_ca': best_t, 'distance_km': best_d, 'position_km': mid}


def scan_conjunctions(satellites: list[dict], t0: datetime, hours: float = 6.0,
                      threshold_km: float = 50.0, coarse_minutes: float = 5.0,
                      top_n: int = 5) -> dict:
    """Cross-reference the catalog for close approaches.

    Returns events below `threshold_km` (risk=True) plus the top nominal
    approaches (risk=False) so the HUD can always show a traffic picture.
    """
    sats = []
    for entry in satellites:
        try:
            sats.append((entry, tle_to_satrec(entry['line1'], entry['line2'])))
        except ValueError:
            continue
    events = []
    coarse_s = coarse_minutes * 60
    for i in range(len(sats)):
        for j in range(i + 1, len(sats)):
            (ea, sa), (eb, sb) = sats[i], sats[j]
            # Cheap pre-filter: skip pairs whose current separation dwarfs the window.
            pa, pb = _state_eci_km(sa, t0), _state_eci_km(sb, t0)
            if not pa or not pb:
                continue
            if math.dist(pa[0], pb[0]) > threshold_km * 40 + 3000:
                continue
            r = _pair_closest_approach(sa, sb, t0, hours, coarse_s)
            if r:
                r.update(a=ea['id'], a_name=ea['name'],
                         b=eb['id'], b_name=eb['name'],
                         risk=r['distance_km'] < threshold_km)
                events.append(r)
    events.sort(key=lambda e: e['distance_km'])
    # Separations below ~1 km are physically impossible for independent
    # vehicles: they are docked modules or duplicate catalog entries
    # (e.g. ISS ZARYA vs POISK). Tag them, never raise them as risks.
    def _fmt(e):
        return {
            'a': e['a'], 'a_name': e['a_name'],
            'b': e['b'], 'b_name': e['b_name'],
            't_ca_utc': e['t_ca'].isoformat(),
            'distance_km': round(e['distance_km'], 2),
            'risk': e['risk'] and e['distance_km'] >= 1.0,
            'co_orbital': e['distance_km'] < 1.0,
        }
    def _is_risk(e):
        return e['risk'] and e['distance_km'] >= 1.0
    risks = [e for e in events if _is_risk(e)]
    watch = [e for e in events if not _is_risk(e) and e['distance_km'] >= 1.0][:top_n]
    return {
        'window_hours': hours,
        'threshold_km': threshold_km,
        'scanned_pairs': len(sats) * (len(sats) - 1) // 2,
        'generated_at': t0.isoformat(),
        'events': [_fmt(e) for e in (risks + watch)],
    }


# ------------------------------------------------------- 3. Space weather

class SpaceWeather:
    """Kp + 10.7 cm flux with TTL cache; synthetic quiet-day fallback."""

    KP_URL = 'https://services.swpc.noaa.gov/products/planetary-k-index.json'
    FLUX_URL = 'https://services.swpc.noaa.gov/json/f107/julian_date_cumulated_flux.json'
    TTL_S = 600

    def __init__(self, timeout: float = 6.0):
        self.timeout = timeout
        self._cache: dict | None = None
        self._fetched_at = 0.0

    @staticmethod
    def _condition(kp: float) -> str:
        if kp < 2: return 'QUIET'
        if kp < 4: return 'UNSETTLED'
        if kp < 5: return 'ACTIVE'
        if kp < 7: return 'STORM G1-G2'
        return 'SEVERE STORM G3+'

    @staticmethod
    def _synthetic_kp(now: datetime) -> float:
        """Deterministic pseudo-weather: slow sine + stable per-minute jitter."""
        phase = now.timestamp() / 86400.0 * 2 * math.pi
        base = 2.6 + 1.9 * math.sin(phase) + 0.7 * math.sin(phase * 7.3)
        jitter = random.Random(int(now.timestamp() // 3600)).uniform(-0.4, 0.9)
        return max(0.0, min(9.0, round(base + jitter, 1)))

    def get(self, now: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        if self._cache and time.monotonic() - self._fetched_at < self.TTL_S:
            return dict(self._cache, cached=True)
        kp = flux = None
        source = 'synthetic'
        try:
            with httpx.Client(timeout=self.timeout) as client:
                r = client.get(self.KP_URL)
                r.raise_for_status()
                rows = [row for row in r.json()[1:] if len(row) > 4]
                if rows:
                    kp = float(rows[-1][3])
                try:
                    f = client.get(self.FLUX_URL)
                    f.raise_for_status()
                    fr = f.json()
                    if fr:
                        flux = float(fr[-1].get('flux') or 150.0)
                except Exception:
                    flux = None
            if kp is not None:
                source = 'noaa-swpc'
        except Exception:
            pass
        if kp is None:
            kp = self._synthetic_kp(now)
        if flux is None:
            flux = round(140 + kp * 9 + 12 * math.sin(now.timetuple().tm_yday / 30), 1)
        payload = {
            'kp_index': round(kp, 1),
            'flux_107cm': flux,
            'condition': self._condition(kp),
            'storm': kp >= 5,
            # Exponential atmospheric-density multiplier vs Kp=2 baseline
            # (simple engineering model used for the drag visualization).
            'density_multiplier': round(1.0 + 0.16 * max(0.0, kp - 2) ** 1.75, 2),
            'source': source,
            'updated_at': now.isoformat(),
        }
        self._cache = payload
        self._fetched_at = time.monotonic()
        return dict(payload, cached=False)


# ------------------------------------------------------ 4. Pass prediction

def ground_track(sat, t0: datetime, past_minutes: float = 45.0,
                 future_minutes: float = 90.0, step_s: float = 30.0) -> list[list[dict]]:
    """Propagated sub-satellite path as antimeridian-safe segments.

    A new segment starts wherever consecutive longitudes jump by more than
    180 degrees, so no renderer ever draws a straight line across the globe
    at the date line. Points carry signed offsets from t0: negative = past.
    """
    start = t0 - timedelta(minutes=past_minutes)
    steps = int((past_minutes + future_minutes) * 60 // step_s)
    segments: list[list[dict]] = []
    prev_lon = None
    for i in range(steps + 1):
        t = start + timedelta(seconds=i * step_s)
        st = _state_eci_km(sat, t)
        if st is None:
            continue
        lat, lon, alt = _geodetic(st[0], t)
        point = {'lat': round(lat, 4), 'lon': round(lon, 4),
                 'alt_km': round(alt, 1),
                 'offset_s': round((t - t0).total_seconds(), 1)}
        if prev_lon is None or abs(lon - prev_lon) > 180.0:
            segments.append([point])
        else:
            segments[-1].append(point)
        prev_lon = lon
    return [seg for seg in segments if len(seg) >= 2]


def predict_passes(sat, obs_lat: float, obs_lon: float, t0: datetime,
                   hours: float = 24.0, min_elevation_deg: float = 10.0,
                   step_s: float = 30.0) -> list[dict]:
    """Upcoming visibility windows for a ground observer (spherical Earth).

    Walks the sky in `step_s` increments, tracking elevation sign changes;
    each AOS->LOS segment reports rise/set times, max elevation, and the
    azimuth (clockwise from north) at maximum.
    """
    up = _ecef_unit(obs_lat, obs_lon)
    # Local ENU basis at the observer.
    east = (-up[1], up[0], 0.0)
    e_norm = math.hypot(*east)
    east = tuple(c / e_norm for c in east)
    north = (up[1] * east[2] - up[2] * east[1],
             up[2] * east[0] - up[0] * east[2],
             up[0] * east[1] - up[1] * east[0])
    obs_r = tuple(EARTH_RADIUS_KM * c for c in up)

    def look(t: datetime):
        st = _state_eci_km(sat, t)
        if st is None:
            return None
        lat, lon, alt = _geodetic(st[0], t)
        r = (EARTH_RADIUS_KM + alt)
        rng = _ecef_unit(lat, lon)
        rng = tuple(c * r for c in rng)
        dx, dy, dz = (rng[0] - obs_r[0], rng[1] - obs_r[1], rng[2] - obs_r[2])
        e = dx * east[0] + dy * east[1] + dz * east[2]
        n = dx * north[0] + dy * north[1] + dz * north[2]
        u = dx * up[0] + dy * up[1] + dz * up[2]
        h = math.hypot(e, n)
        el = math.degrees(math.atan2(u, h))
        az = (math.degrees(math.atan2(e, n)) + 360) % 360
        return el, az

    passes = []
    current = None
    steps = int(hours * 3600 // step_s)
    for i in range(steps + 1):
        t = t0 + timedelta(seconds=i * step_s)
        obs = look(t)
        if obs is None:
            continue
        el, az = obs
        above = el >= min_elevation_deg
        if above and current is None:
            current = {'aos': t, 'max_el': el, 'max_az': az, 'max_t': t}
        elif above:
            if el > current['max_el']:
                current.update(max_el=el, max_az=az, max_t=t)
            current['los'] = t
        elif current is not None:
            if 'los' in current:
                passes.append(_format_pass(current, sat, t0))
            current = None
    if current is not None and 'los' in current:
        passes.append(_format_pass(current, sat, t0))
    return passes[:20]


def _format_pass(p: dict, sat, t0: datetime) -> dict:
    duration = (p['los'] - p['aos']).total_seconds()
    return {
        'rise_utc': p['aos'].isoformat(),
        'max_utc': p['max_t'].isoformat(),
        'set_utc': p['los'].isoformat(),
        'max_elevation_deg': round(p['max_el'], 1),
        'azimuth_at_max_deg': round(p['max_az'], 1),
        'duration_s': round(duration),
        'visible_deg': round(p['max_el'] - 10, 1),
    }
