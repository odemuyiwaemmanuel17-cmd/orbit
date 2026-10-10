# Mission Control Build Progress

Living log — one entry per milestone delivery.

---

## 2026-10-05 · Gap-closure milestone (M6, M8, M9, M10 + spec extras)

**Files changed** — backend: `analysis.py` (+`ground_track`), `main.py`
(+`/groundtrack`), 4 new tests (43 total). Frontend: `engine.js`
(groundTrackSegments, sunlitAt, focusOn, cache invalidation), `coords.js`
(sunDirection), `OrbitScene.jsx` (GroundTrack layer, focus easing),
`CatalogPanel.jsx` (category chips, focus on select), `TelemetryPanel.jsx`
(sunlight tile, NORAD tile, element tooltips), `LayerToggles.jsx` +
`engine` layers (+GND TRACK), `SceneLoader.jsx` (real boot steps),
`TrackerPage.jsx` (`?debug` diagnostics), `index.css` (reduced motion,
toast-in).

**Verified** — 43/43 pytest; production build green; Node math checks:
3 antimeridian splits over 4.25 h ISS arc, 13% eclipse fraction (plausible
for current geometry), GEO zenith/antipode elevation sanity.

**Deviations (documented)** — no Zustand (engine singleton is the store),
no TypeScript migration (would rewrite protected files), no InstancedMesh
at 14 satellites. Next: photoreal Earth texture pass (M2), constellation
expansion + instancing (M11 scale), min-elevation coverage masks.

## 2026-10-05 · Milestone 1 (+ M3–M5, M7–M8, M11–M12 closures)

**Goal:** route the approved landing UI into a real engineering application
without touching its visual identity.

**Files created**
- `frontend/src/App.jsx` — router shell (`/`, `/tracker`, catch-all redirect)
- `frontend/src/pages/Tracker/TrackerPage.jsx` — Mission Control layout
- `frontend/src/components/tracker/SimulationControls.jsx` — LIVE / play /
  pause / step ±5 min / reset / 0.25×–100×
- `frontend/src/components/tracker/LayerToggles.jsx` — shared layer checkboxes
- `frontend/src/components/common/SceneLoader.jsx` — orbital loading state
- `frontend/src/components/common/RouteErrorBoundary.jsx` — crash containment
- `frontend/src/lib/analysis.js` — `tleDetails()` (apogee/perigee/argP/MA/epoch)
- `docs/ARCHITECTURE.md`, `docs/ORBITAL_MATH.md`, `docs/ROADMAP.md`, this file
- `vercel.json` — SPA rewrites for `/tracker` deep links

**Files changed (functional only, visuals preserved)**
- `pages/Landing.jsx` — moved from `App.jsx` (content identical) + hash-scroll
- `lib/engine.js` — single simulation clock: `isLive`, `setLive`, `stepBy`,
  `setSimTime`, warp exits live; orbit polylines now −45 min → +1 period
- `scene/OrbitScene.jsx` — `mission` camera mode (fixed close orbit)
- `site/Navbar.jsx`, `site/Hero.jsx` — Launch Tracker CTAs → `/tracker`;
  anchors resolve cross-route
- `site/TrackerSection.jsx` — uses shared `LayerToggles` (markup unchanged)
- `tracker/TelemetryPanel.jsx` — full element set incl. apogee/perigee/TLE epoch

**Verified**
- Baseline before changes: 39/39 backend tests, clean `vite build`
- After changes: production build green (TrackerPage code-split 8.4 kB);
  dev instance: `/` 200, `/tracker` SPA fallback 200, all new modules 200
- Landing composition, hero, colors, typography, animations: untouched

**Unresolved / next**
- Browser pixel verification not possible in this environment (no headless
  browser) — user should eyeball `/tracker` at desktop + 390px
- M6 ground track with antimeridian handling: next milestone
- M2 photoreal texture/cloud/sun pass on the Earth, M9 categories/instancing,
  M10 camera fly-to

---

## 2026-10-05 — Constellation scaling layer (M13)

**Goal:** extend the validated ISS pipeline to constellations without new orbital logic or UI redesign.

- `frontend/src/lib/constellation.js`: pure `ConstellationGroup` — typed arrays (lat/lon/alt/px/py/pz/lastUpdate), contiguous round-robin slice scheduler (~1 Hz per unselected satellite at 10 Hz heartbeat), promoted-member skip.
- Engine: lazy code-split constellation data, `toggleConstellation`, `_lookupEntry` spans featured + groups, selected constellation satellite is promoted into the exact full-accuracy entry path (telemetry/footprint/ground track/passes/orbit line).
- Scene: one `InstancedMesh` per group, matrices written straight into the instanceMatrix Float32Array in `useFrame` — zero React churn, one draw call.
- Catalog panel: additive constellation chip row (existing chip styling), merged search rows with 120-row honest render cap; `?debug` shows CONST count + slice ms; ALERTS discloses screened-object cap (64).
- Backend: `constellations.py` + `GET /api/constellations{,/{key}}` reuse `parse_tle_file`/`tle_to_satrec`; live CelesTrak with bundle fallback, source labeled (`celestrak`/`bundle`/`unavailable`).
- Data: `fetch_constellations.py` generated real bundles — test 8, gps 30, weather 40. Starlink blocked by CelesTrak 2 h group-dedupe; regenerate with `--key starlink` when the window opens (tool now detects the refusal).
- Perf gates (node, `frontend/tools/constellation-check.mjs`): 8 → slice 1.0 ms; 30 → 0.5; 40 → 0.3; synthetic 2000 → 0.4 (window 223); synthetic 6000 → 0.7 (window 400, full refresh 1.5 s). Parse 6000 = 53 ms; budget 25 ms never approached. Scheduler invariant (every unselected refreshed per cycle, proven via `lastUpdate` stamps) passes at all sizes.
- Tests: 48 backend pytest pass (5 new constellation tests incl. bundle-fallback provenance); frontend build green with per-group chunks (test 3.6 kB / gps 12.6 kB / weather 16.5 kB).
- Deviations: large-scale bench uses clearly-labeled synthetic Starlink-shell fixtures (compute gate only, never app data); conjunction screening client cap 64 — full-catalog screening stays a server-side FUTURE item.

---

## 2026-10-05 — Starlink phase 4 (real subset)

- `frontend/src/data/constellations/starlink.json`: 120 live CelesTrak
  starlink TLEs fetched at 14:32 UTC via `fetch_constellations.py`.
- Perf gate (real data): n=120 parse 11 ms, sweep 5 ms, slice 0.3 ms/tick
  (window 16 -> full refresh 8 ticks = 0.8 s); scheduler invariant PASS.
- All four layers now ship real data; the STARLINK chip appears in /tracker.
- Phase 5 (large catalogue, --cap 2000) awaits the next CelesTrak dedupe
  window (~16:33 UTC); synthetic 2000/6000 gates already prove the budget.

---

## 2026-10-06 — Starlink large catalogue (phase 5, final)

- Re-fetched the starlink group at 11:55 UTC (dedupe window open) and shipped
  `starlink.json` at cap 2000 — 2000 live TLEs, 1.1 MB, lazy-loaded as its
  own chunk; default tool cap raised 120 -> 2000 (backend config mirrors).
- Real-data perf gate (twice): n=2000 parse 39-54 ms, full sweep 36 ms,
  slice 1.2 ms/tick (window 223 -> 0.9 s per-satellite refresh), invariant
  PASS. Matches the synthetic 2000 gate; 6000 synthetic retains ~20x headroom.
- All five requested stages complete: test set -> GPS -> NOAA/weather ->
  Starlink subset -> large Starlink catalogue, on one shared ISS pipeline.

---

## 2026-10-06 - M1 Orbital Elements Lab (platform program)

- Audit: ISS pipeline intact; gaps closed = scattered constants + no frontend
  test runner.
- New: lib/constants.js (sourced, unit-named); lib/kepler.js (elements<->state,
  bracketed Newton Kepler solver, conic + markers, J2 + SSO math); vitest
  physics suite 18/18; docs/VALIDATION.md (expected vs computed with deltas:
  v_circ 7.6686 km/s, T 92.560 min, ISS J2 -4.956 deg/day, SSO 98.19 deg).
- Route /lab/elements: six element sliders with units, presets
  (ISS/Molniya/GEO/Sun-sync/GTO), orbit regenerated from Kepler geometry at
  the 10 Hz engine beat via the shared projection contract; perigee/apogee/
  node markers, apsidal + node construction lines, optional equatorial ring,
  Kepler-II nu(t) playback (pause/warp/scrub act on it), SHOW CALCULATION
  inspector, ENGINEERING readout, perigee-below-surface warning, fidelity
  badge; mobile bottom-sheet panel. Landing + tracker behavior untouched.
- Verification: vitest 18 pass (new runner), pytest 48 pass, vite build green
  (lab 11 kB lazy chunk), dev server 200s for /tracker + /lab/elements;
  browser pixel check pending by convention (no headless here).
- Known limits: two-body only (labeled); J2 first-order; TS checks N/A (JS
  repo; deferral documented).
- Next: M2 Maneuver Simulator - impulsive burn in the rotating
  RSW frame -> new classical elements, before/after orbits via LabOrbit.

---

## 2026-10-06 - M2 Maneuver Simulator (Maneuver Lab)

- New pure service lib/maneuver.js: RSW-basis impulsive burns (prograde,
  retrograde, radial out/in, normal, anti-normal), exact applied-dV report,
  before/after engineering deltas. Built strictly on validated kepler.js.
- New route /lab/maneuver (lazy 13 kB): real satellite picker (featured
  catalog + active constellations via engine.recordFor), direction chips,
  dV slider + engineering input, PREVIEW BURN -> amber burn vector + dashed
  cyan PREDICTED orbit alongside grey ORIGINAL (live SGP4-derived) orbit,
  APPLY commits burn stacks with cumulative dV, RESET restores live state,
  before/LIVE/after table (apogee/perigee altKm, period, e, a, i),
  SHOW CALCULATION with identities and the RSW-vs-LVLH caveat.
- The live satellite's SGP4 truth is never modified (working copy only) -
  labeled ANALYTICAL - IMPULSIVE TWO-BODY.
- Tests: vitest 27/27 (9 new maneuver cases: perigee/apogee identities,
  energy bookkeeping, plane tilt atan(dV/v), second-order induced e,
  orthonormal T/R/N, zero-dV identity, unknown-direction throws).
  ISS end-to-end probe on a real TLE: +100 m/s prograde -> da +183 km,
  dT +3.78 min, burn point -> new perigee (1.04°, live-e offset).
- OrbitScene: additive `overlay` prop; LabOrbit: color/dashed/opacity
  options + exported eciToSceneKm. Tracker behavior unchanged.
- Next: M3 Hohmann transfer planner (two-impulse circular->circular,
  analytic transfer ellipse + animated coast with the same engines).

---

## 2026-10-06 - M3 Hohmann Transfer Planner

- lib/hohmann.js analytic two-impulse service on kepler.js (signed dV for
  outward AND inward transfers, coast time, transfer elements for render).
- /lab/hohmann (lazy 12 kB): initial/target altitude inputs, 4 presets
  (LEO->GEO, LEO->GPS, SSO->SSO, GEO->LEO deorbit pair), inclination slider
  (plane shared, plane-change cost deferred to M5 honestly labeled),
  three-orbit scene (grey endpoint rings, dashed cyan ellipse, amber/sky
  burn-site markers = transfer perigee/apogee), spacecraft animated via
  Kepler solver on the sim clock with PLAY/PAUSE (phase freeze)/RESET/speed,
  live coast-time readout, SHOW CALCULATION fully substituted.
- Tests: vitest 37/37 (10 new: GEO 3.8-3.95 km/s band, 5.26 h coast,
  apsis/identity checks, equal-radius zero-dV limit, up/down symmetry,
  coast monotonicity). pytest 48/48. Build green. Fix during verify:
  invalid lucide 'Transfer' icon -> Waypoints (rollup caught it).
- Next: M4 Delta-V budget + Tsiolkovsky (rocket equation service + event
  table + feasibility).

---

## 2026-10-06 - M4 Mission ΔV Budget + navigation hub

- lib/rocket.js: Tsiolkovsky both directions, feasibility verdict with
  exact margin/propellant shortfall/mass ratio; invalid vehicles throw
  rather than fabricate.
- /lab/dvbudget: add/remove/edit mission events with m/s inputs, LEO->GEO
  preset pulls ΔV1/ΔV2 LIVE from the Hohmann service (reuse proof in
  tests), stacked required vs available bars, GO/NO-GO card, substituted
  SHOW CALCULATION. Simplifications labeled (no gravity/drag losses).
- /lab hub page + consolidated tracker header (single LABS link replacing
  our three cumulative links; approved chrome untouched).
- Tests: vitest 46/46 (9 rocket cases incl. ln(e) identity, forward/inverse
  round-trip, Isp linearity, preset-vs-hohmann equality). pytest 48/48.
  Build green; JSX text arrow literals fixed after esbuild flagged them.
- Next: M5 plane change simulator (dV = 2v sin(di/2) with assumptions +
  combined-burn optimization note).

---

## 2026-10-06 - M5 Plane Change Simulator

- lib/planechange.js: pure dV = 2v sin(di/2) service with documented
  applicability (node-line, impulsive, |v| unchanged), altitude ladder
  helper, and combined circularize+plane-change apogee burn via law of
  cosines on the validated hohmann.js speeds — saving vs separate burns
  reported, never fabricated (combined <= separate proven in tests).
- /lab/planec: current orbit (grey, animated sat) and target orbit
  (dashed cyan) sharing one ascending node; amber node line + sphere
  through the same GMST/eciToSceneKm contract; alt/i1/i2 sliders, live
  Δi·v·ΔV card, cheaper-at-altitude table, LEO->GEO combined-burn card,
  substituted SHOW CALCULATION, ANALYTICAL — IMPULSIVE badge.
- /lab hub gained the Plane Change card (DESIGN).
- Tests: vitest 53/53 (7 new: 133.91 m/s reference at 1 deg/400 km,
  0 and 180 deg endpoints incl. 2v flip bound, sign symmetry, strictly
  decreasing ladder with GEO 30 deg in the classic ~1.6 km/s band,
  di = 0 combined reduces to Hohmann dv2, combined <= separate, triangle
  bound). Build green; route smoke 200 on /lab/planec.
- Fix during verify: my test reference had hardcoded v = 7.6686 km/s
  (equatorial-radius value) while the service correctly uses the mean
  radius (7.6726) — fixed the test, not the physics.
- Next: M6 Ground Station System (station model + map placement; feeds
  pass prediction M7 and LOS M8).

---

## 2026-10-06 - M6 Ground Station System

- lib/stations.js: ground-network state domain kept separate from the
  engine (spec: no giant store). Pure, THREE-free, storage-agnostic:
  validateStation (ranges/finiteness/unique ids), loadStations (corrupt
  payloads degrade to the anchor catalogue), saveStations (best-effort).
- Spherical look angles with an independent closed-form cross-check test:
  tan(elev) = (rk cos(g) - rs)/(rk sin(g)); slant range + min-elevation
  verdict exposed now for M7 passes, M8 LOS, M10 link budget.
- Anchor catalogue = published coords of real sites (Goldstone, Madrid,
  Canberra, Malargue, Svalbard); site elevations labeled approximate.
- /lab/stations: station markers on the approved globe (same
  geodeticToScene contract), live elevation of the watched sat through the
  ISS pipeline (TLE -> SGP4 -> geodetic, zero duplicated orbital logic),
  mask slider, add/remove/reset with inline errors, localStorage,
  substituted SHOW CALCULATION, SPHERICAL EARTH + REAL-TIME PROPAGATION
  labels, mobile bottom-panel layout.
- Tests: vitest 66/66 (13 station cases incl. zenith/antipode identities,
  horizon cos(g)=rs/rk, 19.84 deg LEO horizon anchor, monotone rise,
  validation, persistence round-trip + corrupt fallback). pytest 48/48.
  Build green; routes 200 incl. /lab/stations.
- Self-caught during verify: two WRONG TEST EXPECTATIONS (higher-station
  "dips horizon more" intuition applied to a fixed satellite shell is
  backwards - the cap SHRINKS; and a persistence round-trip missing the
  source field validation fills in). Physics unchanged; tests corrected
  against the proven closed form.
- Next: M7 pass prediction - elevation-vs-time over user stations from the
  validated stations.js + Kepler services (on-demand, cached, tracker stays
  responsive).

---

## 2026-10-07 - M7 Pass Prediction over user stations + landing content

- lib/passes.js: merge/schedule layer ONLY - propagation, look angles and
  pass bracketing stay in the validated pipeline (predictPassesClient,
  mirror of backend predict_passes). Merged AOS-sorted schedule across
  enabled stations with per-station masks, 20-pass cap disclosure,
  elevation curve sampler for the chart, pure formatters.
- Parity fix found while testing (contract-first): the client mirror
  dropped passes still open at the window end (backend closes them) and
  could emit LOS-less single-sample windows. Both aligned in analysis.js;
  the GEO-overhead test only passes because of the fix.
- /lab/passes: station chips + 6/12/24h window + 30/60s grid, on-demand
  PREDICT cached in state (one-frame yield; tracker unaffected), pass rows
  with AOS/TCA/LOS, T-/T+ vs sim clock, max elev + azimuth, per-pass
  elevation curve (SVG, mask line, AOS/LOS markers, peak dot), SHOW METHOD,
  SGP4 REAL-TIME PROPAGATION badge + honest grid-resolution note. Station
  markers reused from /lab/stations (exported StationLayer).
- Landing (owner request, content-only, style untouched): HOW IT WORKS 4->6
  stages (pass prediction + mission-analysis labs) in the same card design;
  TECHNOLOGY STACK chip block removed from About.
- Tests: vitest 73/73 (7 new; REAL GOES-15 + GPS TLE integration: overhead
  GEO = one continuous >80 deg pass spanning window, antipodal = zero,
  sorted/non-overlapping GPS schedule). pytest 48/48. Build green.
- Next: M8 line-of-sight visualization - horizon shells + live LOS beams
  from stations using stations.js + engine positions.

---

## 2026-10-07 - M8 Line-of-Sight Visualization

- lib/los.js: visibility cap closed form gamma(e) = acos((Rs/rk) cos e) - e
  derived from the M6 tan(elev) identity; gamma(0) proven EQUAL to the M6
  horizonHalfAngleDeg for 4 altitudes (cross-check, not reimplementation).
  losState = LINK (elev>=mask) / LOS (0<=elev<mask) / BLOCKED (elev<0), all
  from the single lookAngleKm - M6/M7/M8 can never disagree.
- footprintPolygonDeg: constant-angular-radius ground ring (spherical
  asin/atan2), closed; 97 vertices verified on great-circle distance.
- /lab/los: live footprint ring + sub-sat dot + per-station beams colored by
  state over the persisted network; FOOTPRINT/BEAMS toggles; counts row;
  per-station elev/mask/slant rows; SHOW CALCULATION with substituted gamma;
  REAL-TIME PROPAGATION badge + explicit compressed-scene honesty note.
  StationLayer's 3rd consumer - still zero marker duplication.
- Perf choice: ring recomputed every engine tick (97 projections at 10 Hz is
  trivial) instead of memo-quantizing - ring, dot and beams stay aligned.
- Landing: HOW IT WORKS pass stage now mentions live LOS footprint/beams.
- Tests: vitest 81/81 (8 new). pytest 48/48. Build green; /lab/los 200.
- Next: M9 coverage vs min-elevation - coverage caps of one orbit's shells
  over the station set (reuses gamma(e) + orbitPolyline), cached on demand.

---

## 2026-10-07 - M9 Coverage vs Min-Elevation

- lib/coverage.js: pure analytic coverage on validated services only -
  kepler M0+nt -> nu -> ECI, gstime sidereal rotation, M8 gamma(e) cap,
  M6 lookAngleKm. orbitGroundSamples, visibilityFromSamples (fraction,
  maxElev, pass runs >= 2 samples M7 parity), gridCoverage
  (cos(lat)-weighted cells, dot-product cap test, first-cover time),
  coveredFractionAt scrub, capAreaFractionDeg analytic reference.
- Tests caught the truth before I wrote them wrong: GEO at a=42157 km
  drifts 0.16 deg/period (mu-derived period vs sidereal day) - pinned-test
  tolerance set to 0.3 with a comment; LEO west-drift equals -omega_E*T to
  < 1 deg. Grid vs analytic cap cross-check within 0.015 at 10 deg step.
- /lab/coverage: ANALYZE ORBIT on demand (cached, one-frame yield),
  coverage-growth point cloud with PLAY/slider scrub, live cap ring +
  ground track + station markers (StationLayer 4th consumer), per-station
  visibility bars UNscaled (I removed my own 4x exaggeration before
  commit), 5/10 deg grid + mask selects, ANALYTICAL MODEL badge + explicit
  no-J2/SGP4 and O(step^2) disclosures.
- Landing: HOW IT WORKS pass stage now includes one-orbit coverage growth.
- Tests: vitest 91/91 (10 new). pytest 48/48. Build green, routes 200.
- Next: M10 link budget - Friis/EIRP/C-noise over slant ranges from M6,
  using the constants module (C_KMS) and per-pass worst-case geometry.

---

## 2026-10-07 - M10 Communication Link Budget

- constants.js: noise pair centralized - k_dbW/K derived from the EXACT
  2019-SI Boltzmann value, kT(290K) = -173.976 dBm/Hz (ITU-R reference).
- lib/linkbudget.js: spherical slant rho(e,h) as the law-of-cosines root
  (zenith = altitude, horizon = tangent length, both pinned); fsplDb;
  linkBudgetKm full dB chain with DUAL receiver models - NF or G/T - whose
  equivalence G/T = Grx - 10log(290*10^(NF/10)) is locked to 1e-9 dB;
  channelCapacityBps AWGN reference; labeled EDUCATIONAL modulation targets
  and typical-class presets (S-band, X-band, GEO slow telemetry).
- /lab/link: LIVE WORST CASE mode = current SGP4 altitude at the station's
  own mask -> exact spherical slant; dB chain card with GO/NO-GO + margin;
  beam to selected station colored by verdict; substituted SHOW CALCULATION;
  SIMPLIFIED MODEL + EDUCATIONAL labels everywhere lumped assumptions sit.
- Tests caught ME twice (recorded honestly): my NF/G/T identity test wrongly
  assumed Tsys=290 with NF>0 (real mapping is 290*F - service G/T Prx
  display also stopped assuming 290 K), and "6 dB doubles bitrate" was
  wrong (3.01 dB does; 6 dB quadruples). Also removed my own duplicated
  -173.9755 literal before commit (constants rule applies to UI too).
- Tests: vitest 106/106 (15 new). pytest 48/48. Build green, routes 200.
- Landing: HOW IT WORKS mission-analysis stage now names ground networks
  and link budgets.
- Next: M11 attitude visualizer - orbit-fixed (LVLH/RWFS) frame rendering
  with yaw/roll/pitch about velocity + nadir vectors from the validated
  state pipeline.

---

## 2026-10-07 - M11 Attitude Frames

- lib/attitude.js: pure frame math on the live SGP4 state - LVLH/RWFS by
  Gram-Schmidt (z = nadir, x = horizontal velocity, y = z x x = -h prograde;
  right-handedness and axis definitions pinned on a REAL inclined state,
  degenerate radial-only velocity throws), intrinsic Z-Y-X yaw/pitch/roll,
  body axes as column-weighted basis combinations (verified against an
  independent transcription).
- The analytic teaching identity: a body frozen in ECI sees nadir drift by
  EXACTLY the swept true anomaly (tested at 5/15/30% of period, circular) -
  so INERTIAL HOLD in /lab/attitude turns "nadir pointing is a motion"
  into something you can watch: solid LVLH triad (emerald/cyan/amber)
  rotating away from the dashed white body triad at the orbit rate
  (readout from periodSec, no duplicated mu math).
- ypr sliders with units, preset chips (Nadir / Yaw180 / Pitch30 / Roll90),
  nadir-angle card, SHOW CALCULATION (Gram-Schmidt + R + acos all with live
  numbers), REAL-TIME PROPAGATION badge, page states geometry-only (M12 =
  dynamics). Orbit path via the lab prop.
- Test-suite honesty: fp floor of acos near |d|=1 (~1e-6 deg) asserted
  explicitly; -0/+0 artifacts -> component-wise comparisons; icon existence
  verified BEFORE writing (Axes doesn't exist, Axis3d does).
- Friction logged: one Edit-time bracket slip broke the build (esbuild
  caught), and an early garbled bodyAxesEciKm got rewritten when tests
  exposed it - caught pre-commit, both times.
- Tests: vitest 114/114 (8 new). pytest 48/48. Build green, routes 200.
- Next: M12 reaction wheels - commanded slew with wheel momentum limits,
  RK4 attitude dynamics (documented integrator) against analytic
  small-angle/yaw-about-nadir references.

---

## 2026-10-08 - M12 Reaction Wheel Demo

- lib/wheels.js: platform's first DYNAMICS module - bus+wheel state
  [w, q, Omega], reduced-inertia motor coupling (tau = u I Iw/(I+Iw)),
  Euler equations + quaternion kinematics, documented fixed-step RK4
  (dt 0.02 s) SEGMENT-ALIGNED to command corners, quat renormalized per
  step. Closed-form trapezoid planner: theta = k a t1^2, wheel momentum
  peak = I w_peak via H = 0. Reaction sign: wheel counter-accelerates
  (test-enforced).
- Tests pin the integrator against analysis: settle < 5e-3 deg, H_total
  1e-6 per sample (linear invariant => RK4 exact-ish), mirror momentum at
  peak 1e-9, t1 scaling 4x torque = half time, quat unit norm.
- /lab/wheels: floating 3D bench (fixed inertial triad + rotating bus
  triad + box mesh from sample quaternion), axis/angle/inertia/torque/
  limit controls, plan card with substituted identities, three mini
  charts (angle / wheel rpm / momentum vs +-limit), timeline scrub + loop,
  honest SATURATES banner (integrator continues past the limit to show
  infeasibility; early-stop/desat labeled out of scope). BENCH + RK4
  labels front and center; HOW IT WORKS stage updated.
- New required doc: docs/SPACECRAFT_DYNAMICS.md (frames, orbit-rate fact
  from M11, wheel math + integrator + validity limits from M12).
- Self-caught defects before commit (logged with evidence in ARCHITECTURE):
  garbled quatRotVec expansion, missing reaction SIGN, command-corner
  integration error (fixed by segment alignment), a botched mid-file edit
  that put the loop before its definitions (restructured), dead helper +
  void hacks, setInterval inside useMemo.
- Tests: vitest 126/126 (12 new). pytest 48/48. Build green, routes 200.
- Next: M13 eclipse analysis - umbra/penumbra cylinder-cone model vs the
  validated sunDirection ephemeris; eclipse fraction per orbit analytical
  cross-check; feeds M14 power.

## 2026-10-09 - M13 Eclipse Analysis (umbra/penumbra)

- Safe extraction, not a new approximation: the Meeus low-precision sun
  chain inside coords.sunDirection moved VERBATIM to lib/sun.js
  (sunEquatorialRad/sunEciUnit/subsolarLonDeg); coords.sunDirection delegates
  and is pinned byte-identical to pre-refactor scene vectors at three dates
  (1e-8). One ephemeris now drives both scene lighting and eclipse math.
- SUN_RADIUS_KM (6.957e5, IAU nominal) added to constants.js; AU_KM and
  R_EARTH_MEAN_KM reused - no scattered magic numbers.
- lib/eclipse.js: similar-triangle umbra/penumbra cones. apex Lu = R d/(Rs-R)
  ~1.384e6 km. shadowStateKm returns SUNLIT (no invented radii) on the
  sun-facing half-space; penumbral obscuration is a labeled LINEAR band ramp,
  not the exact circle-overlap integral. orbitEclipseKm 360-pt scan is
  cross-checked against an independent analytic cone root psi_e/pi, with the
  cylindrical asin(R/a)/pi as a shown (not shipped) reference. Degenerate
  inputs throw.
- /lab/eclipse: LIVE watch-satellite shadow badge (shadowStateKm on the real
  SGP4 position each tick, REAL-TIME PROPAGATION label) + SIMPLIFIED CONE
  test-orbit scan: altitude + sun-beta sliders (b=0 max eclipse, b=90 always
  sunlit), USE LIVE ORBIT (a + normal from stateToElementsKm), on-demand
  ANALYZE (frozen sun snapshot, region-colored ring via eciToSceneKm), min/orbit
  in umbra, SHOW CALCULATION. Feeds M14 power.
- HOW IT WORKS stage 6 updated (eclipse/umbra-penumbra named) per standing
  request; Lab index card + /lab/eclipse route wired.
- Self-caught defects (logged in ARCHITECTURE): cone test point mislabeled
  deep-umbra as PENUMBRA (fixed by placing sample in the true ~63 km band,
  not by loosening physics); re-used a stale worktree dir name once - all
  edits confirmed landed in the registered task/eclipse worktree.
- Tests: vitest 136/136 (10 new). pytest 48/48. Build green, routes 200.
- Next: M14 solar power (simplified, labeled) - orbits fed by M13 eclipse
  fractions + SOLAR_CONSTANT_WM2; cosine incidence, power budget.

## 2026-10-09 - Cinematic Visual Program: phases A-E

- Phase A audit: R3F three 0.169 + drei 9.114, single OrbitScene canvas,
  Earth-fixed scene frame (geodeticToScene/GMST), satellite.js SGP4 engine,
  Tailwind 3.4; baseline at 8efdd6f: vitest 136/136, pytest 48/48, build green,
  routes 200. Screenshot capture unavailable headless - numeric contracts +
  user eyeball used instead (stated limitation).
- B: design tokens + 735 emerald remap + green-hex sweep (residue 0),
  REGIME palette rebalanced, glass -> mission panel navy.
- C+D: photoreal Earth (NASA textures vendored + ATTRIBUTION.md), pinned UV
  orientation contract (new earthTexture.test.js, +6 tests => 142), terminator/
  clouds/ocean glint from sim-epoch sun ephemeris, sRGB correctness, dpr cap.
- E: sun-synced directional+ambient rig, LOD spacecraft (generic models,
  illustrative orientation stated), restrained orbit paths (13% unselected),
  ground-track past=blue/future=dashed-cyan.
- Verified: vitest 142/142, pytest 48/48, vite build green, preview smoke:
  all app routes + texture assets 200.
- Next: F tracker interface redesign, G labs polish, H homepage hero,
  I camera/responsive/perf, J visual QC vs reference + regression sweep.

## 2026-10-09 - Visual Refinement Phase 2

- Earth: cloud shadows (labeled zero-offset approx), copper twilight band,
  sun-aware atmosphere (day-limb blue / terminator glow / storm tint kept),
  graded city lights, fresnel-weighted ocean glint, limb airglow.
- Spacecraft: representative ISS / HST / GEO-comsat / EO / MEO-nav models +
  GLTFLoader drop-in hook for licensed GLBs (none ship yet - no verified
  permissive direct source found; stated limitation, never claimed replicas,
  orientation labeled illustrative).
- Declutter: graticule removed; orbits 7% unless selected (glow on
  selection); LOD markers unchanged 1.6/4.5.
- Camera: FOLLOW toggle eases the mission camera to the selected craft's
  TRUE world position (geodeticToScene x live globe quaternion),
  reduced-motion aware; mission framing 2.72, near plane 0.03.
- HUD: SIM EPOCH + REAL-TIME/SIM badge from engine state, larger tabular
  tiles; hero gradient + stat hierarchy; last green gradient residue swept
  (green-* classes: 0).
- Verified: vitest 142/142, pytest 48/48, build green, preview smoke all
  200 incl. texture assets. Screenshots still impossible headless - visual
  QC vs reference is the open follow-up (needs user's browser).

## 2026-10-09 - V3 NASA-Style Scientific Realism (phases 1-5 + partial 7)

- Baseline protected: tag orbitalpulse-v3-baseline (27c663b).
- NEW docs/COORDINATES.md: TEME -> geodetic -> scene contracts, units,
  tolerances, render/physics separation, HUD frame definitions.
- REAL BUG FOUND by the integrity suite: eciToSceneKm used geocentric
  latitude; tracker uses geodetic (satellite.js) — lab-vs-tracker
  disagreement up to ~20 km ground equivalent at mid latitudes. Fixed by
  delegating to sm.eciToGeodetic; agreement pinned <1e-9 scene units.
- Shadow HUD upgraded from cylindrical to the M13 CONE model via
  shadowFromGeodetic on satellite.js's own WGS84 chain (no hand-rolled
  rotations for frames).
- Earth: ACES tone mapping + exposure + sRGB output in custom shaders;
  HIGH/BALANCED/LOW presets (dpr/clouds/glow/segments only, physics
  identical); module-level texture cache; WebGL context-loss banner.
- Orbits past/future split on real samples; camera modes OVERVIEW/FOCUS/
  RESET/FOLLOW; TRUE SCALE toggle separating model size from position.
- HUD provenance: source, bundle date, TLE age, NOMINAL/AGED/NO SOLUTION,
  frame tooltips; model size/orientation disclaimer in footer.
- Tests: vitest 156/156 (14 new), pytest 48/48, build green, all routes
  + /lab/elements smoke 200.
- Remaining: deeper lab micro-polish (step 8 audit found existing coverage
  already solid: apsides/nodes/axes, degenerate-element tests), measured
  FPS/perf report + visual regression screenshots require a real browser
  (documented environment limitation, not marked complete).
