import { describe, it, expect } from 'vitest'
import {
  screenPairKm, screenCatalogKm, severityBandKm, tcaOffsetMin,
} from '../src/lib/conjunction.js'
import { elementsToStateKm } from '../src/lib/kepler.js'
import { MU_EARTH_KM3S2, RAD_PER_DEG, DEG_PER_RAD } from '../src/lib/constants.js'

/** Analytic Kepler sampler (circular): the same sampler contract the app
 *  fulfils with SGP4 — screening code cannot tell the difference. */
function circularSampler(el) {
  const n = Math.sqrt(MU_EARTH_KM3S2 / el.aKm ** 3)
  return (tMs) => {
    const nuRad = el.trueAnomalyDeg * RAD_PER_DEG + n * (tMs / 1000)
    const s = elementsToStateKm({ ...el, e: el.e ?? 0, trueAnomalyDeg: (nuRad * DEG_PER_RAD + 360) % 360 })
    return { posKm: s.posKm, velKmS: s.velKmS }
  }
}

const A7 = 7000
const T7 = 2 * Math.PI * Math.sqrt(A7 ** 3 / MU_EARTH_KM3S2) // s
const MS = (s) => s * 1000

describe('screenPairKm on analytically-known geometries', () => {
  it('coplanar circular phasing difference: separation is CONSTANT 2a sin(θ/2)', () => {
    const theta = 30 * RAD_PER_DEG
    const a = circularSampler({ aKm: A7, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 })
    const b = circularSampler({ aKm: A7, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 30 })
    const r = screenPairKm({ samplerA: a, samplerB: b, tStartMs: 0, tEndMs: MS(T7), stepS: T7 / 500 })
    expect(r.missKm).toBeCloseTo(2 * A7 * Math.sin(theta / 2), 6)
    expect(r.bad).toBe(0)
  })
  it('concentric circular orbits aligned at t0: min miss = |a1 − a2|', () => {
    // Different radii => different rates, so alignment is exact only at t0;
    // for any later angle gap the law-of-cosines distance exceeds |Δa|,
    // which is exactly what the screen must return.
    const inner = circularSampler({ aKm: 7000, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 12 })
    const outer = circularSampler({ aKm: 7150, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 12 })
    const r = screenPairKm({ samplerA: inner, samplerB: outer, tStartMs: 0, tEndMs: MS(T7), stepS: T7 / 500 })
    expect(r.missKm).toBeCloseTo(150, 6)
  })
  it('perpendicular polar orbits with a quarter-period B delay: EXACT miss = a at T/8', () => {
    // Closed-form (chord-free): |Δ|² = r²[1 + (cos x − sin x)²]... min at
    // nt = π/4 (t = T/8) gives |Δ| = r EXACTLY, and the velocity triangle
    // at that instant has a 120° angle between the two tangents => |Δv| = v√3.
    const P = { aKm: A7, e: 0, iDeg: 90, argPerigeeDeg: 0, trueAnomalyDeg: 90 } // at (0,0,a)
    const aSam = circularSampler({ ...P, raanDeg: 0 })
    const bSam = circularSampler({ ...P, raanDeg: 90, trueAnomalyDeg: 0 }) // reaches P at T/4
    const r = screenPairKm({ samplerA: aSam, samplerB: bSam, tStartMs: 0, tEndMs: MS(T7), stepS: T7 / 2000 })
    expect(r.missKm).toBeCloseTo(A7, 6)
    const v = Math.sqrt(MU_EARTH_KM3S2 / A7)
    expect(r.relVelKmS).toBeCloseTo(v * Math.sqrt(3), 6)
    // analytic TCA at T/8 (exactly on this grid)
    expect(Math.abs(r.tcaMs - MS(T7 / 8))).toBeLessThanOrEqual(MS(T7 / 2000))
  })
  it('same place same time: the screen finds the ~zero miss', () => {
    const P = { aKm: A7, e: 0, iDeg: 90, argPerigeeDeg: 0, trueAnomalyDeg: 90 }
    const aSam = circularSampler({ ...P, raanDeg: 0 })
    const bSam = circularSampler({ ...P, raanDeg: 90 })
    const r = screenPairKm({ samplerA: aSam, samplerB: bSam, tStartMs: 0, tEndMs: MS(T7), stepS: T7 / 1000 })
    expect(r.missKm).toBeLessThan(A7 * 1e-6)
    expect(r.tcaMs).toBe(0)
  })
  it('guards: bad step, empty window, absurd grid resolution', () => {
    const s = circularSampler({ aKm: A7, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 })
    expect(() => screenPairKm({ samplerA: s, samplerB: s, tStartMs: 0, tEndMs: MS(1000), stepS: 0 }))
      .toThrow(/stepS/)
    expect(() => screenPairKm({ samplerA: s, samplerB: s, tStartMs: 1000, tEndMs: 0, stepS: 1 }))
      .toThrow(/empty/)
    expect(() => screenPairKm({ samplerA: s, samplerB: s, tStartMs: 0, tEndMs: MS(3600), stepS: 0.01 }))
      .toThrow(/grid too fine/)
  })
  it('broken ephemeris is counted and disclosed, never silent', () => {
    const good = circularSampler({ aKm: A7, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 })
    const dead = () => ({ posKm: { x: NaN, y: NaN, z: NaN }, velKmS: { x: 0, y: 0, z: 0 } })
    const r = screenPairKm({ samplerA: good, samplerB: dead, tStartMs: 0, tEndMs: MS(600), stepS: 60 })
    expect(r.missKm).toBeNull()
    expect(r.reason).toMatch(/no valid ephemeris/)
    expect(r.bad).toBe(r.samples)
  })
  it('partial corruption: samples counted, valid ones still screened', () => {
    const a = circularSampler({ aKm: A7, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 })
    let k = 0
    const flaky = (t) => (k++ % 3 === 0
      ? { posKm: { x: NaN, y: 0, z: 0 }, velKmS: { x: 0, y: 0, z: 0 } }
      : circularSampler({ aKm: A7, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 180 })(t))
    const r = screenPairKm({ samplerA: a, samplerB: flaky, tStartMs: 0, tEndMs: MS(6000), stepS: 60 })
    expect(r.bad).toBeGreaterThan(0)
    expect(r.missKm).toBeCloseTo(2 * A7, 0) // antipodal constant 14000 km
  })
})

describe('screenCatalogKm', () => {
  const prim = circularSampler({ aKm: A7, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 90 })
  const mkCand = (phaseDeg, name) => ({
    name, id: name,
    sampler: circularSampler({ aKm: A7, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: phaseDeg }),
  })
  it('sorts by miss distance ascending and honors the pair cap', () => {
    const res = screenCatalogKm({
      samplerPrimary: prim,
      candidates: [mkCand(94, 'far'), mkCand(91.5, 'mid'), mkCand(90.2, 'closest'), mkCand(270, 'other')],
      tStartMs: 0, tEndMs: MS(T7 / 2), stepS: T7 / 1000, limitPairs: 3,
    })
    expect(res).toHaveLength(3)
    expect(res[0].name).toBe('closest')
    expect(res[1].name).toBe('mid')
    expect(res[0].missKm).toBeLessThan(res[1].missKm)
  })
  it('a dead candidate drops out without poisoning the scan', () => {
    const dead = { name: 'DEAD', sampler: () => ({ posKm: { x: NaN, y: NaN, z: NaN }, velKmS: { x: 0, y: 0, z: 0 } }) }
    const res = screenCatalogKm({
      samplerPrimary: prim, candidates: [dead, mkCand(200, 'ok')],
      tStartMs: 0, tEndMs: MS(T7 / 4), stepS: T7 / 500,
    })
    expect(res.map((r) => r.name)).toEqual(['ok'])
  })
  it('tcaOffsetMin converts the grid TCA into minutes within the window', () => {
    // window = 60,000 s = 1000.02 min
    const r = screenPairKm({ samplerA: prim, samplerB: mkCand(200, 'x').sampler, tStartMs: 1000, tEndMs: MS(60000) + 1000, stepS: 30 })
    const off = tcaOffsetMin({ tStartMs: 1000, tcaMs: r.tcaMs })
    expect(off).toBeGreaterThanOrEqual(0)
    expect(off).toBeLessThanOrEqual(1000.1)
  })
})

describe('severity bands (labeled distance heuristic, NOT Pc)', () => {
  it('bands by miss distance with the relative-speed gate at 1 km', () => {
    expect(severityBandKm({ missKm: 0.5, relVelKmS: 14 })).toBe('CRITICAL')
    expect(severityBandKm({ missKm: 0.5, relVelKmS: 0.05 })).toBe('DANGER') // slow co-orbiting pair
    expect(severityBandKm({ missKm: 5, relVelKmS: 10 })).toBe('DANGER')
    expect(severityBandKm({ missKm: 30, relVelKmS: 10 })).toBe('WATCH')
    expect(severityBandKm({ missKm: 150, relVelKmS: 10 })).toBe('INTERESTING')
    expect(severityBandKm({ missKm: 5000, relVelKmS: 1 })).toBe('BACKGROUND')
    expect(severityBandKm({ missKm: null, relVelKmS: null })).toBe('UNKNOWN')
  })
})
