/**
 * OrbitalPulse — first-order J2 secular perturbation (M17).
 *
 * Equations are the classical averaged (Brouwer/Kozai) secular set as
 * documented verbatim in SatelliteToolbox.jl's J2 propagator (matching
 * Vallado Fundamentals of ASTRODYNAMICS ch. 9):
 *   p   = a(1−e²)
 *   n̄   = n·[1 + (3/4)·J2·(Re/p)²·√(1−e²)·(2 − 3sin²i)]     (mean motion)
 *   Ω̇   = −(3/2)·J2·(Re/p)²·n̄·cos i                        (nodal regression)
 *   ω̇   = +(3/4)·J2·(Re/p)²·n̄·(4 − 5sin²i)                 (apsidal rotation)
 *   M(t)= M0 + n̄·t
 *
 * SIMPLIFIED, disclosed in the UI: secular-only (short-period sinusoids
 * omitted), and here n̄ multiplies the rates as the reference formula does
 * while the pre-validated kepler.j2NodalPrecessionDegDay uses n0 — the
 * difference is second-order in J2 (<0.1% of the drift). No J3+, no third
 * body, no drag. Long-arc products are ANALYTICAL MODEL, not ephemeris.
 */
import { R_EARTH_EQUATORIAL_KM as RE, J2_EARTH, RAD_PER_DEG, DEG_PER_RAD } from './constants.js'
import {
  meanMotionRadS, j2NodalPrecessionDegDay,
  eccentricFromTrueAnomalyRad, meanToTrueAnomalyRad,
} from './kepler.js'

const sin2 = (deg) => Math.sin(deg * RAD_PER_DEG) ** 2

/** Perturbed mean motion n̄ [rad/s] and Keplerian n [rad/s]. */
export function j2MeanMotionRadS({ aKm, e, iDeg }) {
  if (!(aKm > RE) ) throw new RangeError('aKm must exceed Earth equatorial radius')
  if (!(e >= 0 && e < 1)) throw new RangeError('e must be in [0,1)')
  if (!Number.isFinite(iDeg)) throw new TypeError('iDeg must be finite')
  const p = aKm * (1 - e * e)
  const n = meanMotionRadS(aKm)
  const k = 0.75 * J2_EARTH * (RE / p) ** 2 * Math.sqrt(1 - e * e)
  return { nRadS: n, nBarRadS: n * (1 + k * (2 - 3 * sin2(iDeg))), kJ2: k }
}

/**
 * All first-order secular rates, degrees/day. raan delegates the n0-form
 * to the pre-validated kepler function for the displayed cross-check.
 */
export function j2SecularRatesDegDay({ aKm, e, iDeg }) {
  const { nBarRadS } = j2MeanMotionRadS({ aKm, e, iDeg })
  const p = aKm * (1 - e * e)
  const q = (RE / p) ** 2
  return {
    raanDegDay: -(3 / 2) * J2_EARTH * q * nBarRadS * Math.cos(iDeg * RAD_PER_DEG) * 86400 * DEG_PER_RAD,
    argPerigeeDegDay: (3 / 4) * J2_EARTH * q * nBarRadS * (4 - 5 * sin2(iDeg)) * 86400 * DEG_PER_RAD,
    meanMotionDeltaDegDay: (nBarRadS - meanMotionRadS(aKm)) * 86400 * DEG_PER_RAD,
    raanKeplerFormDegDay: j2NodalPrecessionDegDay(aKm, e, iDeg),
  }
}

const wrap360 = (d) => ((d % 360) + 360) % 360

/**
 * Secular J2 propagation of mean elements over dtSec (linear drift of
 * Ω and ω; phase swept by the PERTURBED mean motion n̄ through the Kepler
 * equation, since the lab tracks true anomaly).
 */
export function propagateJ2SecularKm(el, dtSec) {
  if (!Number.isFinite(dtSec)) throw new TypeError('dtSec must be finite')
  const { nBarRadS } = j2MeanMotionRadS(el)
  const r = j2SecularRatesDegDay(el)
  const days = dtSec / 86400
  const E0 = eccentricFromTrueAnomalyRad(el.trueAnomalyDeg * RAD_PER_DEG, el.e)
  const M0 = E0 - el.e * Math.sin(E0)
  const nu1 = meanToTrueAnomalyRad(M0 + nBarRadS * dtSec, el.e)
  return {
    ...el,
    raanDeg: wrap360(el.raanDeg + r.raanDegDay * days),
    argPerigeeDeg: wrap360(el.argPerigeeDeg + r.argPerigeeDegDay * days),
    trueAnomalyDeg: wrap360(nu1 * DEG_PER_RAD),
  }
}

/** Inclination where apsidal rotation vanishes (54.7356° = 2−3sin²i; the
 *  drift coefficient 4−5sin²i vanishes at 63.4353° — Molniya frozen ω). */
export const J2_SPECIAL_INCLINATIONS_DEG = {
  magicMeanMotion: (Math.asin(Math.sqrt(2 / 3)) / RAD_PER_DEG),   // 54.7356°: n̄ = n
  criticalApsidal: (Math.asin(Math.sqrt(4 / 5)) / RAD_PER_DEG),   // 63.4349°: ω̇ = 0
}
