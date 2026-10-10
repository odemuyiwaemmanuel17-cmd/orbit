# OrbitalPulse V3 — NASA-Style Scientific Realism: Release Validation

Stage: **phases 1-6 verified & shipped; phase 7 partially shipped —
browser-dependent validation is BLOCKED in this environment, not complete.**
Baseline tag: `orbitalpulse-v3-baseline` (27c663b). All evidence is
re-runnable: `cd frontend && npx vitest run && npx vite build`,
`cd backend && python -m pytest`.

## 1. Step-by-step traceability

| # | Mandatory step | Status | Evidence |
|---|---|---|---|
| 1 | Repository audit + regression inventory + protected baseline | DONE | tag `orbitalpulse-v3-baseline`; inventory in ARCHITECTURE V3 addendum; FE 142 / BE 48 baseline (pre-V3) |
| 2 | Scientific Earth rendering | DONE | vendored NASA textures + ATTRIBUTION.md; ACES+exposure+sRGB in custom shaders; sRGB color spaces; mipmaps default on; HIGH/BAL/LOW presets (lib/quality.js) |
| 3 | Coordinate-system integrity | DONE + BUG FIXED | docs/COORDINATES.md; coordinates.test.js (15 checks) — found eciToSceneKm geocentric-vs-geodetic divergence (~20 km ground); fixed via satellite.js eciToGeodetic; round-trips <1e-9 |
| 4 | Orbital path cleanup | DONE | past/future split on real SGP4 samples; 7% unselected; glow only HIGH; graticule (decorative) removed; Kepler lab kept separate from SGP4 (§6 COORDINATES) |
| 5 | Spacecraft assets | DONE w/ stated limitation | representative per-class models; GLB loader hook (no license-verified GLB source found headless — stand-ins labeled, never claimed as mission replicas); TRUE SCALE toggle separates size from position |
| 6 | Mission-control telemetry | DONE | provenance block (source/bundle date/TLE age/propagation status), frame-labeled tiles, epoch + REAL-TIME/SIM badge; search/filters intact |
| 7 | Camera system | DONE | OVERVIEW/FOCUS/FOLLOW/GROUND-TRACK/RESET; all view-only (engine state never mutated by camera code — follow reads quaternion, writes camera); reduced-motion aware |
| 8 | Orbital laboratory | DONE (audit + enhance) | audit found existing coverage strong (6 controls, apsides/nodes, conic/vis-viva inspector, sub-surface warning, singularities tested in kepler.test); gaps closed NOW: ECI axes overlay (finite-input tested) + equatorial degeneracy disclosure |
| 9 | Data quality | DONE | TLE bundle date + per-sat age (AGED badge, HUD status), NO SOLUTION on propagation failure, offline weather fallback disclosed, no silent substitutes |
| 10 | Performance | PARTIAL | done: LOD, instanced constellations, module texture cache, dpr caps per preset, context-loss banner, no per-frame allocations added. NOT done: measured FPS/memory numbers — requires real browser (see §3) |
| 11 | Scientific validation | DONE (numeric) | 157 vitest incl. SGP4-vs-reference, TEME transforms, geodetic round-trip, illumination, trail placement path, GMST sign, frame tooltips backed by tests. Visual-regression screenshots: BLOCKED (no browser) |
| 12 | Final release | THIS DOC | shipped to main; limitations honest in §3 |

## 2. Numerical tolerances shipped (units)

- geodetic↔ECI round-trip: <1e-6°, <1e-3 km
- render-path agreement: <5e-10 scene units (~3 km compressed → effectively identical placement)
- SGP4 |v| vs circular reference: <0.02 km/s envelope (osculating short-period terms)
- mean motion vs sma period: <0.15 min
- sun ephemeris pins: 1e-8 (byte-identical extraction proofs)
- texture orientation: analytic identities exact

## 3. Remaining limitations (not marked complete)

1. **Browser visual QC + before/after screenshots** — impossible headless;
   run `/tracker?debug` at 1920x1080 & 390x844, fixed epoch (`LIVE` then
   step ±5 min), compare Earth terminator vs eclipse lab SUNLIT badge and
   subsolar HUD — the tests already assert numeric equivalence.
2. **FPS/memory measurement** — Diagnostics (`?debug`) reports FPS/SATS/SLICE;
   representative-device numbers pending user capture.
3. **Licensed GLB spacecraft** — loader ready (`meta.modelGlb` + GLTFLoader);
   no verified permissive direct-download asset found; stand-ins labeled.
4. **Post-processing (bloom SSAO)** — intentionally not added: violates
   "no excessive effects" more than it adds realism at this scale.
5. Cloud shadows are a zero-offset overhead approximation (labeled).

## 4. Trade-offs made (explicit)

- ACES applied manually in shaders instead of full render pass: consistency
  without a postprocessing dependency (revisit if bloom is ever required).
- Geodetic latitude as the single scene convention (tracker authority)
  rather than re-projecting everything to a sphere: matches user-visible
  alt/lat/lon, costs a small compression distortion already documented.
- Presets change rendering surfaces only — physics identical everywhere —
  chosen over resolution-scaled simulation for credibility.

## 5. What to revisit as the system grows

- Replace stand-in craft once a license-verified ISS/HST GLB is sourced.
- Visual-regression: add Playwright screenshot jobs in CI (needs browser env).
- Ellipsoidal scene radius if sub-km placement fidelity is ever needed.
