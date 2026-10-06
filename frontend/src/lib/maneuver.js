/**
 * OrbitalPulse — impulsive maneuver service (M2).
 *
 * Applies an instantaneous delta-V to a spacecraft state and reports the
 * resulting Keplerian orbit. Pure module; builds only on the validated
 * kepler.js primitives (no duplicated orbital math).
 *
 * Frame convention (Gauss/RSW-like, documented):
 *   prograde  T = v/|v|                     (along velocity)
 *   radial    R = r/|r|                     (true geocentric radial; the
 *             component perpendicular to T only when the orbit is circular —
 *             this is the standard RSW basis, not LVLH flight-path)
 *   out-plane N = h x R ... unit(h)         (orbit-normal, right-handed)
 * Retrograde / Radial In / Anti-Normal are the negatives.
 *
 * Model fidelity: ANALYTICAL — impulsive burn in two-body gravity, evaluated
 * at the spacecraft state of the chosen epoch. Real post-burn motion would
 * add J2/drag; the SGP4 truth for the live satellite is never modified.
 */
import * as K from './kepler.js'
import { R_EARTH_MEAN_KM } from './constants.js'

const norm = (v) => [v[0] / Math.hypot(...v), v[1] / Math.hypot(...v), v[2] / Math.hypot(...v)]

export const BURN_DIRECTIONS = [
  { key: 'prograde', label: 'PROGRADE' },
  { key: 'retrograde', label: 'RETROGRADE' },
  { key: 'radialOut', label: 'RADIAL OUT' },
  { key: 'radialIn', label: 'RADIAL IN' },
  { key: 'normal', label: 'NORMAL' },
  { key: 'antiNormal', label: 'ANTI-NORMAL' },
]

/** Unit burn direction in ECI for a state + direction key. */
export function burnDirectionEciKm(posKm, velKmS, dirKey) {
  const r = [posKm.x, posKm.y, posKm.z]
  const v = [velKmS.x, velKmS.y, velKmS.z]
  const h = [
    r[1] * v[2] - r[2] * v[1],
    r[2] * v[0] - r[0] * v[2],
    r[0] * v[1] - r[1] * v[0],
  ]
  const unit = {
    prograde: v,
    retrograde: v.map((c) => -c),
    radialOut: r,
    radialIn: r.map((c) => -c),
    normal: h,
    antiNormal: h.map((c) => -c),
  }[dirKey]
  if (!unit) throw new Error(`unknown burn direction: ${dirKey}`)
  const u = norm(unit)
  return { x: u[0], y: u[1], z: u[2] }
}

/**
 * Apply an impulsive burn.
 * @param stateKm  { posKm, velKmS } ECI (km, km/s)
 * @param dirKey   one of BURN_DIRECTIONS keys
 * @param dvMps    delta-V magnitude in m/s (signed not required; direction
 *                 comes from dirKey)
 * @returns { beforeKm, afterKm, beforeElements, afterElements,
 *             dvAppliedMps, burnDirEci } — after-state velocity magnitude
 *          equals |v_before + dv| exactly (asserted in tests).
 */
export function applyBurnKm(stateKm, dirKey, dvMps) {
  const dvKmS = dvMps / 1000
  const d = burnDirectionEciKm(stateKm.posKm, stateKm.velKmS, dirKey)
  const before = { posKm: { ...stateKm.posKm }, velKmS: { ...stateKm.velKmS } }
  const after = {
    posKm: { ...before.posKm },
    velKmS: {
      x: before.velKmS.x + dvKmS * d.x,
      y: before.velKmS.y + dvKmS * d.y,
      z: before.velKmS.z + dvKmS * d.z,
    },
  }
  const be = K.stateToElementsKm(before)
  const ae = K.stateToElementsKm(after)
  // applied delta is exactly the vector difference magnitude
  const appliedMps = Math.hypot(
    after.velKmS.x - before.velKmS.x,
    after.velKmS.y - before.velKmS.y,
    after.velKmS.z - before.velKmS.z) * 1000
  return { beforeKm: before, afterKm: after, beforeElements: be, afterElements: ae,
           dvAppliedMps: appliedMps, burnDirEci: d }
}

/**
 * Before/after engineering deltas for the UI table. All units explicit.
 */
export function maneuverDeltas(beforeEl, afterEl) {
  const pBefore = K.periodSec(beforeEl.aKm)
  const pAfter = K.periodSec(afterEl.aKm)
  return {
    dSemiMajorAxisKm: afterEl.aKm - beforeEl.aKm,
    dEccentricity: afterEl.e - beforeEl.e,
    dInclinationDeg: afterEl.iDeg - beforeEl.iDeg,
    dPeriodMin: (pAfter - pBefore) / 60,
    dApoapsisAltKm: K.apoapsisRadiusKm(afterEl.aKm, afterEl.e)
      - K.apoapsisRadiusKm(beforeEl.aKm, beforeEl.e),
    dPeriapsisAltKm: K.periapsisRadiusKm(afterEl.aKm, afterEl.e)
      - K.periapsisRadiusKm(beforeEl.aKm, beforeEl.e),
    beforeApoapsisAltKm: K.apoapsisRadiusKm(beforeEl.aKm, beforeEl.e) - R_EARTH_MEAN_KM,
    beforePeriapsisAltKm: K.periapsisRadiusKm(beforeEl.aKm, beforeEl.e) - R_EARTH_MEAN_KM,
    afterApoapsisAltKm: K.apoapsisRadiusKm(afterEl.aKm, afterEl.e) - R_EARTH_MEAN_KM,
    afterPeriapsisAltKm: K.periapsisRadiusKm(afterEl.aKm, afterEl.e) - R_EARTH_MEAN_KM,
    beforePeriodMin: pBefore / 60,
    afterPeriodMin: pAfter / 60,
    beforeEccentricity: beforeEl.e,
    afterEccentricity: afterEl.e,
    beforeSemiMajorAxisKm: beforeEl.aKm,
    afterSemiMajorAxisKm: afterEl.aKm,
    beforeInclinationDeg: beforeEl.iDeg,
    afterInclinationDeg: afterEl.iDeg,
  }
}
