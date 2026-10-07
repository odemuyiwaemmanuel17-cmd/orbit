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
