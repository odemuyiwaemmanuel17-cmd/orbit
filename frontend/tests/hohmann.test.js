/**
 * M3 Hohmann transfer validation — textbook reference cases + identities.
 */
import { describe, expect, it } from 'vitest'
import { hohmannTransferKm, hohmannTransferAltKm, transferElements, coastFractionSec } from '../src/lib/hohmann.js'
import { periodSec } from '../src/lib/kepler.js'
import { R_EARTH_MEAN_KM } from '../src/lib/constants.js'

describe('Hohmann transfer — reference cases', () => {
  it('LEO 300 km -> GEO: total dV within the classic 3.8-3.95 km/s band', () => {
    const t = hohmannTransferAltKm(300, 35786)
    expect(t.outward).toBe(true)
    expect(t.dv1Mps).toBeGreaterThan(2250)
    expect(t.dv1Mps).toBeLessThan(2480)
    expect(t.dv2Mps).toBeGreaterThan(1400)
    expect(t.dv2Mps).toBeLessThan(1550)
    expect(t.totalDvMps).toBeGreaterThan(3800)
    expect(t.totalDvMps).toBeLessThan(3950)
  })

  it('coast time LEO->GEO ~ 5.26 h (half transfer period)', () => {
    const t = hohmannTransferAltKm(300, 35786)
    const hours = t.coastSec / 3600
    expect(hours).toBeGreaterThan(5.1)
    expect(hours).toBeLessThan(5.4)
    expect(t.coastSec).toBeCloseTo(periodSec(t.transferSemiMajorAxisKm) / 2, 6)
  })

  it('transfer eccentricity matches (r2-r1)/(r2+r1) and a_t = mean radius', () => {
    const t = hohmannTransferKm(6778.137, 26560) // GPS shell
    expect(t.transferSemiMajorAxisKm).toBeCloseTo((6778.137 + 26560) / 2, 9)
    expect(t.transferEccentricity).toBeCloseTo((26560 - 6778.137) / (26560 + 6778.137), 9)
  })

  it('degenerate limit: equal radii -> zero dV both burns', () => {
    const t = hohmannTransferKm(7000, 7000)
    expect(Math.abs(t.dv1Mps)).toBeLessThan(1e-9)
    expect(Math.abs(t.dv2Mps)).toBeLessThan(1e-9)
    expect(t.transferEccentricity).toBeCloseTo(0, 12)
  })

  it('symmetry: reverse transfer has identical total dV, negative burn signs', () => {
    const up = hohmannTransferKm(6778.137, 26560)
    const down = hohmannTransferKm(26560, 6778.137)
    expect(down.totalDvMps).toBeCloseTo(up.totalDvMps, 6)
    expect(down.outward).toBe(false)
    expect(down.dv1Mps).toBeLessThan(0) // retrograde at the higher radius
    expect(down.dv2Mps).toBeLessThan(0)
    expect(up.dv1Mps).toBeGreaterThan(0)
    expect(up.dv2Mps).toBeGreaterThan(0)
  })

  it('vis-viva identities: dv1 = v_p - v_c1 and dv2 = v_c2 - v_a (outward)', () => {
    const t = hohmannTransferAltKm(400, 20000)
    expect(t.dv1Mps).toBeCloseTo((t.vTransferPerigeeKmS - t.vInitCircularKmS) * 1000, 6)
    expect(t.dv2Mps).toBeCloseTo((t.vTargetCircularKmS - t.vTransferApogeeKmS) * 1000, 6)
  })

  it('apsis radii of the transfer ellipse equal the endpoint radii', () => {
    const t = hohmannTransferAltKm(500, 35786)
    const aT = t.transferSemiMajorAxisKm
    const eT = t.transferEccentricity
    expect(aT * (1 - eT)).toBeCloseTo(500 + R_EARTH_MEAN_KM, 6)
    expect(aT * (1 + eT)).toBeCloseTo(35786 + R_EARTH_MEAN_KM, 6)
  })

  it('coast fraction is monotonic in true anomaly and hits endpoints', () => {
    const t = hohmannTransferAltKm(400, 35786)
    expect(coastFractionSec(t, 0)).toBeCloseTo(0, 6)
    expect(coastFractionSec(t, 90)).toBeGreaterThan(coastFractionSec(t, 45))
    expect(coastFractionSec(t, 180)).toBeCloseTo(t.coastSec, 3)
  })

  it('elements for rendering put perigee at the lower endpoint', () => {
    const out = transferElements(hohmannTransferAltKm(400, 35786), { iDeg: 0, raanDeg: 0 })
    expect(out.argPerigeeDeg).toBe(0) // outward: perigee radius = r1
    const inward = transferElements(hohmannTransferAltKm(35786, 400), { iDeg: 0, raanDeg: 0 })
    expect(inward.argPerigeeDeg).toBe(180) // perigee is at the lower (target) end
  })

  it('below-surface input is rejected instead of producing NaN orbits', () => {
    expect(() => hohmannTransferKm(5000, 42164)).toThrow(/above the surface/)
  })
})
