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

---

## Addendum 2026-10-05 — Constellation scaling

The ISS end-to-end pipeline is the reference architecture; constellations
reuse it verbatim (TLE -> twoline2satrec -> SGP4 -> eciToGeodetic/GMST ->
scene projection). What changes is only cadence and rendering:

- **One scheduler**: `ConstellationGroup.tickSlice` advances a contiguous
  window of `ceil(n/divisor)` satellites per 10 Hz tick (clamped 16..400),
  giving ~1 Hz per unselected satellite and proven coverage via per-satellite
  `lastUpdate` sim timestamps.
- **Selection promotion**: the selected satellite never lives in the slice —
  the engine re-propagates it through the full `_entryFrom` path each tick,
  so telemetry, footprint, ground track, passes and orbit line are identical
  to the featured pipeline.
- **Rendering**: per group one InstancedMesh; instance matrices are written
  directly into the typed array each frame (translation + 0/1 scale), colors
  set once from regime palette. Dead TLEs stay uninitialized and scale-zero.
- **Data flow**: seed bundles are generated from CelesTrak by
  `backend/tools/fetch_constellations.py`, lazy-imported per group
  (code-split). The backend mirrors the same provider with live fetch,
  bundle fallback, and explicit `source` labeling.
- **Honest limits**: client conjunction screening caps at 64 objects
  (synchronous O(n^2)); ALERTS discloses it. Full-catalog screening is a
  server-side roadmap item.


---

## Addendum 2026-10-06 - Mission-analysis platform scaffolding (M1)

Three-mode direction: TRACK (live tracker, unchanged), ANALYZE, DESIGN.
Milestone 1 lands the shared services ANALYZE/DESIGN will reuse:

- `lib/constants.js` - single source of physical constants (mu, J2, Re,
  OmegaEarth, c, solar constant...), units in names, sources in comments.
  New math imports from here; legacy inline constants migrate when touched.
- `lib/kepler.js` - analytic two-body service: elements<->state, conic
  geometry, bracketed-Newton Kepler solver, J2 secular rates, SSO design,
  polyline/marker generation. Pure module (no THREE) -> node-testable.
- `frontend/tests/` + `npm test` - vitest physics suite (18 tests), feeding
  docs/VALIDATION.md. Validation architecture for later milestones: every
  new equation ships with a reference-case test row.
- `/lab/elements` - lazy route (11 kB chunk) mounting the existing
  OrbitScene with a `lab` prop; Earth stays interactive (same drag layer +
  engine clock). The ISS pipeline is untouched: the lab renders alongside
  the live scene under the same projection contract.


## Addendum 2026-10-06 — M2 Maneuver Lab

- `lib/maneuver.js`: pure impulsive-burn service (RSW directions, apply +
  before/after deltas) on top of kepler.js. No duplicated orbital math.
- `engine.recordFor(id)`: public accessor so tools seed from real featured
  or active-constellation satellites through the same record path.
- OrbitScene gained an `overlay` node prop (inside GlobeGroup) — Maneuver
  Lab draws ORIGINAL (grey, live SGP4-derived elements, updates with the
  sim clock) + PREDICTED (dashed cyan, frozen burn epoch two-body) with
  LabOrbit twice; amber burn vector via exported eciToSceneKm.
- `/lab/maneuver`: lazy 13 kB chunk; PREVIEW before APPLY, burn stack with
  cumulative dV, before/LIVE/after engineering table, SHOW CALCULATION.


## Addendum 2026-10-06 - M3 Hohmann Planner

- lib/hohmann.js: pure analytic transfer service (radii in, signed dV out),
  plus transferElements/circularElements for renderer-friendly element sets
  and coastFractionSec for honest animation phasing.
- /lab/hohmann: three-orbit overlay (initial/target circles via LabOrbit
  hideSat, dashed transfer ellipse with perigee/apogee burn markers),
  presets incl. inward transfer, altitude sliders + engineering inputs,
  play/pause (freeze keeps last phase, no teleport)/reset/speed, full
  SHOW CALCULATION with substituted numbers.
- Tracker header: ELEMENTS LAB / MANEUVER / TRANSFER lab links (md/lg
  breakpoints to avoid crowding); pages cross-link in headers.


## Addendum 2026-10-06 - M4 ΔV Budget + lab navigation

- lib/rocket.js pure service (Tsiolkovsky both directions, verdict object).
- /lab/dvbudget: editable event table (preset transfers computed live from
  hohmann.js), stacked required-dV bars vs vehicle capacity bar, GO/NO-GO
  verdict with margin + propellant shortfall + mass ratio, SHOW CALCULATION.
- /lab (LabsIndexPage): ANALYZE/DESIGN hub; tracker header's three
  cumulative lab links consolidated into one LABS entry (own additions,
  not approved chrome); each lab header: TRACKER + LABS.
