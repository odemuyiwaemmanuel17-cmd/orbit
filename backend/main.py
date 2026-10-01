"""
OrbitalPulse — FastAPI orbital propagation service.

Endpoints
---------
GET /api/health                    liveness + catalog provenance
GET /api/satellites                tracked satellite catalog (TLEs included)
GET /api/satellites/positions      propagated state of the whole catalog at a
                                   timestamp (?timestamp=<ISO-8601>, default now)
GET /api/satellites/{id}/orbit     projected trajectory polyline (default 90 min)

Run:  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from catalog import GROUPS, TleCatalog
from propagation import (propagate_orbit_path, propagate_state,
                         sat_epoch, tle_to_satrec)

catalog = TleCatalog()

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
