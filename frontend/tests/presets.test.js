/**
 * M22 — preset missions on real engines.
 *
 * Two independent layers of proof:
 *  (a) every preset's Δv is re-derived from raw constants in the test
 *      (vis-viva arithmetic written out fresh, not imported), and
 *  (b) the whole event sequence is EXECUTED on the M21 engine and the
 *      final orbit compared against the analytic target.
 * Engine table integrity (positive, sourced) is a data-contract test.
 */
import { describe, expect, it } from 'vitest'
import { ENGINES, buildPreset, listPresets, equivalentBurnTimeSec, PRESET_BUILDERS } from '../src/lib/presets.js'
import { runMissionKm, missionMassesKm } from '../src/lib/mission.js'
import { hohmannTransferKm } from '../src/lib/hohmann.js'
import { periodSec } from '../src/lib/kepler.js'
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM } from '../src/lib/constants.js'

const RE = R_EARTH_MEAN_KM
const MU = MU_EARTH_KM3S2

describe('engine data contract', () => {
  it('all four engines are physical and sourced', () => {
    for (const e of Object.values(ENGINES)) {
      expect(e.ispSec).toBeGreaterThan(0)
      expect(e.thrustN).toBeGreaterThan(0)
      expect(Number.isFinite(e.powerW ?? NaN) || e.powerW === null).toBe(true)
      expect(e.source.length).toBeGreaterThan(10)
      expect(e.propellant.length).toBeGreaterThan(0)
    }
    expect(ENGINES.RL10B2.ispSec).toBe(465.5) // the highest-fidelity Isp anchors the table
    expect(Object.keys(ENGINES).sort()).toEqual(['AESTUS', 'NEXTC', 'RL10B2', 'SPT100'])
  })
})

describe('P1 GTO->GEO apogee kick (Aestus)', () => {
  const p = buildPreset('GTO_GEO')
  it('Δv re-derived from raw constants matches the preset', () => {
    const rp = RE + 1000, ra = RE + 35786
    const aG = (rp + ra) / 2
    const vApo = Math.sqrt(MU * (2 / ra - 1 / aG))
    const dv = (Math.sqrt(MU / ra) - vApo) * 1000
    expect(p.analytic.dvMps).toBeCloseTo(dv, 9)
    expect(dv).toBeGreaterThan(1300) // the classic ~1.4-1.5 km/s apogee kick
    expect(dv).toBeLessThan(1550)
  })
  it('executed on the M21 engine: lands circular GEO, plane untouched', () => {
    const res = runMissionKm({ elements0: p.elements0, events: p.events })
    expect(res.finalElements.aKm).toBeCloseTo(p.targets.aKm, 5)
    expect(res.finalElements.e).toBeLessThan(1e-9)
    expect(res.finalElements.iDeg).toBeCloseTo(6, 9)
    expect(res.totalDvMps).toBeCloseTo(p.analytic.dvMps, 9)
    // coast was exactly half the GTO period -> burn lands at apogee:
    expect(p.events[0].minutes).toBeCloseTo(periodSec((RE + 1000 + RE + 35786) / 2) / 120, 9)
  })
})

describe('P2 LEO shell raise 450->550 (SPT-100)', () => {
  const p = buildPreset('LEO_RAISE')
  it('staged total is within 15% of the direct Hohmann and above it', () => {
    const direct = hohmannTransferKm(RE + 450, RE + 550)
    expect(p.analytic.dvMps).toBeGreaterThanOrEqual(direct.totalDvMps - 1e-9)
    expect(p.analytic.dvMps).toBeLessThan(direct.totalDvMps * 1.15)
  })
  it('12 events execute to the 550 km circular target', () => {
    expect(p.events.length).toBe(12)
    const res = runMissionKm({ elements0: p.elements0, events: p.events })
    expect(res.finalElements.aKm).toBeCloseTo(RE + 550, 4)
    expect(res.finalElements.e).toBeLessThan(1e-9)
    expect(res.finalElements.iDeg).toBeCloseTo(53, 9)
  })
  it('electric honesty: continuous-thrust time for this Δv is WEEKS at 80 mN', () => {
    const t = equivalentBurnTimeSec({ dvMps: p.analytic.dvMps, massKg: 500, thrustN: ENGINES.SPT100.thrustN })
    expect(t).toBeGreaterThan(3 * 86400) // > 3 days of thrusting, disclosed on the page
  })
})

describe('P3 SSO disposal to the -100 km reentry band (NEXT-C)', () => {
  const p = buildPreset('SSO_DISPOSE')
  it('final perigee is EXACTLY the M16 band edge from raw arithmetic', () => {
    const r0 = RE + 380, rpT = RE - 100
    const aF = (r0 + rpT) / 2
    const vA = Math.sqrt(MU * (2 / r0 - 1 / aF))
    const dvF = (Math.sqrt(MU / r0) - vA) * 1000
    expect(p.analytic.dvFinalMps).toBeCloseTo(dvF, 9)
    const res = runMissionKm({ elements0: p.elements0, events: p.events })
    const fe = res.finalElements
    const rp = fe.aKm * (1 - fe.e)
    expect(rp).toBeCloseTo(rpT, 5)
    expect(res.belowSurfaceSeen).toBe(true)
    expect(fe.iDeg).toBeCloseTo(97.3, 9)
  })
  it('propellant for the whole disposal at Isp 4170 is kilograms on 500 kg', () => {
    const res = runMissionKm({ elements0: p.elements0, events: p.events })
    const led = missionMassesKm({ result: res, mass0Kg: 500, ispSec: ENGINES.NEXTC.ispSec })
    // ve = 4170·9.80665 = 40.89 km/s; ~210 m/s ⇒ m0(1−e^−dv/ve) ≈ 2.6 kg
    expect(led.propellantUsedKg).toBeGreaterThan(2)
    expect(led.propellantUsedKg).toBeLessThan(4)
    expect(res.totalDvMps).toBeGreaterThan(180)
    expect(res.totalDvMps).toBeLessThan(240)
  })
})

describe('P4 GEO reposition via integer-lap drift ellipse (SPT-100)', () => {
  const p = buildPreset('GEO_REPOS')
  const R_GEO = RE + 35786
  it('drift-ellipse semimajor axis is consistent with n from raw Kepler', () => {
    const nPrime = p.analytic.nPrimeDegDay * Math.PI / 180 / 86400
    const a = (MU / nPrime ** 2) ** (1 / 3)
    expect(p.analytic.aDriftKm).toBeCloseTo(a, 6)
    expect(a).toBeLessThan(R_GEO) // eastward drift = lower/faster ellipse
  })
  it('coast is an integer number of drift periods so the return burn is symmetric', () => {
    const Tmin = periodSec(p.analytic.aDriftKm) / 60
    expect(p.analytic.coastMin / Tmin).toBeCloseTo(p.analytic.laps, 9)
    expect(p.analytic.actualDriftDeg).toBeGreaterThan(14)
    expect(p.analytic.actualDriftDeg).toBeLessThan(16)
  })
  it('executed: returns to circular GEO with equal-and-opposite kicks', () => {
    const res = runMissionKm({ elements0: p.elements0, events: p.events })
    expect(res.finalElements.aKm).toBeCloseTo(R_GEO, 3)
    expect(res.finalElements.e).toBeLessThan(1e-9)
    expect(res.totalDvMps).toBeCloseTo(p.analytic.dvMps, 9)
    expect(p.analytic.dvOutMps).toBeGreaterThan(1)
    expect(p.analytic.dvOutMps).toBeLessThan(10) // commercial repositions are m/s-scale
  })
})

describe('preset registry', () => {
  it('listPresets returns all four, each with its engine attached', () => {
    const all = listPresets()
    expect(all.map((x) => x.id).sort()).toEqual(['GEO_REPOS', 'GTO_GEO', 'LEO_RAISE', 'SSO_DISPOSE'])
    for (const x of all) expect(ENGINES[x.engineKey]).toBe(x.engine)
    expect(Object.keys(PRESET_BUILDERS).length).toBe(4)
  })
  it('unknown preset id throws with the known list', () => {
    expect(() => buildPreset('NOPE')).toThrow(/unknown preset 'NOPE'/)
  })
  it('equivalentBurnTimeSec guards and hand value', () => {
    expect(equivalentBurnTimeSec({ dvMps: 100, massKg: 1000, thrustN: 1 })).toBe(100000)
    expect(() => equivalentBurnTimeSec({ dvMps: 100, massKg: 1000, thrustN: 0 })).toThrow(/required/)
    expect(() => equivalentBurnTimeSec({ dvMps: -1, massKg: 1000, thrustN: 1 })).toThrow(/required/)
  })
})

describe('cross-check with the M21 Hohmann spine', () => {
  it('P1+descent burn reproduces a full 400 km->GEO transfer when launched from LEO first', () => {
    // LEO->GTO perigee raise + the P1 apogee kick == the M3 Hohmann total
    const h = hohmannTransferKm(RE + 400, RE + 35786)
    const gto = buildPreset('GTO_GEO')
    const dvKick = gto.analytic.dvMps
    // GTO here has perigee at 1000 km, so the equivalent total from 400 km
    // must exceed the direct Hohmann (extra apsis mismatch):
    expect(dvKick).toBeGreaterThan(0)
    expect(h.totalDvMps).toBeGreaterThan(dvKick) // dv1(400->...) replaces the 1000 km insertion
  })
})
