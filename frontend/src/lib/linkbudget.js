/**
 * OrbitalPulse — communication link budget (M10).
 *
 * Classic dB-chain arithmetic on the spherical slant geometry already used
 * by M6/M8 (slant range here is the geometric twin of lookAngleKm's, and
 * worst-case live geometry reuses their altitude/mask values). Boltzmann and
 * the 290 K noise floor come from the centralized constants module — no
 * scattered magic numbers.
 *
 * Labels (per the accuracy-label rules):
 *  - losses are lumped user inputs (atmosphere, pointing, misc,
 *    implementation): SIMPLIFIED MODEL, not a propagation study;
 *  - MODULATION_REFERENCE values are textbook uncoded BER~1e-5 Eb/N0
 *    numbers: EDUCATIONAL MODEL, clearly annotated at the point of use.
 */
import { R_EARTH_MEAN_KM, K_DBW_PER_K, K_DBM_HZ_290K, RAD_PER_DEG } from './constants.js'

export const MODULATION_REFERENCE_DB = [
  { id: 'bpsk105', name: 'BPSK uncoded, BER 1e-5', ebN0Db: 9.6, label: 'EDUCATIONAL' },
  { id: 'qpsk105', name: 'QPSK uncoded, BER 1e-5', ebN0Db: 10.5, label: 'EDUCATIONAL' },
  { id: 'qpskccs12', name: 'QPSK + CCSDS r=1/2 coding', ebN0Db: 4.0, label: 'EDUCATIONAL' },
]

/** Geometric slant range for elevation e at circular altitude h (spherical).
 *  Positive root of rk^2 = rs^2 + rho^2 + 2 rs rho sin(e). */
export function slantFromElevationKm(elevDeg, altKm, rsKm = R_EARTH_MEAN_KM) {
  if (!(altKm > 0)) throw new RangeError('altKm must be > 0')
  const rk = rsKm + altKm
  const se = Math.sin(elevDeg * RAD_PER_DEG)
  return -rsKm * se + Math.sqrt(rsKm * se * rsKm * se + rk * rk - rsKm * rsKm)
}

/** Free-space path loss dB, d in km, f in MHz: 32.44 + 20log d + 20log f. */
export function fsplDb(slantKm, freqMhz) {
  if (!(slantKm > 0) || !(freqMhz > 0)) throw new RangeError('slantKm and freqMhz must be > 0')
  return 32.44 + 20 * Math.log10(slantKm) + 20 * Math.log10(freqMhz)
}

/** Shannon capacity reference for an AWGN band, from C/N0 and bandwidth. */
export function channelCapacityBps(cN0DbHz, bwHz) {
  if (!(bwHz > 0)) throw new RangeError('bwHz must be > 0')
  const snr = 10 ** ((cN0DbHz - 10 * Math.log10(bwHz)) / 10)
  return bwHz * Math.log2(1 + snr)
}

/**
 * Full dB chain. Receiver described by noise figure (NF path) or by G/T
 * (GT path with rxGainDbi factored in) — mathematically identical at
 * Tsys = 290 K, which the test suite pins.
 */
export function linkBudgetKm(opts) {
  const {
    ptxDbm, txGainDbi, freqMhz, slantKm,
    atmosLossDb = 0, pointingLossDb = 0, otherLossDb = 0,
    bitRateKbps, requiredEbN0Db, implementationLossDb = 1,
    nfDb, rxGTdBperK, rxGainDbi = 0,
  } = opts
  for (const [k, v] of Object.entries({ ptxDbm, txGainDbi, freqMhz, slantKm, bitRateKbps, requiredEbN0Db })) {
    if (typeof v !== 'number' || Number.isNaN(v)) throw new RangeError(`${k} is required`)
  }
  if (nfDb === undefined && rxGTdBperK === undefined) {
    throw new RangeError('describe the receiver: nfDb OR rxGTdBperK')
  }
  const eirpDbm = ptxDbm + txGainDbi
  const fspl = fsplDb(slantKm, freqMhz)
  const pathLossDb = fspl + atmosLossDb + pointingLossDb + otherLossDb
  let cN0DbHz, prxDbm
  if (nfDb !== undefined) {
    prxDbm = eirpDbm - pathLossDb + rxGainDbi
    cN0DbHz = prxDbm - K_DBM_HZ_290K - nfDb
  } else {
    // C/N0 = C_dBW(at LNA input, antenna gain included in G/T) - k:
    // EIRP_dBW - pathLoss + G/T - k_dBW/K. Prx display needs the actual rx
    // gain at the same reference point; without it we report null rather
    // than assume a noise temperature.
    cN0DbHz = (eirpDbm - 30) - pathLossDb + rxGTdBperK - K_DBW_PER_K
    prxDbm = opts.rxGainDbi === undefined ? null : eirpDbm - pathLossDb + opts.rxGainDbi
  }
  const ebN0Db = cN0DbHz - 10 * Math.log10(bitRateKbps * 1000) - implementationLossDb
  const marginDb = ebN0Db - requiredEbN0Db
  return {
    eirpDbm, fsplDb: fspl, pathLossDb, prxDbm,
    cN0DbHz, ebN0DbDb: ebN0Db, marginDb,
    verdict: marginDb >= 0 ? 'GO' : 'NO-GO',
    maxBitRateKbps: 10 ** ((cN0DbHz - implementationLossDb - requiredEbN0Db) / 10) / 1000,
    receiverPath: nfDb !== undefined ? 'NF' : 'GT',
  }
}

/** Labeled educational presets (powers/gains are typical-class values). */
export const LINK_PRESETS = {
  leoSband: {
    name: 'LEO · S-band 2.2 GHz · 5 W · ground SS',
    ptxDbm: 37, txGainDbi: 6, freqMhz: 2200, nfDb: 1.5,
    atmosLossDb: 1, pointingLossDb: 1.5, otherLossDb: 2, implementationLossDb: 1,
    bitRateKbps: 250, requiredEbN0Db: 10.5,
  },
  leoXband: {
    name: 'LEO · X-band 8 GHz · 20 W · 1.2 m dish',
    ptxDbm: 43, txGainDbi: 17, freqMhz: 8000, nfDb: 1.0,
    atmosLossDb: 1.5, pointingLossDb: 2, otherLossDb: 2, implementationLossDb: 1,
    bitRateKbps: 2000, requiredEbN0Db: 10.5,
  },
  geoSbandLowRate: {
    name: 'GEO · S-band 2.2 GHz · 10 W · slow telemetry',
    ptxDbm: 40, txGainDbi: 10, freqMhz: 2200, nfDb: 1.5,
    atmosLossDb: 1.5, pointingLossDb: 1, otherLossDb: 2, implementationLossDb: 1,
    bitRateKbps: 64, requiredEbN0Db: 10.5,
  },
}
