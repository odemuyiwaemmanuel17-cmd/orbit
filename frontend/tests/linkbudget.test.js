/**
 * M10 link-budget validation: dB-chain hand checks, slant-geometry
 * identities, NF-vs-G/T path equivalence, constants pinning, preset bands,
 * and honest rejection of invalid input.
 */
import { describe, expect, it } from 'vitest'
import {
  slantFromElevationKm, fsplDb, channelCapacityBps, linkBudgetKm, LINK_PRESETS,
} from '../src/lib/linkbudget.js'
import { K_DBW_PER_K, K_DBM_HZ_290K, R_EARTH_MEAN_KM } from '../src/lib/constants.js'

describe('slant geometry (spherical twin of M6)', () => {
  it('e=90 gives the altitude itself; e=0 gives the exact tangent length', () => {
    expect(slantFromElevationKm(90, 400)).toBeCloseTo(400, 9)
    expect(slantFromElevationKm(0, 400)).toBeCloseTo(Math.sqrt(6771 ** 2 - 6371 ** 2), 6)
  })
  it('solves the law of cosines rk^2 = rs^2 + rho^2 + 2 rs rho sin(e)', () => {
    for (const e of [5, 17, 30, 61, 88]) {
      const rho = slantFromElevationKm(e, 550)
      const lhs = (R_EARTH_MEAN_KM + 550) ** 2
      const rhs = R_EARTH_MEAN_KM ** 2 + rho * rho
        + 2 * R_EARTH_MEAN_KM * rho * Math.sin(e * Math.PI / 180)
      expect(rhs).toBeCloseTo(lhs, 6)
    }
  })
  it('monotone decreasing in elevation', () => {
    const a = slantFromElevationKm(10, 400), b = slantFromElevationKm(45, 400)
    expect(b).toBeLessThan(a)
  })
  it('rejects zero altitude', () => expect(() => slantFromElevationKm(10, 0)).toThrow(RangeError))
})

describe('free space loss and noise constants', () => {
  it('FSPL hand check at 400 km / 2200 MHz', () => {
    expect(fsplDb(400, 2200)).toBeCloseTo(32.44 + 20 * Math.log10(400) + 20 * Math.log10(2200), 9)
  })
  it('6 dB per distance/frequency doubling', () => {
    expect(fsplDb(800, 2200) - fsplDb(400, 2200)).toBeCloseTo(6.0206, 3)
  })
  it('Boltzmann log forms pinned to CODATA exact k and ITU 290 K', () => {
    expect(K_DBW_PER_K).toBeCloseTo(10 * Math.log10(1.380649e-23), 12)
    expect(K_DBM_HZ_290K).toBeCloseTo(-173.9755, 3)
    expect(K_DBM_HZ_290K).toBeCloseTo(K_DBW_PER_K + 10 * Math.log10(290) + 30, 12)
  })
})

describe('link budget chain', () => {
  const base = {
    ptxDbm: 37, txGainDbi: 6, freqMhz: 2200, slantKm: slantFromElevationKm(10, 400),
    atmosLossDb: 1, pointingLossDb: 1.5, otherLossDb: 2, implementationLossDb: 1,
    bitRateKbps: 250, requiredEbN0Db: 10.5, rxGainDbi: 20, nfDb: 1.5,
  }
  it('chain self-consistency: Eb/N0 = C/N0 - 10log(Rb) - impl, margin = Eb/N0 - req', () => {
    const r = linkBudgetKm(base)
    expect(r.eirpDbm).toBeCloseTo(43, 12)
    expect(r.prxDbm).toBeCloseTo(r.eirpDbm - r.pathLossDb + 20, 9)
    expect(r.ebN0DbDb).toBeCloseTo(r.cN0DbHz - 10 * Math.log10(250e3) - 1, 9)
    expect(r.marginDb).toBeCloseTo(r.ebN0DbDb - 10.5, 9)
    expect(r.verdict).toBe(r.marginDb >= 0 ? 'GO' : 'NO-GO')
  })
  it('NF path == G/T path for the same physical receiver (Tsys = 290*10^(NF/10))', () => {
    // NF 1.5 dB at 290 K source => total system noise temperature 290*F.
    const gt = { ...base, nfDb: undefined, rxGTdBperK: 20 - 10 * Math.log10(290 * 10 ** (1.5 / 10)) }
    const a = linkBudgetKm(base)
    const b = linkBudgetKm(gt)
    expect(b.cN0DbHz).toBeCloseTo(a.cN0DbHz, 9)
    expect(b.prxDbm).toBeCloseTo(a.prxDbm, 9)
  })
  it('+3.01 dB EIRP doubles the zero-margin max bit rate (10log10(2))', () => {
    const lo = linkBudgetKm(base)
    const hi = linkBudgetKm({ ...base, ptxDbm: base.ptxDbm + 10 * Math.log10(2) })
    expect(hi.maxBitRateKbps / lo.maxBitRateKbps).toBeCloseTo(2, 6)
  })
  it('zero-margin point: maxBitRate at exactly margin 0 when Rb = maxBitRate', () => {
    const r = linkBudgetKm(base)
    const again = linkBudgetKm({ ...base, bitRateKbps: r.maxBitRateKbps })
    expect(again.marginDb).toBeCloseTo(0, 6)
  })
  it('missing receiver model or NaN inputs throw instead of fabricating', () => {
    const { nfDb, ...noRx } = base
    expect(() => linkBudgetKm(noRx)).toThrow(RangeError)
    expect(() => linkBudgetKm({ ...base, slantKm: NaN })).toThrow(RangeError)
  })
})

describe('presets and capacity', () => {
  it('GEO S-band slow telemetry budget lands in a believable 30 m dish band', () => {
    const r = linkBudgetKm({ ...LINK_PRESETS.geoSbandLowRate,
      slantKm: 40000, rxGainDbi: 40, nfDb: 1.5 })
    expect(r.cN0DbHz).toBeGreaterThan(60)
    expect(r.cN0DbHz).toBeLessThan(75)
    expect(r.verdict).toBe('GO')
  })
  it('X-band preset at 2000 km beats S-band at the same slant', () => {
    const x = linkBudgetKm({ ...LINK_PRESETS.leoXband, slantKm: 2000, rxGainDbi: 20, nfDb: 1.0 })
    const s = linkBudgetKm({ ...LINK_PRESETS.leoSband, slantKm: 2000, rxGainDbi: 20, nfDb: 1.5 })
    expect(x.eirpDbm).toBeGreaterThan(s.eirpDbm)
    expect(x.cN0DbHz).toBeGreaterThan(s.cN0DbHz)
  })
  it('AWGN capacity: monotone in C/N0, matches transcribed Shannon formula', () => {
    const bw = 2e6
    const c1 = channelCapacityBps(70, bw), c2 = channelCapacityBps(76, bw)
    expect(c2).toBeGreaterThan(c1)
    const snr = 10 ** ((70 - 10 * Math.log10(bw)) / 10)
    expect(c1).toBeCloseTo(bw * Math.log2(1 + snr), 6)
  })
})
