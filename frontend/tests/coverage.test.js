/**
 * M9 coverage validation: analytic cap-area identity, station visibility
 * invariants from real two-body ground tracks, sidereal longitude drift,
 * grid-coverage numerics vs the closed form, pass-run logic.
 */
import { describe, expect, it } from 'vitest'
import {
  greatCircleDeg, capAreaFractionDeg, orbitGroundSamples, visibilityFromSamples,
  gridCoverage, coveredFractionAt,
} from '../src/lib/coverage.js'
import { periodSec } from '../src/lib/kepler.js'
import { OMEGA_EARTH_RADS, RAD_PER_DEG } from '../src/lib/constants.js'
import { footprintRadiusDeg } from '../src/lib/los.js'

const GEO_EL = { aKm: 6371 + 35786, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
const LEO_EL = { aKm: 6371 + 400, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }

describe('great-circle + cap area identities', () => {
  it('known distances', () => {
    expect(greatCircleDeg({ latDeg: 0, lonDeg: 0 }, { latDeg: 0, lonDeg: 90 })).toBeCloseTo(90, 9)
    expect(greatCircleDeg({ latDeg: 45, lonDeg: 10 }, { latDeg: 45, lonDeg: 10 })).toBeCloseTo(0, 9)
    expect(greatCircleDeg({ latDeg: -90, lonDeg: 0 }, { latDeg: 90, lonDeg: 123 })).toBeCloseTo(180, 9)
  })
  it('hemisphere cap = 1/2, zero cap = 0, monotone in radius', () => {
    expect(capAreaFractionDeg(90)).toBeCloseTo(0.5, 12)
    expect(capAreaFractionDeg(0)).toBeCloseTo(0, 12)
    expect(capAreaFractionDeg(45)).toBeGreaterThan(capAreaFractionDeg(30))
  })
})

describe('two-body ground track', () => {
  it('GEO equatorial track is essentially pinned (e=0, i=0): lat 0, |lon| < 0.3 deg', () => {
    // a = 42157 km gives T = 86127 s vs sidereal 86164 s — a real ~0.16 deg
    // westward drift over one period, so 0.3 deg is the honest bound.
    const t0 = Date.UTC(2026, 9, 6, 0, 0)
    const s = orbitGroundSamples(GEO_EL, { t0Ms: t0, samples: 60 })
    for (const p of s) {
      expect(Math.abs(p.latDeg)).toBeLessThan(1e-9)
      expect(Math.abs(p.altKm - 35786)).toBeLessThan(1e-6)
      expect(Math.abs(p.lonDeg - s[0].lonDeg)).toBeLessThan(0.3)
    }
  })
  it('equatorial LEO drifts west by ~omega_E * T over one period (sidereal)', () => {
    const t0 = Date.UTC(2026, 9, 6, 0, 0)
    const T = periodSec(LEO_EL.aKm)
    const s = orbitGroundSamples(LEO_EL, { t0Ms: t0, samples: 120 })
    const drift = ((s[s.length - 1].lonDeg - s[0].lonDeg + 540) % 360) - 180
    const expected = -OMEGA_EARTH_RADS * T * (1 / RAD_PER_DEG)
    expect(drift).toBeLessThan(0)
    expect(Math.abs(drift - expected)).toBeLessThan(1.0)
  })
})

describe('station visibility from analytic tracks', () => {
  const t0 = Date.UTC(2026, 9, 6, 0, 0)
  const leo = orbitGroundSamples(LEO_EL, { t0Ms: t0, samples: 240 })
  it('station on the equator under the track: passes exist, fraction in (0, 0.5)', () => {
    const v = visibilityFromSamples(leo, { id: 'e', name: 'e', latDeg: 0, lonDeg: 40, elevKm: 0, minElevDeg: 10 })
    expect(v.passCount).toBeGreaterThanOrEqual(1)
    expect(v.fraction).toBeGreaterThan(0)
    expect(v.fraction).toBeLessThan(0.5)
    expect(v.maxElevDeg).toBeGreaterThan(10)
    for (const p of v.passes) expect(p.endMs).toBeGreaterThan(p.startMs)
  })
  it('mid-latitude station vs equatorial orbit: NEVER visible (distance > cap)', () => {
    const v = visibilityFromSamples(leo, { id: 'm', name: 'm', latDeg: 60, lonDeg: 0, elevKm: 0, minElevDeg: 0 })
    expect(v.fraction).toBe(0)
    expect(v.passCount).toBe(0)
    expect(v.maxElevDeg).toBeLessThan(0)
  })
  it('single-sample blips are not counted as passes (M7 parity)', () => {
    // synthetic samples: one above-mask sample, gap, then a two-sample run
    const st = { id: 's', name: 's', latDeg: 0, lonDeg: 0, elevKm: 0, minElevDeg: 0 }
    const near = (lonDeg, tMin) => ({ tMs: t0 + tMin * 60000, latDeg: 0, lonDeg, altKm: 400 })
    const synth = [near(30, 0), near(15, 1), near(30, 2), near(8, 3), near(6, 4), near(30, 5)]
    const v = visibilityFromSamples(synth, st)
    expect(v.passCount).toBe(1) // the 15 deg hit at t=1 is a blip: excluded
    expect(v.passes[0].startMs).toBe(t0 + 3 * 60000)
  })
})

describe('grid coverage numerics', () => {
  const t0 = Date.UTC(2026, 9, 6, 0, 0)
  it('stationary GEO mask-0 footprint: grid fraction ~ analytic cap within grid error', () => {
    const g = footprintRadiusDeg(35786, 0)
    const geo = orbitGroundSamples(GEO_EL, { t0Ms: t0, samples: 4 })
    const cov = gridCoverage(geo, { stepDeg: 10, maskDeg: 0 })
    // cap is ~81 deg wide here; 10-deg weighted-cell discretization ~1.5 pts
    expect(Math.abs(cov.fraction - capAreaFractionDeg(g))).toBeLessThan(0.015)
    for (const c of cov.cells) if (c.tMs !== null) {
      expect(greatCircleDeg(c, { latDeg: 0, lonDeg: geo[0].lonDeg })).toBeLessThanOrEqual(g + 1e-6)
    }
  })
  it('LEO one-orbit sweep grows coverage monotonically over the scrub', () => {
    const leo = orbitGroundSamples(LEO_EL, { t0Ms: t0, samples: 120 })
    const cov = gridCoverage(leo, { stepDeg: 10, maskDeg: 0 })
    expect(cov.fraction).toBeGreaterThan(0.01)
    let prev = 0
    for (const k of [0.1, 0.3, 0.5, 0.8, 1]) {
      const f = coveredFractionAt(cov, leo[0].tMs + k * periodSec(LEO_EL.aKm) * 1000)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
    expect(prev).toBeCloseTo(cov.fraction, 9)
  })
  it('equatorial orbit never covers |lat| > cap radius cells', () => {
    const leo = orbitGroundSamples(LEO_EL, { t0Ms: t0, samples: 120 })
    const g = footprintRadiusDeg(400, 0)
    const cov = gridCoverage(leo, { stepDeg: 10, maskDeg: 0 })
    for (const c of cov.cells) if (c.tMs !== null) {
      expect(Math.abs(c.latDeg)).toBeLessThan(g + 10)
    }
  })
})
