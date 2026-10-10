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

## Addendum 2026-10-06 — M5 Plane Change Simulator

- lib/planechange.js pure service: dV = 2v sin(di/2) (node-line, impulsive,
  |v| unchanged), altitude ladder helper, and combined apogee burn via law
  of cosines on the VALIDATED hohmann.js apogee/target speeds (reuse, no
  duplicated transfer math).
- /lab/planec: two rings sharing one ascending node (grey current orbit with
  animated sat, dashed cyan target orbit), amber node line + node sphere
  projected through the same eciToSceneKm/GMST contract as LabOrbit;
  altitude + i1/i2 sliders, live Δi·v·ΔV readout, cheaper-at-altitude ladder
  table, LEO→GEO combined-vs-separate saving card, substituted
  SHOW CALCULATION, ANALYTICAL — IMPULSIVE accuracy badge.
- Tests: vitest 53/53 (7 plane-change cases incl. 133.91 m/s reference,
  180° = 2v bound, monotone ladder, GEO 30° band, di = 0 reduces to
  Hohmann dv2, combined ≤ separate, triangle bound).

## Addendum 2026-10-06 — M6 Ground Station System

- lib/stations.js: the ground-network state domain, deliberately separate
  from the engine (stations are static infrastructure). Pure + THREE-free
  + storage-agnostic (any getItem/setItem object) so node tests cover the
  real persistence path. validateStation refuses out-of-range/NaN input;
  loadStations degrades corrupt payloads to the anchor catalogue instead of
  throwing; saves are best-effort (quota/private-mode safe).
- Look angles on the mean sphere with an independent closed-form test
  cross-check; slant range + min-elevation verdict exposed for M7/M8/M10.
- /lab/stations: StationLayer markers via the same geodeticToScene
  contract (sphere + true-radial drei Line mast), per-station live
  elevation of the watched satellite through the ISS reference pipeline,
  min-elevation slider, add/remove/reset UI with inline validation errors,
  localStorage persistence, SHOW CALCULATION substituted, ANALYTICAL —
  SPHERICAL EARTH + REAL-TIME PROPAGATION labels.
- Tests: vitest 66/66 (13 station cases). pytest 48/48 unchanged.

## Addendum 2026-10-07 — M7 Pass Prediction + landing content

- lib/passes.js: pure merge/schedule layer over the EXISTING validated pass
  math (analysis.predictPassesClient == backend predict_passes) and the M6
  station domain. predictSchedule(rec, stations, t0, hours, step) merges all
  stations into one AOS-sorted schedule with cap disclosure;
  elevationCurve samples the pipeline for the per-pass SVG chart; utcHm and
  passAgeLabel are pure formatters (tested).
- Parity bug fixed on the way (contract-first): client mirror now closes
  window-edge passes like the server and never emits LOS-less single-sample
  windows (analysis.js; documented in ORBITAL_MATH M7).
- /lab/passes: station chips (enable/disable, own masks), 6/12/24 h window,
  30/60 s grid select, on-demand PREDICT (cached result, one-frame yield
  before the sweep — tracker stays responsive), merged pass rows with
  AOS/TCA/LOS + T−/T+ vs sim clock, elevation curve per pass, SHOW METHOD
  bracketing steps, SGP4 REAL-TIME PROPAGATION + grid-resolution labels.
  StationLayer exported from /lab/stations and reused (no duplication).
- Landing content updates by owner request (not a redesign; style untouched):
  HOW IT WORKS grew 4 -> 6 stages (added pass prediction + mission-analysis
  labs; 3x2 grid, same card design), backend note now mentions server-side
  analytics, and the TECHNOLOGY STACK chip block was removed from About.
- Tests: vitest 73/73 (7 new incl. REAL GOES-15 + GPS TLE integration).
  pytest 48/48 unchanged.

## Addendum 2026-10-07 — M8 Line-of-Sight Visualization

- lib/los.js: closed-form footprint cap gamma(e) = acos((R⊕/rk)cos e) − e,
  derived from the M6 tan(elev) form; gamma(0) is the M6 horizon identity
  (locked by a cross-check test, not reimplemented). losState returns
  LINK/LOS/BLOCKED using M6 lookAngleKm — the single source of elevation
  truth, so M6, M7 and M8 can never disagree.
- footprintPolygonDeg: constant-angular-radius ground ring by spherical
  (asin/atan2) trig, closed; great-circle invariance tested.
- /lab/los: live footprint ring + sub-satellite marker + station beams over
  the persisted station set, colored by state; 97 projected points at the
  engine's 10 Hz tick is trivial, so no quantization was added and ring /
  dot / beams stay pixel-aligned. Toggles for footprint/beams, per-station
  elev/mask/slant list, SHOW CALCULATION, REAL-TIME PROPAGATION badge, and an
  explicit note that state is decided by computed elevation, not apparent
  intersection in the compressed-radius scene.
- StationLayer reused again (3rd consumer) — zero marker duplication.
- Tests: vitest 81/81 (8 new LOS cases). pytest 48/48.

## Addendum 2026-10-07 — M9 Coverage vs Min-Elevation

- lib/coverage.js: analytic one-orbit coverage on top of kepler.js (M0+n t ->
  nu -> ECI), satellite.js gstime for sidereal rotation, M8 gamma(e) caps and
  M6 lookAngleKm. orbitGroundSamples / visibilityFromSamples / gridCoverage /
  coveredFractionAt / capAreaFractionDeg — all pure, all node-tested.
- Area math: cos(lat)-weighted equal-lat/lon grid with dot-product cap tests
  (O(step^2) residual disclosed and bounded against the analytic cap fraction
  in tests); station time-fraction from uniform time samples; passes need >= 2
  samples (M7 parity).
- /lab/coverage: on-demand ANALYZE ORBIT (one-frame yield, cached result — no
  per-frame heavy compute), coverage-growth point cloud scrub with PLAY /
  slider, live cap ring + ground track + stations (StationLayer, 4th use),
  per-station visibility bars (unscaled), 5/10 deg grid + 0/5/10 deg mask
  selects, ANALYTICAL MODEL badge with explicit "no J2/SGP4 here" note.
- Landing HOW IT WORKS pass stage now names one-orbit coverage growth.
- Tests: vitest 91/91 (10 new). pytest 48/48.

## Addendum 2026-10-07 — M10 Communication Link Budget

- constants.js gained the noise pair (k_dbW/K from the exact SI Boltzmann
  value; -173.976 dBm/Hz at ITU-R 290 K), derived once in the central module.
- lib/linkbudget.js: slantFromElevationKm (law-of-cosines root, exact at
  zenith and tangent), fsplDb, linkBudgetKm (NF or G/T receiver model with
  a proven 290·10^(NF/10) equivalence), channelCapacityBps AWGN reference,
  LINK_PRESETS + MODULATION_REFERENCE_DB labeled EDUCATIONAL.
- /lab/link: station picker; LIVE WORST CASE mode takes the current SGP4
  altitude and the station's own mask into slantFromElevationKm; full dB
  chain card EIRP → FSPL → Prx → C/N0 → Eb/N0 → margin → max bitrate with
  GO/NO-GO badge; beam to the selected station colored by verdict;
  substituted SHOW CALCULATION.
- Self-caught during review: an NF-vs-G/T equivalence error (Tsys = 290 vs
  290·F — the TEST caught it, service display fixed to not assume 290 K),
  a "6 dB doubles bitrate" mistake (3.01 dB does), and a duplicated
  -173.9755 literal (now imported from constants).
- Tests: vitest 106/106 (15 new). pytest 48/48. Landing HOW IT WORKS lab
  stage now names ground networks and link budgets.

## Addendum 2026-10-07 — M11 Attitude Frames

- lib/attitude.js: pure THREE-free frame math — lvlhBasisEciKm (Gram-
  Schmidt, throws on degenerates), yawPitchRollMat (intrinsic Z-Y-X RWFS),
  bodyAxesEciKm (column-weighted basis), angleBetweenDeg/nadirErrorDeg.
  Conventions documented in the module header and pinned by tests.
- /lab/attitude: live SGP4 state -> LVLH solid triad (along-track emerald,
  wheel cyan, nadir amber) + dashed white body triad through the shared
  eciToSceneKm GMST contract; ypr sliders with degree units; preset chips;
  INERTIAL HOLD freezes body axes in ECI so the diverging frames dramatize
  that nadir pointing = continuous orbit-rate rotation (rate readout from
  periodSec — no duplicated mu math). REAL-TIME PROPAGATION badge; page
  states geometry-only (M12 adds dynamics); orbit path via OrbitScene lab.
- Delivery friction honestly logged: my own Edit-time bracket slip broke the
  build (caught by esbuild, fixed), an early garbled bodyAxesEciKm was
  rewritten, -0/+0 deep-equality artifacts moved to component-wise
  comparisons, and a lucide icon name (Axes) was verified BEFORE writing
  this time (it doesn't exist; Axis3d does).
- Tests: vitest 114/114 (8 new). pytest 48/48.

## Addendum 2026-10-08 — M12 Reaction Wheel Bench

- lib/wheels.js: first DYNAMICS module. State [ω(3), q(4), Ω(3)]; internal
  motor torque with reduced-inertia coupling; Euler equations + quaternion
  kinematics; documented fixed-step RK4 (dt 0.02 s), SEGMENT-ALIGNED to
  command corners (a plain grid showed ~2e-4 corner error — the aligned
  version settles the closed-form angle to <5e-3°), quat renormalized per
  step. planSlew exposes the exact trapezoid identities (θ = k a t1²,
  t1 = √(θ(I+Iw)/τ), H_wheel = I·ω_peak via H = 0).
- Momentum conservation is a LINEAR invariant → RK4 preserves it to ~1e-13;
  tests assert H_total ≈ 0 and the wheel/bus momentum mirror per sample.
- /lab/wheels: axis + 5-60° slew, inertia/torque/limit inputs, plan card,
  RUN SIMULATION (cached, one-frame yield), floating 3D bench: fixed inertial
  triad + rotating bus frame + box mesh driven by the sample quaternion,
  three mini-charts (angle, wheel rpm, momentum vs ±limit lines), timeline
  scrub + play loop, honest saturation warning (integrator continues past
  the limit to SHOW infeasibility). BENCH + RK4 labels up front.
- New doc: docs/SPACECRAFT_DYNAMICS.md (frames, orbit-rate fact, wheel math,
  integrator + validity limits) — required platform doc, started here.
- Delivery honesty: several of my own defects caught pre-commit by tests and
  self-review (garbled quatRotVec expansion, missing reaction-wheel SIGN
  (wheel must counter-accelerate), segment-boundary corner error, a broken
  mid-function edit reorder, dead helper + void hacks, interval-in-useMemo
  misuse). All fixed with evidence, none shipped.
- Tests: vitest 126/126 (12 new). pytest 48/48.

## Addendum 2026-10-09 — M13 Eclipse & Sun Ephemeris

- SAFE REFACTOR of an existing primitive, not a new approximation: the Meeus
  low-precision sun chain that already lived inside coords.sunDirection was
  extracted VERBATIM into lib/sun.js (sunEquatorialRad / sunEciUnit /
  subsolarLonDeg); coords.sunDirection now delegates. The pre-refactor scene
  vectors for three dates were captured from main FIRST and are pinned in
  tests/eclipse.test.js to 1e-8 — so the ISS scene lighting and eclipse tests
  share one byte-identical ephemeris, zero behavior drift.
- SUN_RADIUS_KM (6.957e5, IAU nominal) added to constants.js — no new magic
  number in the lib. AU_KM and R_EARTH_MEAN_KM reused.
- lib/eclipse.js: similar-triangle umbra/penumbra cones. shadowStateKm does
  NOT invent radii on the sun-facing half-space (r_anti ≤ 0 returns SUNLIT
  with null cone radii); penumbral obscuration is a labeled LINEAR band
  approximation, explicitly NOT the exact circle-overlap integral. The thin
  (~63 km) LEO penumbral band is a tested real-physics consequence, not a bug.
- orbitEclipseKm fraction scan is cross-checked against an INDEPENDENT
  analytic cone root (psi_e = asin(R/(a√(1+k²)))−atan(k), fraction psi_e/pi),
  not just against itself; the cylindrical textbook limit asin(R/a)/pi is a
  shown reference, never the shipped number. Degenerate inputs throw.
- /lab/eclipse: LIVE watch-satellite shadow badge (shadowStateKm on the real
  SGP4 position, re-evaluated every tick, REAL-TIME PROPAGATION label) +
  TEST-ORBIT fraction scan with sun-angle-beta slider (β=0 max eclipse, β=90
  always sunlit) and USE LIVE ORBIT (a + plane normal from stateToElementsKm).
  On-demand ANALYZE (frozen sun snapshot, cached 360-pt ring colored by
  region, rendered through eciToSceneKm/GMST); SHOW CALCULATION exposes apex,
  cone radii, analytic root. Feeds M14 power.
- Delivery honesty: my first write of the cone test mislabeled a deep-umbra
  point (y=0.5r, perp 3386 < rhoU 6340) as PENUMBRA — caught by the assertion,
  fixed by placing the sample inside the true band, not by loosening physics.
  Also recovered from re-using a stale worktree directory name; all M13 edits
  landed in the registered task/eclipse-20261009-144651 worktree (confirmed).
- Tests: vitest 136/136 (10 new). pytest 48/48. Build green, /lab/eclipse 200.

## Addendum 2026-10-09 — Cinematic Visual Program (phases A–E)

- User directive SUPERSEDES the earlier "keep green / do not redesign landing"
  constraint set: new navy/blue/cyan design tokens (docs/VISUAL_SYSTEM.md),
  photoreal Earth replacing the dot-matrix globe, spacecraft LOD models.
  Physics, routes, engine pipeline and all 142 frontend + 48 backend tests
  remain untouched contracts.
- Earth orientation is guaranteed by tests/earthTexture.test.js, not by
  eyeballing: three SphereGeometry UV convention (λ = 180 − 360u, north-up)
  and the compensating texture flip (repeat.x=-1, offset.x=1) are pinned
  numerically, so texture upgrades/rotations cannot silently desync the
  planet from geodeticToScene, ground tracks or the terminator.
- Terminator + key light read engine.simMs through sun.js — the same ephemeris
  validated for M13 eclipse analysis. Visual realism and science share one
  source of truth; the globe never "fakes" rotation.
- Commits kept reviewable per phase: c6b8af9 tokens (B), ccdff0d Earth+sun (C/D),
  e1e6b18 lighting/craft/orbits (E).

## Addendum 2026-10-09 — Visual Refinement Phase 2

- Earth shader stack extended (cloud-shadow approx, twilight scattering,
  sun-aware atmosphere, graded night lights). One invariant held throughout:
  every lighting quantity reads sunDirection(engine.simMs) through the
  validated sun ephemeris; the globe never animates independently of the
  coordinate math (orientation contract still pinned by earthTexture.test.js).
- Follow camera replaces aim heuristics with real transforms:
  geodeticToScene(latest SGP4 state) x globe quaternion -> camera lerp.
  engine.syncFollowViewpoint runs on every snapshot tick; toggle in
  SimulationControls; reduced-motion honored.
- Spacecraft visuals: representative multi-part models per slot (iss/hubble/
  regime) + optional modelGlb licensed-asset drop-in path (GLTFLoader,
  dynamic import, procedural fallback on failure). Explicitly labeled: not
  replicas, orientation illustrative. No fake telemetry anywhere.
- Declutter pass: graticule deleted, orbit rings 7% unless selected
  (glow pass on selection), models LOD'd at 1.6/4.5 units.
- Verified: vitest 142/142, pytest 48/48, build green, preview routes +
  texture assets 200. GPU shader execution not verifiable headless —
  recorded as a residual risk for user visual QC.
