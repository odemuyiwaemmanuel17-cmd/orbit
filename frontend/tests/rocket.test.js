/**
 * M4 rocket-equation validation — analytical references.
 */
import { describe, expect, it } from 'vitest'
import { dvAvailableMps, propellantForDv, massRatio, budgetVerdict, presetLeoToGeo } from '../src/lib/rocket.js'
import { G0_MS2 } from '../src/lib/constants.js'
import { hohmannTransferAltKm } from '../src/lib/hohmann.js'

describe('Tsiolkovsky rocket equation', () => {
  it('dV = Isp*g0*ln(m0/m1) exact for ratio e', () => {
    const dv = dvAvailableMps({ ispSec: 300, dryMassKg: 1000, propellantKg: 1000 * (Math.E - 1) })
    expect(dv).toBeCloseTo(300 * G0_MS2, 6) // ln(e) = 1
  })
  it('zero propellant gives zero dV', () => {
    expect(dvAvailableMps({ ispSec: 350, dryMassKg: 500, propellantKg: 0 })).toBeCloseTo(0, 12)
  })
  it('forward/inverse are exact inverses (propellant round-trip)', () => {
    const veh = { ispSec: 320, dryMassKg: 1200 }
    const mp = propellantForDv({ dvMps: 2500, ...veh })
    expect(dvAvailableMps({ ...veh, propellantKg: mp })).toBeCloseTo(2500, 6)
  })
  it('higher Isp is more efficient for the same masses', () => {
    const a = dvAvailableMps({ ispSec: 250, dryMassKg: 1000, propellantKg: 2000 })
    const b = dvAvailableMps({ ispSec: 450, dryMassKg: 1000, propellantKg: 2000 })
    expect(b / a).toBeCloseTo(450 / 250, 9)
  })
  it('mass ratio for 3 km/s at Isp 300 equals exp(dv/(Isp g0))', () => {
    expect(massRatio({ dvMps: 3000, ispSec: 300 })).toBeCloseTo(Math.exp(3000 / (300 * G0_MS2)), 9)
  })
  it('invalid vehicle inputs throw instead of returning fake numbers', () => {
    expect(() => dvAvailableMps({ ispSec: 0, dryMassKg: 100, propellantKg: 100 })).toThrow()
    expect(() => propellantForDv({ dvMps: 100, ispSec: 300, dryMassKg: -5 })).toThrow()
  })
})

describe('mission budget feasibility', () => {
  const events = [
    { id: 'a', label: 'Transfer', dvMps: 2400 },
    { id: 'b', label: 'Circularize', dvMps: 1500 },
  ]
  it('GO when available exceeds required, with correct margin', () => {
    const v = budgetVerdict({ events, ispSec: 320, dryMassKg: 1000, propellantKg: 3000 })
    expect(v.requiredMps).toBe(3900)
    expect(v.feasible).toBe(v.availableMps >= 3900)
    expect(v.marginMps).toBeCloseTo(v.availableMps - 3900, 6)
    expect(v.propellantNeededKg).toBeLessThan(3000 + 1e-6)
    expect(v.propellantShortfallKg).toBeCloseTo(0, 6)
  })
  it('NO-GO budget reports the exact propellant shortfall', () => {
    const v = budgetVerdict({ events, ispSec: 320, dryMassKg: 800, propellantKg: 100 })
    expect(v.feasible).toBe(false)
    expect(v.marginMps).toBeLessThan(0)
    expect(v.propellantShortfallKg).toBeCloseTo(v.propellantNeededKg - 100, 6)
  })
  it('preset LEO->GEO uses REAL Hohmann numbers (engine reuse proof)', () => {
    const t = hohmannTransferAltKm(400, 35786)
    const ev = presetLeoToGeo(t)
    const sum = ev.reduce((s, e) => s + e.dvMps, 0)
    expect(ev.find((e) => e.id === 't1').dvMps).toBeCloseTo(t.dv1Mps, -1) // rounded m/s
    expect(ev.find((e) => e.id === 'circ').dvMps).toBeCloseTo(t.dv2Mps, -1)
    expect(sum).toBeGreaterThan(t.totalDvMps) // extras only add margin/sk/reserve
  })
})
