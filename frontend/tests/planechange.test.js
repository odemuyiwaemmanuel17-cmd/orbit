/**
 * M5 plane-change validation: analytic identities + classic references.
 */
import { describe, expect, it } from 'vitest'
import { planeChangeDvMps, planeChangeAtAltMps, combinedPlaneChangeKm, planeChangeAltLadder } from '../src/lib/planechange.js'
import { R_EARTH_MEAN_KM } from '../src/lib/constants.js'

describe('pure plane change dV = 2v sin(di/2)', () => {
  it('1 deg at 400 km LEO ~ 134 m/s (v = sqrt(mu/(6371+400)) = 7.6726 km/s)', () => {
    const vRef = Math.sqrt(398600.4418 / (6371.0 + 400))
    expect(planeChangeAtAltMps(400, 1)).toBeCloseTo(2 * vRef * Math.sin(0.5 * Math.PI / 180) * 1000, 6)
    expect(planeChangeAtAltMps(400, 1)).toBeGreaterThan(130)
    expect(planeChangeAtAltMps(400, 1)).toBeLessThan(138)
  })
  it('zero and 180 deg endpoints', () => {
    expect(planeChangeDvMps(7.7, 0)).toBeCloseTo(0, 12)
    expect(planeChangeDvMps(7.7, 180)).toBeCloseTo(2 * 7.7 * 1000, 9) // full flip = 2v
  })
  it('symmetric in sign of delta-i (prograde node vs retrograde node)', () => {
    expect(planeChangeDvMps(3.07, 28)).toBeCloseTo(planeChangeDvMps(3.07, -28), 12)
  })
  it('cost strictly decreases with altitude (same dInc) - the core lesson', () => {
    const ladder = planeChangeAltLadder(30, [400, 1000, 20200, 35786])
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i].dvMps).toBeLessThan(ladder[i - 1].dvMps)
      expect(ladder[i].vCircKmS).toBeLessThan(ladder[i - 1].vCircKmS)
    }
    // GEO 30 deg pure plane change is the famous ~1.6 km/s:
    expect(ladder[3].dvMps).toBeGreaterThan(1500)
    expect(ladder[3].dvMps).toBeLessThan(1650)
  })
})

describe('combined apogee burn (velocity-triangle law of cosines)', () => {
  it('di=0 reduces to the plain Hohmann circularization dv2', () => {
    const c = combinedPlaneChangeKm(R_EARTH_MEAN_KM + 6378, R_EARTH_MEAN_KM + 35786, 0)
    expect(c.dvCombinedMps).toBeCloseTo(Math.abs(c.transfer.dv2Mps), 4)
  })
  it('combined is never worse than separate plane-change + circularize', () => {
    for (const di of [5, 15, 28.5]) {
      const c = combinedPlaneChangeKm(R_EARTH_MEAN_KM + 6378, R_EARTH_MEAN_KM + 35786, di)
      expect(c.savingMps).toBeGreaterThanOrEqual(-1e-6)
      expect(c.dvCombinedMps).toBeLessThanOrEqual(c.dvSeparateMps + 1e-6)
    }
  })
  it('triangle inequality sanity: combined <= va + vc (max possible)', () => {
    const c = combinedPlaneChangeKm(R_EARTH_MEAN_KM + 6378, R_EARTH_MEAN_KM + 35786, 60)
    expect(c.dvCombinedMps).toBeLessThanOrEqual((c.vApogeeKmS + c.vTargetKmS) * 1000 + 1e-6)
  })
})
