<!--
  OrbitalPulse - physics validation log
  One row per important equation: reference case -> expected -> OrbitalPulse
  result -> delta. Tests: frontend `npm test` (vitest) + backend pytest.
-->
# Validation

## Analytic orbital mechanics (frontend/tests/kepler.test.js, vitest)
mu = 398600.4418 km^3/s^2 (EGM-96, lib/constants.js). Values captured 2026-10-06.

| Equation | Reference case | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| v_circ = sqrt(mu/r) | r = 6778.137 km (400 km WGS84) | 7.6686 km/s (textbook ~7.67) | 7.6686 | <1e-4 |
| T = 2*pi*sqrt(a^3/mu) | a = 6778.137 km | 92.56 min | 92.560 min | <1e-3 min |
| v_esc = sqrt(2mu/r) | r = 6778.137 km | 10.845 km/s | 10.8450 | <1e-4 |
| vis-viva vs circular | e = 0 identity | equal | equal (<1e-12) | - |
| conic r(nu) | ISS-like elements, 6 anomalies | matches state norm(r) | <1e-9 km | - |
| elements->state->elements | ISS-like + retrograde i=140 deg | identity round-trip | max err 1.7e-11 | - |
| ascending node at RAAN | omega=0, nu=0 -> ECI lon = RAAN | exact | <1e-9 deg | - |
| Kepler eq inversion | e in {0..0.95}, M in {0.1..5.9} | abs(E - e sinE - M) < 1e-10 | passes all 16 combos | - |
| Kepler II (areal rate) | e=0.5, 600 s near periapsis vs near apoapsis | periapsis sweep > 3x apogee sweep | passes | - |
| J2 nodal regression | ISS a=6796, i=51.6 deg | approx -4.95 deg/day (Vallado order) | -4.956 | 0.01 |
| Sun-synchronous i | altitude 700 km | 98.2 deg (standard reference) | 98.19 deg | 0.01 deg |
| SSO self-consistency | precession at designed i | 360 deg / 365.2421897 d | matches to 1e-3 deg/day | - |

## SGP4 pipeline (established earlier, unchanged)
| Item | Evidence |
|---|---|
| TLE column maps (epoch 14-char zero-padded doy, 7-char eccentricity) | backend/tests regression cases vs canonical ISS TLE |
| ground-track antimeridian segmentation | test_ground_track_segments_never_cross_antimeridian |
| client/server propagation parity | mirrored node + pytest cases |

## Known model limits (honesty ledger)
- Two-body lab math ignores J2/drag/SRP: labeled `ANALYTICAL MODEL - TWO-BODY` in the UI.
- Scene display uses documented log radial compression (altToRadius); all *numbers* shown are SI, never scene units.
- J2 formulas are first-order secular averages, valid for LEO/MEO study, not long-horizon prediction.
- Browser pixel verification is performed manually (no headless browser in the build environment).

## Impulsive maneuvers (frontend/tests/maneuver.test.js + ISS end-to-end probe)

| Equation | Reference case | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| v' = v + dV·d̂ (magnitude) | any direction, 37.5 m/s | applied \|Δv\| = requested | exact (1e-9) | - |
| tangential prograde burn | circular r=7000 km, +100 m/s | burn point becomes perigee: a'(1−e') = 7000 | 7000.000000 km | <1e-6 |
| energy bookkeeping | prograde 100 m/s at circular | ε' = ε + v·dV + dV²/2 | matches to 1e-9 | - |
| retrograde identity | circular −50 m/s | burn point becomes apogee; Δapogee = 0 | 0 km / −25.9 km perigee | <1e-6 |
| plane tilt, normal burn | circular +100 m/s out-of-plane | Δi ≈ atan(dV/v) = 0.760° | 0.7592° | <0.001° |
| induced e (2nd order) | normal burn finite dV | e ≈ (dV/v)² = 1.76e-4 | 1.756e-4 | <1% |
| ISS live-state burn (E2E) | +100 m/s prograde at TLE epoch | Δa ≈ v·dV·2a²/μ? numeric integration | Δa +183.2 km, ΔT +3.78 min, ν_burn→0 (1.04°, live e≠0) | consistent |

## Hohmann transfer (frontend/tests/hohmann.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| 300 km -> GEO total dV | classic two-impulse LEO->GEO | 3.80-3.95 km/s band | in-band (per-run 3.85 km/s @400 km) | in-band |
| 300 km -> GEO coast | half transfer period | ~5.1-5.4 h | 5.26 h | <0.05 h |
| a_t, e_t formulas | (r1+r2)/2, (r2-r1)/(r2+r1) | identity | 1e-9 rel | - |
| equal-radius limit | r1 = r2 | dV1 = dV2 = 0 | <1e-9 m/s | - |
| direction symmetry | up vs down same endpoints | identical total dV, opposite signs | to 1e-6 m/s | - |
| vis-viva identities | dV1 = v_p - v_c1 etc. | definition match | 1e-6 m/s | - |
| apsis radii | a(1±e) = r1, r2 | exact | 1e-6 km | - |
| coast monotonicity | t(nu) increasing, t(180)=T/2 | endpoints | 1e-3 s | - |

## Rocket equation & budgets (frontend/tests/rocket.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| dV for m0/m1 = e, Isp 300 s | dV = Isp g0 ln(m0/m1) | 300 x 9.80665 = 2941.995 m/s | matches | 1e-6 |
| zero propellant | identity | 0 m/s | 0 (1e-12) | - |
| forward/inverse round-trip | propellantForDv o dvAvailable | 2500 m/s | 2500.000 | 1e-6 |
| Isp linearity | 250 s vs 450 s, same masses | ratio 1.8 | 1.800000000 | 1e-9 |
| mass ratio | exp(3000/(300 g0)) | analytic | matches 1e-9 | - |
| invalid vehicle | Isp <= 0 or dry <= 0 | throws, no fabricated numbers | throws | - |
| budget GO/NO-GO | required vs available | margin = avail - req | exact | 1e-6 |
| shortfall accounting | over-budget mission | needed - carried | exact | 1e-6 |
| preset reuse proof | LEO->GEO preset vs hohmann service | dv1/dv2 equal (rounded m/s) | equal | <1 m/s |

## Plane change (frontend/tests/planechange.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| 1 deg at 400 km | 2 sqrt(mu/6771) sin(0.5 deg) | 133.91 m/s (v = 7.6726 km/s) | 133.910 | 1e-6 |
| 180 deg flip | dV = 2v (formula's own bound) | exact | matches | 1e-9 |
| sign symmetry | +di vs -di same cost | identity | matches | 1e-12 |
| altitude ladder | dV strictly decreases with alt | monotone for 30 deg | monotone | - |
| GEO 30 deg pure plane change | classic ~1.6 km/s rule of thumb | 1.5-1.65 km/s band | 1.592 km/s | in-band |
| combined burn, di = 0 | reduces to Hohmann dv2 | equals transfer dv2 | matches | 1e-4 |
| combined <= separate | law of cosines vs plane+circ sum | saving >= 0 for 5/15/28.5 deg | holds | - |
| triangle bound | combined <= va + vc | never exceeded | holds | - |

## Ground stations & look angles (frontend/tests/stations.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| zenith | same lat/lon, sat alt 500 km | elev 90, slant 500 km | matches | 1e-6 |
| antipode | sat at lon+180 | elev -90, slant rs+rk = 13242 km | matches | 1e-3 |
| closed-form cross-check | atan2(rk cos g - rs, rk sin g), g = 10 deg | independent of module's dot path | matches | 1e-9 |
| rising satellite | g: 70 to 0 deg | elev strictly up, slant strictly down | monotone | - |
| horizon identity | cos(g) = rs/rk | elev exactly 0 | 1e-4 deg | - |
| LEO 400 km sea-level horizon | acos(6371/6771) | 19.84 deg | matches | 1e-6 |
| fixed-shell cap | higher station | SMALLER above-horizon cap (counter-intuitive, proven from closed form) | holds | - |
| min-elevation mask | verdict across threshold | flips true/false at mask | holds | - |
| catalogue validation | lat/lon/elev/mask ranges, finiteness, unique ids | invalid input never becomes a station | holds | - |
| persistence | corrupt/empty storage payload | degrade to default catalogue, no throw | holds | - |
| persistence round-trip | save custom list then load | exact equality | exact | - |
