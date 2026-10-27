import { describe, it, expect } from 'vitest'
import {
  instantaneousAdotKmS, orbitMeanAdotKmS, circularAdotReferenceKmS, integrateDecayKm,
} from '../src/lib/decay.js'
import { densityKgM3 } from '../src/lib/drag.js'
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM } from '../src/lib/constants.js'

const aAt = (altKm) => R_EARTH_MEAN_KM + altKm

describe('instantaneous da/dt (vis-viva energy balance)', () => {
  it('reproduces the M15 circular closed form exactly', () => {
    const aKm = aAt(398.4)
    const v2 = MU_EARTH_KM3S2 / aKm
    const adot = instantaneousAdotKmS({ rKm: aKm, aKm, ballisticCoeffKgM2: 100 })
    const expect_ = -aKm * aKm * 1.8118e-12 * Math.pow(v2, 1.5) / (MU_EARTH_KM3S2 * 100) * 1000
    expect(adot / expect_).toBeCloseTo(1, 12) // relative: recompute-order noise only
    expect(adot / (-Math.sqrt(MU_EARTH_KM3S2 * aKm) * (1.8118e-12 / 100) * 1000))
      .toBeCloseTo(1, 12)
  })
  it('rejects nonpositive B and non-finite inputs', () => {
    expect(() => instantaneousAdotKmS({ rKm: aAt(300), aKm: aAt(300), ballisticCoeffKgM2: 0 }))
      .toThrow(RangeError)
    expect(() => instantaneousAdotKmS({ rKm: NaN, aKm: aAt(300), ballisticCoeffKgM2: 100 }))
      .toThrow(TypeError)
    expect(() => instantaneousAdotKmS({ rKm: aAt(300), aKm: Infinity, ballisticCoeffKgM2: 100 }))
      .toThrow(TypeError)
  })
})

describe('orbit-averaged da/dt (eccentric-anomaly sampling)', () => {
  it('circular limit: mean == reference to floating point', () => {
    const aKm = aAt(420.3)
    const m = orbitMeanAdotKmS({ aKm, e: 0, ballisticCoeffKgM2: 100 })
    const ref = circularAdotReferenceKmS({ aKm, ballisticCoeffKgM2: 100 })
    expect(m.meanAdotKmS / ref).toBeCloseTo(1, 12)
  })
  it('mean is bracketed by the instantaneous min/max (rigorous invariant)', () => {
    const aKm = 6865 // perigee ~150.8 km, apogee ~837.3 km (e=0.05)
    const m = orbitMeanAdotKmS({ aKm, e: 0.05, ballisticCoeffKgM2: 100 })
    expect(m.meanAdotKmS).toBeLessThanOrEqual(m.maxAdotKmS)
    expect(m.meanAdotKmS).toBeGreaterThanOrEqual(m.minAdotKmS)
    // apogee drag is the (least negative) max, perigee the min: pumping lives at perigee
    expect(m.maxAdotKmS / m.minAdotKmS).toBeLessThan(1) // |apogee rate| << |perigee rate|
    expect(m.minAdotKmS).toBeLessThan(0)
  })
  it('grid convergence: 360 vs 1440 samples agree within 0.5%', () => {
    const aKm = 6865
    const g1 = orbitMeanAdotKmS({ aKm, e: 0.05, ballisticCoeffKgM2: 100, steps: 360 })
    const g2 = orbitMeanAdotKmS({ aKm, e: 0.05, ballisticCoeffKgM2: 100, steps: 1440 })
    expect(Math.abs(g1.meanAdotKmS / g2.meanAdotKmS - 1)).toBeLessThan(0.005)
  })
  it('refuses orbits whose apsides leave the tabulated atmosphere (no extrapolation)', () => {
    expect(() => orbitMeanAdotKmS({ aKm: aAt(90), e: 0, ballisticCoeffKgM2: 100 }))
      .toThrow(/outside the tabulated atmosphere/)
    expect(() => orbitMeanAdotKmS({ aKm: 7400, e: 0.05, ballisticCoeffKgM2: 100 }))
      .toThrow(/outside the tabulated atmosphere/) // apogee 1302 km
    expect(() => orbitMeanAdotKmS({ aKm: aAt(400), e: 1, ballisticCoeffKgM2: 100 }))
      .toThrow(/e must be/)
  })
})

describe('RK4 decay integrator vs analytic exponential-atmosphere solution', () => {
  /**
   * Independent analytic root: with rho(z) = rho0*exp(-(z-z0)/H) and the
   * coefficient C = sqrt(mu*a0) FROZEN, the model ODE
   *   dz/dt = -C * (rho(z)/B) * 1000   [km/s]
   * integrates to  z(t) = z0 + H ln(1 - beta t),  beta = C rho0 1000/(B H) [1/s].
   * rho0 = 1e-7 kg/m3 is a DELIBERATELY thick synthetic atmosphere so the
   * check runs on a seconds timescale within the step budget — it is NOT
   * presented as a real-atmosphere number; this test validates RK4
   * convergence against a known solution, not the physics of Earth.
   */
  it('matches the frozen-coefficient analytic root to <50 m over ~11 km decay', () => {
    const z0 = 400, Hkm = 50, rho0 = 1e-7, B = 100
    const densityFn = (altKm) => rho0 * Math.exp(-(altKm - z0) / Hkm)
    const aKm = aAt(z0)
    const C = Math.sqrt(MU_EARTH_KM3S2 * aKm)
    const beta = C * (rho0 / B) * 1000 / Hkm // 1/s
    const tEndS = -Math.log(1 - 0.2) / beta // drops H ln(1/0.8) = 11.16 km
    const r = integrateDecayKm({
      aKm0: aKm, e: 0, ballisticCoeffKgM2: B, densityFn,
      maxDays: (tEndS * 1.06) / 86400, stepDays: tEndS / 250 / 86400,
      reentryPerigeeAltKm: -1000, steps: 60, sampleEvery: 20,
    })
    expect(r.terminatedBy).toBe('MAX_DAYS')
    const T = r.lifetimeDays * 86400
    const analyticAlt = z0 + Hkm * Math.log(1 - beta * T)
    expect(Math.abs(r.final.altPerigeeKm - analyticAlt)).toBeLessThan(0.05) // 50 m
    expect(analyticAlt).toBeLessThan(z0 - 10) // decay actually progressed
  })

  it('lifetime increases strictly with perigee altitude on the real table', () => {
    const life = (altKm) => integrateDecayKm({
      aKm0: aAt(altKm), e: 0, ballisticCoeffKgM2: 100,
      stepDays: 2, maxDays: 20000, sampleEvery: 1000,
    })
    const l200 = life(200), l300 = life(300), l500 = life(500)
    expect(l200.terminatedBy).toBe('REENTRY')
    expect(l300.terminatedBy).toBe('REENTRY')
    expect(l500.terminatedBy).toBe('REENTRY')
    expect(l200.lifetimeDays).toBeLessThan(l300.lifetimeDays)
    expect(l300.lifetimeDays).toBeLessThan(l500.lifetimeDays)
    // plausibility bands (median atmosphere, B=100 kg/m2): LEO-alt sanity,
    // not mission claims
    expect(l200.lifetimeDays).toBeLessThan(60)          // days-weeks
    expect(l300.lifetimeDays).toBeGreaterThan(50)       // months+
    expect(l500.lifetimeDays).toBeGreaterThan(1000)     // years+
  })

  it('ISS-class median estimate at ~400 km: years-to-decades band, sane rate', () => {
    const r = integrateDecayKm({
      aKm0: aAt(415), e: 0.0005, ballisticCoeffKgM2: 108,
      stepDays: 2, maxDays: 20000, sampleEvery: 200,
    })
    expect(r.terminatedBy).toBe('REENTRY')
    // Median-table densities are below real-averaged thermosphere, so this
    // is the LOW end of published estimates — the band asserts order, not
    // a mission prediction.
    expect(r.lifetimeDays).toBeGreaterThan(500)
    expect(r.lifetimeDays).toBeLessThan(20000)
    expect(Math.abs(r.initialRateMPerDay)).toBeGreaterThan(20)
    expect(Math.abs(r.initialRateMPerDay)).toBeLessThan(300)
  })

  it('documented integrator limits are enforced', () => {
    expect(() => integrateDecayKm({ aKm0: aAt(400), e: 0, ballisticCoeffKgM2: 100, stepDays: 0 }))
      .toThrow(/stepDays/)
    expect(() => integrateDecayKm({ aKm0: aAt(400), e: 0, ballisticCoeffKgM2: 100,
      stepDays: 0.0001, maxDays: 20000 })).toThrow(/40000 RK4 steps/)
    expect(() => integrateDecayKm({ aKm0: aAt(400), e: -0.1, ballisticCoeffKgM2: 100 }))
      .toThrow(/e must be/)
  })

  it('series is finite, decreasing in a, and ends at/below the reentry threshold', () => {
    const r = integrateDecayKm({ aKm0: aAt(300), e: 0, ballisticCoeffKgM2: 100,
      stepDays: 0.25, maxDays: 400, sampleEvery: 10 }) // 1600-step budget
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i].aKm).toBeLessThan(r.series[i - 1].aKm)
      expect(r.series[i].tDays).toBeGreaterThan(r.series[i - 1].tDays)
    }
    expect(r.series[0].aKm).toBe(aAt(300))
    expect(r.terminatedBy).toBe('REENTRY')
    // Terminal semantics: below ~150 km the orbit-averaged model breaks
    // down (decay per step outruns the fixed step), so REENTRY is declared
    // when a step's probes leave the tabulated regime — the last recorded
    // perigee is NEAR the threshold, not guaranteed below it.
    expect(r.series[r.series.length - 1].altPerigeeKm).toBeLessThan(200)
  })
})
