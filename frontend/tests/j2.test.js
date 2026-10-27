import { describe, it, expect } from 'vitest'
import {
  j2MeanMotionRadS, j2SecularRatesDegDay, propagateJ2SecularKm,
  J2_SPECIAL_INCLINATIONS_DEG,
} from '../src/lib/j2.js'
import { sunSyncInclinationDeg, periodSec, meanMotionRadS } from '../src/lib/kepler.js'
import { R_EARTH_EQUATORIAL_KM, RAD_PER_DEG } from '../src/lib/constants.js'

const LEO = { aKm: R_EARTH_EQUATORIAL_KM + 550, e: 0.001, iDeg: 53 }

describe('J2 mean motion correction n̄', () => {
  it('magic inclination 54.7356° leaves the mean motion unperturbed', () => {
    const i = J2_SPECIAL_INCLINATIONS_DEG.magicMeanMotion
    expect(i).toBeCloseTo(54.7356, 3)
    const { nRadS, nBarRadS } = j2MeanMotionRadS({ ...LEO, iDeg: i })
    expect(nBarRadS / nRadS).toBeCloseTo(1, 12)
    expect(Math.abs(j2SecularRatesDegDay({ ...LEO, iDeg: i }).meanMotionDeltaDegDay)).toBeLessThan(1e-6)
  })
  it('equatorial speeds up (2−3sin²i = +2), polar slows down (= −1), both <0.2%', () => {
    const eq = j2MeanMotionRadS({ ...LEO, iDeg: 0 })
    const po = j2MeanMotionRadS({ ...LEO, iDeg: 90 })
    expect(eq.nBarRadS).toBeGreaterThan(eq.nRadS)
    expect(po.nBarRadS).toBeLessThan(po.nRadS)
    expect(eq.nBarRadS / eq.nRadS - 1).toBeLessThan(0.002)
    expect(1 - po.nBarRadS / po.nRadS).toBeLessThan(0.002)
  })
})

describe('J2 secular rates in deg/day', () => {
  it('ISS-like anchor: nodal regression about −5°/day', () => {
    const r = j2SecularRatesDegDay({ aKm: 6771, e: 0.0007, iDeg: 51.64 })
    expect(r.raanDegDay).toBeGreaterThan(-5.8)
    expect(r.raanDegDay).toBeLessThan(-4.4)
  })
  it('critical inclination 63.4349° freezes the argument of perigee (Molniya)', () => {
    const i = J2_SPECIAL_INCLINATIONS_DEG.criticalApsidal
    expect(i).toBeCloseTo(63.4349, 3)
    const r = j2SecularRatesDegDay({ aKm: 26600, e: 0.74, iDeg: i })
    expect(Math.abs(r.argPerigeeDegDay)).toBeLessThan(1e-6)
  })
  it('retrograde orbits regress EASTWARD (sign flips across i=90°)', () => {
    const pro = j2SecularRatesDegDay({ ...LEO, iDeg: 60 })
    const retro = j2SecularRatesDegDay({ ...LEO, iDeg: 120 })
    expect(pro.raanDegDay).toBeLessThan(0)
    expect(retro.raanDegDay).toBeGreaterThan(0)
  })
  it('n̄-form and the pre-validated n0-form agree within 0.1% (both second-order consistent)', () => {
    const r = j2SecularRatesDegDay(LEO)
    expect(Math.abs(r.raanDegDay / r.raanKeplerFormDegDay - 1)).toBeLessThan(1e-3)
  })
  it('sun-sync altitude reproduces the +360 deg/year drift through the n̄ form', () => {
    const aKm = R_EARTH_EQUATORIAL_KM + 705
    const i = sunSyncInclinationDeg(aKm)
    expect(i).toBeCloseTo(98.2, 1)
    const r = j2SecularRatesDegDay({ aKm, e: 0.001, iDeg: i })
    expect(r.raanDegDay).toBeCloseTo(360 / 365.2421897, 2)
  })
})

describe('secular propagation of mean elements', () => {
  it('dt = 0 preserves every element (Kepler round trip within 1e-6°)', () => {
    const el = { aKm: 7078, e: 0.001, iDeg: 98.2, raanDeg: 123.4, argPerigeeDeg: 88.8, trueAnomalyDeg: 250 }
    const same = propagateJ2SecularKm(el, 0)
    expect(same.aKm).toBe(el.aKm)
    expect(same.raanDeg).toBeCloseTo(123.4, 9)
    expect(same.argPerigeeDeg).toBeCloseTo(88.8, 9)
    expect(same.trueAnomalyDeg).toBeCloseTo(250, 6)
  })
  it('linear drifts match rate x days, wrapped into [0,360)', () => {
    const el = { aKm: 7078, e: 0.001, iDeg: 98.2, raanDeg: 359, argPerigeeDeg: 10, trueAnomalyDeg: 0 }
    const r = j2SecularRatesDegDay(el)
    const after = propagateJ2SecularKm(el, 20 * 86400)
    const wrap = (d) => ((d % 360) + 360) % 360
    expect(after.raanDeg).toBeCloseTo(wrap(359 + r.raanDegDay * 20), 9)
    expect(after.argPerigeeDeg).toBeCloseTo(wrap(10 + r.argPerigeeDegDay * 20), 9)
    expect(after.raanDeg).toBeGreaterThanOrEqual(0)
    expect(after.raanDeg).toBeLessThan(360)
  })
  it('circular phase advances by n̄: one Kepler period lands short of 360° by (n̄−n)T', () => {
    const el = { aKm: 7078, e: 0, iDeg: 98.2, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
    const T = periodSec(el.aKm)
    const { nRadS, nBarRadS } = j2MeanMotionRadS(el)
    const after = propagateJ2SecularKm(el, T)
    const expectDeg = ((nBarRadS - nRadS) * T) * (180 / Math.PI) % 360
    const got = after.trueAnomalyDeg > 180 ? after.trueAnomalyDeg - 360 : after.trueAnomalyDeg
    expect(got).toBeCloseTo(expectDeg, 6)
    expect(Math.abs(got)).toBeGreaterThan(0.01) // polar J2 slows the phase measurably
  })
  it('rejects bad inputs', () => {
    const el = { aKm: 7000, e: 0.01, iDeg: 50, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
    expect(() => propagateJ2SecularKm(el, NaN)).toThrow(TypeError)
    expect(() => j2MeanMotionRadS({ ...el, aKm: 6000 })).toThrow(RangeError)
    expect(() => j2MeanMotionRadS({ ...el, e: 1 })).toThrow(RangeError)
    expect(() => j2MeanMotionRadS({ ...el, iDeg: 'x' })).toThrow(TypeError)
  })
  it('mean motion baseline unchanged: nRadS == kepler.meanMotionRadS', () => {
    const { nRadS } = j2MeanMotionRadS({ ...LEO })
    expect(nRadS).toBeCloseTo(meanMotionRadS(LEO.aKm), 15)
  })
})
