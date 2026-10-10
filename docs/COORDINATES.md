# OrbitalPulse Coordinate Frames (V3 step 3)

Every transform below is exercised by `frontend/tests/coordinates.test.js`
and `frontend/tests/earthTexture.test.js`. Tolerances and units are stated
per contract.

## 1. Propagator output — TEME

- `satellite.js` SGP4 (`sm.twoline2satrec` → `sm.propagate(rec, date)`)
  returns position **km** and velocity **km/s** in the **TEME** frame
  (True Equator Mean Equinox — the frame CelesTrak TLEs are fit in).
  The app treats TEME as ECI for display, matching the sgp4/celestrak
  convention; the difference vs GCRS is sub-arcsecond and not modeled.
- `sm.gstime(date)` gives the GMST (rad) that pairs with this TEME variant
  (TEME→Pseudo-ECEF), used for ALL Earth-fixed conversions.

## 2. Earth-fixed / geodetic

- `sm.eciToGeodetic(p, gmst)` → geodetic lat/lon (WGS84 ellipsoid,
  satellite.js implementation) + height above the ellipsoid, km.
- The INVERSE used by labs and the shadow helper is
  `sm.ecfToEci(sm.geodeticToEcf({lat, lon, h}), gmst)`
  (`lib/eclipse.js::geodeticEciKm`) — never a hand-rolled rotation.
  Round-trip through `eciToGeodetic` matches to <1e-6° / <1e-3 km.

## 3. Render scene frame (Earth-fixed, compressed radius)

- `coords.js::geodeticToScene(lat, lon, altKm)`:
  x = r·cosφ·cosλ, y = r·sinφ, z = r·cosφ·sinλ with
  r = `altToRadius(altKm)` = 1 + 0.26·log10(1 + alt/90).
  Latitude here is **geodetic** (the tracker's convention).
- `coords.js::eciToSceneKm(x, y, z, gmst)` maps ECI km through
  `eciToGeodetic` into the same scene convention, so lab orbits
  (two-body, ECI) and real satellites (SGP4) never disagree visually.
- **V3 bug found & fixed:** the previous `eciToSceneKm` used
  `asin(z/r)` — GEocentric latitude — placing mid-latitude points up to
  ~0.2° (≈0.003 scene units, ~20 km ground equivalent) away from the
  tracker's GEodetic placement. Both paths now agree to <1e-9 scene
  units (coordinates.test.js, 4 cases incl. GEO + high-inclination).
- Radial compression is RENDER-ONLY and clearly separated: km quantities
  (altitude, slant range, footprint radius) always come from the physics
  libs, never from scene geometry.
- Globe mesh orientation: three SphereGeometry maps texture u to scene
  lon as λ = 180° − 360u; the pinned flip (repeat.x=−1, offset.x=1)
  aligns imagery with `geodeticToScene` (earthTexture.test.js). Earth
  NEVER self-rotates outside the coordinate math.

## 4. Sun / shadow direction

- `lib/sun.js` — Meeus low-precision: RA/Dec → ECI unit
  `[cosδcosα, cosδsinα, sinδ]` (TEME-consistent), and `subsolarLonDeg =
  RA − GMST`. Output pinned byte-identical to the pre-M13 primitive at
  three dates (eclipse.test.js).
- Scene sun vector = `geodeticToScene(dec, subsolarLon, 0)` — illumination,
  terminator, eclipse analysis and the key light all read this one vector
  at `engine.simMs`.

## 5. HUD field frame definitions (displayed in tooltips)

| Quantity | Frame / convention |
|---|---|
| Latitude, Longitude | WGS84 geodetic via satellite.js at the SIM epoch |
| Altitude | height above ellipsoid, km |
| Velocity | TEME ECI magnitude, km/s (inertial, not ground-relative) |
| Ground track | Earth-fixed samples, −45 min → +1 period |
| Sunlight | umbra/penumbra cone model at SIM epoch (M13) |
| SGP4 states | osculating (short-period terms included; velocity may differ from mean-circular by ~0.01 km/s — envelope asserted in tests) |

## 6. Kepler teaching model vs SGP4 — deliberate separation

`lib/kepler.js` is a two-body J2-optional analytic model for the labs;
it shares `eciToSceneKm`/GMST with the tracker but never feeds real
satellite states, and SGP4 never feeds teaching curves. Both render paths
are equal by construction (same inverse transform) — see §3.
