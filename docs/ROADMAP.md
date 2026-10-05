# OrbitalPulse Mission Control — Roadmap

Statuses: DONE · IN PROGRESS · NEXT · FUTURE

| # | Milestone | Status | Evidence / notes |
|---|---|---|---|
| 1 | Mission Control foundation (`/tracker` route, selector, telemetry dock, sim controls, loading/error, mobile) | **DONE** | `pages/Tracker/TrackerPage.jsx`, router shell, `SceneLoader`, `RouteErrorBoundary`, mobile bottom sheets |
| 2 | 3D Earth (sphere, material, atmosphere, stars, sun, camera, touch, adaptive dpr) | **IN PROGRESS** | Graticule + landmass point-cloud + Fresnel atmosphere + star field exist; photoreal day/night textures, cloud layer, and directional sun lighting still to add without changing the approved look |
| 3 | Real orbital propagation ISS end-to-end | **DONE** | TLE → SGP4 (satellite.js / sgp4) → TEME → GMST → lat/lon/alt/velocity; never animated manually |
| 4 | Telemetry (name, NORAD, UTC, lat, lon, alt, vel, incl, period, apogee, perigee, TLE epoch) | **DONE** | Telemetry tab; apogee/perigee/argPerigee/meanAnomaly/epoch parsed from the element set (`tleDetails`) |
| 5 | Real orbit path (past 45 min + future one period, propagated points) | **DONE** | `engine.orbitPoints` samples −45 min → +1 period; no fitted ellipse |
| 6 | Ground track with antimeridian splitting | **DONE** | `engine.groundTrackSegments` + `GET /api/satellites/{id}/groundtrack`; solid past / dashed future; segment-per-date-line crossing (tested both sides) |
| 7 | Simulation engine (single clock: time, speed, playing, live) | **DONE** | `engine.simMs` is the only clock; LIVE / play / pause / step ±5 min / reset / 0.25–100× (landing presets up to 300×) |
| 8 | Timeline scrubber | **DONE** | ±12 h scrub on `/tracker`; scene stays interactive while scrubbing |
| 9 | Satellite catalogue + categories + scalable rendering | **DONE (at 14 sats)** | Search + regime filters + mission-category chips (Stations/Starlink/Navigation/Weather/Earth Obs/Science). InstancedMesh deferred until >~100 objects — per-sat meshes at 14 are cheaper than the instancing bookkeeping |
| 10 | Search + smooth camera focus on selection | **DONE** | `engine.focusOn` damps globe yaw/pitch toward the selected satellite each frame; user drag cancels the ease — no teleport |
| 11 | Coverage footprint from geometry | **DONE** | Tangent-cone + ground circle from `cos θ = R⊕/(R⊕+h)`; min-elevation mask is FUTURE |
| 12 | Orbital analysis panel (full element set) | **DONE** | Expandable via the tabbed HUD; advanced values kept out of the primary tiles |
| — | Conjunction alerts, space weather, pass predictor | **DONE** | Shipped in the mission-HUD tabs (ALERTS / WX / PASSES) + backend mirrors |
| — | Backend restructure into `app/api/orbital/services` packages | FUTURE | Current flat modules are tested; restructure only when the endpoint count justifies it |

## Definition of done for each milestone
Build green · backend tests green (when touched) · landing visually unchanged ·
`/tracker` verified at 390px and desktop widths · no console errors.
