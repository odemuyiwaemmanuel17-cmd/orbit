# Orbital Mechanics Notes (OrbitalPulse)

## TLE — Two-Line Element sets
A TLE encodes mean orbital elements fitted to the **SGP4** perturbation model
by NORAD. Line 1 carries the catalog number, international designator, epoch
(YY + day-of-year fraction), drag term `B*`, and mean-motion derivatives.
Line 2 carries inclination, RAAN (Ω), eccentricity, argument of perigee (ω),
mean anomaly (M), and mean motion (rev/day). TLEs are only meaningful with
SGP4 + WGS-72 constants — they are not generic Keplerian elements.

## SGP4
SGP4 propagates the mean elements forward in time including J2–J4 zonal
harmonics, drag (via B*), and resonance terms. Input: TLE + UTC time.
Output: position/velocity in **TEME** (True Equator, Mean Equinox), km and
km/s. Accuracy: a few km for LEO within ~1–2 days of epoch; it degrades as
the TLE ages — which is why the catalog is refreshed from CelesTrak.

## Coordinate frames used here
| Frame | Definition | Where |
|---|---|---|
| TEME | true equator, mean equinox — native SGP4 output | `propagate()` results |
| PEF/ECEF-like | Earth-fixed; obtained by rotating TEME by GMST | geodetic conversion |
| Geodetic | lat/lon (spherical approx.) + height | HUD, ground track |
| Scene | unit sphere, y-up; radius compressed: `1 + 0.26·log10(1+alt/90)` | 3D rendering |

⚠ Scene radii are **compressed for visualization**; angles (lat/lon) are
physically faithful, distances are not to scale. Telemetry always reports
true km from SGP4, never scene units.

## GMST & sub-satellite point
θ_GMST = 280.46061837° + 360.98564736629°·d (IAU-82 expression). Rotating the
TEME position by −GMST gives an Earth-fixed vector whose spherical angles are
the sub-satellite latitude/longitude. (We use a spherical Earth; WGS-84
geodetic latitude differs by up to ~0.2°.)

## Ground track
Sampling (lat, lon) over time traces the ground track. Crossing ±180° must
split the polyline into segments, otherwise a straight line is drawn across
the whole globe — the classic antimeridian artifact. (M6 in the roadmap.)

## Coverage geometry
For altitude h, the horizon half-angle seen from the satellite satisfies
cos θ = R⊕/(R⊕+h). The instantaneous footprint is a spherical cap of ground
radius R⊕·θ centered on the sub-satellite point; the tangent cone from the
satellite to that circle is the line-of-sight frustum rendered in the scene.
Slant range to the horizon: √((R⊕+h)² − R⊕²). A minimum-elevation mask (e.g.
10°) shrinks the cap: cos c = (R⊕/(R⊕+h))·cos(el) − … (planned for M11).

## Pass prediction
For observer position O and satellite ECEF vector S: elevation
el = asin( (S−O)·û / |S−O| ) with û the observer's up unit vector; azimuth is
the clockwise-from-north angle of the horizontal component. A pass is a
contiguous interval where el ≥ mask; rise/set are the interval endpoints and
max elevation its extremum.

## Conjunction screening
Pairwise minimum distance over a time window: coarse uniform sampling finds
the basin, ternary search refines the minimum (distance is unimodal near a
close approach). Separations below ~1 km indicate docked or duplicate
catalog entries, not collision threats, and are filtered out.

## Space weather & drag
The Kp index proxies geomagnetic activity; polar heating expands the
thermosphere, raising density at LEO altitudes (our model:
`ρ/ρ₀ ≈ 1 + 0.16·max(0, Kp−2)^1.75`) and accelerating orbital decay.


---

## Orbital Elements Lab math (Milestone 1, 2026-10-06)

Service: `frontend/src/lib/kepler.js` (pure, unit-tested). Constants:
`frontend/src/lib/constants.js`.

1. **Conic**: r(nu) = a(1-e^2)/(1 + e*cos nu); periapsis a(1-e), apoapsis a(1+e).
2. **Perifocal -> ECI** (Vallado Alg. 4): r_PQW = [r cos nu, r sin nu, 0],
   v_PQW = sqrt(mu/p)*[-sin nu, e+cos nu, 0], rotated by R3(Omega)R1(i)R3(omega).
3. **Kepler's equation** M = E - e*sinE solved by bracketed Newton
   (monotone for e<1, |f|<1e-13); M->nu via half-angle atan2 identities.
4. **Period/energy**: T = 2*pi*sqrt(a^3/mu); eps = -mu/2a; h = sqrt(mu*p);
   vis-viva v = sqrt(mu(2/r - 1/a)).
5. **J2 secular** (first-order, averaged): RAANdot = -3/2*J2*(Re/p)^2*n*cos i.
   SSO inclination solves RAANdot = +360 deg/tropical year.
6. **Scene projection**: ECI -> (lat, lon at GMST, alt) -> geodeticToScene -
   the identical contract used by real SGP4 satellites, so lab orbits and
   live satellites share one frame. Earth rotates under the inertial ellipse.


## Maneuver mechanics (M2)

Service: `frontend/src/lib/maneuver.js` (imports kepler.js only).

1. **Impulsive burn**: position continuous, velocity jumps by dV·d̂.
   Directions use the RSW/velocity basis in ECI: T = v̂ (prograde),
   R = r̂ (radial out), N = ĥ (out-of-plane); negatives for the other
   three. Note RSW r̂ equals the true radial, which coincides with the
   local-horizontal normal only for circular orbits - stated, not hidden.
2. **New orbit** = stateToElements of (r, v'). Exact identities used as
   tests: tangential prograde burn => burn point is new perigee;
   retrograde => new apogee; out-of-plane => Δi = atan(dV/v) + O(dV²).
3. **Honesty model**: predicted orbit is analytic two-body from the
   post-burn state at the frozen burn epoch; live SGP4 state of the real
   satellite is never mutated (working copy in the UI layer only).


## Hohmann transfer (M3)

Service: `frontend/src/lib/hohmann.js`.

a_t = (r1 + r2)/2; e_t = (r2 - r1)/(r2 + r1); burns from vis-viva on the
transfer ellipse: dV1 = v_t(r1) - v_c(r1), dV2 = v_c(r2) - v_t(r2) (signed;
inward transfers get both-negative retrograde pairs via perigee re-indexing,
argPerigee flips 0/180 so the LOW apsis always sits at the lower radius).
Coast = T_t/2 = pi*sqrt(a_t^3/mu). Animation phase: mean anomaly from the
sim clock -> true anomaly via the validated Kepler solver; the return half
is labeled DISPLAY LOOP (a real mission circularizes at apogee).
Assumptions: impulsive, coplanar, circular endpoints; Earth-oblate and
plane-change costs excluded (M4/M5 model those).


## Rocket equation (M4)

Service: `frontend/src/lib/rocket.js`. g0 = 9.80665 m/s^2 from constants.js.

- dV_avail = Isp * g0 * ln((m_dry + m_prop)/m_dry)   [Tsiolkovsky]
- m_prop(required) = m_dry * (exp(dV_req/(Isp g0)) - 1)
- Budget: dV_req = SUM(mission events). Preset LEO->GEO pulls its transfer
  numbers from the validated hohmann.js service (engine reuse, not typed-in
  constants). Feasibility compares required vs available with exact margin
  and propellant shortfall.
- Not modeled (labeled): gravity + drag losses, staging, tank residuals,
  thrust profile (impulsive assumption inherited from M2/M3).


## Plane change (M5)

Service: `frontend/src/lib/planechange.js`. Builds on kepler.js
(circularVelocityKmS) and hohmann.js (transfer apogee/target speeds) — no
duplicated orbital math.

- Pure inclination change at speed v (|v| unchanged, vectors di apart),
  executed exactly on the node line, impulsive, two-body:
      dV = 2 v sin(di/2)
  Endpoints are sanity anchors: di = 0 -> 0; di = 180 deg -> 2v (a full
  flip is the largest plane change and costs twice the speed).
- The cost scales with orbital speed, so the same di is far cheaper at GEO
  than in LEO (30 deg: ~3.97 km/s at 400 km vs ~1.59 km/s at GEO).
  Missions therefore change planes high, or combine.
- Combined circularize + plane change at transfer apogee (velocity
  triangle, law of cosines), using the validated Hohmann apogee speed:
      dV = sqrt(v_a^2 + v_c^2 - 2 v_a v_c cos(di))
  always <= separate plane-change-then-circularize (saving shown in UI;
  proven per-triangle in tests, incl. di = 0 reducing to plain dv2).
- Not modeled (labeled): finite-thrust arcs, low-thrust spiral plane
  changes, J2 RAAN drift during the climb (M17 models J2), non-circular
  endpoint pairs other than the two-midpoint transfer.


## Ground stations & look angles (M6)

Service: `frontend/src/lib/stations.js` — pure, THREE-free, storage-agnostic
(the ground-network state domain lives beside, not inside, the engine).

- Station = {latDeg, lonDeg, elevKm, minElevDeg}. Anchor catalogue uses
  published coordinates of real DSN/Estrack/KSAT sites; site elevations are
  approximate and labeled as such — never presented as surveyed values.
- Spherical-elevation topocentric geometry (mean Earth R = 6371 km):
      S = (R + h_sta)·û(lat,lon)   K = (R + h_sat)·û(lat,lon)
      d = K − S,  cos ζ = (S·d)/(|S||d|),  elev = 90° − ζ
  closed form (used as an independent test cross-check):
      tan(elev) = (r_k cos γ − r_s) / (r_k sin γ)
  slant range = |d| — this is what M10's link budget will consume.
- Horizon identity: elev = 0 exactly when cos γ = r_s/r_k (geometric
  horizon half-angle for a satellite shell). One subtle, verified fact:
  for a satellite at FIXED altitude, a higher station sees a SMALLER
  above-horizon cap and lower elevations at the same geocentric angle —
  the "climb the mast to see farther" intuition belongs to the Earth's
  surface horizon, not to a concentric satellite shell.
- Honest approximation label (UI badge SPHERICAL EARTH): satellite.js
  returns WGS84 geodetic coordinates; using them on a sphere introduces the
  classic geodetic/parametric latitude tilt (~0.2° near LEO horizons).
- Live-elevation card propagates the watched satellite through the ISS
  reference pipeline (TLE -> SGP4 -> eciToGeodetic), no duplicated orbital
  logic. minElevDeg mask verdicts feed M7 pass prediction and M8 LOS.


## Pass scheduling (M7)

Layer: `frontend/src/lib/passes.js` — a scheduling/merge layer only.
Propagation + look angles stay in the validated reference pipeline
(analysis.predictPassesClient, which mirrors backend predict_passes).

- Pass definition: maximal interval where elev(t) >= station.minElevDeg.
  Reported as AOS (rise), TCA (grid argmax elevation, with azimuth there),
  LOS (set), duration arc.
- Resolution trade, disclosed in UI: the search walks the sky on a stepS
  grid (30/60 s), so AOS/LOS/TCA times carry up to ±stepS discretization;
  no sub-grid refinement is claimed. Cap: 20 passes per station per window
  (backend parity; the UI says when a station hits it).
- M7 parity fix (contract-first): the client mirror dropped a pass still
  open at the window end while backend/analysis.py closes it at the last
  visible sample; it also could emit single-sample windows without a LOS.
  Both aligned to the backend's bracketing semantics (analysis.js).
  Tracker behavior only gains previously-dropped edge passes — no other
  numeric change.
- Station elevations (km) are ignored in the pass search (observer at the
  mean sphere surface) — sub-0.2° effect for real sites, consistent with
  the backend mirror; M6's lookAngleKm (which honors station elevation)
  remains the on-demand topocentric view.


## Line-of-sight footprints (M8)

Layer: `frontend/src/lib/los.js` — geometry only, on top of M6 look angles.

- Visibility cap (spherical Earth): the set of surface points seeing a
  satellite at radius r_k with elevation >= e is a circle centered on the
  sub-satellite point with angular radius
      gamma(e) = acos( (R⊕/r_k) cos e ) − e
  from tan(elev) = (r_k cos g − R⊕)/(r_k sin g) via the auxiliary-angle
  identity cos(g + e) = (R⊕/r_k) cos e. gamma(0) is exactly the M6 horizon
  identity — locked by test rather than re-derived twice.
- Three-state verdict per station: LINK (elev >= mask), LOS (0 <= elev <
  mask), BLOCKED (elev < 0, Earth between). Elevation comes from the single
  M6 lookAngleKm function — one geometry everywhere.
- Boundary ring: constant-angular-radius circle by spherical trig
  (asin/atan2 form), closed polygon, vertices verified on the great-circle
  distance in tests.
- Scene honesty: beams and the ring are drawn in the compressed-radius
  scene (angles faithful, radius logarithmic); the UI states that computed
  elevation, not apparent intersection on the compressed globe, decides
  LINK/BLOCKED. Live cost: 97 projected points per frame at 10 Hz — trivial,
  so no quantization was introduced.


## One-orbit coverage vs min-elevation (M9)

Layer: `frontend/src/lib/coverage.js` — analytic MODEL track (two-body
Kepler from kepler.js, sidereal rotation from satellite.js gstime, M8 cap
gamma(e), M6 look angles). The live tracker/SGP4 path remains the real
prediction source; the page badges ANALYTICAL MODEL.

- Ground track: for uniform time samples over one period,
  M = M0 + n t -> nu (M1 Kepler solver) -> ECI (Vallado Alg 4) ->
  sub-satellite (lat = asin z/r, lon = atan2 - gstime(t), wrapped).
  Verified: GEO pinned to < 0.3 deg (the true 0.16 deg/period difference
  between the mu-derived period at 42157 km and the sidereal day is a
  FEATURE the test documents, not noise), and equatorial LEO drifts west by
  exactly omega_E * T = -23.2 deg per period.
- Station visibility: count of samples with elev >= mask / sample count;
  pass runs require >= 2 samples (M7 parity). Bounds proven in tests
  (equatorial 400 km orbit is geometrically invisible from lat 60).
- Area coverage: cos(lat)-weighted equal-lat/lon grid; a cell counts as
  covered when its dot product with a sub-satellite unit vector reaches
  cos(gamma(alt, mask)) — one acos per sample, none per cell. Weighting
  removes the naive pole overweight; residual O(step^2) discretization is
  disclosed and cross-checked against the exact cap fraction
  (1 - cos gamma)/2 within 0.015 at 10 deg for the 81-deg GEO cap.
- Coverage scrub: first-cover timestamps make the union grow monotonically
  over the orbit (tested), rendered as point clouds + live cap ring.


## Communication link budget (M10)

Service: `frontend/src/lib/linkbudget.js`. Noise constants live in
constants.js (k exact since the 2019 SI redefinition; 290 K is the ITU-R
reference noise temperature), not inline in formulas.

- Geometry: spherical slant range as the positive root of
  rk^2 = rs^2 + rho^2 + 2 rs rho sin(e)  =>
  rho = -rs sin e + sqrt(rs^2 sin^2 e + rk^2 - rs^2).
  e = 90 gives the altitude, e = 0 the tangent length (both pinned).
  Worst-case live mode = current SGP4 altitude at the station mask angle.
- Chain (all dB): EIRP = Ptx + Gtx; FSPL = 32.44 + 20log10(d_km) +
  20log10(f_MHz); Prx = EIRP - FSPL - L_atm - L_point - L_misc + Grx;
  C/N0 = Prx - kT(290K) - NF  (dB-Hz);  Eb/N0 = C/N0 - 10log10(Rb) - L_impl;
  margin = Eb/N0 - (Eb/N0)_required. Max bitrate = zero-margin fixed point.
- Receiver dual-model identity: the NF path and the G/T path agree exactly
  when G/T = Grx - 10log10(290 * 10^(NF/10)) (same physical receiver, two
  datasheet dialects) — locked by test to 1e-9 dB.
- Labeled simplifications (UI states them): lumped losses, not a propagation
  study; MODULATION_REFERENCE Eb/N0 values are textbook typicals (BPSK/QPSK
  uncoded BER 1e-5, CCSDS r=1/2) — EDUCATIONAL, not vendor curves; no
  polarization or rain-model detail (single atmos knob); receiver desense,
  interference and Doppler-free link (frequency enters only via FSPL).
- channelCapacityBps gives the AWGN reference C = B log2(1 + C/N0·B⁻¹) for
  context, separate from the required-margin verdict.


## Attitude frames (M11)

Service: `frontend/src/lib/attitude.js` — frame geometry only (attitude
DYNAMICS belong to M12). Built on the validated SGP4 state, no new physics.

- LVLH/RWFS basis by Gram-Schmidt from ECI r, v:
      ẑ = −r̂ (nadir),  x̂ = normalize(v − (v·r̂)r̂) (along-track),  ŷ = ẑ×x̂
  For prograde orbits ŷ = −ĥ (classic Hill frame); x̂·v > 0 and a right-handed
  x̂×ŷ=ẑ are verified as DEFINITIONS on real inclined states, and radial-only
  velocity throws rather than inventing an axis.
- Body attitude: intrinsic Z-Y-X (yaw ψ about nadir z, pitch θ about y,
  roll φ about x): R = Rz(ψ)Ry(θ)Rx(φ) maps body coords -> LVLH coords, so
  body axis i = Σ_j R[j][i]·LVLH_j (columns of R weight the basis — pinned
  by an independent transcription). Boresight nadir angle = acos(ẑ_b·ẑ).
- The teaching identity (tested analytically): a body FROZEN in ECI sees the
  LVLH z-axis drift away at exactly the swept true anomaly — for a circular
  orbit angle = n·t (0.05..0.3 period checks match Δν to 1e-6°). Nadir
  pointing is therefore continuous rotation at the orbit rate, shown live
  by the page's INERTIAL HOLD.
- Numeric honesty: acos roundoff near |d| = 1 gives ~1e-6° jitter at double
  precision; tests assert against that floor explicitly, not false 1e-12.
- Not modeled here (labeled): torques, wheel speeds, desat, sun/moon
  pointing (M12-M13). Scene axes reuse eciToSceneKm/GMST contract.
  Wheel dynamics (M12) are documented in docs/SPACECRAFT_DYNAMICS.md.
