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

## Pass scheduling (frontend/tests/passes.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| GEO overhead, real TLE | GOES-15 (shipped CelesTrak fixture), co-longitudinal station | one continuous pass spanning the window, max elev > 80° | holds | - |
| GEO antipodal | same TLE, station at lon+180 | zero passes | 0 | - |
| schedule order | GPS MEO, 2 stations, 12 h | sorted by AOS, non-overlapping per station, inside window | holds | - |
| pass structure | AOS < TCA <= LOS, elev at TCA >= mask | per row | holds | - |
| cap disclosure | predictPassesClient 20-pass cap | capped flag surfaced in UI | boolean | - |
| elevation curve | GEO overhead, AOS−10m→LOS+10m | all samples > 70°, peak > 80° | holds | grid step 60s |
| window-edge parity | client mirror vs backend bracketing | pass open at window end closes at last visible sample (fix in M7) | aligned | - |
| labels | utcHm zero-pad, T-/T+ flip | exact strings | match | - |

## Line-of-sight footprints (frontend/tests/los.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| mask 0 closed form | gamma(0) = acos(Rs/rk) — M6 horizon identity | equal for 400/1000/20200/35786 km | equal | 1e-9 |
| hand number | gamma(400 km, 10 deg) from formula | closed form | match | 1e-9 |
| mask monotonicity | e: 0..85 deg | cap strictly shrinks; e=90 -> point | holds | - |
| state thresholds | LINK/LOS/BLOCKED at elev >= mask / >= 0 / < 0 | built from exact gamma boundaries | correct sides | - |
| state = lookAngleKm | losState vs direct M6 call | identical elevation | 1e-12 | - |
| polygon invariance | all 97 vertices at angular radius gamma of sub-sat point | spherical-trig check | match | 1e-6 deg |
| ring elevation | surface stations on the gamma(0) ring | elev within 0.02 deg of 0 | holds | - |
| degenerate input | radius <= 0 | empty polygon, no garbage | holds | - |

## One-orbit coverage (frontend/tests/coverage.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| great-circle | 90 deg apart, identical, antipodes | 90 / 0 / 180 | match | 1e-9 |
| cap area | hemisphere gamma=90 -> 1/2; 0 -> 0; monotone | exact | match | 1e-12 |
| GEO pinned track | e=0 i=0 a=42157 km | lat 0, alt exact, lon |lon| < 0.3 deg (real 0.16 deg period drift, sidereal vs mu-derived period) | holds | - |
| sidereal drift | equatorial LEO, delta-lon over one period | -omega_E * T = -23.2 deg | holds | < 1 deg |
| equatorial station | under-track station, LEO i=0 | >= 1 pass, fraction in (0, 0.5) | holds | - |
| never-visible bound | station lat 60 vs equatorial 400 km orbit (cap 19.8 deg) | fraction 0, maxElev < 0 | holds | - |
| pass parity (M7) | single-sample blip | not counted as a pass | excluded | - |
| grid vs analytic | GEO mask-0: weighted 10 deg grid | within 0.015 of (1-cos gamma)/2 = 0.4245 | holds | grid O(step^2) |
| coverage growth | scrub 0..1 over LEO orbit | monotone, ends at final fraction | holds | - |
| cap geometry | covered cells of equatorial track | abs(lat) < gamma + step | holds | - |

## Link budget (frontend/tests/linkbudget.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| slant at zenith | e = 90 deg | rho = altitude | exact | 1e-9 |
| slant at horizon | e = 0 deg | sqrt(rk^2 - rs^2) tangent | exact | 1e-6 |
| law of cosines | rk^2 = rs^2 + rho^2 + 2 rs rho sin e for e = 5..88 | identity | holds | 1e-6 |
| FSPL hand value | 32.44 + 20log(400) + 20log(2200) | 151.33 dB | match | 1e-9 |
| FSPL slope | distance doubling | +6.0206 dB | match | 1e-3 |
| noise constants | 10log10(k exact SI), kT(290K) ITU-R | -228.598 dBW/K, -173.976 dBm/Hz | match | 1e-3 |
| NF == G/T models | G/T = Grx - 10log(290*10^(NF/10)) | identical C/N0 and Prx | match | 1e-9 |
| chain closure | Prx, Eb/N0, margin definitions | term-by-term recompute | match | 1e-9 |
| bitrate vs power | +3.01 dB EIRP | max bitrate x2 | match | 1e-6 |
| zero-margin fixed point | Rb := maxBitRate | margin = 0 | holds | 1e-6 |
| preset bands | GEO S-band 64 kbps, 40 m-equivalent dish | C/N0 in (60, 75) dB-Hz, GO | holds | - |
| AWGN capacity | Shannon transcription | monotone, equals formula | match | 1e-6 |
| invalid input | alt 0, slant NaN, missing receiver | throws, no fabricated numbers | throws | - |

## Attitude frames (frontend/tests/attitude.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| classic LVLH case | r=(7000,0,0), v=(0,7.5,0) | z=(-1,0,0), x=(0,1,0), y=(0,0,-1) | match | 1e-12 |
| definition on real state | x horizontal-velocity, z=-r̂, y=zx, RH, unit | cross(x,y)=z | match | 1e-12 |
| degeneracies | zero r / pure radial v | throw, no invented axis | throws | - |
| yaw convention | +90° about nadir: x̂→LVLH-ŷ, boresight stays | exact | match | 1e-9 |
| pitch/roll 90 | boresight tilts exactly 90° from nadir | acos(ẑb·ẑ)=90 | match | 1e-9 |
| orthonormal body frame | arbitrary ypr incl. 180° yaw | unit, pairwise orthogonal | holds | 1e-12 |
| column-combination check | body axis = Σ R[j,i]·lvlh_j (independent transcription) | identical | match | 1e-10 |
| inertial-hold drift | frozen ECI body vs LVLH at true-anomaly +Δν | angle = Δν exactly (circular) | match | 1e-6 deg |
| fp floor documented | acos near |d|=1 | 1e-6° jitter is double precision, asserted < 1e-4° | noted | - |

## Reaction-wheel dynamics bench (frontend/tests/wheels.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| quat axis-angle round-trip | 2 atan2(v·axis, s) | pi/3 exact | match | 1e-12 |
| quat vector rotation | hand rotation of x by 60 deg about z | (cos, sin, 0) | match | 1e-12 |
| quat composition | shared-axis angles add | 0.7 + (-0.2) = 0.5 | match | 1e-12 |
| planner identity | theta = k a t1^2, k = Iw/(I+Iw) | exact for t1 | match | 1e-9 |
| torque scaling | 4x torque | t1 halves | match | 1e-9 |
| invalid plan | zero angle / negative inertia | throws | throws | - |
| RK4 final angle vs closed form | 30 deg slew, I 100, Iw 0.1, tau 0.05, dt 0.02 s segment-aligned | settles at 30.00 | match | < 5e-3 deg |
| momentum conservation | H_total from rest | 0 through every sample (RK4 preserves linear invariants) | holds | < 1e-6 Nms |
| reaction pair | Iw*omega_wheel_abs = -I*omega_bus | mirror at peak | match | 1e-9 |
| peak wheel momentum | I*w_peak closed form | within sample-grid 0.25 s | match | ~6e-3 Nms |
| saturation demo | 60 deg on 2 Nms wheel | required peak exceeds limit (honest early-stop warning) | flagged | - |
| quat normalization | every emitted sample | unit to 1e-9 | holds | - |

## Eclipse & sun ephemeris (frontend/tests/eclipse.test.js)

| Check | Reference | Expected | OrbitalPulse | Delta |
|---|---|---|---|---|
| sun-direction regression pins | pre-refactor coords.sunDirection vectors, 3 dates (Mar 20 / Jun 21 / Dec 21 2026) | byte-identical after extraction to lib/sun.js | match | 1e-8 |
| ECI sun z = sin(dec) | dec invariant under GMST rotation | -0.397708 at Dec solstice; unit norm | match | 1e-8 / 1e-12 |
| June solstice declination | +obliquity 23.439 deg | z = sin(eps) | match | 1e-3 |
| umbra apex | Lu = R·d/(Rs-R) similar triangles | ~1.384e6 km, > any Earth orbit radius | match | 1e-6 rel |
| day/night half-space | rAnti = p·(-sun) <= 0 | SUNLIT, no cone radii invented | match | exact |
| axis point in shadow | x=-1000 on -sun axis | UMBRA, obscuration 100% | match | exact |
| cone radii at r=6771 | rhoU = R - r(Rs-R)/d; rhoP = R + r(Rs+R)/d | 6339.8 / 6402.8 km (band ~63 km — thin, real) | match | 1e-6 |
| penumbra band | point at (rhoU+rhoP)/2 | PENUMBRA at ~50% linear obscuration; monotone toward umbra | match | exact |
| umbra-vs-cylinder | point at perp 0.5r < rhoU | UMBRA (deep inside cone) | match | exact |
| orbit scan vs analytic cone root | psi_e = asin(R/(a*sqrt(1+k^2))) - atan(k), k=(Rs-R)/d; fraction = psi_e/pi | 360-step sun-plane scan matches | match | ~5e-3 (grid) |
| cylindrical textbook ref | asin(R/a)/pi | within 0.5 pp of cone scan at LEO | match | <0.005 |
| polar-at-equinox | plane normal along sun | 0 eclipse over all 360 samples | match | exact |
| GEO < LEO | umbra fraction 6771 vs 42165 km | shorter GEO band, > 0.3 h sanity | match | - |
| degenerate inputs | a <= R, zero-length normal | throw RangeError | throws | - |
