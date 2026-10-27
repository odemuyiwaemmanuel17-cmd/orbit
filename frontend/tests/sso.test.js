import { describe, it, expect } from 'vitest'
import {
  sunRaDeg, ltanOfNodeDeg, nodeRaForLtanDeg, planeNormalU, betaAngleDeg,
  designSunSyncOrbit, classifySsoCandidate,
} from '../src/lib/sso.js'
import { sunSyncInclinationDeg } from '../src/lib/kepler.js'
import { R_EARTH_EQUATORIAL_KM, SUN_MEAN_MOTION_DEGDAY } from '../src/lib/constants.js'

const DATE = new Date(Date.UTC(2026, 2, 20, 14, 46)) // near the 2026 equinox
const A705 = R_EARTH_EQUATORIAL_KM + 705

describe('LTAN <-> node-RA geometry', () => {
  it('round-trips design -> measure for representative local times', () => {
    for (const ltan of [0, 3.25, 6, 10.5, 12, 18, 21.75, 23.99]) {
      const raan = nodeRaForLtanDeg(ltan, DATE)
      expect(ltanOfNodeDeg(raan, DATE)).toBeCloseTo(ltan, 9)
    }
  })
  it('dusk node is 90° east of noon node; 18:00 minus 06:00 = 180°', () => {
    const noon = nodeRaForLtanDeg(12, DATE)
    const dusk = nodeRaForLtanDeg(18, DATE)
    const dawn = nodeRaForLtanDeg(6, DATE)
    expect(((dusk - noon) % 360 + 360) % 360).toBeCloseTo(90, 9)
    expect(((dusk - dawn) % 360 + 360) % 360).toBeCloseTo(180, 9)
  })
  it('sun RA nearly closes the cycle over one calendar year (RA non-uniform, year exact)', () => {
    const a0 = sunRaDeg(new Date(Date.UTC(2026, 0, 1)))
    const a1 = sunRaDeg(new Date(Date.UTC(2027, 0, 1))) // 365 d: short of the
    // tropical year by 0.2422 d -> RA shortfall ~0.24 deg, inside the band
    const dd = ((a1 - a0) % 360 + 360) % 360
    expect(Math.min(dd, 360 - dd)).toBeLessThan(0.4) // RA sweeps non-uniformly but closes the year
    const aMid = sunRaDeg(new Date(Date.UTC(2026, 6, 1)))
    expect(aMid).toBeGreaterThanOrEqual(0)
    expect(aMid).toBeLessThan(360)
  })
  it('plane normal: equatorial -> +Z, i=90 RAAN=0 -> +Y-ish unit length', () => {
    const n0 = planeNormalU(0, 33)
    expect(n0[2]).toBeCloseTo(1, 12)
    const n90 = planeNormalU(90, 0)
    expect(Math.hypot(...n90)).toBeCloseTo(1, 12)
    expect(n90[1]).toBeCloseTo(-1, 12)
    expect(n90[0]).toBeCloseTo(0, 12)
  })
})

describe('sun angle beta ties LTAN class to illumination', () => {
  it('NOON-SSO: sun lies IN the plane (beta ~ 0) — max-eclipse class', () => {
    const raan = nodeRaForLtanDeg(12, DATE)
    const beta = betaAngleDeg({ iDeg: 98.2, raanDeg: raan, date: DATE })
    expect(beta).toBeLessThan(1.5) // cos i * sin(delta-sun), delta ~ 0 at equinox
  })
  it('DAWN/DUSK-SSO: near-continuous sunlit (beta ~ 82 deg at i=98.2)', () => {
    for (const ltan of [6, 18]) {
      const raan = nodeRaForLtanDeg(ltan, DATE)
      const beta = betaAngleDeg({ iDeg: 98.2, raanDeg: raan, date: DATE })
      expect(beta).toBeGreaterThan(78)
      expect(beta).toBeLessThan(84)
    }
  })
  it('beta is symmetric dawn vs dusk (equinox)', () => {
    const b6 = betaAngleDeg({ iDeg: 98.2, raanDeg: nodeRaForLtanDeg(6, DATE), date: DATE })
    const b18 = betaAngleDeg({ iDeg: 98.2, raanDeg: nodeRaForLtanDeg(18, DATE), date: DATE })
    expect(Math.abs(b6 - b18)).toBeLessThan(1)
  })
})

describe('design summary composes the validated layers', () => {
  it('705 km, LTAN 10:30: classic morning SSO numbers', () => {
    const d = designSunSyncOrbit({ altKm: 705, ltanH: 10.5, date: DATE })
    expect(d.solvable).toBe(true)
    expect(d.iDeg).toBeGreaterThan(97.9)
    expect(d.iDeg).toBeLessThan(98.5)
    expect(d.periodMin).toBeGreaterThan(96) // Landsat-class SSO: ~98.8 min
    expect(d.periodMin).toBeLessThan(101)
    expect(d.raanDriftDegDay).toBeCloseTo(SUN_MEAN_MOTION_DEGDAY, 2)
    expect(d.driftMismatchDegDay).toBeLessThan(0.01)
    // LTAN 10:30 -> RAAN = sun RA + (10.5-12)*15 = sun RA - 22.5
    expect((((d.raanDeg - sunRaDeg(DATE)) % 360 + 360) % 360)).toBeCloseTo(337.5, 9)
  })
  it('inclination rises with altitude and the ceiling is honored', () => {
    const i600 = designSunSyncOrbit({ altKm: 600 }).iDeg
    const i800 = designSunSyncOrbit({ altKm: 800 }).iDeg
    const i1000 = designSunSyncOrbit({ altKm: 1000 }).iDeg
    expect(i600).toBeLessThan(i800)
    expect(i800).toBeLessThan(i1000)
    const up = designSunSyncOrbit({ altKm: 15000 })
    expect(up.solvable).toBe(false)
    expect(up.reason).toMatch(/ceiling/)
    expect(sunSyncInclinationDeg(R_EARTH_EQUATORIAL_KM + 15000)).toBeNull()
  })
  it('illumination classes label correctly', () => {
    expect(designSunSyncOrbit({ altKm: 705, ltanH: 6, date: DATE }).illumination).toMatch(/NEAR-CONTINUOUS/)
    expect(designSunSyncOrbit({ altKm: 705, ltanH: 12, date: DATE }).illumination).toMatch(/HIGH-ECLIPSE/)
    expect(designSunSyncOrbit({ altKm: 705, ltanH: 9, date: DATE }).illumination).toMatch(/MODERATE/)
  })
  it('rejects non-finite altitude', () => {
    expect(() => designSunSyncOrbit({ altKm: NaN })).toThrow(TypeError)
  })
})

describe('live classification of watched satellites', () => {
  it('an exact SSO design classifies as SUN-SYNCHRONOUS with ~zero drift', () => {
    const d = designSunSyncOrbit({ altKm: 705, ltanH: 9.75, date: DATE })
    const c = classifySsoCandidate({ aKm: d.aKm, iDeg: d.iDeg, raanDeg: d.raanDeg }, DATE)
    expect(c.sso).toBe(true)
    expect(c.driftMinPerDay).toBeLessThan(0.01)
    expect(c.ltanH).toBeCloseTo(9.75, 6)
  })
  it('1° inclination error slides LTAN ~0.3-0.7 min/day (rate-mismatch derived)', () => {
    const d = designSunSyncOrbit({ altKm: 705, ltanH: 12, date: DATE })
    const c = classifySsoCandidate({ aKm: d.aKm, iDeg: d.iDeg + 1, raanDeg: d.raanDeg }, DATE)
    expect(c.sso).toBe(false)
    expect(c.driftMinPerDay).toBeGreaterThan(0.2)
    expect(c.driftMinPerDay).toBeLessThan(0.8)
    expect(c.note).toMatch(/NEAR-SSO/)
  })
  it('non-SSO inclinations report not-SSO without pretending drift', () => {
    const c = classifySsoCandidate({ aKm: A705, iDeg: 51.6, raanDeg: 100 }, DATE)
    expect(c.sso).toBe(false)
    expect(c.note).toBe('not SSO family')
  })
})
