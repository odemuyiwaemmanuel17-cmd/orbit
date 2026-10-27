/**
 * OrbitalPulse — orbit decay & lifetime (M16).
 *
 * SIMPLIFIED, labeled: time-averaged drag decay on the mean USSA-1976
 * atmosphere (see drag.js disclosures — real density swings x2–x30 with
 * solar activity, which changes LIFETIMES by the same factors; a computed
 * lifetime here is a median-atmosphere ESTIMATE, not a prediction).
 *
 * Model chain:
 *  - Instantaneous semimajor-axis rate from the vis-viva energy balance
 *    with drag power ½·ρ·v³/B (non-rotating-atmosphere convention, chosen
 *    so the circular case reproduces M15's circularDecayRateKmPerDay
 *    EXACTLY — pinned by test):
 *        da/dt = −(2a²/μ)·(½·ρ(r)·v³/B) = −a²·ρ(r)·v³/(μ·B)
 *    with v² = μ(2/r − 1/a) (vis-viva) and ρ from the altitude at the
 *    sampled point.
 *  - Eccentric averaging: mean over one period, uniform in ECCENTRIC
 *    anomaly E (dt = (1 − e·cosE)dE / n), 360 samples. Perigee pumping
 *    EMERGES from the sampling — no memorized eccentricity function is
 *    asserted. Apogee decays faster than perigee is a downstream
 *    observable (e shrinks); we integrate a(t) at CONSTANT e as a stated
 *    simplification (slightly conservative lifetime — the real e-damping
 *    keeps perigee low for longer).
 *  - Integrator: documented RK4 on the scalar state a [km], fixed step
 *    in days, hard limits (maxSteps <= 40000, stepDays > 0), terminates
 *    at reentry threshold perigee or table range exit.
 */
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM } from './constants.js'
import { densityKgM3, DENSITY_RANGE_KM } from './drag.js'

function requireFinite(name, v) {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite, got ${v}`)
}

/**
 * Instantaneous da/dt [km/s] at a point of the ellipse — pure scalars,
 * no vectors (v via vis-viva), so it is cheap inside the orbit average.
 */
export function instantaneousAdotKmS({ rKm, aKm, ballisticCoeffKgM2, densityFn = densityKgM3 }) {
  requireFinite('rKm', rKm); requireFinite('aKm', aKm)
  if (!(aKm > 0) || !(rKm > 0)) throw new RangeError('rKm and aKm must be positive')
  if (!(ballisticCoeffKgM2 > 0)) throw new RangeError('ballisticCoeffKgM2 must be > 0')
  const altKm = rKm - R_EARTH_MEAN_KM
  const rho = densityFn(altKm)
  const v2 = MU_EARTH_KM3S2 * (2 / rKm - 1 / aKm)
  if (v2 <= 0) throw new RangeError('vis-viva v^2 <= 0 — impossible for an ellipse')
  const v = Math.sqrt(v2)
  // ȧ[km/s] = −a²[km²]·ρ[kg/m³]·v³[km³/s³]/(μ[km³/s²]·B[kg/m²]) · 1000
  // The x1000 is the rho/B unit bridge: (kg/m³)/(kg/m²) = m⁻¹ → km⁻¹.
  // Without it every lifetime is silently 1000x too long — pinned by the
  // M15 circular-identity test below.
  return -(aKm * aKm * rho * v * v * v) / (MU_EARTH_KM3S2 * ballisticCoeffKgM2) * 1000
}

/**
 * One-orbit time-average of da/dt. Sampling uniform in eccentric anomaly
 * E: (1/T)∮ g dt = (1/2π)∫₀^{2π} g(E)(1 − e cosE) dE.
 * Perigee/apogee must stay inside the tabulated density range.
 * Returns { meanAdotKmS, minAdotKmS, maxAdotKmS, steps } — the min/max
 * bracket is a rigorously checkable invariant of any mean.
 */
export function orbitMeanAdotKmS({ aKm, e, ballisticCoeffKgM2, steps = 360, densityFn = densityKgM3 }) {
  requireFinite('aKm', aKm); requireFinite('e', e)
  if (!(e >= 0 && e < 1)) throw new RangeError('e must be in [0,1) for a bound ellipse')
  if (!(steps >= 8)) throw new RangeError('steps must be >= 8')
  const rp = aKm * (1 - e), ra = aKm * (1 + e)
  const altP = rp - R_EARTH_MEAN_KM, altA = ra - R_EARTH_MEAN_KM
  if (altP < DENSITY_RANGE_KM.minKm || altA > DENSITY_RANGE_KM.maxKm) {
    throw new RangeError(
      `perigee ${altP.toFixed(1)} km / apogee ${altA.toFixed(1)} km outside the tabulated`
      + ` atmosphere ${DENSITY_RANGE_KM.minKm}–${DENSITY_RANGE_KM.maxKm} km (no extrapolation)`)
  }
  let sum = 0, lo = Infinity, hi = -Infinity
  for (let k = 0; k < steps; k++) {
    const E = (k / steps) * 2 * Math.PI
    const rKm = aKm * (1 - e * Math.cos(E))
    const adot = instantaneousAdotKmS({ rKm, aKm, ballisticCoeffKgM2, densityFn })
    sum += adot * (1 - e * Math.cos(E))
    if (adot < lo) lo = adot
    if (adot > hi) hi = adot
  }
  return { meanAdotKmS: sum / steps, minAdotKmS: lo, maxAdotKmS: hi, steps }
}

/** M15-compatible circular closed form: −√(μa)·(ρ/B)·1000 (km/s), ρ at a−R⊕. */
export function circularAdotReferenceKmS({ aKm, ballisticCoeffKgM2, densityFn = densityKgM3 }) {
  const rho = densityFn(aKm - R_EARTH_MEAN_KM)
  return -Math.sqrt(MU_EARTH_KM3S2 * aKm) * (rho / ballisticCoeffKgM2) * 1000
}

/**
 * RK4 integration of a(t) at constant e until perigee drops below the
 * reentry threshold or the table range is exited (both = REENTRY for our
 * purposes) or maxDays is reached.
 * stepDays <= 0 or maxDays > 40000 days-step budget -> throw (documented
 * integrator limits).
 */
export function integrateDecayKm({
  aKm0, e, ballisticCoeffKgM2, maxDays = 20000, stepDays = 1,
  reentryPerigeeAltKm = 120, steps = 360, densityFn = densityKgM3, sampleEvery = 50,
}) {
  requireFinite('aKm0', aKm0); requireFinite('e', e)
  if (!(e >= 0 && e < 1)) throw new RangeError('e must be in [0,1)')
  if (!(stepDays > 0)) throw new RangeError('stepDays must be > 0')
  if (!(maxDays > 0) || maxDays * (1 / stepDays) > 40000) {
    throw new RangeError('integrator budget is capped at 40000 RK4 steps')
  }
  const f = (aKm) => orbitMeanAdotKmS({ aKm, e, ballisticCoeffKgM2, steps, densityFn }).meanAdotKmS
  let a = aKm0, tDays = 0
  const series = [{ tDays, aKm: a, altPerigeeKm: a * (1 - e) - R_EARTH_MEAN_KM, altApogeeKm: a * (1 + e) - R_EARTH_MEAN_KM }]
  const stepS = stepDays * 86400
  let terminatedBy = 'MAX_DAYS'
  const nSteps = Math.floor(maxDays / stepDays)
  for (let i = 0; i < nSteps; i++) {
    let k1, k2, k3, k4
    try {
      k1 = f(a)
      k2 = f(a + 0.5 * stepS * k1)
      k3 = f(a + 0.5 * stepS * k2)
      k4 = f(a + stepS * k3)
    } catch (err) {
      if (err instanceof RangeError && /tabulated atmosphere/.test(err.message)) {
        terminatedBy = 'REENTRY'
        break
      }
      throw err
    }
    a += (stepS / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
    tDays += stepDays
    if (series.length < 2000 && (i + 1) % sampleEvery === 0) {
      series.push({ tDays, aKm: a, altPerigeeKm: a * (1 - e) - R_EARTH_MEAN_KM, altApogeeKm: a * (1 + e) - R_EARTH_MEAN_KM })
    }
    if (a * (1 - e) - R_EARTH_MEAN_KM <= reentryPerigeeAltKm) {
      terminatedBy = 'REENTRY'
      break
    }
    if (a <= 0) { terminatedBy = 'REENTRY'; break }
  }
  const final = { aKm: a, altPerigeeKm: a * (1 - e) - R_EARTH_MEAN_KM, altApogeeKm: a * (1 + e) - R_EARTH_MEAN_KM }
  const last = series[series.length - 1]
  if (last.tDays !== tDays) series.push({ ...final, tDays })
  return { series, lifetimeDays: tDays, terminatedBy, initialRateMPerDay: f(aKm0) * 86400 * 1000, final }
}
