# OrbitalPulse

Interactive orbital mechanics & satellite tracking — a **3D scrollytelling
website** where a fixed WebGL space scene (React Three Fiber) flies the camera
through scroll keyframes while a live SGP4 tracker, telemetry HUD, and
marketing sections scroll over it. Satellite positions are propagated **in the
browser** with `satellite.js` from a curated 14-object CelesTrak demo catalog;
the FastAPI + `sgp4` backend remains available for live catalog, positions, and
90-minute orbit-polyline APIs.

![stack](https://img.shields.io/badge/React%2018-R3F%208-blue) ![api](https://img.shields.io/badge/FastAPI-SGP4-cyan)

## Architecture

```
┌──────────────────────────────────┐      /api proxy (Vite)     ┌──────────────────────┐
│ 3D scrollytelling frontend       │ ──────────────────────────▶│  FastAPI backend     │
│ fixed R3F scene · scroll camera  │                            │  CelesTrak TLE fetch │
│ in-browser SGP4 (satellite.js)   │  ◀── catalog / positions / │  SGP4 propagation    │
│ tracker HUD · landing sections   │      orbit polylines       │  CORS + TTL cache    │
└──────────────────────────────────┘                            └──────────────────────┘
```

- `backend/` — FastAPI service. `propagation.py` is the deterministic SGP4
  core (pure computation, fully offline-testable); `catalog.py` fetches live
  TLEs from CelesTrak with an embedded fallback set; `tools/fetch_demo_catalog.py`
  regenerates the frontend's curated 14-satellite snapshot.
- `frontend/` — Vite + React 18 + Tailwind, emerald mission-control theme.
  - `components/scene/OrbitScene.jsx` — fixed WebGL canvas: graticule +
    landmass point-cloud Earth, green Fresnel atmosphere, orbit rings,
    satellite markers, scroll-keyframed camera rig.
  - `lib/engine.js` — in-browser SGP4 engine: 10 Hz telemetry heartbeat,
    simulated clock with pause + 1×–300× time-warp, per-satellite orbit
    trajectory caches.
  - `components/tracker/*` — catalog panel (search + LEO/MEO/GEO filters),
    telemetry HUD (altitude/velocity/lat/lon + orbital elements), time-warp
    controls.
  - `components/site/*` — navbar, hero, tracker section, how-it-works,
    services, gallery, about, FAQ, contact, footer.

## Run it (two terminals)

**1. Frontend** (self-contained — works without the backend)

```bash
cd frontend
npm install          # add --legacy-peer-deps on npm >= 10 if peer resolution complains
npm run dev          # → http://localhost:5173  (also on http://127.0.0.1:5173)
```

**2. Backend** (optional — live catalog & position APIs)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`. Regenerate the
demo catalog snapshot anytime with `python backend/tools/fetch_demo_catalog.py`.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | liveness, catalog provenance |
| `GET /api/satellites[?refresh=true]` | catalog (names, groups, TLEs, inclination, epoch) |
| `GET /api/satellites/positions?timestamp=<ISO>` | lat/lon/alt, velocity, ECI for every tracked object |
| `GET /api/satellites/{id}/orbit?minutes=90&steps=180` | projected trajectory polyline |

## Tests

```bash
cd backend && python -m pytest tests -q
```

22 tests cover the propagation core, column-correct synthetic TLE generation,
the catalog fallback path, and every API contract (happy / error / edge).

## Features

- **3D scrollytelling** — the camera flies through six keyframes as you scroll;
  hero → tracker → how-it-works → services/gallery → about/FAQ → contact.
- **In-browser SGP4** — 14 curated spacecraft (8 LEO · 3 MEO · 3 GEO) propagated
  locally with `satellite.js`; telemetry heartbeat at 10 Hz.
- **Time-warp** (pause, 1×/10×/60×/300×) accelerates the simulated clock; orbit
  rings, ground positions, and HUD stay consistent.
- **Interactive globe** — drag to rotate, +/− to zoom, reset view; glowing
  per-regime orbit trails for every tracked object.
- **Telemetry HUD** — altitude, velocity, latitude/longitude plus period,
  inclination, RAAN, eccentricity, semi-major axis, and launch year.
- **Full landing experience** — searchable/filterable catalog, services grid,
  how-it-works steps, SVG gallery mocks, about + team, FAQ accordion, contact
  form with transmit confirmation, and footer.

## Known limitations

- Geodetic conversion uses a spherical Earth (visualization-grade).
- CelesTrak group fetch sizes are capped for responsiveness; raise the
  limits in `backend/catalog.py` for full constellations.
- WebGL2 context and a modern browser required.
