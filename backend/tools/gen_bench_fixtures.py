"""Generate SYNTHETIC large-constellation performance fixtures.

These files exist ONLY as inputs to frontend/tools/constellation-check.mjs so
the propagation budget can be proven at Starlink-catalog scale before the
real bundle is regenerated from CelesTrak. They are never imported by the
app (frontend loads src/data/constellations/*.json, not tools/fixtures).

Orbits are real Starlink shell parameters (550 km, 53 deg, 95.6 min period);
satellite numbers/NORAD ids are fake and marked `synthetic`.
"""
import json
import math
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "frontend" / "tools" / "fixtures"
import sys
sys.path.insert(0, str(ROOT / "backend"))
from catalog import _build_line1, _build_line2  # column-correct TLE builders

MU = 398600.4418
RE = 6371.0


def make(n: int, alt_km: float, inc: float) -> dict:
    now = datetime.now(timezone.utc)
    yy = now.year % 100
    doy = (now.timetuple().tm_yday + now.hour / 24 + now.minute / 1440
           + now.second / 86400)
    a = RE + alt_km
    motion = 86400 / (2 * math.pi) * math.sqrt(MU / a**3)  # rev/day
    sats = []
    planes = max(1, round(math.sqrt(n)))
    per = math.ceil(n / planes)
    for k in range(n):
        plane, slot = divmod(k, per)
        norad = 900_000 + k  # reserved synthetic range
        l1 = _build_line1(norad, "U", f"22ZZZ{plane:03d}", yy, doy,
                          ".00010000", " 10000-3", 1)
        l2 = _build_line2(norad, inc, (360 / planes) * plane, 0.00014,
                          0.0, (360 / per) * slot, motion, 1000)
        sats.append({
            "id": f"norad-{norad}", "norad_id": norad,
            "name": f"SYNTH-BENCH {k + 1}", "slot": "bench",
            "description": "SYNTHETIC performance fixture - not app data",
            "launched": 2022, "regime": "LEO",
            "line1": l1, "line2": l2,
            "inclination_deg": round(inc, 2),
            "raan_deg": round((360 / planes) * plane, 1),
            "eccentricity": 0.0001, "period_min": round(1440 / motion, 1),
            "sma_km": round(a), "altitude_km": round(alt_km),
            "apogee_km": round(a * 1.0001 - RE),
        })
    return {"key": f"bench-{n}", "label": f"Synthetic bench {n}",
            "source": "SYNTHETIC-BENCH-FIXTURE",
            "fetched_at": now.isoformat(),
            "note": "Performance fixture for constellation-check.mjs only",
            "satellites": sats}


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for n in (2000, 6000):
        out = OUT_DIR / f"bench-{n}.json"
        out.write_text(json.dumps(make(n, 550.0, 53.0), indent=1), encoding="utf-8")
        print(f"wrote {out} ({n} synthetic sats)")
