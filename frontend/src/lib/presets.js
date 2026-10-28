/**
 * OrbitalPulse — preset missions on real, source-documented engines (M22).
 *
 * Every number in ENGINES was verified against the cited public source at
 * build time (2026-10-27); every Δv in a PRESET is COMPUTED from the
 * validated Kepler/Hohmann primitives — no hard-crafted mission numbers.
 * The event sequences execute on the M21 engine (runMissionKm), so they
 * inherit its validation spine.
 *
 * Fidelity: SIMPLIFIED where a low-thrust engine is approximated by
 * impulsive kicks (disclosed per preset + burn-time honesty display from
 * t = Δv·m/F). Two-body Earth only, as in M21.
 */
import {
  periodSec, circularVelocityKmS, velocityKmS,
} from './kepler.js'
import { hohmannTransferKm } from './hohmann.js'
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM, RAD_PER_DEG } from './constants.js'

/** Vacuum specs, each verified 2026-10-27 against the cited source. */
export const ENGINES = Object.freeze({
  AESTUS: {
    key: 'AESTUS', name: 'Aestus (Ariane 5 EPS)', cls: 'STORABLE BIPRO',
    thrustN: 29600, ispSec: 324, powerW: null, propellant: 'MMH / NTO',
    source: 'Wikipedia "Aestus"; DLR 2014 HTS paper (29.6 kN vacuum, Isp 324 s); Arianespace satnow listing',
  },
  RL10B2: {
    key: 'RL10B2', name: 'RL10B-2 (Centaur family)', cls: 'CRYOGENIC LH2/LOX',
    thrustN: 110100, ispSec: 465.5, powerW: null, propellant: 'LH2 / LOX',
    source: 'Wikipedia "RL10": 110.1 kN vacuum, Isp 465.5 s (B-2/C-2 row)',
  },
  SPT100: {
    key: 'SPT100', name: 'SPT-100 (OKB Fakel Hall)', cls: 'HALL ELECTRIC',
    thrustN: 0.080, ispSec: 1600, powerW: 1350, propellant: 'Xe',
    source: 'Wikipedia "SPT-100": 80 mN, Isp 1600 s, 1.35 kW; flown Gals-1, Thaicom 8',
  },
  NEXTC: {
    key: 'NEXTC', name: 'NEXT-C (NASA gridded ion)', cls: 'GRIDDED ION',
    thrustN: 0.237, ispSec: 4170, powerW: 6900, propellant: 'Xe',
    source: 'Wikipedia "NEXT-C": 237 mN, Isp 4170 s, 6.9 kW; flew DART (Nov 2021)',
  },
})

const ALT = { geo: 35786, gtoPeri: 1000, gtoInc: 6 }
const R_GEO = R_EARTH_MEAN_KM + ALT.geo

/**
 * Apsis-pair Δv to step from one circular radius to another (M3 Hohmann,
 * reused not re-derived).
 */
const hohmannPair = (r1Km, r2Km) => {
  const h = hohmannTransferKm(r1Km, r2Km)
  return { dv1Mps: h.dv1Mps, dv2Mps: h.dv2Mps, coastMin: h.coastSec / 60 }
}

/** P1: Ariane-type GTO -> GEO circularization burn at apogee (Aestus). */
function buildGtoGeo() {
  const rp = R_EARTH_MEAN_KM + ALT.gtoPeri
  const ra = R_GEO
  const aGto = (rp + ra) / 2
  const eGto = (ra - rp) / (ra + rp)
  const vApogee = velocityKmS(aGto, eGto, ra)
  const dvMps = (circularVelocityKmS(ra) - vApogee) * 1000
  const elements0 = { aKm: aGto, e: eGto, iDeg: ALT.gtoInc, raanDeg: 0,
    argPerigeeDeg: 0, trueAnomalyDeg: 0 } // start AT perigee
  const events = [
    { type: 'coast', label: 'GTO coast perigee -> apogee', minutes: periodSec(aGto) / 2 / 60 },
    { type: 'burn', label: 'Apogee circularization', dirKey: 'prograde', dvMps },
  ]
  return {
    id: 'GTO_GEO', name: 'GTO -> GEO Apogee Kick', engineKey: 'AESTUS',
    rationale: `Ariane-class GTO (${ALT.gtoPeri} km perigee, ${ALT.gtoInc}°) circularized at ` +
      `${ALT.geo} km. The kick is a single apogee prograde impulse — the classic Aestus/EPS maneuver.`,
    elements0, events,
    targets: { aKm: R_GEO, eMax: 1e-9, iDeg: ALT.gtoInc },
    analytic: { dvMps, vApogeeKmS: vApogee, vGeoKmS: circularVelocityKmS(R_GEO) },
  }
}

/** P2: LEO shell raise 450 -> 550 km in four staged Hohmann pairs (SPT-100). */
function buildLeoRaise() {
  const steps = [[450, 475], [475, 500], [500, 525], [525, 550]]
  const events = []
  let dv = 0
  for (const [a0, a1] of steps) {
    const h = hohmannPair(R_EARTH_MEAN_KM + a0, R_EARTH_MEAN_KM + a1)
    events.push({ type: 'burn', label: `Raise ${a0}->${a1} kick-in`, dirKey: 'prograde', dvMps: h.dv1Mps })
    events.push({ type: 'coast', label: 'transfer half-period', minutes: h.coastMin })
    events.push({ type: 'burn', label: `Raise ${a0}->${a1} circularize`, dirKey: 'prograde', dvMps: h.dv2Mps })
    dv += h.dv1Mps + h.dv2Mps
  }
  return {
    id: 'LEO_RAISE', name: 'LEO Shell Raise 450 -> 550 km', engineKey: 'SPT100',
    rationale: 'A Walker-style shell change flown as four mini-Hohmann raises. A real SPT-100 ' +
      'spiral is continuous-thrust; we approximate it impulsively and disclose the burn time.',
    elements0: { aKm: R_EARTH_MEAN_KM + 450, e: 0, iDeg: 53, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 },
    events,
    targets: { aKm: R_EARTH_MEAN_KM + 550, eMax: 1e-9, iDeg: 53 },
    analytic: { dvMps: dv, directDvMps: hohmannPair(R_EARTH_MEAN_KM + 450, R_EARTH_MEAN_KM + 550).dv1Mps
      + hohmannPair(R_EARTH_MEAN_KM + 450, R_EARTH_MEAN_KM + 550).dv2Mps },
  }
}

/** P3: SSO disposal: 500 km -> perigee at -100 km (reentry band, M16 link). */
function buildSsoDispose() {
  const steps = [[500, 440], [440, 380]]
  const events = []
  let dv = 0
  for (const [a0, a1] of steps) {
    // hohmannTransferKm returns SIGNED Δv (negative for inward transfers);
    // the event carries direction in dirKey, magnitude in dvMps
    const h = hohmannPair(R_EARTH_MEAN_KM + a0, R_EARTH_MEAN_KM + a1)
    events.push({ type: 'burn', label: `Lower ${a0}->${a1} kick-in`, dirKey: 'retrograde', dvMps: Math.abs(h.dv1Mps) })
    events.push({ type: 'coast', label: 'transfer half-period', minutes: h.coastMin })
    events.push({ type: 'burn', label: `Lower ${a0}->${a1} circularize`, dirKey: 'retrograde', dvMps: Math.abs(h.dv2Mps) })
    dv += Math.abs(h.dv1Mps) + Math.abs(h.dv2Mps)
  }
  // final: from circular 380 km, retrograde at that point until rp = RE - 100
  const r0 = R_EARTH_MEAN_KM + 380
  const rpTarget = R_EARTH_MEAN_KM - 100 // the M16 reentry-interface band
  const aFinal = (r0 + rpTarget) / 2 // burn point becomes apogee, r0 fixed
  const eFinal = (r0 - rpTarget) / (r0 + rpTarget)
  const vApo = velocityKmS(aFinal, eFinal, r0)
  const dvFinalMps = (circularVelocityKmS(r0) - vApo) * 1000
  events.push({ type: 'burn', label: 'Disposal: drop perigee to -100 km', dirKey: 'retrograde', dvMps: dvFinalMps })
  dv += dvFinalMps
  return {
    id: 'SSO_DISPOSE', name: 'SSO End-of-Life Disposal', engineKey: 'NEXTC',
    rationale: '500 km, 97.3° sun-sync lowered in two steps, then a final retrograde that drives ' +
      'perigee into the -100 km reentry band used by the M16 decay lab. NEXT-C makes the ' +
      'propellant figure absurdly small — that is the electric-propulsion story.',
    elements0: { aKm: R_EARTH_MEAN_KM + 500, e: 0, iDeg: 97.3, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 },
    events,
    targets: { aKm: aFinal, eMax: 1e-9, rpKm: rpTarget, iDeg: 97.3, expectBelowSurface: true },
    analytic: { dvMps: dv, dvFinalMps },
  }
}

/**
 * P4: GEO longitude reposition via a drift ellipse. A RETROGRADE kick at
 * GEO makes that point the ellipse APOGEE (lower, faster period), so the
 * sub-satellite longitude creeps east at n' − n_sidereal. We coast an
 * INTEGER number of drift periods — the return burn then happens exactly
 * at apogee and is the symmetric inverse — and report the ACTUAL drift
 * angle (a hair off the nominal 15 deg, disclosed not fudged).
 */
function buildGeoReposition() {
  const driftDegDay = 15 / 20 // nominal eastward rate
  const omegaEarthSiderealDegDay = 360.9856
  const nPrimeDegDay = omegaEarthSiderealDegDay + driftDegDay
  const nRadS = nPrimeDegDay * RAD_PER_DEG / 86400
  const aDrift = Math.cbrt(MU_EARTH_KM3S2 / nRadS ** 2)
  const vGeo = circularVelocityKmS(R_GEO)
  // vis-viva at the apsis that sits at R_GEO on the drift ellipse:
  const vA = Math.sqrt(MU_EARTH_KM3S2 * (2 / R_GEO - 1 / aDrift))
  const dvOutMps = (vGeo - vA) * 1000
  const TdriftMin = periodSec(aDrift) / 60
  const laps = Math.round((20 * 1440) / TdriftMin)
  const coastMin = laps * TdriftMin
  const actualDriftDeg = (nPrimeDegDay - omegaEarthSiderealDegDay) * (coastMin / 1440)
  const events = [
    { type: 'burn', label: 'Enter eastward drift ellipse (retrograde at GEO)', dirKey: 'retrograde', dvMps: dvOutMps },
    { type: 'coast', label: `Drift ${laps} whole ellipse laps`, minutes: coastMin },
    { type: 'burn', label: 'Re-circularize at apogee (prograde)', dirKey: 'prograde', dvMps: dvOutMps },
  ]
  return {
    id: 'GEO_REPOS', name: 'GEO Reposition ~15 deg East', engineKey: 'SPT100',
    rationale: 'Commercial slot change flown as out-drift / integer-lap coast / symmetric return on ' +
      'a slightly lower (faster) drift ellipse. Integer laps keep the return burn exactly at apogee, ' +
      'so re-circularization is the mirror of entry — the actual drift angle is reported, not forced to 15°.',
    elements0: { aKm: R_GEO, e: 0, iDeg: 0.05, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 180 },
    events,
    targets: { aKm: R_GEO, eMax: 1e-9, iDeg: 0.05 },
    analytic: { dvMps: 2 * dvOutMps, dvOutMps, aDriftKm: aDrift, nPrimeDegDay,
      laps, coastMin, actualDriftDeg },
  }
}

export const PRESET_BUILDERS = Object.freeze({
  GTO_GEO: buildGtoGeo, LEO_RAISE: buildLeoRaise, SSO_DISPOSE: buildSsoDispose, GEO_REPOS: buildGeoReposition,
})

export function buildPreset(id) {
  const b = PRESET_BUILDERS[id]
  if (!b) throw new RangeError(`unknown preset '${id}' — known: ${Object.keys(PRESET_BUILDERS).join(', ')}`)
  const p = b()
  p.engine = ENGINES[p.engineKey]
  if (!p.engine) throw new RangeError(`preset ${id} references unknown engine ${p.engineKey}`)
  return p
}

export function listPresets() {
  return Object.keys(PRESET_BUILDERS).map(buildPreset)
}

/** Continuous-thrust burn time honesty display: t = Δv·m_avg / F. */
export function equivalentBurnTimeSec({ dvMps, massKg, thrustN }) {
  if (!(thrustN > 0) || !(massKg > 0) || !Number.isFinite(dvMps) || dvMps < 0) {
    throw new RangeError('thrust, mass and non-negative dv required')
  }
  return dvMps * massKg / thrustN
}
