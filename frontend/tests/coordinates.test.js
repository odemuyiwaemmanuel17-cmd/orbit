/**
 * V3 coordinate-system integrity (mandatory steps 3 + 11).
 *
 * Pins the contracts every visual layer depends on:
 *  1. satellite.js TEME -> geodetic <-> our ECI helper round-trip (WGS84).
 *  2. BOTH render paths (tracker dots via geodeticToScene, labs via
 *     eciToSceneKm) agree to 1e-9 for the same physical point & GMST —
 *     catches camera/GMST sign flips that screenshots cannot.
 *  3. UTC sim clock -> sun geometry: subsolar point SUNLIT, antipode UMBRA.
 *  4. SGP4 speed magnitudes match the circular-orbit closed form (units).
 */
import { describe, expect, it } from 'vitest'
import * as sm from 'satellite.js'
import { geodeticToScene, eciToSceneKm, sunDirection } from '../src/lib/coords.js'
import { geodeticEciKm, shadowFromGeodetic } from '../src/lib/eclipse.js'
import { subsolarLonDeg, sunEquatorialRad } from '../src/lib/sun.js'
import { circularVelocityKmS, periodSec } from '../src/lib/kepler.js'
import catalog from '../src/data/satellites.json'

const DEG = 180 / Math.PI
const D = new Date('2026-10-09T14:30:00Z')
const GMST = sm.gstime(D)

describe('geodetic <-> ECI (TEME) round-trip via satellite.js chain', () => {
  const cases = [[0, 0, 420], [51.6, -120.3, 500], [-33.9, 151.2, 700],
    [89.4, 45, 35786], [0, 179.9, 550], [-90, -180, 600]]
  for (const [lat, lon, alt] of cases) {
    it(`(${lat}°, ${lon}°, ${alt} km) round-trips eciToGeodetic exactly`, () => {
      const eci = geodeticEciKm(lat, lon, alt, GMST)
      const geo = sm.eciToGeodetic({ x: eci.x, y: eci.y, z: eci.z }, GMST)
      expect(geo.latitude * DEG).toBeCloseTo(lat, 6)
      expect(((geo.longitude * DEG - lon + 540) % 360) - 180).toBeCloseTo(lon - lon, 6)
      expect(geo.height).toBeCloseTo(alt, 3)
    })
  }
})

describe('render-path agreement: geodeticToScene == eciToSceneKm', () => {
  const pts = [[45, 90, 550], [-20, -70, 20200], [0, 0, 35786], [66, 25, 500]]
  for (const [lat, lon, alt] of pts) {
    it(`(${lat}, ${lon}, ${alt}) lands in the same scene unit both ways`, () => {
      const direct = geodeticToScene(lat, lon, alt)
      const eci = geodeticEciKm(lat, lon, alt, GMST)
      const viaEci = eciToSceneKm(eci.x, eci.y, eci.z, GMST)
      for (let i = 0; i < 3; i++) expect(direct.toArray()[i]).toBeCloseTo(viaEci.toArray()[i], 9)
    })
  }
  it('GMST sign convention: an ECEF +x point at GMST=g has ECI azimuth +g', () => {
    // lon 0 at time D -> ECI (cos g, sin g, 0); reversing the GMST sign in
    // eciToSceneKm would place it at lon -2g — caught here at 20°+ scale.
    const g = 0.35
    const eci = geodeticEciKm(0, 0, 0, g)
    expect(Math.atan2(eci.y, eci.x)).toBeCloseTo(g, 9)
    const scene = eciToSceneKm(eci.x, eci.y, eci.z, g)
    expect(Math.atan2(scene.z, scene.x)).toBeCloseTo(0, 9)
  })
})

describe('sun geometry synced to the simulation epoch', () => {
  it('subsolar point is SUNLIT; its antipode is in UMBRA', () => {
    const { dec } = sunEquatorialRad(D)
    const sLon = subsolarLonDeg(D)
    const subs = shadowFromGeodetic(dec * DEG, sLon, 420, D)
    expect(subs.region).toBe('SUNLIT')
    const antiLon = ((sLon + 180 + 540) % 360) - 180
    const anti = shadowFromGeodetic(-dec * DEG, antiLon, 420, D)
    expect(anti.region).toBe('UMBRA')
  })
  it('scene sunDirection points at the subsolar geodetic position', () => {
    const s = sunDirection(D)
    const at = geodeticToScene(sunEquatorialRad(D).dec * DEG, subsolarLonDeg(D), 0)
    expect(s.dot(at.normalize())).toBeGreaterThan(1 - 1e-9)
  })
})

describe('SGP4 state magnitudes against closed-form references (units)', () => {
  it('near-circular catalog sats: |v| within 0.02 km/s of sqrt(mu/r); mean motion matches sma', () => {
    const sats = catalog.satellites.filter((s) => s.eccentricity < 0.001)
    expect(sats.length).toBeGreaterThan(4)
    for (const s of sats) {
      const rec = sm.twoline2satrec(s.line1, s.line2)
      const pv = sm.propagate(rec, D)
      expect(pv).toBeTruthy()
      const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z)
      const v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
      // SGP4 returns OSCULATING states: short-period J2/drag terms make
      // |v - vcirc(r)| a few m/s to ~10 m/s even at e<0.001. 0.02 km/s is
      // the physically correct envelope; a unit or frame error is >> this.
      expect(Math.abs(v - circularVelocityKmS(r))).toBeLessThan(0.02)
      expect(Math.abs(periodSec(s.sma_km) / 60 - s.period_min)).toBeLessThan(0.15)
    }
  })
})
