"""
OrbitalPulse — FastAPI orbital propagation service.

Endpoints
---------
GET /api/health                    liveness + catalog provenance
GET /api/satellites                tracked satellite catalog (TLEs included)
GET /api/satellites/positions      propagated state of the whole catalog at a
                                   timestamp (?timestamp=<ISO-8601>, default now)
GET /api/satellites/{id}/orbit     projected trajectory polyline (default 90 min)
GET /api/satellites/{id}/footprint sub-satellite point + horizon footprint cone
GET /api/satellites/{id}/passes    flyover pass schedule for a ground observer
GET /api/conjunctions              catalog-wide close-approach screening
GET /api/space-weather             Kp index / F10.7 flux (NOAA SWPC or synthetic)

Run:  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from analysis import (SpaceWeather, footprint, predict_passes,
                      scan_conjunctions)
from catalog import GROUPS, TleCatalog
from propagation import (propagate_orbit_path, propagate_state,
                         sat_epoch, tle_to_satrec)

catalog = TleCatalog()
weather = SpaceWeather()

app = FastAPI(
    title="OrbitalPulse API",
    version="1.0.0",
    description="TLE ingestion + SGP4 orbital propagation for the OrbitalPulse 3D tracker.",
)

# The Vite dev server runs on another origin; the tracker is read-only, so a
# permissive CORS policy is appropriate for local/dev deployments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _parse_timestamp(raw: Optional[str]) -> datetime:
    """ISO-8601 -> aware UTC datetime. Naive inputs are treated as UTC."""
    if not raw:
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422,
                            detail=f"Invalid ISO-8601 timestamp: {raw!r}")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@app.get("/api/health")
def health():
    cat = catalog.get()
    return {
        "status": "ok",
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
        "catalog_source": cat["source"],
        "catalog_updated_at": cat["updated_at"],
        "satellite_count": len(cat["satellites"]),
    }


@app.get("/api/satellites")
def list_satellites(refresh: bool = Query(False, description="Force a CelesTrak re-fetch")):
    cat = catalog.get(force_refresh=refresh)
    groups = [{"key": k, "label": v[2]} for k, v in GROUPS.items()]
    return {
        "source": cat["source"],
        "updated_at": cat["updated_at"],
        "groups": groups,
        "satellites": [
            {
                "id": s["id"],
                "norad_id": s["norad_id"],
                "name": s["name"],
                "group": s["group"],
                "line1": s["line1"],
                "line2": s["line2"],
                "inclination_deg": s["inclination_deg"],
                "epoch": s["epoch"],
            }
            for s in cat["satellites"]
        ],
    }


@app.get("/api/satellites/positions")
def positions(timestamp: Optional[str] = Query(None)):
    """Propagated state of every catalog satellite at `timestamp` (UTC)."""
    when = _parse_timestamp(timestamp)
    cat = catalog.get()
    out, failed = [], []
    for s in cat["satellites"]:
        try:
            sat = tle_to_satrec(s["line1"], s["line2"])
            state = propagate_state(sat, when)
        except (ValueError, RuntimeError):
            failed.append(s["id"])
            continue
        state["id"] = s["id"]
        state["name"] = s["name"]
        out.append(state)
    return {
        "timestamp": when.isoformat(),
        "count": len(out),
        "positions": out,
        # Satellites whose element sets could not be propagated at this time.
        "skipped": failed,
    }


@app.get("/api/satellites/{sat_id}/orbit")
def orbit_path(sat_id: str,
               minutes: float = Query(90.0, ge=1.0, le=240.0),
               steps: int = Query(180, ge=2, le=720),
               timestamp: Optional[str] = Query(None)):
    """Trajectory polyline points for one satellite (inertial frame at t0)."""
    entry = catalog.find(sat_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown satellite id: {sat_id!r}")
    t0 = _parse_timestamp(timestamp)
    try:
        sat = tle_to_satrec(entry["line1"], entry["line2"])
    except ValueError:
        raise HTTPException(status_code=500, detail="Stored TLE failed to parse")
    points = propagate_orbit_path(sat, t0, minutes=minutes, steps=steps)
    if not points:
        raise HTTPException(status_code=422,
                            detail="SGP4 could not propagate this window "
                                   f"(epoch offset {(t0 - sat_epoch(sat)).total_seconds()/86400:+.1f} days)")
    return {
        "id": sat_id,
        "name": entry["name"],
        "timestamp": t0.isoformat(),
        "minutes": minutes,
        "steps_requested": steps,
        "steps_returned": len(points),
        "inclination_deg": entry["inclination_deg"],
        "points": points,
    }


def _satrec_for(sat_id: str):
    """Resolve a catalog id to (entry, Satrec) or raise the proper HTTP error."""
    entry = catalog.find(sat_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown satellite id: {sat_id!r}")
    try:
        return entry, tle_to_satrec(entry['line1'], entry['line2'])
    except ValueError:
        raise HTTPException(status_code=422, detail='Stored TLE failed to parse')


@app.get('/api/satellites/{sat_id}/footprint')
def satellite_footprint(sat_id: str, timestamp: Optional[str] = Query(None)):
    """Sub-satellite point + radio/optical horizon footprint cone."""
    _entry, sat = _satrec_for(sat_id)
    when = _parse_timestamp(timestamp)
    try:
        fp = footprint(sat, when)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {'id': sat_id, 'timestamp': when.isoformat(), **fp}


@app.get('/api/satellites/{sat_id}/passes')
def satellite_passes(sat_id: str,
                     lat: float = Query(..., ge=-90, le=90),
                     lon: float = Query(..., ge=-180, le=180),
                     hours: float = Query(24.0, ge=1, le=72),
                     min_elevation: float = Query(10.0, ge=0, le=60),
                     step: float = Query(30.0, ge=5, le=120),
                     timestamp: Optional[str] = Query(None)):
    """Upcoming flyover passes for a ground observer (rise, max elevation,
    azimuth at max, set) over the next `hours` hours."""
    entry, sat = _satrec_for(sat_id)
    t0 = _parse_timestamp(timestamp)
    passes = predict_passes(sat, lat, lon, t0, hours=hours,
                            min_elevation_deg=min_elevation, step_s=step)
    return {
        'id': sat_id, 'name': entry['name'],
        'observer': {'lat': lat, 'lon': lon},
        'window_start': t0.isoformat(),
        'window_hours': hours,
        'min_elevation_deg': min_elevation,
        'passes': passes,
    }


@app.get('/api/conjunctions')
def conjunctions(hours: float = Query(6.0, ge=1, le=48),
                 threshold_km: float = Query(50.0, ge=1, le=1000),
                 coarse_minutes: float = Query(5.0, ge=1, le=30),
                 timestamp: Optional[str] = Query(None)):
    """Catalog-wide close-approach screening: risk events (< threshold) plus
    the nearest nominal approaches for traffic context."""
    t0 = _parse_timestamp(timestamp)
    result = scan_conjunctions(catalog.get()['satellites'], t0,
                               hours=hours, threshold_km=threshold_km,
                               coarse_minutes=coarse_minutes)
    return result


@app.get('/api/space-weather')
def space_weather():
    """Kp index + 10.7 cm solar flux driving atmospheric drag.

    Live NOAA SWPC feed when reachable; deterministic synthetic fallback
    otherwise, so the HUD widget never goes dark.
    """
    return weather.get()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
