/**
 * M8 LOS validation: footprint closed form vs the M6 horizon identity,
 * polygon geometry invariants, and three-state verdicts constructed from
 * exact spherical positions.
 */
import { describe, expect, it } from 'vitest'
import { footprintRadiusDeg, losState, footprintPolygonDeg } from '../src/lib/los.js'
import { horizonHalfAngleDeg, lookAngleKm } from '../src/lib/stations.js'

const ST0 = { id: 's', name: 's', latDeg: 0, lonDeg: 0, elevKm: 0, minElevDeg: 10 }

describe('footprint radius closed form', () => {
  it('e = 0 equals the M6 horizon identity acos(Rs/rk)', () => {
    for (const alt of [400, 1000, 20200, 35786]) {
      const viaM6 = horizonHalfAngleDeg(ST0, alt)
      expect(footprintRadiusDeg(alt, 0)).toBeCloseTo(viaM6, 9)
    }
  })
  it('mask angle strictly shrinks the cap; 90 deg mask degenerates to a point', () => {
    const alt = 550
    let prev = footprintRadiusDeg(alt, 0)
    for (const e of [10, 25, 45, 70, 85]) {
      const g = footprintRadiusDeg(alt, e)
      expect(g).toBeLessThan(prev)
      expect(g).toBeGreaterThan(0)
      prev = g
    }
    expect(footprintRadiusDeg(alt, 90)).toBeCloseTo(0, 9)
  })
  it('hand-checked number: 400 km, 10 deg mask', () => {
    const expected = Math.acos((6371 / 6771) * Math.cos(10 * Math.PI / 180)) * (180 / Math.PI) - 10
    expect(footprintRadiusDeg(400, 10)).toBeCloseTo(expected, 9)
  })
})

describe('losState verdicts', () => {
  it('LINK / LOS / BLOCKED split at the exact 0 and mask thresholds', () => {
    const alt = 400
    const gMask = footprintRadiusDeg(alt, 10)   // elev = 10 boundary
    const gH = footprintRadiusDeg(alt, 0)       // elev = 0 boundary
    const inside = losState(ST0, { latDeg: 0, lonDeg: gMask - 1, altKm: alt })
    const between = losState(ST0, { latDeg: 0, lonDeg: (gMask + gH) / 2, altKm: alt })
    const blocked = losState(ST0, { latDeg: 0, lonDeg: gH + 2, altKm: alt })
    expect(inside.state).toBe('LINK')
    expect(between.state).toBe('LOS')
    expect(blocked.state).toBe('BLOCKED')
    expect(blocked.inFootprint).toBe(false)
    expect(blocked.elevDeg).toBeLessThan(0)
  })
  it('thresholds are consistent with lookAngleKm itself', () => {
    const s = losState(ST0, { latDeg: 0, lonDeg: 5, altKm: 400 })
    const direct = lookAngleKm(ST0, { latDeg: 0, lonDeg: 5, altKm: 400 })
    expect(s.elevDeg).toBeCloseTo(direct.elevDeg, 12)
    expect(s.state).toBe(s.elevDeg >= 10 ? 'LINK' : s.elevDeg >= 0 ? 'LOS' : 'BLOCKED')
  })
})

describe('footprint polygon', () => {
  it('every vertex sits at angular radius gamma from the sub-sat point', () => {
    const alt = 800, g = footprintRadiusDeg(alt, 0)
    const poly = footprintPolygonDeg(20, -60, g, 72)
    expect(poly.length).toBe(73)
    expect(poly[0]).toEqual(poly[poly.length - 1]) // closed ring
    for (const [lat, lon] of poly) {
      // geocentric angle between (20,-60) and (lat,lon) via unit vectors
      const u = (la, lo) => [Math.cos(la * Math.PI / 180) * Math.cos(lo * Math.PI / 180),
        Math.cos(la * Math.PI / 180) * Math.sin(lo * Math.PI / 180), Math.sin(la * Math.PI / 180)]
      const dot = u(20, -60).reduce((s, c, i) => s + c * u(lat, lon)[i], 0)
      expect(Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI).toBeCloseTo(g, 6)
    }
  })
  it('polygon points sit at elevation ~0 for a surface station at the sub-sat point', () => {
    const alt = 550, g = footprintRadiusDeg(alt, 0)
    const poly = footprintPolygonDeg(0, 0, g, 48)
    for (const [lat, lon] of poly.slice(0, 12)) {
      const l = lookAngleKm(ST0, { latDeg: lat, lonDeg: lon, altKm: alt })
      expect(Math.abs(l.elevDeg)).toBeLessThan(0.02)
    }
  })
  it('zero radius or negative degenerates to empty, not garbage', () => {
    expect(footprintPolygonDeg(0, 0, 0, 32)).toEqual([])
    expect(footprintPolygonDeg(0, 0, -3, 32)).toEqual([])
  })
})
