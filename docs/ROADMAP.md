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
| 9 | Satellite catalogue + categories + scalable rendering | **DONE (constellation layer)** | Search + regime filters + mission-category chips. Constellation layer ships InstancedMesh + typed arrays + time-sliced propagation; bench: 6000 sats parse 53 ms, slice <1 ms/tick |
| 13 | Constellation scaling on the ISS reference pipeline | **DONE (large Starlink catalogue live at 2000 sats)** | Layers `test`(8)/`gps`(30)/`weather`(40)/`starlink`(2000, 1.1 MB lazy chunk) ship with live CelesTrak bundles; real-data gate at 2000: parse 39 ms, slice 1.2 ms/tick, per-sat cycle 0.9 s. CelesTrak refreshes groups ~2 h; regenerate bundles with `python backend/tools/fetch_constellations.py` (tool refuses politely during the dedupe window). Selected member keeps the full high-accuracy pipeline; unselected refresh ~1 Hz via slices; client conjunction screening capped at 64 records (disclosed in UI; full-catalog scan belongs server-side) |
| 10 | Search + smooth camera focus on selection | **DONE** | `engine.focusOn` damps globe yaw/pitch toward the selected satellite each frame; user drag cancels the ease — no teleport |
| 11 | Coverage footprint from geometry | **DONE** | Tangent-cone + ground circle from `cos θ = R⊕/(R⊕+h)`; min-elevation mask is FUTURE |
| 12 | Orbital analysis panel (full element set) | **DONE** | Expandable via the tabbed HUD; advanced values kept out of the primary tiles |
| — | Conjunction alerts, space weather, pass predictor | **DONE** | Shipped in the mission-HUD tabs (ALERTS / WX / PASSES) + backend mirrors |
| — | Backend restructure into `app/api/orbital/services` packages | FUTURE | Current flat modules are tested; restructure only when the endpoint count justifies it |

## Definition of done for each milestone
Build green · backend tests green (when touched) · landing visually unchanged ·
`/tracker` verified at 390px and desktop widths · no console errors.


---

## Platform milestones (mission-analysis program, 2026-10-06)

Spec: 22 milestones across TRACK / ANALYZE / DESIGN. Build strictly in order;
each reuses validated lower-level physics.

| # | Capability | Status |
|---|---|---|
| 1 | Orbital Elements Lab (analytic two-body; vitest physics suite; constants module) | **DONE** |
| 2 | Maneuver Simulator (impulsive burn -> before/after elements) | **DONE** |
| 3 | Hohmann Transfer Planner | **DONE** |
| 4 | Delta-V Budget + Tsiolkovsky | **DONE** |
| 5 | Plane Change Simulator | **DONE** |
| 6 | Ground Station System | **DONE** |
| 7 | Pass Prediction over user stations | **DONE** |
| 8 | Line-of-Sight visualization | **DONE** |
| 9 | Coverage vs min-elevation | **DONE** |
| 10 | Communication link budget | **DONE** |
| 11 | Attitude visualizer | NEXT |
| 12 | Reaction wheel demo | TODO |
| 13 | Eclipse analysis (umbra/penumbra) | TODO |
| 14 | Solar power (simplified, labeled) | TODO |
| 15 | Atmospheric drag comparison | TODO |
| 16 | Orbit decay demo (simplified, labeled) | TODO |
| 17 | J2 perturbation visualization (math already in kepler.js) | TODO |
| 18 | SSO designer (math already in kepler.js) | TODO |
| 19 | Conjunction analyzer pair view | TODO |
| 20 | Collision-avoidance maneuver | TODO |
| 21 | Mission Builder (sequential events) | TODO |
| 22 | Preset missions on real engines | TODO |

Fidelity labels in use: REAL-TIME PROPAGATION (SGP4/TLE) - ANALYTICAL MODEL
(two-body, Hohmann) - SIMPLIFIED MODEL (drag/decay/power) - EDUCATIONAL MODEL
(reaction wheel). Never present a simplified number without its label.
