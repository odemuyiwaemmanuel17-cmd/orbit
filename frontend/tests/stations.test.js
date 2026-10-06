/**
 * M6 ground-station validation: spherical look-angle identities,
 * horizon anchor, catalogue validation, storage round-trip.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATIONS, STORAGE_KEY, validateStation, loadStations, saveStations,
  lookAngleKm, horizonHalfAngleDeg,
} from '../src/lib/stations.js'

const ST = { id: 'x', name: 'Test', latDeg: 0, lonDeg: 0, elevKm: 0, minElevDeg: 10 }

describe('spherical look angles', () => {
  it('satellite directly overhead reads elevation 90', () => {
    const a = lookAngleKm(ST, { latDeg: 0, lonDeg: 0, altKm: 500 })
    expect(a.elevDeg).toBeCloseTo(90, 9)
    expect(a.slantRangeKm).toBeCloseTo(500, 6)
  })
  it('antipodal satellite is straight down: elevation -90', () => {
    const a = lookAngleKm(ST, { latDeg: 0, lonDeg: 180, altKm: 500 })
    expect(a.elevDeg).toBeCloseTo(-90, 6)
    expect(a.slantRangeKm).toBeCloseTo(6371 + (6371 + 500), 3)
    expect(a.aboveMinElev).toBe(false)
  })
  it('elevation matches the closed form atan2(cos(gamma) - rs/rk, sin(gamma))', () => {
    // Independent derivation (not the module's dot-product path):
    // station radius rs, satellite radius rk, geocentric angle gamma.
    const gamma = 10 * (Math.PI / 180)
    const rs = 6371.0, rk = 6371.0 + 400
    const expectedDeg = Math.atan2(Math.cos(gamma) - rs / rk, Math.sin(gamma)) * (180 / Math.PI)
    const a = lookAngleKm(ST, { latDeg: 10, lonDeg: 0, altKm: 400 })
    expect(a.elevDeg).toBeCloseTo(expectedDeg, 9)
  })
  it('slant range shrinks monotonically as the satellite rises toward zenith', () => {
    const d = [70, 50, 30, 10, 0].map((lonDeg) =>
      lookAngleKm(ST, { latDeg: 0, lonDeg, altKm: 400 }))
    for (let i = 1; i < d.length; i += 1) {
      expect(d[i].slantRangeKm).toBeLessThan(d[i - 1].slantRangeKm)
      expect(d[i].elevDeg).toBeGreaterThan(d[i - 1].elevDeg)
    }
  })
  it('horizon geometry for a fixed shell: a higher station sees a SMALLER above-horizon cap', () => {
    // tan(elev) = (rk cos(gamma) - rs) / (rk sin(gamma)) — elevation drops as
    // the station rises toward the satellite shell. The intuitive "climb to
    // see over the horizon" applies to the EARTH surface, not to a satellite
    // at fixed altitude. Verified against the closed form at gamma = 88 deg:
    // elev(radians) difference rs 6371 vs 6372 is ~ -0.005 deg (more negative).
    const sea = { ...ST, elevKm: 0 }
    const high = { ...ST, elevKm: 1 }
    const a = lookAngleKm(sea, { latDeg: 0, lonDeg: 88, altKm: 400 })
    const b = lookAngleKm(high, { latDeg: 0, lonDeg: 88, altKm: 400 })
    expect(b.elevDeg).toBeLessThan(a.elevDeg)
    const hSea = horizonHalfAngleDeg(sea, 400)
    const hHigh = horizonHalfAngleDeg(high, 400)
    expect(hHigh).toBeLessThan(hSea)
    // sea-level horizon anchor: cos(gamma) = 6371/6771 -> gamma = 19.84 deg
    expect(hSea).toBeCloseTo(Math.acos(6371 / 6771) * (180 / Math.PI), 6)
  })
  it('elevation is exactly 0 at the geometric horizon half-angle', () => {
    const st = { ...ST, elevKm: 0.5 }
    const satAlt = 400
    const gamma = horizonHalfAngleDeg(st, satAlt)
    const a = lookAngleKm(st, { latDeg: 0, lonDeg: gamma, altKm: satAlt })
    expect(a.elevDeg).toBeCloseTo(0, 4)
    expect(a.aboveMinElev).toBe(false) // 0 < minElev 10
  })
  it('min-elevation verdict flips across the configured mask', () => {
    const st = { ...ST, minElevDeg: 30 }
    expect(lookAngleKm(st, { latDeg: 0, lonDeg: 0, altKm: 400 }).aboveMinElev).toBe(true)
    expect(lookAngleKm(st, { latDeg: 0, lonDeg: 60, altKm: 400 }).aboveMinElev).toBe(false)
  })
})

describe('station catalogue validation', () => {
  it('defaults all validate and have unique ids', () => {
    for (const s of DEFAULT_STATIONS) expect(validateStation(s).ok).toBe(true)
    expect(new Set(DEFAULT_STATIONS.map((s) => s.id)).size).toBe(DEFAULT_STATIONS.length)
  })
  it('rejects out-of-range and non-finite fields', () => {
    const bad = { id: 'b', name: 'Bad', latDeg: 95, lonDeg: 0, elevKm: 0, minElevDeg: 10 }
    expect(validateStation(bad).ok).toBe(false)
    expect(validateStation({ ...bad, latDeg: 0, lonDeg: NaN }).ok).toBe(false)
    expect(validateStation({ ...bad, latDeg: 0, minElevDeg: -1 }).ok).toBe(false)
  })
  it('rejects empty or non-object input without throwing', () => {
    expect(validateStation(null).ok).toBe(false)
    expect(validateStation({ ...DEFAULT_STATIONS[0], name: '  ' }).ok).toBe(false)
  })
})

describe('storage-agnostic persistence', () => {
  const fakeStorage = () => {
    const m = new Map()
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
  }
  it('empty storage falls back to the default catalogue', () => {
    expect(loadStations(fakeStorage())).toEqual(DEFAULT_STATIONS)
  })
  it('round-trips a custom list', () => {
    const st = fakeStorage()
    const mine = [{ id: 'home', name: 'Home', latDeg: 6.5, lonDeg: 3.4, elevKm: 0.01, minElevDeg: 5, source: 'user-defined' }]
    saveStations(mine, st)
    expect(loadStations(st)).toEqual(mine)
  })
  it('corrupt payloads degrade to defaults, not exceptions', () => {
    const st = fakeStorage()
    st.setItem(STORAGE_KEY, '{not json')
    expect(loadStations(st)).toEqual(DEFAULT_STATIONS)
    st.setItem(STORAGE_KEY, JSON.stringify([{ junk: true }]))
    expect(loadStations(st)).toEqual(DEFAULT_STATIONS)
  })
})
