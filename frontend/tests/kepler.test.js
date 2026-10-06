/**
 * Physics validation suite for the Kepler service.
 * References are analytical (Kepler III, vis-viva, WGS84-derived textbook
 * values). Tolerances stated per test. Results feed docs/VALIDATION.md.
 */
import { describe, expect, it } from 'vitest'
import * as K from '../src/lib/kepler.js'
import { MU_EARTH_KM3S2, R_EARTH_EQUATORIAL_KM } from '../src/lib/constants.js'

const ISS_LIKE = { aKm: 6778.137, e: 0.0012, iDeg: 51.64, raanDeg: 132.4,
                   argPerigeeDeg: 87.2, trueAnomalyDeg: 245.7 }

describe('circular-orbit and two-body identities', () => {
  it('circular velocity at 400 km altitude = 7.6686 km/s (textbook)', () => {
    const r = R_EARTH_EQUATORIAL_KM + 400
    expect(K.circularVelocityKmS(r)).toBeCloseTo(7.6686, 3)
  })
  it('Kepler III period for r = 6778.137 km (400 km WGS84) = 92.56 min', () => {
    expect(K.periodSec(6778.137) / 60).toBeCloseTo(92.56, 2)
  })
  it('vis-viva equals circular velocity on a circular orbit', () => {
    const r = 7000
    expect(K.velocityKmS(r, 0, r)).toBeCloseTo(K.circularVelocityKmS(r), 12)
  })
  it('escape velocity = sqrt(2) x circular at same radius', () => {
    const r = 8000
    expect(K.escapeVelocityKmS(r) / K.circularVelocityKmS(r)).toBeCloseTo(Math.SQRT2, 12)
  })
  it('specific energy depends only on a: -mu/2a', () => {
    expect(K.specificMechanicalEnergyKm2S2(20000)).toBeCloseTo(-MU_EARTH_KM3S2 / 40000, 12)
  })
})

describe('elements <-> state', () => {
  it('equatorial prograde orbit stays in the z=0 plane', () => {
    const s = K.elementsToStateKm({ aKm: 7000, e: 0.05, iDeg: 0, raanDeg: 40,
                                    argPerigeeDeg: 20, trueAnomalyDeg: 130 })
    expect(Math.abs(s.posKm.z)).toBeLessThan(1e-9)
    expect(Math.abs(s.velKmS.z)).toBeLessThan(1e-9)
  })
  it('radius follows the conic equation at every anomaly', () => {
    for (const nu of [0, 45, 120, 180, 260, 330]) {
      const s = K.elementsToStateKm({ ...ISS_LIKE, trueAnomalyDeg: nu })
      expect(s.rKm).toBeCloseTo(K.conicRadiusKm(ISS_LIKE.aKm, ISS_LIKE.e, nu), 9)
    }
  })
  it('ascending node crossing lies at ECI longitude = RAAN (GMST-free check)', () => {
    const el = { ...ISS_LIKE, argPerigeeDeg: 0 }
    const s = K.elementsToStateKm({ ...el, trueAnomalyDeg: 0 })
    const lonEci = (Math.atan2(s.posKm.y, s.posKm.x) * 180 / Math.PI + 360) % 360
    expect(lonEci).toBeCloseTo(el.raanDeg, 9)
    expect(Math.abs(s.posKm.z)).toBeLessThan(1e-6)
  })
  it('elem -> state -> elem round-trips within 1e-6 (deg/km)', () => {
    const s = K.elementsToStateKm(ISS_LIKE)
    const back = K.stateToElementsKm(s)
    expect(back.aKm).toBeCloseTo(ISS_LIKE.aKm, 6)
    expect(back.e).toBeCloseTo(ISS_LIKE.e, 9)
    expect(back.iDeg).toBeCloseTo(ISS_LIKE.iDeg, 6)
    expect(back.raanDeg).toBeCloseTo(ISS_LIKE.raanDeg, 6)
    expect(back.argPerigeeDeg).toBeCloseTo(ISS_LIKE.argPerigeeDeg, 6)
    expect(back.trueAnomalyDeg).toBeCloseTo(ISS_LIKE.trueAnomalyDeg, 6)
  })
  it('retrograde orbit (i=140) round-trips incl. RAAN quadrant', () => {
    const el = { aKm: 12000, e: 0.2, iDeg: 140, raanDeg: 275, argPerigeeDeg: 190, trueAnomalyDeg: 55 }
    const back = K.stateToElementsKm(K.elementsToStateKm(el))
    expect(back.iDeg).toBeCloseTo(el.iDeg, 6)
    expect(back.raanDeg).toBeCloseTo(el.raanDeg, 6)
    expect(back.trueAnomalyDeg).toBeCloseTo(el.trueAnomalyDeg, 6)
  })
  it('velocity is consistent with vis-viva and perpendicularity of h', () => {
    const s = K.elementsToStateKm(ISS_LIKE)
    expect(s.vKmS).toBeCloseTo(K.velocityKmS(ISS_LIKE.aKm, ISS_LIKE.e, s.rKm), 9)
    const h = [
      s.posKm.y * s.velKmS.z - s.posKm.z * s.velKmS.y,
      s.posKm.z * s.velKmS.x - s.posKm.x * s.velKmS.z,
      s.posKm.x * s.velKmS.y - s.posKm.y * s.velKmS.x,
    ]
    expect(h[0] * s.posKm.x + h[1] * s.posKm.y + h[2] * s.posKm.z).toBeCloseTo(0, 6)
  })
})

describe('Kepler equation solver', () => {
  it('M = E - e sin E inverts accurately at high eccentricity', () => {
    for (const e of [0, 0.3, 0.7, 0.95]) {
      for (const M of [0.1, 1.0, Math.PI, 5.9]) {
        const nu = K.meanToTrueAnomalyRad(M, e)
        let E = K.eccentricFromTrueAnomalyRad(nu, e)
        while (E < M - Math.PI) E += 2 * Math.PI // align turn convention
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10)
      }
    }
  })
  it('near perigee the satellite sweeps angle faster than near apogee', () => {
    const el = { aKm: 20000, e: 0.5, iDeg: 30, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
    const T = K.periodSec(el.aKm)
    const nuAt = (sec) => {
      const M = (2 * Math.PI * sec) / T
      return K.meanToTrueAnomalyRad(M, el.e) * 180 / Math.PI
    }
    const perigeeSweep = nuAt(600) - nuAt(0)
    const apogeeSweep = ((nuAt(T / 2 + 300) - nuAt(T / 2 - 300)) + 720) % 360
    expect(perigeeSweep).toBeGreaterThan(apogeeSweep * 3)
  })
})

describe('J2 and Sun-synchronous relations', () => {
  it('ISS nodal regression ~ -4.9 deg/day (Vallado example magnitude)', () => {
    const el = { aKm: 6796, e: 0.0004, iDeg: 51.6 }
    const rate = K.j2NodalPrecessionDegDay(el.aKm, el.e, el.iDeg)
    expect(rate).toBeLessThan(-4.5)
    expect(rate).toBeGreaterThan(-5.4)
  })
  it('SSO at 700 km gives i ~ 98.2 deg (standard reference)', () => {
    expect(K.sunSyncInclinationDeg(6378.137 + 700)).toBeCloseTo(98.2, 1)
  })
  it('SSO precession target is met within first-order model', () => {
    const aKm = 6378.137 + 700
    const i = K.sunSyncInclinationDeg(aKm)
    expect(K.j2NodalPrecessionDegDay(aKm, 0, i)).toBeCloseTo(360 / 365.2421897, 3)
  })
})

describe('geometry helpers', () => {
  it('polyline closes and has requested sample count', () => {
    const pts = K.orbitPolylineKm(ISS_LIKE, 64)
    expect(pts.length).toBe(65 * 3)
    expect(Math.hypot(pts[0] - pts[192], pts[1] - pts[193], pts[2] - pts[194])).toBeLessThan(1e-6)
  })
  it('markers: equatorial orbit has no nodes; circular has no apsides', () => {
    const m1 = K.orbitMarkersKm({ ...ISS_LIKE, iDeg: 0 })
    expect(m1.ascendingNodeKm).toBeNull()
    const m2 = K.orbitMarkersKm({ ...ISS_LIKE, e: 0 })
    expect(m2.perigeeKm).toBeNull()
    expect(m2.apogeeKm).toBeNull()
  })
})
