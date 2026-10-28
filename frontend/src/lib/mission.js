/**
 * OrbitalPulse — mission builder: sequential event engine (M21).
 *
 * A mission is an ordered list of events executed against Keplerian
 * elements, starting from a real state (the app injects the SGP4 state of
 * the selected satellite):
 *   { type: 'burn',  dirKey, dvMps }   impulsive Δv via the M2 maneuver
 *                                       service (RSW directions)
 *   { type: 'coast', minutes }         two-body phase advance, or first-
 *                                       order J2 secular drift when
 *                                       opts.j2Secular (M17 engine)
 *
 * Every leg returns BEFORE/AFTER elements, cumulative mission time and a
 * running propellant ledger (rocket equation, M4 law: m ∝ e^{−Δv/ve}).
 *
 * Fidelity: ANALYTICAL MODEL — impulsive burns, point-mass two-body
 * coasting (J2 optional), no third bodies, no drag, no finite-burn or
 * eclipse constraints. A periapsis driven below the surface is FLAGGED,
 * not silently propagated as a valid orbit.
 */
import {
  elementsToStateKm, stateToElementsKm, meanMotionRadS,
  eccentricFromTrueAnomalyRad, meanToTrueAnomalyRad, periapsisRadiusKm,
} from './kepler.js'
import { applyBurnKm } from './maneuver.js'
import { propagateJ2SecularKm, j2SecularRatesDegDay } from './j2.js'
import { R_EARTH_MEAN_KM, G0_MS2, DEG_PER_RAD, RAD_PER_DEG } from './constants.js'

const wrap360 = (d) => ((d % 360) + 360) % 360

export const COAST_MODELS = Object.freeze({ TWO_BODY: 'two-body Kepler', J2_SECULAR: 'J1 + secular J2 (M17)' })

/**
 * Two-body coast: mean anomaly advances by n·Δt; a, e and the plane are
 * invariants of the Kepler problem, so only trueAnomalyDeg changes.
 */
export function coastTwoBodyKm(el, dtSec) {
  if (!Number.isFinite(dtSec) || dtSec < 0) throw new RangeError('coast dtSec must be finite and >= 0')
  const n = meanMotionRadS(el.aKm)
  const E0 = eccentricFromTrueAnomalyRad(el.trueAnomalyDeg * RAD_PER_DEG, el.e)
  const M0 = E0 - el.e * Math.sin(E0)
  const nu1 = meanToTrueAnomalyRad(M0 + n * dtSec, el.e)
  return { ...el, trueAnomalyDeg: wrap360(nu1 * DEG_PER_RAD) }
}

/** Mass after expending dvMps at ispSec (Tsiolkovsky inverted, kg). */
export function massAfterDvKg({ massKg, dvMps, ispSec }) {
  if (!(massKg > 0) || !(ispSec > 0)) throw new RangeError('mass and isp must be positive')
  if (!Number.isFinite(dvMps) || dvMps < 0) throw new RangeError('dvMps must be finite and >= 0')
  return massKg * Math.exp(-dvMps / (ispSec * G0_MS2))
}

/**
 * Execute the event list. Returns one step per event with before/after
 * elements, the Δv spent, cumulative mission minutes, and periapsis
 * bookkeeping (below-surface flag for deorbit-style burns).
 */
export function runMissionKm({ elements0, events, j2Secular = false }) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array')
  for (const k of ['aKm', 'e', 'iDeg', 'raanDeg', 'argPerigeeDeg', 'trueAnomalyDeg']) {
    if (!Number.isFinite(elements0[k])) throw new TypeError(`elements0.${k} must be finite`)
  }
  if (!(elements0.e >= 0 && elements0.e < 1)) throw new RangeError('elements0.e must be in [0,1)')
  let el = { ...elements0 }
  let tMin = 0
  const steps = []
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const before = { ...el }
    if (ev.type === 'coast') {
      const minutes = Number(ev.minutes)
      if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError(`event ${i}: coast minutes must be finite and >= 0`)
      el = j2Secular ? propagateJ2SecularKm(el, minutes * 60) : coastTwoBodyKm(el, minutes * 60)
      tMin += minutes
      steps.push({ index: i, event: ev, beforeElements: before, afterElements: { ...el },
        dvMps: 0, tMinCumulative: tMin })
    } else if (ev.type === 'burn') {
      const dvMps = Number(ev.dvMps)
      if (!Number.isFinite(dvMps) || dvMps < 0) throw new RangeError(`event ${i}: burn dvMps must be finite and >= 0`)
      const state = elementsToStateKm(el)
      const burn = applyBurnKm(state, ev.dirKey, dvMps)
      const ae = burn.afterElements
      if (!(ae.aKm > 0) || ae.e >= 1) {
        throw new RangeError(`event ${i}: burn drives the craft to escape (e = ${ae.e.toFixed(4)} >= 1) — hyperbolic legs are out of scope`)
      }
      el = { aKm: ae.aKm, e: ae.e, iDeg: ae.iDeg, raanDeg: ae.raanDeg,
        argPerigeeDeg: ae.argPerigeeDeg, trueAnomalyDeg: ae.trueAnomalyDeg }
      steps.push({ index: i, event: { ...ev, dvMps }, beforeElements: before,
        afterElements: { ...el }, dvMps, tMinCumulative: tMin })
    } else {
      throw new TypeError(`event ${i}: unknown type '${ev.type}' (coast | burn)`)
    }
    const step = steps[steps.length - 1]
    const rpKm = periapsisRadiusKm(el.aKm, el.e)
    step.periapsisRadiusKm = rpKm
    step.periapsisAltKm = rpKm - R_EARTH_MEAN_KM
    step.periapsisBelowSurface = rpKm < R_EARTH_MEAN_KM
  }
  const totalDvMps = steps.reduce((s, st) => s + st.dvMps, 0)
  return { steps, totalDvMps, missionMinutes: tMin, finalElements: el,
    j2Secular, belowSurfaceSeen: steps.some((s) => s.periapsisBelowSurface) }
}

/**
 * Propellant ledger: run the rocket equation over the burn sequence.
 * Returns per-event mass after burn and totals. m0 is wet launch mass.
 */
export function missionMassesKm({ result, mass0Kg, ispSec }) {
  let m = mass0Kg
  const rows = []
  for (const st of result.steps) {
    if (st.dvMps > 0) m = massAfterDvKg({ massKg: m, dvMps: st.dvMps, ispSec })
    rows.push({ index: st.index, dvMps: st.dvMps, massAfterKg: m, propellantUsedKg: mass0Kg - m })
  }
  return { rows, massAtEndKg: m, propellantUsedKg: mass0Kg - m }
}

/** Secular drift summary for the coast legs under J2 mode (display aid). */
export function coastDriftDegKm({ elements, minutes }) {
  const r = j2SecularRatesDegDay(elements)
  const d = minutes / 1440
  return { raanDeg: r.raanDegDay * d, argPerigeeDeg: r.argPerigeeDegDay * d }
}
