/**
 * M2 maneuver physics validation — analytical references only.
 */
import { describe, expect, it } from 'vitest'
import * as M from '../src/lib/maneuver.js'
import * as K from '../src/lib/kepler.js'
import { MU_EARTH_KM3S2 as MU } from '../src/lib/constants.js'

const circularState = (aKm = 7000) => {
  const el = { aKm, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
  return K.elementsToStateKm(el)
}

describe('impulsive burn mechanics', () => {
  it('zero delta-V leaves elements unchanged', () => {
    const r = M.applyBurnKm(circularState(), 'prograde', 0)
    expect(r.afterElements.aKm).toBeCloseTo(r.beforeElements.aKm, 9)
    expect(r.afterElements.e).toBeCloseTo(0, 9)
    expect(r.dvAppliedMps).toBeCloseTo(0, 9)
  })

  it('applied |dv| equals the requested m/s exactly', () => {
    const r = M.applyBurnKm(circularState(), 'radialOut', 37.5)
    expect(r.dvAppliedMps).toBeCloseTo(37.5, 9)
  })

  it('prograde burn at circular: burn point becomes perigee (nu = 0), apogee rises, perigee altitude unchanged', () => {
    const st = circularState(7000)
    const r = M.applyBurnKm(st, 'prograde', 100)
    expect(r.afterElements.trueAnomalyDeg).toBeCloseTo(0, 6)
    expect(r.afterElements.e).toBeGreaterThan(0.001)
    // r_burn = a'(1-e') exactly:
    const rp = r.afterElements.aKm * (1 - r.afterElements.e)
    expect(rp).toBeCloseTo(7000, 6)
    expect(r.afterElements.aKm).toBeGreaterThan(7000)
    // energy bookkeeping: eps' = eps + v.dv + dv^2/2
    const v = K.circularVelocityKmS(7000)
    const epsBefore = K.specificMechanicalEnergyKm2S2(7000)
    expect(K.specificMechanicalEnergyKm2S2(r.afterElements.aKm))
      .toBeCloseTo(epsBefore + v * 0.1 + 0.5 * 0.01, 9)
  })

  it('retrograde burn at circular: burn point becomes apogee, perigee drops', () => {
    const r = M.applyBurnKm(circularState(7000), 'retrograde', 50)
    const ra = r.afterElements.aKm * (1 + r.afterElements.e)
    expect(ra).toBeCloseTo(7000, 6)
    const d = M.maneuverDeltas(r.beforeElements, r.afterElements)
    expect(d.dApoapsisAltKm).toBeCloseTo(0, 6)
    expect(d.dPeriapsisAltKm).toBeLessThan(0)
  })

  it('normal burn on circular equatorial orbit tilts inclination by ~dv/v', () => {
    const v = K.circularVelocityKmS(7000)
    const r = M.applyBurnKm(circularState(7000), 'normal', 100)
    const expectedDeg = Math.atan2(0.1, v) * 180 / Math.PI
    expect(r.afterElements.iDeg).toBeCloseTo(expectedDeg, 2)
    // out-of-plane burn keeps the orbit near-circular; induced e is
    // second-order ((dv/v)^2 ~ 1.8e-4), so assert that scale, not zero:
    expect(r.afterElements.e).toBeLessThan(1e-3)
    expect(r.afterElements.e).toBeGreaterThan(Math.pow(0.1 / v, 2) * 0.5)
  })

  it('normal burn on equatorial orbit produces a defined node', () => {
    const r = M.applyBurnKm(circularState(7000), 'normal', 100)
    expect(r.afterElements.equatorialOrbit).toBe(false)
  })

  it('deltas table is internally consistent (da = stage-dependent, period up for prograde)', () => {
    const r = M.applyBurnKm(circularState(7000), 'prograde', 100)
    const d = M.maneuverDeltas(r.beforeElements, r.afterElements)
    expect(d.dSemiMajorAxisKm).toBeGreaterThan(0)
    expect(d.dPeriodMin).toBeGreaterThan(0)
    expect(d.beforeApoapsisAltKm).toBeCloseTo(d.beforePeriapsisAltKm, 6)
    expect(d.afterApoapsisAltKm).toBeGreaterThan(d.afterPeriapsisAltKm)
  })

  it('burn direction unit vectors are orthonormal triple T/R/N', () => {
    const st = { posKm: { x: 7000, y: 0, z: 0 }, velKmS: { x: 0, y: 7.5, z: 0 } }
    const T = M.burnDirectionEciKm(st.posKm, st.velKmS, 'prograde')
    const R = M.burnDirectionEciKm(st.posKm, st.velKmS, 'radialOut')
    const N = M.burnDirectionEciKm(st.posKm, st.velKmS, 'normal')
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
    expect(dot(T, R)).toBeCloseTo(0, 12) // circular: v perp r
    expect(dot(N, T)).toBeCloseTo(0, 12)
    expect(dot(N, R)).toBeCloseTo(0, 12)
    expect(Math.hypot(T.x, T.y, T.z)).toBeCloseTo(1, 12)
  })

  it('unknown direction throws instead of guessing', () => {
    expect(() => M.burnDirectionEciKm({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 'sideways'))
      .toThrow(/unknown burn direction/)
  })
})
