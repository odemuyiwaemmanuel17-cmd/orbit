/**
 * M-CINE — cinematic landing logic tests.
 *
 * The scroll/camera math is deterministic and pure, so the whole
 * choreography contract is checkable headless: window coverage and
 * monotonic fades, camera path continuity and waypoint exactness, and —
 * the honesty spine — that every telemetry/ring/transfer builder
 * reproduces INDEPENDENT vis-viva and geodetic arithmetic.
 */
import { describe, expect, it } from 'vitest'
import * as sm from 'satellite.js'
import {
  clamp01, smoothstep, SCENES, windowOpacity, windowLocal, cameraAt, CAM_KEYS,
  orbitScenePoints, satStateAt, telemetryRows, elementRows, beamCurve,
  visibleStations, transferViz, qualityTier, supportsWebGL,
} from '../src/lib/cinematic.js'
import { EARTH_RADIUS_KM, altToRadius } from '../src/lib/coords.js'
import { DEFAULT_STATIONS } from '../src/lib/stations.js'
import catalog from '../src/data/satellites.json'
import { MU_EARTH_KM3S2, R_EARTH_EQUATORIAL_KM } from '../src/lib/constants.js'

const iss = catalog.satellites.find((s) => s.id === 'norad-25544')
const issRec = sm.twoline2satrec(iss.line1, iss.line2)

describe('scroll windows', () => {
  it('five contiguous scenes tile [0,1] exactly', () => {
    expect(SCENES.length).toBe(5)
    expect(SCENES[0].from).toBe(0)
    expect(SCENES[SCENES.length - 1].to).toBe(1)
    for (let i = 1; i < SCENES.length; i++) expect(SCENES[i].from).toBe(SCENES[i - 1].to)
  })
  it('windowOpacity: zero outside, plateau inside, monotone fades', () => {
    const w = SCENES[2]
    expect(windowOpacity(0, w)).toBe(0)
    expect(windowOpacity(1, w)).toBe(0)
    expect(windowOpacity((w.from + w.to) / 2, w)).toBeCloseTo(1, 6)
    let last = 0
    for (let p = w.from - 0.05; p <= (w.from + w.to) / 2; p += 0.005) {
      const v = windowOpacity(p, w)
      expect(v).toBeGreaterThanOrEqual(last - 1e-9)
      last = v
    }
  })
  it('windowLocal is 0/1 at the edges and monotone', () => {
    const w = SCENES[1]
    expect(windowLocal(w.from, w)).toBeCloseTo(0, 9)
    expect(windowLocal(w.to, w)).toBeCloseTo(1, 9)
    expect(windowLocal((w.from + w.to) / 2, w)).toBeGreaterThan(0.5) // smoothstep
  })
  it('clamp01/smoothstep endpoints', () => {
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(9)).toBe(1)
    expect(smoothstep(0, 1, 0)).toBe(0)
    expect(smoothstep(0, 1, 1)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 9)
  })
})

describe('camera path', () => {
  it('passes EXACTLY through every waypoint (both pos and look)', () => {
    for (const k of CAM_KEYS) {
      const c = cameraAt(k.p)
      for (let i = 0; i < 3; i++) {
        expect(c.pos[i]).toBeCloseTo(k.pos[i], 9)
        expect(c.look[i]).toBeCloseTo(k.look[i], 9)
      }
    }
  })
  it('is continuous: adjacent samples never jump more than a chord step', () => {
    let prev = cameraAt(0).pos
    let maxStep = 0
    for (let p = 0.001; p <= 1.0001; p += 0.001) {
      const cur = cameraAt(p).pos
      const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2])
      expect(Number.isFinite(d)).toBe(true)
      maxStep = Math.max(maxStep, d)
      prev = cur
    }
    expect(maxStep).toBeLessThan(0.06) // smooth cinematic flight, no teleport
  })
  it('stays outside the planet + atmosphere shell for the whole flight', () => {
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const [x, y, z] = cameraAt(p).pos
      expect(Math.hypot(x, y, z)).toBeGreaterThan(1.08)
    }
  })
  it('clamps beyond the ends', () => {
    expect(cameraAt(-2).pos).toEqual(cameraAt(0).pos)
    expect(cameraAt(5).pos).toEqual(cameraAt(1).pos)
  })
})

describe('real-data telemetry (ISS snapshot)', () => {
  const tMs = Date.UTC(2026, 9, 27, 12, 0, 0)
  it('satStateAt reproduces vis-viva and the sphere mapping independently', () => {
    const st = satStateAt(issRec, tMs)
    expect(st).not.toBeNull()
    // scene radius must match altToRadius(alt) within the geodetic/scene loop
    const rScene = Math.hypot(...st.scene)
    const rExpected = 1 + 0.26 * Math.log10(1 + Math.max(st.altKm, 0) / 90)
    expect(rScene).toBeCloseTo(rExpected, 6)
    // vis-viva: v^2 = mu(2/r - 1/a) with the TRUE ECI radius, not mean-R + alt
    const rKm = st.rKm
    const vVisViva = Math.sqrt(MU_EARTH_KM3S2 * (2 / rKm - 1 / st.elements.aKm))
    expect(st.speedKmS).toBeCloseTo(vVisViva, 4)
    // ISS is a near-circular LEO orbit: sanity band, not a decoration
    expect(st.altKm).toBeGreaterThan(350)
    expect(st.altKm).toBeLessThan(500)
    expect(st.elements.iDeg).toBeGreaterThan(51)
    expect(st.elements.iDeg).toBeLessThan(52)
  })
  it('telemetryRows/elementRows are complete and label every value', () => {
    const st = satStateAt(issRec, tMs)
    const rows = telemetryRows(iss, st)
    expect(rows.map((r) => r.label)).toEqual(
      ['NAME', 'NORAD', 'ALT', 'VEL', 'LAT', 'LON', 'INC', 'PERIOD'])
    expect(rows.find((r) => r.label === 'NORAD').value).toBe('25544')
    expect(rows.find((r) => r.label === 'ALT').value).toMatch(/km$/)
    const el = elementRows(st)
    expect(el.length).toBe(8)
    expect(el.find((r) => r.label === 'SEMIMAJOR').value).toMatch(/^6\d{3}\.\d km$/)
  })
  it('orbitScenePoints closes a ring of finite scene points around the unit Earth', () => {
    const pts = orbitScenePoints(issRec, tMs, 48)
    expect(pts.length).toBe(49)
    // One period nearly closes: SGP4 secular J2 drift over ~93 min (RAAN
    // ~0.19°, argPerigee ~0.12°) puts the wrap-around a few thousandths of a
    // scene unit off — a tolerance, not equality.
    for (let i = 0; i < 3; i++) expect(Math.abs(pts[0][i] - pts[48][i])).toBeLessThan(0.01)
    for (const [x, y, z] of pts) {
      expect(Number.isFinite(x + y + z)).toBe(true)
      const r = Math.hypot(x, y, z)
      expect(r).toBeGreaterThan(1.02)
      expect(r).toBeLessThan(1.25) // LEO shell under the compression law
    }
  })
})

describe('beams and stations', () => {
  const tMs = Date.UTC(2026, 9, 27, 12, 0, 0)
  it('beam endpoints anchor at the station surface and the satellite', () => {
    const st = satStateAt(issRec, tMs)
    // the scene only beams to in-view stations — test that real contract
    const vis = visibleStations(DEFAULT_STATIONS, st, 55)
    expect(vis.length).toBeGreaterThan(0)
    const pts = beamCurve(vis[0], st.scene)
    const r0 = Math.hypot(...pts[0])
    expect(r0).toBeGreaterThan(0.98) // station sits on the sphere (bump ~1 at u=0)
    expect(r0).toBeLessThan(1.02)
    const end = pts[pts.length - 1]
    expect(Math.hypot(end[0] - st.scene[0], end[1] - st.scene[1], end[2] - st.scene[2]))
      .toBeLessThan(1e-9)
    // for a visible station the lifted arc bulges outward past the anchor radius
    const mid = Math.hypot(...pts[Math.floor(pts.length / 2)])
    expect(mid).toBeGreaterThan(r0)
  })
  it('visibleStations uses the true central angle (independent recompute)', () => {
    const sub = { latDeg: 10, lonDeg: 40 }
    const fake = [{ name: 'A', latDeg: 11, lonDeg: 41 }, { name: 'B', latDeg: -80, lonDeg: 100 }]
    const vis = visibleStations(fake, sub, 5)
    expect(vis.map((s) => s.name)).toEqual(['A'])
  })
})

describe('transfer visualization (scene 04)', () => {
  it('Δv matches the validated M3 Hohmann library exactly', () => {
    const tv = transferViz({ altFromKm: 428, altToKm: 1200, incDeg: 51.6 })
    const r1 = EARTH_RADIUS_KM + 428
    const r2 = EARTH_RADIUS_KM + 1200
    const v1 = Math.sqrt(MU_EARTH_KM3S2 / r1)
    const aT = (r1 + r2) / 2
    const dv1 = (Math.sqrt(MU_EARTH_KM3S2 * (2 / r1 - 1 / aT)) - v1) * 1000
    const dv2 = (Math.sqrt(MU_EARTH_KM3S2 / r2) - Math.sqrt(MU_EARTH_KM3S2 * (2 / r2 - 1 / aT))) * 1000
    expect(tv.dv1Mps).toBeCloseTo(dv1, 9)
    expect(tv.dv2Mps).toBeCloseTo(dv2, 9)
    expect(tv.totalDvMps).toBeCloseTo(dv1 + dv2, 9)
  })
  it('arc starts at the departure radius and ends at the target radius', () => {
    const tv = transferViz({ altFromKm: 428, altToKm: 1200, incDeg: 51.6 })
    const rOf = (p) => Math.hypot(...p)
    // endpoints land on the equator, where eciToGeodetic measures height above
    // the WGS84 ELLIPSOID (6378.137 km), not the mean sphere (6371 km)
    const r1 = altToRadius(EARTH_RADIUS_KM + 428 - R_EARTH_EQUATORIAL_KM)
    const r2 = altToRadius(EARTH_RADIUS_KM + 1200 - R_EARTH_EQUATORIAL_KM)
    expect(rOf(tv.pts[0])).toBeCloseTo(r1, 6)
    expect(rOf(tv.pts[tv.pts.length - 1])).toBeCloseTo(r2, 6)
    expect(tv.pts.every((p) => p.every(Number.isFinite))).toBe(true)
  })
})

describe('perf tiers and fallback', () => {
  it('mobile tier reduces load and keeps beams off', () => {
    const m = qualityTier({ mobile: true })
    const d = qualityTier({ mobile: false })
    expect(m.maxSats).toBeLessThan(d.maxSats)
    expect(m.beams).toBe(false)
    expect(d.beams).toBe(true)
    expect(m.dpr[1]).toBeLessThanOrEqual(d.dpr[1])
  })
  it('reduced motion raises camera damping (snappier, less drift)', () => {
    expect(qualityTier({ reducedMotion: true }).cameraDamping)
      .toBeGreaterThan(qualityTier({}).cameraDamping)
  })
  it('supportsWebGL survives a non-canvas environment', () => {
    expect(supportsWebGL({ getContext: () => null })).toBe(false)
    expect(supportsWebGL({ getContext: () => ({}) })).toBe(true)
  })
})
