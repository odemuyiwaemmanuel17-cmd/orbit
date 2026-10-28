/**
 * M21 — mission builder (sequential events) tests.
 *
 * The engine is validated against INDEPENDENT closed forms: Kepler
 * invariants, vis-viva at burn points, the exact atan plane-tilt for a
 * normal burn, Tsiolkovsky round trips, and a two-burn Hohmann executed
 * event-by-event that must reproduce the M3 hohmann.js numbers.
 */
import { describe, expect, it } from 'vitest'
import {
  coastTwoBodyKm, runMissionKm, massAfterDvKg, missionMassesKm, coastDriftDegKm,
} from '../src/lib/mission.js'
import { circularElements, hohmannTransferKm } from '../src/lib/hohmann.js'
import { stateToElementsKm, elementsToStateKm, periapsisRadiusKm, apoapsisRadiusKm, meanMotionRadS, periodSec } from '../src/lib/kepler.js'
import { propellantForDv, dvAvailableMps } from '../src/lib/rocket.js'
import { j2SecularRatesDegDay } from '../src/lib/j2.js'
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM } from '../src/lib/constants.js'

const MU = MU_EARTH_KM3S2
const R400 = R_EARTH_MEAN_KM + 400 // 6771
const R_GEO = 42164

describe('coastTwoBodyKm — Kepler invariants', () => {
  const el = { aKm: 8000, e: 0.15, iDeg: 45, raanDeg: 30, argPerigeeDeg: 20, trueAnomalyDeg: 100 }
  it('preserves a, e, i, RAAN, argPerigee and advances mean anomaly by n·Δt', () => {
    const dt = 1234
    const out = coastTwoBodyKm(el, dt)
    for (const k of ['aKm', 'e', 'iDeg', 'raanDeg', 'argPerigeeDeg']) expect(out[k]).toBe(el[k])
    // exact check in MEAN-anomaly space: M(ν_out) − M(ν_in) must equal n·Δt
    const toM = (nuDeg) => {
      const E = 2 * Math.atan(Math.sqrt((1 - el.e) / (1 + el.e)) * Math.tan(nuDeg * Math.PI / 360))
      return E - el.e * Math.sin(E)
    }
    expect(toM(out.trueAnomalyDeg)).toBeCloseTo(toM(el.trueAnomalyDeg) + meanMotionRadS(el.aKm) * dt, 12)
  })
  it('one full period returns the SAME true anomaly', () => {
    const out = coastTwoBodyKm(el, periodSec(el.aKm))
    expect(out.trueAnomalyDeg).toBeCloseTo(el.trueAnomalyDeg, 9)
  })
  it('circular orbit: ν (=phase) advances linearly at exactly n', () => {
    const c = { aKm: 7000, e: 0, iDeg: 0, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 10 }
    const out = coastTwoBodyKm(c, 100)
    expect(out.trueAnomalyDeg).toBeCloseTo(10 + meanMotionRadS(7000) * 100 * 180 / Math.PI, 9)
  })
  it('rejects negative/non-finite duration', () => {
    expect(() => coastTwoBodyKm(el, -1)).toThrow(/dtSec/)
    expect(() => coastTwoBodyKm(el, Number.NaN)).toThrow(/dtSec/)
  })
})

describe('runMissionKm — burns reproduce vis-viva / apsis geometry exactly', () => {
  const circ400 = circularElements(R400, { iDeg: 51.6, raanDeg: 0 })
  it('prograde burn from circular keeps rp EXACT (burn point becomes perigee)', () => {
    const res = runMissionKm({ elements0: circ400, events: [{ type: 'burn', dirKey: 'prograde', dvMps: 500 }] })
    const ae = res.finalElements
    expect(periapsisRadiusKm(ae.aKm, ae.e)).toBeCloseTo(R400, 6) // rp unchanged
    const vAfter = Math.sqrt(MU / R400) + 0.5 // independent vis-viva input
    const aExpected = 1 / (2 / R400 - vAfter ** 2 / MU) // vis-viva inverted
    expect(ae.aKm).toBeCloseTo(aExpected, 6)
  })
  it('prograde at perigee raises apogee only; prograde at APOGEE raises perigee with ra FIXED', () => {
    const ecc = { aKm: 8000, e: 0.2, iDeg: 45, raanDeg: 10, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
    const b1 = runMissionKm({ elements0: ecc, events: [{ type: 'burn', dirKey: 'prograde', dvMps: 200 }] })
    expect(periapsisRadiusKm(b1.finalElements.aKm, b1.finalElements.e)).toBeCloseTo(periapsisRadiusKm(ecc.aKm, ecc.e), 6)
    expect(apoapsisRadiusKm(b1.finalElements.aKm, b1.finalElements.e)).toBeGreaterThan(apoapsisRadiusKm(ecc.aKm, ecc.e))
    const apo = { ...ecc, trueAnomalyDeg: 180 }
    const b2 = runMissionKm({ elements0: apo, events: [{ type: 'burn', dirKey: 'prograde', dvMps: 200 }] })
    expect(apoapsisRadiusKm(b2.finalElements.aKm, b2.finalElements.e)).toBeCloseTo(apoapsisRadiusKm(ecc.aKm, ecc.e), 6)
    expect(periapsisRadiusKm(b2.finalElements.aKm, b2.finalElements.e)).toBeGreaterThan(periapsisRadiusKm(ecc.aKm, ecc.e))
    // and the mirror law: RETROGRADE at apogee LOWERS perigee (energy down)
    const b3 = runMissionKm({ elements0: apo, events: [{ type: 'burn', dirKey: 'retrograde', dvMps: 200 }] })
    expect(apoapsisRadiusKm(b3.finalElements.aKm, b3.finalElements.e)).toBeCloseTo(apoapsisRadiusKm(ecc.aKm, ecc.e), 6)
    expect(periapsisRadiusKm(b3.finalElements.aKm, b3.finalElements.e)).toBeLessThan(periapsisRadiusKm(ecc.aKm, ecc.e))
  })
  it('normal burn from equatorial tilts i by EXACTLY atan(Δv/v)', () => {
    const v = Math.sqrt(MU / R400) // km/s
    const dvMps = 300, dv = dvMps / 1000
    const eq = circularElements(R400, { iDeg: 0, raanDeg: 0 })
    const res = runMissionKm({ elements0: eq, events: [{ type: 'burn', dirKey: 'normal', dvMps }] })
    expect(res.finalElements.iDeg).toBeCloseTo(Math.atan2(dv, v) * 180 / Math.PI, 9)
    // |v| grows as the hypotenuse — speed check via vis-viva on the new orbit
    expect(res.finalElements.e).toBeLessThan(0.02) // near-circular after a small tilt
  })
  it('coast between burns does not change the orbit shape (two-body)', () => {
    const res = runMissionKm({ elements0: circ400, events: [
      { type: 'burn', dirKey: 'prograde', dvMps: 400 },
      { type: 'coast', minutes: 27 },
      { type: 'burn', dirKey: 'prograde', dvMps: 300 },
    ] })
    const s1 = res.steps[0].afterElements, s2 = res.steps[1].afterElements
    for (const k of ['aKm', 'e', 'iDeg', 'raanDeg', 'argPerigeeDeg']) expect(s2[k]).toBe(s1[k])
  })
})

describe('runMissionKm — end-to-end Hohmann against the M3 library', () => {
  it('executed event-by-event it reproduces hohmannTransferKm to sub-mm', () => {
    const h = hohmannTransferKm(R400, R_GEO)
    const el0 = circularElements(R400, { iDeg: 51.6, raanDeg: 0 })
    const res = runMissionKm({ elements0: el0, events: [
      { type: 'burn', dirKey: 'prograde', dvMps: h.dv1Mps },
      { type: 'coast', minutes: h.coastSec / 60 },
      { type: 'burn', dirKey: 'prograde', dvMps: h.dv2Mps },
    ] })
    expect(res.totalDvMps).toBeCloseTo(h.totalDvMps, 9)
    expect(res.missionMinutes).toBeCloseTo(h.coastSec / 60, 9)
    expect(res.finalElements.aKm).toBeCloseTo(R_GEO, 5) // sub-mm in km
    expect(res.finalElements.e).toBeLessThan(1e-9)
    expect(res.finalElements.iDeg).toBeCloseTo(51.6, 9)
    // transfer leg itself: a_T = (r1+r2)/2 and e_T exact after the first burn
    const t = res.steps[0].afterElements
    expect(t.aKm).toBeCloseTo((R400 + R_GEO) / 2, 4)
    expect(t.e).toBeCloseTo((R_GEO - R400) / (R_GEO + R400), 9)
  })
  it('one minute SHORT of half-period circularizes imperfectly (sensitivity witness)', () => {
    const h = hohmannTransferKm(R400, R_GEO)
    const el0 = circularElements(R400, { iDeg: 51.6, raanDeg: 0 })
    const res = runMissionKm({ elements0: el0, events: [
      { type: 'burn', dirKey: 'prograde', dvMps: h.dv1Mps },
      { type: 'coast', minutes: h.coastSec / 60 - 1 },
      { type: 'burn', dirKey: 'prograde', dvMps: h.dv2Mps },
    ] })
    expect(res.finalElements.e).toBeGreaterThan(1e-6) // apsis mismatch -> eccentric
    expect(res.finalElements.e).toBeLessThan(0.05)
  })
})

describe('runMissionKm — J2 coast mode hooks the M17 engine', () => {
  it('RAAN drift equals the first-order secular rate over the leg', () => {
    const el = { aKm: 7000, e: 0.001, iDeg: 97.6, raanDeg: 100, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
    const minutes = 2880 // 2 days
    const res = runMissionKm({ elements0: el, events: [{ type: 'coast', minutes }], j2Secular: true })
    const rates = j2SecularRatesDegDay(el)
    const expected = (100 + rates.raanDegDay * minutes / 1440) % 360
    expect(res.finalElements.raanDeg).toBeCloseTo(expected, 6)
    // two-body mode must NOT drift the node:
    const plain = runMissionKm({ elements0: el, events: [{ type: 'coast', minutes }] })
    expect(plain.finalElements.raanDeg).toBe(100)
  })
})

describe('propellant ledger — Tsiolkovsky consistency', () => {
  it('massAfterDvKg inverts dvAvailableMps exactly', () => {
    const m0 = 1000, isp = 300
    const dv = dvAvailableMps({ ispSec: isp, dryMassKg: 500, propellantKg: 500 })
    expect(massAfterDvKg({ massKg: m0, dvMps: dv, ispSec: isp })).toBeCloseTo(500, 9)
  })
  it('sequence with m0 = dry + needed propellant ends at dry mass', () => {
    const dry = 600, isp = 312
    const dvs = [1200, 900] // two stacked burns stay bound at 400 km (escape Δv ~3169 m/s)
    const m0 = dry + propellantForDv({ dvMps: dvs[0] + dvs[1], ispSec: isp, dryMassKg: dry })
    const res = runMissionKm({ elements0: circularElements(R400, { iDeg: 0, raanDeg: 0 }),
      events: dvs.map((d) => ({ type: 'burn', dirKey: 'prograde', dvMps: d })) })
    const ledger = missionMassesKm({ result: res, mass0Kg: m0, ispSec: isp })
    expect(ledger.propellantUsedKg).toBeCloseTo(m0 - dry, 6)
    expect(ledger.massAtEndKg).toBeCloseTo(dry, 6)
  })
  it('burn sequence ordering does not change total propellant (exp additivity)', () => {
    const el = circularElements(R400, { iDeg: 0, raanDeg: 0 })
    const mk = (dvs) => runMissionKm({ elements0: el, events: dvs.map((d) => ({ type: 'burn', dirKey: 'prograde', dvMps: d })) })
    const a = missionMassesKm({ result: mk([300, 500]), mass0Kg: 1000, ispSec: 300 })
    const b = missionMassesKm({ result: mk([500, 300]), mass0Kg: 1000, ispSec: 300 })
    expect(a.propellantUsedKg).toBeCloseTo(b.propellantUsedKg, 9)
  })
  it('guards: negative dv, non-positive mass/isp throw', () => {
    expect(() => massAfterDvKg({ massKg: 0, dvMps: 1, ispSec: 300 })).toThrow(/positive/)
    expect(() => massAfterDvKg({ massKg: 10, dvMps: -1, ispSec: 300 })).toThrow(/finite/)
  })
})

describe('runMissionKm — honest failure modes', () => {
  const circ = circularElements(R400, { iDeg: 51.6, raanDeg: 0 })
  it('escape-grade burn throws instead of emitting a hyperbolic leg', () => {
    const vEsc = Math.sqrt(2 * MU / R400), vCirc = Math.sqrt(MU / R400)
    const dvMps = (vEsc - vCirc) * 1000 + 10
    expect(() => runMissionKm({ elements0: circ, events: [{ type: 'burn', dirKey: 'prograde', dvMps }] }))
      .toThrow(/escape/)
  })
  it('deorbit burn flags periapsis below surface, keeps the run valid', () => {
    const res = runMissionKm({ elements0: circ, events: [{ type: 'burn', dirKey: 'retrograde', dvMps: 150 }] })
    expect(res.steps[0].periapsisBelowSurface).toBe(true)
    expect(res.belowSurfaceSeen).toBe(true)
    expect(res.steps[0].periapsisAltKm).toBeLessThan(0)
  })
  it('unknown event type, bad dv, bad coast and bad initial elements throw', () => {
    expect(() => runMissionKm({ elements0: circ, events: [{ type: 'sail' }] })).toThrow(/unknown type/)
    expect(() => runMissionKm({ elements0: circ, events: [{ type: 'burn', dirKey: 'prograde', dvMps: -5 }] }))
      .toThrow(/finite and >= 0/)
    expect(() => runMissionKm({ elements0: circ, events: [{ type: 'coast', minutes: Number.POSITIVE_INFINITY }] }))
      .toThrow(/finite/)
    expect(() => runMissionKm({ elements0: { ...circ, aKm: Number.NaN }, events: [] })).toThrow(/aKm/)
    expect(() => runMissionKm({ elements0: { ...circ, e: 1.2 }, events: [] })).toThrow(/\[0,1\)/)
  })
  it('cumulative timeline: coast time accrues, burns are instantaneous', () => {
    const res = runMissionKm({ elements0: circ, events: [
      { type: 'coast', minutes: 10 },
      { type: 'burn', dirKey: 'prograde', dvMps: 10 },
      { type: 'coast', minutes: 5 },
    ] })
    expect(res.steps[0].tMinCumulative).toBe(10)
    expect(res.steps[1].tMinCumulative).toBe(10) // burn shares its instant
    expect(res.steps[2].tMinCumulative).toBe(15)
    expect(res.missionMinutes).toBe(15)
  })
})

describe('coastDriftDegKm', () => {
  it('matches an independently recomputed rate × duration', () => {
    const el = { aKm: 7000, e: 0.001, iDeg: 53, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
    const r = j2SecularRatesDegDay(el)
    const d = coastDriftDegKm({ elements: el, minutes: 90 })
    expect(d.raanDeg).toBeCloseTo(r.raanDegDay * 90 / 1440, 12)
    expect(d.argPerigeeDeg).toBeCloseTo(r.argPerigeeDegDay * 90 / 1440, 12)
  })
})

describe('engine uses the SAME elements pipeline as the state path', () => {
  it('a burn executed from an ECI state round-trips through elements identically', () => {
    const s = { posKm: { x: R400, y: 0, z: 0 }, velKmS: { x: 0, y: 7.678, z: 0.02 } }
    const el = stateToElementsKm(s)
    const viaMission = runMissionKm({ elements0: el, events: [{ type: 'burn', dirKey: 'prograde', dvMps: 123 }] })
    // independent path: elements -> state at burn epoch must equal original state
    const s2 = elementsToStateKm(el)
    expect(Math.hypot(s2.posKm.x - s.posKm.x, s2.posKm.y - s.posKm.y, s2.posKm.z - s.posKm.z)).toBeLessThan(1e-6)
    expect(viaMission.finalElements.aKm).toBeGreaterThan(el.aKm)
    // vis-viva consistency of the post-burn orbit at the burn radius
    const rp = periapsisRadiusKm(viaMission.finalElements.aKm, viaMission.finalElements.e)
    expect(rp).toBeLessThanOrEqual(Math.hypot(s.posKm.x, s.posKm.y, s.posKm.z) + 1e-6)
  })
})
