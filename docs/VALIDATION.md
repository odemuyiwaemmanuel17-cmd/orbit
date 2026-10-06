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
