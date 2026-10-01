"""Fetch curated demo TLEs from CelesTrak and emit frontend/src/data/satellites.json.

Fixed-id slots resolve by NORAD catalog number; constellation slots pull the
first suitable object from a CelesTrak group feed (gps-ops, galileo,
starlink, weather). Regime is derived from orbit size.
"""
import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "src" / "data" / "satellites.json"

GROUP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=tle"

FIXED = [
    ("iss",        [25544], None),
    ("hubble",     [20580], None),
    ("sentinel2a", [40697], None),
    ("landsat9",   [49260], None),
    ("noaa20",     [43013], None),
    ("terra",      [25994], None),
    ("aqua",       [27424], None),
    ("goes",       [41866], "GEO"),
]
# (slot, group, regime filter, description, launched)
GROUPED = [
    ("starlink",  "starlink", "LEO", "Broadband constellation · SpaceX", 2020),
    ("gps",       "gps-ops",  "MEO", "Navigation · USSF GPS", 2014),
    ("gps2",      "gps-ops",  "MEO", "Navigation · USSF GPS", 2016),
    ("galileo",   "galileo",  "MEO", "Navigation · EUSPA Galileo", 2017),
    ("himawari",  "weather",  "GEO", "Weather GEO · JMA", 2014),
    ("meteosat",  "weather",  "GEO", "Weather GEO · EUMETSAT", 2015),
]

MU = 398600.4418


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "orbitalpulse-demo/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def parse_blocks(text: str):
    lines = [ln for ln in text.splitlines() if ln.strip()]
    out = []
    i = 0
    while i + 2 < len(lines) or i + 2 == len(lines) - 1:
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            m = re.match(r"^\s*1\s*(\d{5})", l1)
            if m:
                out.append((int(m.group(1)), name.strip(), l1, l2))
            i += 3
        else:
            i += 1
    return out


def elements(l2: str):
    inc = float(l2[8:16])
    raan = float(l2[17:25])
    ecc = float("0." + l2[26:33])
    motion = float(l2[52:63])
    period = 1440.0 / motion
    a = (MU / ((motion * 2 * math.pi / 86400) ** 2)) ** (1 / 3)
    apo = a * (1 + ecc) - 6371.0
    return inc, raan, ecc, period, a, apo


def regime(apo_km: float) -> str:
    if apo_km > 30000:
        return "GEO"
    if apo_km > 2000:
        return "MEO"
    return "LEO"


def make_entry(slot, norad, name, l1, l2, desc, launched):
    inc, raan, ecc, period, a, apo = elements(l2)
    reg = regime(apo)
    alt = round(a - 6371.0)
    return {
        "id": f"norad-{norad}",
        "norad_id": norad,
        "name": name,
        "slot": slot,
        "description": desc,
        "launched": launched,
        "regime": reg,
        "line1": l1,
        "line2": l2,
        "inclination_deg": round(inc, 2),
        "raan_deg": round(raan, 1),
        "eccentricity": round(ecc, 4),
        "period_min": round(period, 1),
        "sma_km": round(a),
        "altitude_km": alt,
        "apogee_km": round(apo),
    }


def main():
    entries = []
    used = set()
    for slot, ids, want in FIXED:
        for norad in ids:
            try:
                blocks = parse_blocks(get(
                    f"https://celestrak.org/NORAD/elements/gp.php?CATNR={norad}&FORMAT=tle"))
            except Exception as exc:
                print(f"  ! {norad}: {exc}")
                blocks = []
            if blocks:
                n, name, l1, l2 = blocks[0]
                e = make_entry(slot, n, name, l1, l2,
                               default_desc(slot, name), default_year(slot))
                if want and e["regime"] != want:
                    print(f"  ! {slot}: got {e['regime']}, want {want}")
                    continue
                entries.append(e)
                used.add(n)
                print(f"ok {slot:11s} {n} {name[:26]:26s} {e['regime']}")
                break
        else:
            print(f"slot {slot}: NO TLE")

    for slot, group, want, desc, year in GROUPED:
        try:
            blocks = parse_blocks(get(GROUP_URL.format(group=group)))
        except Exception as exc:
            print(f"  ! group {group}: {exc}")
            continue
        for n, name, l1, l2 in blocks:
            if n in used:
                continue
            e = make_entry(slot, n, name, l1, l2, desc, year)
            if e["regime"] != want:
                continue
            entries.append(e)
            used.add(n)
            print(f"ok {slot:11s} {n} {name[:26]:26s} {e['regime']}")
            break
        else:
            print(f"slot {slot}: no suitable object in {group}")

    if len(entries) < 13:
        print(f"only {len(entries)} entries — aborting", file=sys.stderr)
        sys.exit(1)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "Curated demo catalog fetched from CelesTrak by backend/tools/fetch_demo_catalog.py",
        "satellites": entries,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(entries)} satellites)")


DESCS = {
    "iss": ("Crewed space station · NASA / Roscosmos", 1998),
    "hubble": ("Space telescope · NASA / ESA", 1990),
    "sentinel2a": ("Earth observation · ESA Copernicus", 2015),
    "landsat9": ("Earth observation · NASA / USGS", 2021),
    "noaa20": ("Polar weather satellite · NOAA", 2017),
    "terra": ("Earth observation · NASA EOS AM-1", 1999),
    "aqua": ("Earth observation · NASA EOS PM-1", 2002),
    "goes": ("Weather GEO · NOAA GOES", 2016),
}


def default_desc(slot, name):
    return DESCS.get(slot, (f"Tracked object · {name}", 2000))[0]


def default_year(slot):
    return DESCS.get(slot, (None, 2000))[1]


if __name__ == "__main__":
    main()
