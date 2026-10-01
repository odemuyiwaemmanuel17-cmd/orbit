"""
OrbitalPulse — SGP4 propagation core.

Deterministic, dependency-light orbital mechanics built on the pure-Python
`sgp4` reference implementation. This module does no I/O so it can be unit
tested offline.

Coordinate notes
----------------
* `Satrec.propagate` returns position/velocity in the TEME (True Equator,
  Mean Equinox) frame, which is what CelesTrak TLEs are fitted in.
* Geodetic latitude/longitude are obtained by rotating TEME -> PEF using
  Greenwich Mean Sidereal Time with a spherical-Earth approximation. This
  is accurate enough for visualisation and HUD telemetry (sub-arcminute
  error dominated by the spherical approximation, not the frame choice).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from sgp4.api import Satrec, WGS72, jday

EARTH_RADIUS_KM = 6371.0


def tle_to_satrec(line1: str, line2: str) -> Satrec:
    """Parse a Two-Line Element set into an SGP4 satellite record.

    Uses WGS72 gravitics, which is the constant model SGP4 TLEs are generated
    with. Raises ValueError for syntactically invalid element sets.
    """
    return Satrec.twoline2rv(line1.rstrip(), line2.rstrip(), WGS72)


def propagate_jd(sat: Satrec, jd: float, fr: float) -> tuple[int, tuple, tuple]:
    """Run SGP4 at a Julian Date, tolerant of sgp4 API generations.

    sgp4 <= 2.22 exposes Satrec.propagate(); the current C-extension build
    exposes Satrec.sgp4(). Both return (error_code, position_km, velocity_km_s).
    """
    if hasattr(sat, "propagate"):
        return sat.propagate(jd, fr)
    return sat.sgp4(jd, fr)


def gmst_deg(jd_utc: float, frac_day: float) -> float:
    """Greenwich Mean Sidereal Time (IAU 1982 expression) in degrees."""
    theta_0 = 280.46061837
    rate = 360.98564736629
    d = (jd_utc + frac_day) - 2451545.0
    t = d / 36525.0
    gmst = theta_0 + rate * d + 0.000387933 * t * t - t * t * t / 38710000.0
    return gmst % 360.0


def teme_to_geodetic(pos_km: tuple[float, float, float], jd_utc: float,
                     frac_day: float) -> tuple[float, float, float]:
    """Rotate a TEME position vector to (lat_deg, lon_deg, alt_km).

    Spherical-Earth approximation of the PEF conversion.
    """
    x, y, z = pos_km
    theta = math.radians(gmst_deg(jd_utc, frac_day))
    # ECEF = Rz(-theta) * ECI
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    x_e = x * cos_t + y * sin_t
    y_e = -x * sin_t + y * cos_t
    p = math.hypot(x_e, y_e)
    lon = math.degrees(math.atan2(y_e, x_e))
    lat = math.degrees(math.atan2(z, p))
    alt = math.hypot(x_e, y_e, z) - EARTH_RADIUS_KM
    return lat, lon, alt


def teme_to_eci(pos_km, vel_km_s, jd_utc: float, frac_day: float) -> tuple[list, list]:
    """Rotate TEME -> ECI (inertial frame at the given epoch) for drawing.

    Applies the equation-of-equinoxes-free GMST rotation about Z. Used only
    for scene geometry; magnitudes are frame-independent.
    """
    theta = math.radians(gmst_deg(jd_utc, frac_day))
    cos_t, sin_t = math.cos(theta), math.sin(theta)

    def rot(v):
        return [v[0] * cos_t - v[1] * sin_t, v[0] * sin_t + v[1] * cos_t, v[2]]

    return rot(pos_km), rot(vel_km_s)


def propagate_state(sat: Satrec, when: datetime) -> dict:
    """Full observable state of a satellite at `when` (UTC)."""
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    jd, fr = jday(when.year, when.month, when.day,
                  when.hour, when.minute, when.second + when.microsecond * 1e-6)
    e, pos, vel = propagate_jd(sat, jd, fr)
    if e != 0:
        raise RuntimeError(f"SGP4 propagation error {e} at epoch offset "
                           f"{(when - sat_epoch(sat)).total_seconds() / 86400.0:.1f} days")
    speed = math.sqrt(vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2)
    lat, lon, alt = teme_to_geodetic(pos, jd, fr)
    eci_pos, eci_vel = teme_to_eci(pos, vel, jd, fr)
    return {
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "altitude_km": round(alt, 3),
        "velocity_km_s": round(speed, 4),
        "eci_km": [round(c, 3) for c in eci_pos],
        "eci_velocity_km_s": [round(c, 4) for c in eci_vel],
    }


def propagate_orbit_path(sat: Satrec, t0: datetime, minutes: float = 90.0,
                         steps: int = 180) -> list[dict]:
    """Project the trajectory polyline over `minutes` ahead of `t0`.

    Returns `steps` points sampling [t0, t0 + minutes], each with the inertial
    position at that instant (all relative to the same visualisation epoch so
    the ring stays a closed geometric loop on screen).
    """
    if steps < 2:
        raise ValueError("steps must be >= 2")
    minutes = max(1.0, min(float(minutes), 240.0))  # bounded to protect the API
    dt = timedelta(minutes=minutes / (steps - 1))
    jd0, fr0 = jday(t0.year, t0.month, t0.day, t0.hour, t0.minute,
                   t0.second + t0.microsecond * 1e-6)
    points = []
    t = t0
    for _ in range(steps):
        jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute,
                      t.second + t.microsecond * 1e-6)
        e, pos, _vel = propagate_jd(sat, jd, fr)
        if e != 0:
            break
        lat, lon, alt = teme_to_geodetic(pos, jd, fr)
        # Rotate every point into the inertial frame at t0 so the polyline is
        # stable in the scene graph instead of smearing with Earth rotation.
        theta = math.radians(gmst_deg(jd0, fr0))
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        x, y, z = pos
        points.append({
            "eci_km": [round(x * cos_t - y * sin_t, 3),
                       round(x * sin_t + y * cos_t, 3),
                       round(z, 3)],
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "altitude_km": round(alt, 3),
            "time_offset_s": round((t - t0).total_seconds(), 3),
        })
        t += dt
    return points


def sat_epoch(sat: Satrec) -> datetime:
    """Epoch datetime (UTC) encoded in the satellite record."""
    import calendar
    jd = sat.jdsatepoch + sat.jdsatepochF
    # Convert Julian Date -> unix timestamp via the standard JD 2440587.5 epoch.
    ts = (jd - 2440587.5) * 86400.0
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def inclination_deg(line2: str) -> float:
    """Inclination from column 9..16 of a TLE line 2."""
    return float(line2[8:16].strip())
