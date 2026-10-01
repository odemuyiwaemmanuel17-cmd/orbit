# OrbitalPulse

Interactive orbital mechanics & satellite tracker — an immersive 3D Earth
(React Three Fiber) with live SGP4 satellite propagation (FastAPI + `sgp4`),
a sci-fi glassmorphic HUD, and time-warp orbital playback.

![stack](https://img.shields.io/badge/React%2018-R3F%208-blue) ![api](https://img.shields.io/badge/FastAPI-SGP4-cyan)

## Architecture

```
┌───────────────────────┐        /api proxy (Vite)       ┌──────────────────────┐
│  React + R3F frontend │ ─────────────────────────────▶ │  FastAPI backend     │
│  Earth · satellites · │                                │  CelesTrak TLE fetch │
│  HUD overlays         │ ◀── catalog / positions /      │  SGP4 propagation    │
│                       │     orbit polylines            │  CORS + TTL cache    │
└───────────────────────┘                                └──────────────────────┘
```

- `backend/` — FastAPI service. `propagation.py` is the deterministic SGP4
  core (pure computation, fully offline-testable); `catalog.py` fetches live
  TLEs from CelesTrak with an embedded fallback set; `main.py` exposes the API.
- `frontend/` — Vite + React 18 + Tailwind. `Earth.jsx` (textured globe,
  Fresnel atmosphere, sun-locked terminator), `SatelliteScene.jsx` (instanced
  satellites, orbit tracks, focus camera), `Sidebar.jsx`, `TelemetryHUD.jsx`,
  `TopBar.jsx`, `Toasts.jsx`.

## Run it (two terminals)

**1. Backend**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8000
```

**2. Frontend**

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`.

If the backend is unreachable the UI degrades gracefully to a bundled
snapshot (`frontend/src/lib/offline-snapshot.json`; regenerate with
`python backend/tools/gen_snapshot.py`). Earth textures stream from a CDN and
fall back to a procedural globe when offline.

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

- **Time-warp** (1×/10×/60× presets + 1–240× slider) accelerates the simulated
  clock; the backend re-propagates telemetry at simulated timestamps.
- **Focus mode** lerps the camera onto the locked satellite with damped
  station-keeping.
- **90-minute orbit tracks** rendered as glowing additive polylines in the
  inertial frame.
- **Live sun vector** — a low-precision solar ephemeris keeps the day/night
  terminator aligned with the mission clock.
- Sun-constrained damped `OrbitControls`, instanced satellite meshes,
  per-group color coding, search + category filtering, toast status feed.

## Known limitations

- Geodetic conversion uses a spherical Earth (visualization-grade).
- CelesTrak group fetch sizes are capped for responsiveness; raise the
  limits in `backend/catalog.py` for full constellations.
- WebGL2 context and a modern browser required.
