import { describe, it, expect } from 'vitest'
import {
  USSA1976_RHO, DENSITY_RANGE_KM, densityKgM3, scaleHeightKm,
  dragAccelKmS2, circularDecayRateKmPerDay, dragPowerPerKgMWm2,
} from '../src/lib/drag.js'
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM, OMEGA_EARTH_RADS } from '../src/lib/constants.js'

describe('USSA-1976 tabulated density', () => {
  it('returns the published anchor values exactly (log-space)', () => {
    for (const [hKm, rho] of USSA1976_RHO) {
      expect(Math.log10(densityKgM3(hKm))).toBeCloseTo(Math.log10(rho), 12)
    }
  })
  it('interpolates log-linearly between anchors (geometric mean at midpoints)', () => {
    for (let i = 0; i < USSA1976_RHO.length - 1; i++) {
      const [h0, r0] = USSA1976_RHO[i]
      const [h1, r1] = USSA1976_RHO[i + 1]
      const mid = densityKgM3((h0 + h1) / 2)
      expect(Math.log10(mid)).toBeCloseTo((Math.log10(r0) + Math.log10(r1)) / 2, 9)
    }
  })
  it('decreases monotonically with altitude', () => {
    for (let h = 120; h <= 850; h += 20) {
      expect(densityKgM3(h + 10)).toBeLessThan(densityKgM3(h))
    }
  })
  it('rejects out-of-range and non-finite altitudes (no silent extrapolation)', () => {
    expect(() => densityKgM3(50)).toThrow(/tabulated range/)
    expect(() => densityKgM3(900)).toThrow(RangeError)
    expect(() => densityKgM3(NaN)).toThrow(TypeError)
    expect(() => densityKgM3(Infinity)).toThrow(TypeError)
    // range endpoints themselves are valid
    expect(densityKgM3(DENSITY_RANGE_KM.minKm)).toBeGreaterThan(0)
    expect(densityKgM3(DENSITY_RANGE_KM.maxKm)).toBeGreaterThan(0)
  })
  it('local scale height at 400 km is the physically sane 30–80 km band', () => {
    // Table derivative between the 376.3/398.4 anchors: 22.1/ln(2.8028/1.8118) = 50.6 km
    const h = scaleHeightKm(388)
    expect(h).toBeGreaterThan(30)
    expect(h).toBeLessThan(80)
    expect(h).toBeCloseTo(50.6, 0)
  })
})

describe('dragAccelKmS2 — vector drag with corotating atmosphere', () => {
  // Prograde equatorial circular orbit at the 398.4 km anchor altitude.
  const rKm = R_EARTH_MEAN_KM + 398.4
  const vKmS = Math.sqrt(MU_EARTH_KM3S2 / rKm)
  const state = { posKm: { x: rKm, y: 0, z: 0 }, velKmS: { x: 0, y: vKmS, z: 0 } }
  const B = 100 // kg/m^2

  it('corotation wind is exactly omega*r km/s (0.49 km/s here)', () => {
    const d = dragAccelKmS2({ ...state, ballisticCoeffKgM2: B })
    expect(d.vRelKmS.y).toBeCloseTo(vKmS - OMEGA_EARTH_RADS * rKm, 9)
    expect(OMEGA_EARTH_RADS * rKm).toBeCloseTo(0.4936, 3) // km/s sanity anchor
  })
  it('magnitude equals hand-computed 0.5*rho*vRel^2/B and opposes motion', () => {
    const d = dragAccelKmS2({ ...state, ballisticCoeffKgM2: B })
    const expectMps2 = 0.5 * 1.8118e-12 * (d.vRelMps ** 2) / B
    expect(d.dragMs2).toBeCloseTo(expectMps2, 12)
    expect(d.accKmS2.x).toBeCloseTo(0, 30) // (signed zero, not a physics issue)
    expect(d.accKmS2.y).toBeLessThan(0) // retrograde for prograde motion
    expect(Math.hypot(d.accKmS2.x, d.accKmS2.y, d.accKmS2.z))
      .toBeCloseTo(expectMps2 / 1000, 12)
  })
  it('doubles with quadrupled density ratio check: a ∝ rho — 200 km vs 400 km', () => {
    const lo = dragAccelKmS2({ posKm: { x: R_EARTH_MEAN_KM + 193.9, y: 0, z: 0 },
      velKmS: { x: 0, y: Math.sqrt(MU_EARTH_KM3S2 / (R_EARTH_MEAN_KM + 193.9)), z: 0 },
      ballisticCoeffKgM2: B })
    const hi = dragAccelKmS2({ ...state, ballisticCoeffKgM2: B })
    expect(lo.dragMs2 / hi.dragMs2).toBeGreaterThan(50) // ~140x density, ~4% speed
  })
  it('rejects non-positive ballistic coefficient', () => {
    expect(() => dragAccelKmS2({ ...state, ballisticCoeffKgM2: 0 })).toThrow(RangeError)
    expect(() => dragAccelKmS2({ ...state, ballisticCoeffKgM2: -5 })).toThrow(RangeError)
  })
})

/**
 * Derivation pinned below: E = −mu/(2a); dE/dt = v·aDrag = −0.5·rho·v³/B
 * with v² = mu/a ⇒ da/dt = −(a²/mu)·0.5·rho·v³/B = −sqrt(mu·a)·rho/B
 * (all SI; rho/B [1/m] must be scaled x1000 for km^-1).
 */
describe('circularDecayRateKmPerDay — vis-viva energy-loss law', () => {
  const aKm = R_EARTH_MEAN_KM + 398.4
  it('equals the closed form exactly at the tabulated anchor', () => {
    const d = circularDecayRateKmPerDay({ aKm, ballisticCoeffKgM2: 100 })
    const expectKmS = -Math.sqrt(MU_EARTH_KM3S2 * aKm) * (1.8118e-12 / 100) * 1000
    expect(d.dadtKmPerDay).toBeCloseTo(expectKmS * 86400, 12)
    expect(d.dadtKmPerDay).toBeLessThan(0)
  })
  it('ISS-class craft (B ~ 108 kg/m2) at ~400 km: decay 40–250 m/day at solar median', () => {
    const d = circularDecayRateKmPerDay({ aKm, ballisticCoeffKgM2: 108 })
    const mPerDay = -d.dadtKmPerDay * 1000
    expect(mPerDay).toBeGreaterThan(40)
    expect(mPerDay).toBeLessThan(250)
  })
  it('inverse in B: doubling the ballistic coefficient halves the rate', () => {
    const a = circularDecayRateKmPerDay({ aKm, ballisticCoeffKgM2: 100 })
    const b = circularDecayRateKmPerDay({ aKm, ballisticCoeffKgM2: 200 })
    expect(b.dadtKmPerDay / a.dadtKmPerDay).toBeCloseTo(0.5, 12)
  })
  it('out-of-range altitudes throw instead of extrapolating', () => {
    expect(() => circularDecayRateKmPerDay({ aKm: R_EARTH_MEAN_KM + 900, ballisticCoeffKgM2: 100 }))
      .toThrow(RangeError)
    expect(() => circularDecayRateKmPerDay({ aKm: R_EARTH_MEAN_KM - 1, ballisticCoeffKgM2: 100 }))
      .toThrow(RangeError)
  })
})

describe('dragPowerPerKgMWm2 — energy dissipation per unit mass', () => {
  it('P/m = 0.5*rho*v^3 (hand product)', () => {
    const p = dragPowerPerKgMWm2({ vRelMps: 7000, densityKgM3: 2e-12 })
    expect(p).toBeCloseTo(0.5 * 2e-12 * 7000 ** 3, 12) // 0.343 W/kg
    expect(p).toBeCloseTo(0.343, 3)
  })
})
