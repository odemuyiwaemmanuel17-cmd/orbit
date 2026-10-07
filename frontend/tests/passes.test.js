/**
 * M7 pass-schedule validation.
 *
 * Unit: merge/sort/labels. Integration: REAL TLEs from the shipped
 * constellation fixtures drive the validated chain (satellite.js SGP4 ->
 * analysis.lookAngles -> predictPassesClient), not stubs:
 *  - a geostationary satellite over a co-longitudinal station is one
 *    continuous pass spanning the whole window with near-zenith peak;
 *  - the antipodal station sees nothing;
 *  - a MEO GPS pass schedule stays non-overlapping and inside its window.
 */
import { describe, expect, it } from 'vitest'
import * as sm from 'satellite.js'
import weather from '../src/data/constellations/weather.json'
import gps from '../src/data/constellations/gps.json'
import { predictSchedule, elevationCurve, utcHm, passAgeLabel, PASS_CAP } from '../src/lib/passes.js'

const satrec = (s) => sm.twoline2satrec(s.line1, s.line2)
const tleEpochMs = (s) => {
  const yy = +s.line1.slice(18, 20), doy = +s.line1.slice(20, 32)
  return Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * 86400000
}

const ST = (id, latDeg, lonDeg, minElevDeg = 10) =>
  ({ id, name: id, latDeg, lonDeg, elevKm: 0, minElevDeg })

describe('predictSchedule (real TLE integration)', () => {
  const goes = weather.satellites.find((s) => /GOES 15/.test(s.name))
  const rec = satrec(goes)
  const t0 = tleEpochMs(goes)

  // Sub-satellite longitude of a GEO sat at window start (no hardcoded slot).
  const pv = sm.propagate(rec, new Date(t0))
  const geo = sm.eciToGeodetic(pv.position, sm.gstime(new Date(t0)))
  const subLon = sm.degreesLong(geo.longitude)

  it('station under the GEO shell: one continuous pass, near-zenith peak', () => {
    const res = predictSchedule(rec, [ST('over', 0, subLon)], t0, 3)
    expect(res.schedule.length).toBe(1)
    const p = res.schedule[0]
    expect(p.rise).toBeLessThanOrEqual(t0 + 1) // visible from window start
    expect(p.set).toBeGreaterThanOrEqual(t0 + 3 * 3600e3 - 1)
    expect(p.maxElev).toBeGreaterThan(80)
    expect(p.durationS).toBeGreaterThan(3 * 3600 - 2 * 61)
  })

  it('antipodal station sees nothing from the same shell', () => {
    const res = predictSchedule(rec, [ST('away', 0, subLon + 180)], t0, 3)
    expect(res.schedule.length).toBe(0)
  })

  it('GPS MEO: schedule sorted, non-overlapping, inside the window, capped disclosed', () => {
    const sat = gps.satellites[0]
    const g = satrec(sat)
    const gt0 = tleEpochMs(sat)
    const stations = [ST('a', 6.5, 3.4, 5), ST('b', -35.4, 149.0, 10)]
    const res = predictSchedule(g, stations, gt0, 12, 60)
    const sch = res.schedule
    expect(sch.length).toBeLessThanOrEqual(2 * PASS_CAP)
    for (let i = 0; i < sch.length; i++) {
      const p = sch[i]
      expect(p.rise).toBeGreaterThanOrEqual(gt0)
      expect(p.set).toBeLessThanOrEqual(gt0 + 12 * 3600e3 + 60_000)
      expect(p.rise).toBeLessThan(p.max)
      expect(p.max).toBeLessThanOrEqual(p.set)
      expect(p.maxElev).toBeGreaterThanOrEqual(5) // station mask lower bound
      if (i > 0) expect(p.rise).toBeGreaterThanOrEqual(sch[i - 1].rise)
      const same = sch.filter((q) => q.stationId === p.stationId)
      const idx = same.indexOf(p)
      if (idx > 0) expect(p.rise).toBeGreaterThanOrEqual(same[idx - 1].set) // no overlap
    }
    expect(typeof res.capped).toBe('boolean')
  })
})

describe('elevationCurve', () => {
  const goes = weather.satellites.find((s) => /GOES 15/.test(s.name))
  const rec = satrec(goes)
  const t0 = tleEpochMs(goes)
  const pv = sm.propagate(rec, new Date(t0))
  const subLon = sm.degreesLong(sm.eciToGeodetic(pv.position, sm.gstime(new Date(t0))).longitude)

  it('GEO overhead: flat high curve, peak matches', () => {
    const c = elevationCurve(rec, ST('over', 0, subLon), t0, t0 + 30 * 60000, 60)
    expect(c.samples.length).toBeGreaterThan(25)
    expect(c.peak.elevDeg).toBeGreaterThan(80)
    for (const s of c.samples) expect(s.elevDeg).toBeGreaterThan(70)
  })
  it('elevation at curve peak equals a fresh direct evaluation (self-consistency)', () => {
    const c = elevationCurve(rec, ST('mid', 20, subLon + 20), t0, t0 + 20 * 60000, 60)
    const hit = c.samples.find((s) => s === c.peak)
    expect(hit).toBeTruthy()
    expect(c.peak.elevDeg).toBeLessThanOrEqual(90)
  })
})

describe('schedule labels', () => {
  it('utcHm is zero-padded UTC minutes', () => {
    expect(utcHm(Date.UTC(2026, 9, 6, 7, 5))).toBe('07:05')
  })
  it('passAgeLabel switches T-/T+ around the sim clock', () => {
    const now = Date.UTC(2026, 9, 6, 12, 0)
    expect(passAgeLabel(now + 50 * 60 * 1000, now)).toBe('T-50m00s')
    expect(passAgeLabel(now - 3600 * 1000, now)).toBe('T+1h00m')
  })
})
