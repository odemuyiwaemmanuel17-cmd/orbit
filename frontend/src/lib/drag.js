/**
 * OrbitalPulse — atmospheric drag (M15).
 *
 * Density: U.S. Standard Atmosphere 1976 (NOAA/NRL/NASA USAUR76, Part 4
 * main tables) interpolated in log10(rho) vs GEOMETRIC altitude — the 37
 * anchor points below are read directly from the published tables
 * (reproduced by pdas.com "Table of the U.S. Standard Atmosphere 1976").
 *
 * SIMPLIFIED, disclosed in the UI:
 *  - USSA-1976 is a time-stationary mean (solar-median) model. Real
 *    thermospheric density at 400 km varies by factors of ~2-30 with the
 *    solar F10.7 cycle and geomagnetic activity; we do NOT model space
 *    weather here — saying otherwise would be faking aerospace data.
 *  - The atmosphere co-rotates rigidly with Earth (v_rel = v − ω⊕×r);
 *    wind/thermospheric circulation ignored.
 *  - Constant ballistic coefficient B = m/(Cd·A) as a single slider;
 *    realistic Cd ~ 2.2 for free-molecular LEO (representative), but the
 *    lab takes B directly so no mass/area is invented per satellite.
 *  - Circular-orbit averaging for the per-orbit decay rate
 *    da/dt = −√(μ·a)·ρ(a)/B (vis-viva energy rate; exact for instantaneous
 *    circular speed). Eccentric drag partitioning is M16's job.
 */
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM, OMEGA_EARTH_RADS } from './constants.js'

/** [geometric altitude km, density kg/m^3] — USSA-1976 Part 4 (Z,H,rho). */
export const USSA1976_RHO = [
  [98.5, 5.6044e-7], [122.6, 1.2918e-8], [146.5, 2.0752e-9], [170.3, 6.3382e-10],
  [193.9, 2.5407e-10], [217.3, 1.1839e-10], [240.5, 6.0706e-11], [263.6, 3.3294e-11],
  [286.5, 1.9159e-11], [309.2, 1.1419e-11], [331.7, 7.0011e-12], [354.1, 4.3914e-12],
  [376.3, 2.8028e-12], [398.4, 1.8118e-12], [420.3, 1.1843e-12], [442.0, 7.8214e-13],
  [463.5, 5.2148e-13], [484.9, 3.5083e-13], [506.2, 2.3832e-13], [527.3, 1.6363e-13],
  [548.3, 1.1367e-13], [569.1, 7.9981e-14], [589.7, 5.7114e-14], [610.2, 4.1478e-14],
  [630.6, 3.0698e-14], [650.8, 2.3196e-14], [670.8, 1.7900e-14], [690.8, 1.4108e-14],
  [710.6, 1.1358e-14], [730.2, 9.3370e-15], [749.7, 7.8223e-15], [769.1, 6.6635e-15],
  [788.4, 5.7587e-15], [807.5, 5.0377e-15], [826.5, 4.4525e-15], [845.3, 3.9687e-15],
  [864.1, 3.5611e-15],
]

export const DENSITY_RANGE_KM = { minKm: 98.5, maxKm: 864.1 }

/** Log10-linear interpolation of the tabulated model. Throws out of range. */
export function densityKgM3(altKm) {
  if (!Number.isFinite(altKm)) throw new TypeError('altKm must be finite')
  const { minKm, maxKm } = DENSITY_RANGE_KM
  if (altKm < minKm || altKm > maxKm) {
    throw new RangeError(`USSA-1976 tabulated range is ${minKm}–${maxKm} km, got ${altKm} km`)
  }
  let lo = 0
  while (lo < USSA1976_RHO.length - 2 && USSA1976_RHO[lo + 1][0] < altKm) lo += 1
  const [h0, r0] = USSA1976_RHO[lo]
  const [h1, r1] = USSA1976_RHO[lo + 1]
  if (altKm === h0) return r0
  const f = (altKm - h0) / (h1 - h0)
  return Math.pow(10, Math.log10(r0) + f * (Math.log10(r1) - Math.log10(r0)))
}

/** Local scale height H = -dz/d(ln rho) from the table (finite difference). */
export function scaleHeightKm(altKm, dzKm = 5) {
  const zLo = Math.max(altKm - dzKm, DENSITY_RANGE_KM.minKm)
  const zHi = Math.min(altKm + dzKm, DENSITY_RANGE_KM.maxKm)
  return -(zHi - zLo) / (Math.log(densityKgM3(zHi)) - Math.log(densityKgM3(zLo)))
}

/**
 * Drag acceleration on a state vector (ECI km, km/s), given ballistic
 * coefficient B = m/(Cd·A) [kg/m^2]. Returns accel km/s^2 plus the inputs
 * for display. Atmosphere corotation: vRel = v − ω⊕ × r.
 */
export function dragAccelKmS2({ posKm, velKmS, ballisticCoeffKgM2 }) {
  const rKm = Math.hypot(posKm.x ?? posKm[0], posKm.y ?? posKm[1], posKm.z ?? posKm[2])
  const altKm = rKm - R_EARTH_MEAN_KM
  const rho = densityKgM3(altKm)
  const [px, py, pz] = [posKm.x ?? posKm[0], posKm.y ?? posKm[1], posKm.z ?? posKm[2]]
  const [vx, vy, vz] = [velKmS.x ?? velKmS[0], velKmS.y ?? velKmS[1], velKmS.z ?? velKmS[2]]
  // ω = [0,0,ωE] rad/s; corotation velocity [km/s] = ω × r (r in km —
  // radians are dimensionless, so km/s comes out directly, no 1e3 factor)
  const sO = OMEGA_EARTH_RADS
  const w = { x: -sO * py, y: sO * px, z: 0 }
  const vRel = { x: vx - w.x, y: vy - w.y, z: vz - w.z }
  if (!(ballisticCoeffKgM2 > 0)) throw new RangeError('ballisticCoeffKgM2 must be > 0')
  const vRelKmS_mag = Math.hypot(vRel.x, vRel.y, vRel.z)
  const vRelMps = vRelKmS_mag * 1000
  const dragMs2 = 0.5 * rho * vRelMps * vRelMps / ballisticCoeffKgM2 // m/s^2
  const aKmS2 = dragMs2 / 1000 // km/s^2 magnitude
  const s = vRelKmS_mag > 0 ? aKmS2 / vRelKmS_mag : 0
  return {
    accKmS2: { x: -s * vRel.x, y: -s * vRel.y, z: -s * vRel.z },
    densityKgM3: rho, altKm, vRelKmS: vRel, vRelMps,
    dragMs2,
  }
}

/**
 * Circular-orbit mean semimajor-axis decay rate from the vis-viva energy
 * loss (all quantities in consistent units; see derivation in the comment
 * of tests/drag.test.js):
 *   da/dt = −√(μ·a) · ρ(a)/B   [km/s when μ km^3/s^2, a km, ρ/B km^-1]
 * Returned as km/day (negative = shrinking). Larger B (heavy, sleek craft)
 * decays SLOWER — the dependency direction the tests pin.
 */
export function circularDecayRateKmPerDay({ aKm, ballisticCoeffKgM2 }) {
  const altKm = aKm - R_EARTH_MEAN_KM
  const rho = densityKgM3(altKm)
  if (!(ballisticCoeffKgM2 > 0)) throw new RangeError('ballisticCoeffKgM2 must be > 0')
  const rhoPerB_kmInv = (rho / ballisticCoeffKgM2) * 1000 // m^-1 -> km^-1
  const dadtKmS = -Math.sqrt(MU_EARTH_KM3S2 * aKm) * rhoPerB_kmInv
  return { dadtKmPerDay: dadtKmS * 86400, densityKgM3: rho, altKm }
}

/** Orbital-energy dissipation per unit mass, P/m = ½ρ|v_rel|³ [W/kg]. */
export function dragPowerPerKgMWm2({ vRelMps, densityKgM3: rho }) {
  return 0.5 * rho * vRelMps * vRelMps * vRelMps
}
