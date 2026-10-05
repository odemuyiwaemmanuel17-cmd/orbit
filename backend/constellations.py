"""
OrbitalPulse — constellation service.

Mirrors the frontend constellation layers on the server using the SAME TLE
provider machinery as the base catalog (CelesTrak GP feeds + parse_tle_file +
SGP4 parse validation). Live fetch first; if the network refuses, fall back
to the bundled seed files the frontend ships with, labelling the source so
nothing is ever presented as fresher than it is.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from catalog import CELESTRAK_URL, parse_tle_file
from propagation import inclination_deg, sat_epoch, tle_to_satrec

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_DIR = ROOT / "frontend" / "src" / "data" / "constellations"

# key -> (label, [(celesstrak group, take)], total cap). Kept in sync with
# backend/tools/fetch_constellations.py, which generates the bundle files.
CONSTELLATIONS = {
    "test": ("Validation Set", [("iridium-next", 5), ("geo", 3)], 8),
    "gps": ("GPS", [("gps-ops", 31)], 31),
    "weather": ("NOAA / Weather", [("weather", 40)], 40),
    "starlink": ("Starlink", [("starlink", 5000)], 120),
}


def _decorate(e: dict, key: str) -> dict | None:
    """Validate with SGP4 and add UI fields; None when unparseable."""
    try:
        sat = tle_to_satrec(e["line1"], e["line2"])
    except ValueError:
        return None
    out = dict(e)
    out["id"] = f"norad-{e['norad_id']}"
    out["group"] = key
    out["inclination_deg"] = inclination_deg(e["line2"])
    out["epoch"] = sat_epoch(sat).isoformat()
    return out


def _from_bundle(key: str) -> list[dict]:
    path = BUNDLE_DIR / f"{key}.json"
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [dict(s) for s in payload["satellites"]]


class ConstellationCatalog:
    def __init__(self, ttl_seconds: int = 6 * 3600, fetch_timeout: float = 10.0):
        self.ttl = ttl_seconds
        self.timeout = fetch_timeout
        self._lock = threading.Lock()
        self._cache: dict[str, dict] = {}

    def summary(self) -> list[dict]:
        with self._lock:
            return [{
                "key": key,
                "label": label,
                "cap": cap,
                "count": len(self._cache.get(key, {}).get("satellites", [])),
                "source": self._cache.get(key, {}).get("source"),
                "updated_at": self._cache.get(key, {}).get("updated_at"),
            } for key, (label, _sources, cap) in CONSTELLATIONS.items()]

    def get(self, key: str, force_refresh: bool = False) -> dict:
        if key not in CONSTELLATIONS:
            return {"error": "unknown_constellation", "key": key}
        label, sources, cap = CONSTELLATIONS[key]
        with self._lock:
            entry = self._cache.get(key)
            fresh = entry and (time.monotonic() - entry["at"]) < self.ttl
            if fresh and not force_refresh:
                return dict(entry)
            collected, source = [], None
            try:
                with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
                    for gp, take in sources:
                        resp = client.get(CELESTRAK_URL.format(group=gp))
                        resp.raise_for_status()
                        collected.extend(parse_tle_file(resp.text, key, take))
                        if len(collected) >= cap:
                            break
                if not collected:
                    raise RuntimeError("CelesTrak returned no parseable element sets")
                source = "celestrak"
            except Exception:
                collected = _from_bundle(key)
                source = "bundle" if collected else "unavailable"
            satellites = []
            seen: set[int] = set()
            for e in collected[:cap]:
                if e["norad_id"] in seen:
                    continue
                seen.add(e["norad_id"])
                d = _decorate(e, key)
                if d:
                    satellites.append(d)
            entry = {"key": key, "label": label, "cap": cap, "source": source,
                     "updated_at": datetime.now(timezone.utc).isoformat(),
                     "at": time.monotonic(), "satellites": satellites}
            self._cache[key] = entry
            return dict(entry)
