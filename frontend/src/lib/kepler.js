/**
 * OrbitalPulse — analytic two-body Kepler mechanics service.
 *
 * Pure module (no THREE, no satellite.js): every DESIGN/ANALYZE milestone
 * builds on these functions, and they are unit-tested against analytical
 * references (see frontend/tests + docs/VALIDATION.md).
 *
 * Frames: positions/velocities are true-of-date TLE-consistent ECI (TEME-ish
 * inertial km / km/s — same convention family as the SGP4 pipeline, so lab
 * orbits and real sats can share the scene projection). Angles in the API
 * are DEGREES with explicit *Deg suffixes; internals convert once.
 *
 * Model fidelity: ANALYTICAL MODEL — two-body point-mass gravity. No J2,
 * drag, third bodies (see j2NodalPrecessionRadS for the one perturbation
 * offered analytically, with its own validity limits).
 */
import { MU_EARTH_KM3S2 as MU, R_EARTH_EQUATORIAL_KM as RE, J2_EARTH, RAD_PER_DEG, DEG_PER_RAD } from './constants.js'

/** Conic radius from center of attraction: r = a(1-e^2)/(1+e cos nu). */
export function conicRadiusKm(aKm, e, trueAnomalyDeg) {
  const p = aKm * (1 - e * e)
  return p / (1 + e * Math.cos(trueAnomalyDeg * RAD_PER_DEG))
}

export function periapsisRadiusKm(aKm, e) { return aKm * (1 - e) }
export function apoapsisRadiusKm(aKm, e) { return aKm * (1 + e) }
export function periodSec(aKm) { return 2 * Math.PI * Math.sqrt(aKm ** 3 / MU) }
export function meanMotionRadS(aKm) { return Math.sqrt(MU / aKm ** 3) }
export function circularVelocityKmS(rKm) { return Math.sqrt(MU / rKm) }
export function escapeVelocityKmS(rKm) { return Math.sqrt(2 * MU / rKm) }
/** Vis-viva: |v| at radius r for the given ellipse. */
export function velocityKmS(aKm, e, rKm) {
  return Math.sqrt(MU * (2 / rKm - 1 / aKm))
}
export function specificMechanicalEnergyKm2S2(aKm) { return -MU / (2 * aKm) }
export function angularMomentumKm2S(aKm, e) {
  return Math.sqrt(MU * aKm * (1 - e * e))
}

/**
 * Kepler's equation M = E - e sin E. Bracketed Newton-Raphson with
 * bisection fallback: f'(E) >= 1 - e > 0 for elliptic motion, so the method
 * is provably convergent for any e < 1. Convergence |f| < 1e-13, max 60
 * iterations. M is reduced to (-pi, pi] internally and the caller's turn
 * offset is restored.
 */
export function solveKeplerEquationRad(meanAnomalyRad, e) {
  const twoPi = 2 * Math.PI
  let Mw = meanAnomalyRad % twoPi
  if (Mw > Math.PI) Mw -= twoPi
  if (Mw < -Math.PI) Mw += twoPi
  const wraps = (meanAnomalyRad - Mw) / twoPi // integer turn offset to restore
  // f(E) = E - e sin E - Mw is strictly increasing for e < 1 (f' >= 1 - e),
  // so a bracketed Newton with bisection fallback converges for ALL e < 1.
  let lo = Mw - e - 1
  let hi = Mw + e + 1
  let E = Mw + 0.85 * e * Math.sign(Mw || 1) // Danby-style starter
  if (!(E > lo && E < hi)) E = Mw
  for (let k = 0; k < 60; k += 1) {
    const f = E - e * Math.sin(E) - Mw
    if (Math.abs(f) < 1e-13) break
    if (f > 0) hi = E
    else lo = E
    const next = E - f / (1 - e * Math.cos(E))
    E = (next > lo && next < hi) ? next : (lo + hi) / 2
  }
  return E + wraps * twoPi
}

/** True anomaly from mean anomaly (rad -> rad). */
export function meanToTrueAnomalyRad(meanAnomalyRad, e) {
  const E = solveKeplerEquationRad(meanAnomalyRad, e)
  return trueFromEccentricAnomalyRad(E, e)
}

export function trueFromEccentricAnomalyRad(E, e) {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2),
                        Math.sqrt(1 - e) * Math.cos(E / 2))
}

export function eccentricFromTrueAnomalyRad(nuRad, e) {
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nuRad / 2),
                        Math.sqrt(1 + e) * Math.cos(nuRad / 2))
}

/**
 * Classical elements (a_km, e, i/RAAN/argPerigee/trueAnomaly in DEG) ->
 * ECI state. Perifocal-frame construction rotated by R3(Omega) R1(i) R3(omega)
 * (Vallado Algorithm 4 forward path).
 */
export function elementsToStateKm(el) {
  const { aKm, e, iDeg, raanDeg, argPerigeeDeg, trueAnomalyDeg } = el
  const nu = trueAnomalyDeg * RAD_PER_DEG
  const i = iDeg * RAD_PER_DEG
  const Om = raanDeg * RAD_PER_DEG
  const w = argPerigeeDeg * RAD_PER_DEG
  const p = aKm * (1 - e * e)
  const r = p / (1 + e * Math.cos(nu))
  // Perifocal (PQW)
  const rPQW = [r * Math.cos(nu), r * Math.sin(nu), 0]
  const vPQW = [-Math.sin(nu), e + Math.cos(nu), 0].map((c) => c * Math.sqrt(MU / p))
  const cO = Math.cos(Om), sO = Math.sin(Om)
  const ci = Math.cos(i), si = Math.sin(i)
  const cw = Math.cos(w), sw = Math.sin(w)
  // Combined rotation matrix elements (standard Q = R3(-Om)R1(-i)R3(-w) from PQW to IJK)
  const q = [
    [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
    [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
    [sw * si, cw * si, ci],
  ]
  const mul = (row) => row[0] * rPQW[0] + row[1] * rPQW[1] + row[2] * rPQW[2]
  const mulv = (row) => row[0] * vPQW[0] + row[1] * vPQW[1] + row[2] * vPQW[2]
  return {
    posKm: { x: mul(q[0]), y: mul(q[1]), z: mul(q[2]) },
    velKmS: { x: mulv(q[0]), y: mulv(q[1]), z: mulv(q[2]) },
    rKm: r,
    vKmS: Math.hypot(...vPQW),
  }
}

/**
 * ECI state -> classical elements (Vallado Algorithm 4 inverse path).
 * Reports degeneracy honestly instead of inventing angles:
 *  - equatorialOrbit: RAAN undefined (reported 0, flag set)
 *  - circularOrbit: argPerigee/trueAnomaly undefined (argLat reported)
 */
export function stateToElementsKm({ posKm, velKmS }) {
  const r = [posKm.x, posKm.y, posKm.z]
  const v = [velKmS.x, velKmS.y, velKmS.z]
  const rMag = Math.hypot(...r)
  const vMag = Math.hypot(...v)
  const h = [
    r[1] * v[2] - r[2] * v[1],
    r[2] * v[0] - r[0] * v[2],
    r[0] * v[1] - r[1] * v[0],
  ]
  const hMag = Math.hypot(...h)
  const n = [-h[1], h[0], 0] // z x h  (node vector)
  const nMag = Math.hypot(...n)
  const energy = vMag ** 2 / 2 - MU / rMag
  const aKm = -MU / (2 * energy)
  const eVec = r.map((ri, k) => ((vMag ** 2 - MU / rMag) * ri - (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) * v[k]) / MU)
  const e = Math.hypot(...eVec)
  const iDeg = Math.acos(h[2] / hMag) * DEG_PER_RAD
  const equatorialOrbit = nMag < 1e-9
  const raanDeg = equatorialOrbit ? 0 : normDeg360(Math.atan2(n[1], n[0]) * DEG_PER_RAD)
  const circularOrbit = e < 1e-9
  let argPerigeeDeg = 0
  let trueAnomalyDeg = 0
  if (!equatorialOrbit && !circularOrbit) {
    argPerigeeDeg = Math.acos((n[0] * eVec[0] + n[1] * eVec[1] + n[2] * eVec[2]) / (nMag * e)) * DEG_PER_RAD
    if (eVec[2] < 0) argPerigeeDeg = 360 - argPerigeeDeg
    trueAnomalyDeg = Math.acos((eVec[0] * r[0] + eVec[1] * r[1] + eVec[2] * r[2]) / (e * rMag)) * DEG_PER_RAD
    // nu in (180,360) <=> sin(nu) < 0 <=> h . (r x e) > 0  (since r x e = -|..| sin(nu) h-hat)
    const crossRe = [r[1] * eVec[2] - r[2] * eVec[1], r[2] * eVec[0] - r[0] * eVec[2], r[0] * eVec[1] - r[1] * eVec[0]]
    if (h[0] * crossRe[0] + h[1] * crossRe[1] + h[2] * crossRe[2] > 0) trueAnomalyDeg = 360 - trueAnomalyDeg
  } else if (!equatorialOrbit && circularOrbit) {
    argPerigeeDeg = Math.acos((n[0] * r[0] + n[1] * r[1]) / (nMag * rMag)) * DEG_PER_RAD
    if (r[2] < 0) argPerigeeDeg = 360 - argPerigeeDeg
  }
  return { aKm, e, iDeg, raanDeg, argPerigeeDeg, trueAnomalyDeg,
           equatorialOrbit, circularOrbit, hMagKm2S: hMag,
           eccentricityVectorKm: eVec, energyKm2S2: energy }
}

const normDeg360 = (deg) => ((deg % 360) + 360) % 360

/**
 * First-order J2 secular nodal regression (Vallado Eq. 9-24 averaged form):
 *   RAANdot = -3/2 * J2 * (Re/p)^2 * n * cos(i)   [rad/s]
 * Validity: near-circular LEO/MEO averaging; NOT a substitute for numerical
 * propagation over long arcs. Negative = westward for prograde orbits.
 */
export function j2NodalPrecessionRadS(aKm, e, iDeg) {
  const p = aKm * (1 - e * e)
  const n = meanMotionRadS(aKm)
  return -1.5 * J2_EARTH * (RE / p) ** 2 * n * Math.cos(iDeg * RAD_PER_DEG)
}

export function j2NodalPrecessionDegDay(aKm, e, iDeg) {
  return j2NodalPrecessionRadS(aKm, e, iDeg) * DEG_PER_RAD * 86400
}

/**
 * Inclination (deg) whose J2 nodal precession equals +360 deg/tropical year
 * (Sun-synchronous): solve cos(i) = precessionTarget / (-1.5 J2 (Re/p)^2 n).
 * Returns null when a is outside physical range for SSO (|cos i| > 1).
 */
export function sunSyncInclinationDeg(aKm) {
  const target = 2 * Math.PI / (365.2421897 * 86400) // rad/s, eastward
  const p = aKm * (1 - 0)
  const n = meanMotionRadS(aKm)
  const cosI = target / (-1.5 * J2_EARTH * (RE / p) ** 2 * n)
  if (Math.abs(cosI) > 1) return null
  return Math.acos(cosI) * DEG_PER_RAD
}

/**
 * Inertial ECI polyline over the full ellipse (sampled in ECCENTRIC anomaly
 * so point spacing is uniform in arc terms of Kepler geometry).
 * Returns flat [x,y,z,...] km array of length (samples+1)*3.
 */
export function orbitPolylineKm(el, samples = 128) {
  const out = new Float64Array((samples + 1) * 3)
  for (let k = 0; k <= samples; k += 1) {
    const E = (k / samples) * 2 * Math.PI
    const nu = trueFromEccentricAnomalyRad(E, el.e) * DEG_PER_RAD
    const s = elementsToStateKm({ ...el, trueAnomalyDeg: nu })
    out[k * 3] = s.posKm.x
    out[k * 3 + 1] = s.posKm.y
    out[k * 3 + 2] = s.posKm.z
  }
  return out
}

/**
 * Geometry markers for the lab: ECI km positions of perigee, apogee and the
 * two equator-crossing nodes, with degeneracy flags (never fake an undefined
 * angle: equatorial orbits have no nodes; circular ones have no apsides).
 */
export function orbitMarkersKm(el) {
  const at = (nuDeg) => elementsToStateKm({ ...el, trueAnomalyDeg: nuDeg }).posKm
  // Orbit-plane node crossings: ascending at argument of latitude u=0,
  // descending at u=180, so nu = u - argPerigee (normalized).
  const nuAsc = normDeg360(-el.argPerigeeDeg)
  const nuDesc = normDeg360(180 - el.argPerigeeDeg)
  const out = {
    perigeeKm: el.e > 1e-4 ? at(0) : null,
    apogeeKm: el.e > 1e-4 ? at(180) : null,
    ascendingNodeKm: el.iDeg > 1e-4 && el.iDeg < 179.999 ? at(nuAsc) : null,
    descendingNodeKm: el.iDeg > 1e-4 && el.iDeg < 179.999 ? at(nuDesc) : null,
    nuAscDeg: nuAsc,
    nuDescDeg: nuDesc,
  }
  return out
}
