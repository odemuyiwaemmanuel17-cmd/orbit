# OrbitalPulse Architecture

## System overview

```
 Browser
 ┌─────────────────────────────────────────────────────────────┐
 │  Landing (/)                 Mission Control (/tracker)     │
 │  scrollytelling sections     fixed 3D scene + HUD panels    │
 │        │                             │                      │
 │        └───────────┬─────────────────┘                      │
 │                    ▼                                        │
 │        engine.js  (singleton simulation clock + SGP4)       │
 │        satellite.js  ·  React Three Fiber 60 fps render     │
 └───────────────────────┬─────────────────────────────────────┘
                         │ /api (Vite proxy / optional)
                         ▼
              FastAPI backend (backend/)
              sgp4 · catalog ingest · analysis mirrors
```

The frontend is authoritative for the demo: every orbital computation also
runs in the browser (`satellite.js`), so the deployed site works with zero
backend. The FastAPI service mirrors the same math server-side
(`sgp4` + pure-Python geometry) for API consumers and heavier catalogs.

## Frontend

- **Stack**: Vite 5, React 18 (JSX, no TS), Tailwind 3, react-router-dom 6,
  three / @react-three/fiber / @react-three/drei, satellite.js, lucide-react.
- **Routing** (`src/App.jsx`): `/` → `pages/Landing.jsx` (approved visual
  design — protected), `/tracker` → `pages/Tracker/TrackerPage.jsx`
  (lazy-loaded, code-split), `*` → redirect. Vercel `rewrites` serve the SPA.
- **Scene** (`components/scene/OrbitScene.jsx`): one fixed WebGL canvas.
  `mission` prop switches the camera rig from scroll keyframes (landing) to
  a close fixed orbit (Mission Control). Globe rotation is user-drag driven
  (`engine.yaw/pitch`). Layers: graticule Earth, landmass point cloud,
  Fresnel atmosphere (Kp-tinted), orbit rings, satellite markers, footprint
  cone, conjunction markers, decay vectors.
- **Engine** (`lib/engine.js`): singleton. Owns the *only* simulation clock
  (`simMs`) and the 10 Hz propagation heartbeat. Components subscribe via
  `useEngine()`; the 3D scene reads mutable state per frame without React
  re-renders.
- **Analysis** (`lib/analysis.js`): client mirrors of footprint geometry,
  pass prediction, conjunction screening, space-weather fallback.

### Performance split
| Layer | Rate |
|---|---|
| WebGL render loop | ~60 fps (reads engine state; no React) |
| Orbital propagation | 10 Hz heartbeat (all catalog sats) |
| DOM telemetry | 10 Hz via engine subscription (cheap trees) |
| Orbit polylines | rebuilt when the sample window drifts (per-sat cache) |

## Backend (`backend/`)

| Module | Role |
|---|---|
| `main.py` | FastAPI app, CORS, endpoint contracts |
| `propagation.py` | SGP4 core: TLE → TEME → geodetic (spherical), GMST |
| `catalog.py` | CelesTrak ingest, TTL cache, synthetic fallback TLEs |
| `analysis.py` | footprint, conjunction scan, space weather, passes |
| `tools/` | demo-catalog + offline-snapshot generators |

`skyfield` is available as an optional higher-precision dependency; the
tested deterministic pipeline uses `sgp4` directly (no ephemeris download).

## Time & frames
- Canonical internal time: **UTC epoch milliseconds** (`engine.simMs`).
- SGP4 outputs **TEME**; geodetic conversion rotates by **GMST** with a
  spherical Earth. Scene positions are derived from geodetic lat/lon/alt,
  never labelled ECEF/EPI.
- Simulation clock modes: `LIVE` (pinned to wall clock), `warp` (0.25–300×),
  `paused`, timeline scrub (±12 h). All consumers read the same clock.

## Deploy
- Vercel builds `frontend/` via root `package.json` + `vercel.json`.
- Backend deploys independently (any uvicorn host); frontend works without it.

## Gap-closure additions (2026-10-05)
- **Ground track** — `engine.groundTrackSegments(id)` propagates −45/+90 min
  sub-satellite points, splits every ±180° crossing into its own polyline,
  and renders past (solid emerald) vs future (dashed cyan) at r = 1.006.
  Server mirror: `GET /api/satellites/{id}/groundtrack`.
- **Sunlight state** — cylindrical Earth-shadow test in scene units inside
  `engine.sunlitAt`; shown as LIT / ECLIPSE in the telemetry tab.
- **Camera focus** — `engine.focusOn(id)` sets a yaw/pitch easing target
  consumed by `GlobeGroup` each frame; any drag input clears it.
- **Categories** — mission-type chips (Stations, Starlink, Navigation,
  Weather, Earth Obs, Science) layered on top of regime filters.
- **Diagnostics** — `/tracker?debug` overlay: FPS, satellite count,
  propagation rate, warp, selected NORAD, sim clock. Hidden otherwise.
- **Accessibility** — aria-pressed filter chips, aria-live boot list,
  `prefers-reduced-motion` disables pulse/bounce/spin animations.
