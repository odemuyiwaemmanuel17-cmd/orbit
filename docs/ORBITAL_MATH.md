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
