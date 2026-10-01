"""
OrbitalPulse — TLE catalog service.

Fetches live Two-Line Element sets from CelesTrak (with a TTL cache) and
falls back to an embedded, column-correct synthetic element set when the
network is unavailable, so the app is always runnable offline.
"""

from __future__ import annotations

import re
import threading
import time
from datetime import datetime, timezone

import httpx

from propagation import inclination_deg, sat_epoch, tle_to_satrec

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle"

# OrbitalPulse display groups -> (CelesTrak group id, max entries, label)
GROUPS = {
    "stations": ("stations", 6, "Space Stations"),
    "science": ("science", 8, "Science"),
    "navigation": ("gps-ops", 10, "Navigation"),
    "starlink": ("starlink", 24, "Starlink"),
}

_TLE_NAME = re.compile(r"^\S.*$")


def _build_line1(norad: int, klass: str, intl_design: str, epoch_yy: int,
                 epoch_doy: float, ndot: str, bstar: str, set_no: int) -> str:
    """Assemble a column-correct TLE line 1 (fields per standard column map)."""
    # Day-of-year must stay right-aligned in a zero-padded 12-char field so
    # single-digit early-January doy values do not shrink the 14-char epoch.
    epoch = f"{epoch_yy % 100:02d}{epoch_doy:012.8f}"
    assert len(epoch) == 14, f"epoch field must be 14 chars, got {epoch!r}"
    return (
        "1 "
        f"{norad:05d}"
        f"{klass:1s}"
        " "
        f"{intl_design:<8.8s}"
        " "
        f"{epoch:>14.14s}"
        " "
        f"{ndot:>10.10s}"
        " "
        f"{' 00000-0':>8.8s}"
        " "
        f"{bstar:>8.8s}"
        " "
        "0"
        f" {set_no:4d}"
    )


def _build_line2(norad: int, inc: float, raan: float, ecc: float, argp: float,
                 ma: float, motion: float, rev: int) -> str:
    ecc_s = f"{ecc:.7f}"
    assert ecc_s.startswith("0."), f"ecc must be in [0,1): {ecc!r}"
    ecc_str = ecc_s[2:]  # "0.0001400" -> "0001400" (TLE drops the "0.")
    assert len(ecc_str) == 7, f"ecc field must be 7 chars, got {ecc_str!r}"
    return (
        f"2 {norad:05d}"
        f" {inc:8.4f}"
        f" {raan:8.4f}"
        f" {ecc_str}"
        f" {argp:8.4f}"
        f" {ma:8.4f}"
        f" {motion:11.8f}"
        f"{rev:5d}"
    )


def _fallback_entries() -> list[dict]:
    """Synthetic-but-plausible element sets covering every display group.

    Orbits are realistic (ISS, Hubble, Tiangong, GPS IIF, Starlink shells);
    epochs are rewritten to "now" at load time so SGP4 extrapolation never
    runs years past epoch. These exist purely so the app works with no
    internet — CelesTrak refresh replaces them with live data.
    """
    now = datetime.now(timezone.utc)
    yy = now.year % 100
    doy = now.timetuple().tm_yday + now.hour / 24 + now.minute / 1440 + now.second / 86400
    specs = [
        # (id, name, group, intl, inc, raan, ecc, argp, ma, motion/day, ndot, bstar)
        (25544, "ISS (ZARYA)", "stations", "98067A", 51.6416, 247.4627, 0.0001400, 87.7906, 235.3495, 15.72125391, "-.00002182", "-11606-4"),
        (49254, "CSS (TIANHE)", "stations", "21086A", 51.4300, 40.1000, 0.0003000, 100.0000, 260.0000, 15.60010000, ".00020000", " 20000-3"),
        (20580, "HST (HUBBLE)", "science", "90037B", 28.4700, 120.3000, 0.0002800, 49.0000, 311.0000, 15.09270000, ".00000300", " 15000-4"),
        (39778, "GOES-16", "science", "14056A", 0.0500, 90.0000, 0.0001000, 180.0000, 180.0000, 1.00270000, "-.00000050", " 10000-5"),
        (40128, "GPS BIIF-5", "navigation", "14050A", 55.0000, 20.0000, 0.0005100, 98.0000, 262.0000, 2.06243546, ".00000000", " 00000-0"),
        (41017, "GPS BIIF-7", "navigation", "15062A", 55.0000, 140.0000, 0.0004800, 44.0000, 316.0000, 2.06244028, ".00000000", " 00000-0"),
        (42968, "GPS BIII-1", "navigation", "17043A", 55.0000, 260.0000, 0.0005200, 300.0000, 60.0000, 2.06247750, ".00000000", " 00000-0"),
        (42017, "STARLINK-1113", "starlink", "17031A", 53.0200, 320.0000, 0.0001400, 190.0000, 170.0000, 15.06400000, ".00010000", " 10000-3"),
        (44231, "STARLINK-2537", "starlink", "19039A", 53.0500, 62.0000, 0.0001200, 25.0000, 335.0000, 15.07000000, ".00009000", " 90000-4"),
        (45971, "STARLINK-3288", "starlink", "20062A", 53.0000, 190.0000, 0.0001500, 300.0000, 60.0000, 15.06500000, ".00008500", " 85000-4"),
        (48511, "STARLINK-4385", "starlink", "21024A", 51.6000, 130.0000, 0.0001300, 77.0000, 283.0000, 15.31000000, ".00012000", " 12000-3"),
        (52340, "STARLINK-5196", "starlink", "22046A", 43.0000, 210.0000, 0.0001100, 15.0000, 345.0000, 15.45000000, ".00013000", " 13000-3"),
    ]
    entries = []
    for (norad, name, group, intl, inc, raan, ecc, argp, ma, motion, ndot, bstar) in specs:
        l1 = _build_line1(norad, "U", intl, yy, doy, ndot, bstar, 1)
        l2 = _build_line2(norad, inc, raan, ecc, argp, ma, motion, 999)
        entries.append({"norad_id": norad, "name": name, "group": group,
                        "line1": l1, "line2": l2})
    return entries


def parse_tle_file(text: str, group: str, max_count: int) -> list[dict]:
    """Parse CelesTrak TLE text (name line, line1, line2) into entries."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    entries = []
    i = 0
    while i + 2 < len(lines):
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if l1.startswith("1 "):
            m = re.match(r"^\s*1\s*(\d{5})", l1)
            if m:
                entries.append({"norad_id": int(m.group(1)), "name": name.strip(),
                                "group": group, "line1": l1, "line2": l2})
            i += 3
            if len(entries) >= max_count:
                break
        else:
            i += 1
    return entries


class TleCatalog:
    """Cached satellite catalog with live refresh and offline fallback."""

    def __init__(self, ttl_seconds: int = 6 * 3600, fetch_timeout: float = 8.0):
        self.ttl = ttl_seconds
        self.timeout = fetch_timeout
        self._lock = threading.Lock()
        self._entries: list[dict] = []
        self._source = "fallback"
        self._updated_at: datetime | None = None
        self._last_attempt = 0.0

    # -- public ------------------------------------------------------------
    def get(self, force_refresh: bool = False) -> dict:
        with self._lock:
            stale = (time.monotonic() - self._last_attempt) > self.ttl
            if force_refresh or stale or not self._entries:
                self._refresh_locked()
            return {
                "source": self._source,
                "updated_at": self._updated_at.isoformat() if self._updated_at else None,
                "satellites": [dict(e) for e in self._entries],
            }

    def find(self, sat_id: str) -> dict | None:
        cat = self.get()
        for e in cat["satellites"]:
            if e["id"] == sat_id:
                return e
        return None

    # -- internals ----------------------------------------------------------
    def _refresh_locked(self) -> None:
        self._last_attempt = time.monotonic()
        collected: list[dict] = []
        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
                for group_key, (gp, max_count, _label) in GROUPS.items():
                    resp = client.get(CELESTRAK_URL.format(group=gp))
                    resp.raise_for_status()
                    collected.extend(parse_tle_file(resp.text, group_key, max_count))
            if not collected:
                raise RuntimeError("CelesTrak returned no parseable element sets")
            self._source = "celestrak"
        except Exception:
            # Offline / upstream failure -> keep the app alive with fallbacks.
            collected = _fallback_entries()
            self._source = "fallback"
        # Drop anything SGP4 refuses to parse, then assign UI ids.
        valid = []
        for e in collected:
            try:
                sat = tle_to_satrec(e["line1"], e["line2"])
            except ValueError:
                continue
            e = dict(e)
            e["id"] = f"norad-{e['norad_id']}"
            e["inclination_deg"] = inclination_deg(e["line2"])
            e["epoch"] = sat_epoch(sat).isoformat()
            valid.append(e)
        self._entries = valid
        self._updated_at = datetime.now(timezone.utc)
