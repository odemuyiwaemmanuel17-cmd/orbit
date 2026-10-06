/**
 * OrbitalPulse — rocket equation & mission ΔV budget service (M4).
 *
 * Tsiolkovsky: dV_avail = Isp * g0 * ln(m0/m1), g0 = 9.80665 m/s^2 (constants).
 * Propellant for a required dV: m_p = m_dry * (exp(dV/(Isp*g0)) - 1).
 * Pure module; every number shown in the UI derives from these two laws —
 * never hand-entered "mission values".
 *
 * Fidelity: ANALYTICAL — impulsive budget accounting. No staging losses,
 * no gravity/drag losses (those belong to launch analysis, out of scope),
 * pressure-fed losses ignored. Labeled in the UI.
 */
import { G0_MS2 } from './constants.js'

/** Available delta-V in m/s from dry mass, propellant mass (kg) and Isp (s). */
export function dvAvailableMps({ ispSec, dryMassKg, propellantKg }) {
  if (!(ispSec > 0) || !(dryMassKg > 0)) throw new Error('isp and dry mass must be positive')
  const m0 = dryMassKg + Math.max(propellantKg, 0)
  return ispSec * G0_MS2 * Math.log(m0 / dryMassKg)
}

/** Propellant mass (kg) required to deliver dvMps with the given vehicle. */
export function propellantForDv({ dvMps, ispSec, dryMassKg }) {
  if (!(ispSec > 0) || !(dryMassKg > 0)) throw new Error('isp and dry mass must be positive')
  return dryMassKg * (Math.exp(Math.max(dvMps, 0) / (ispSec * G0_MS2)) - 1)
}

/** Mass ratio m0/m1 for the given vehicle + requirement. */
export function massRatio({ dvMps, ispSec }) {
  return Math.exp(Math.max(dvMps, 0) / (ispSec * G0_MS2))
}

/**
 * Feasibility verdict for a budget:
 * required = sum of event dv, available = vehicle capability.
 * Returns margin and GO/NO-GO, plus the propellant the requirement costs
 * and the residual capability — all analytical.
 */
export function budgetVerdict({ events, ispSec, dryMassKg, propellantKg }) {
  const requiredMps = events.reduce((s, e) => s + e.dvMps, 0)
  const availableMps = dvAvailableMps({ ispSec, dryMassKg, propellantKg })
  const propellantNeededKg = propellantForDv({ dvMps: requiredMps, ispSec, dryMassKg })
  return {
    requiredMps,
    availableMps,
    marginMps: availableMps - requiredMps,
    feasible: requiredMps <= availableMps,
    propellantNeededKg,
    propellantAvailableKg: propellantKg,
    propellantShortfallKg: Math.max(propellantNeededKg - propellantKg, 0),
    massRatio: massRatio({ dvMps: requiredMps, ispSec }),
    ispSec, dryMassKg,
  }
}

/** Default event list seeded from REAL engines (LEO->GEO Hohmann numbers). */
export function presetLeoToGeo(hohmannTotals) {
  return [
    { id: 'park', label: 'Parking orbit insertion', dvMps: 0 },
    { id: 't1', label: 'Transfer burn (ΔV1)', dvMps: Math.round(hohmannTotals.dv1Mps) },
    { id: 'coast', label: 'Hohmann coast', dvMps: 0 },
    { id: 'circ', label: 'Circularization (ΔV2)', dvMps: Math.round(hohmannTotals.dv2Mps) },
    { id: 'sk', label: 'Station keeping (15 y)', dvMps: 150 },
    { id: 'desat', label: 'End-of-life deorbit', dvMps: 10 },
    { id: 'res', label: 'Reserve margin', dvMps: 200 },
  ]
}
