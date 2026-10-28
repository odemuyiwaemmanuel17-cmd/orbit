/**
 * M20 — collision-avoidance maneuver tests.
 *
 * Every assertion traces to the EXACT Clohessy-Wiltshire solution for a
 * single impulsive relative Δv on a circular reference (initial relative
 * state zero), which itself has closed-form values at special lead times
 * (Ωτ = π/2, π, 2π) — no numeric oracle needed, only hand algebra.
 */
import { describe, expect, it } from 'vitest'
import {
  meanMotionRadS, cwImpulseDisplacementKm, missAfterManeuverKm,
  recommendManeuverKm, relativeStateAtTcaKm, toHillFrameKm,
} from '../src/lib/avoidance.js'
import { MU_EARTH_KM3S2 } from '../src/lib/constants.js'

const A_REF = 6871 // ~493 km circular test reference
const O = Math.sqrt(MU_EARTH_KM3S2 / A_REF ** 3)
const T = 2 * Math.PI / O // ~5680 s

describe('meanMotionRadS', () => {
  it('circular period at 6871 km is ~94.5 min (independent recomputation)', () => {
    expect(T / 60).toBeCloseTo(94.47, 1)
  })
  it('rejects non-positive / non-finite semimajor axis', () => {
    expect(() => meanMotionRadS(0)).toThrow(/positive/)
    expect(() => meanMotionRadS(Number.NaN)).toThrow(/finite/)
  })
})

describe('cwImpulseDisplacementKm — exact CW values at special lead times', () => {
  it('in-track Δv: short lead integrates to nearly dv*τ, with the CW drift correction', () => {
    const dv = 0.001 // 1 m/s
    const lead = 60
    const d = cwImpulseDisplacementKm({ aKm: A_REF, leadS: lead, dvInTrackKmS: dv })
    // y = (4 sin x − 3x)/Ω · dv with x = Ωτ: series gives dv·(τ − (2/3)Ω²τ³)
    const expectY = dv * (lead - (2 / 3) * O ** 2 * lead ** 3)
    expect(d.dyKm).toBeCloseTo(expectY, 6) // series truncation error ~4e-8 km
    // radial partner term: x = 2 sin(Ωτ)/Ω · dv ≈ 2·dv·τ (2:1 ellipse closure)
    expect(d.dxKm).toBeCloseTo(2 * dv * lead, 3) // same term series, error ~9e-5
  })
  it('Ωτ = π/2 (quarter period): exact hand values for a pure radial burn', () => {
    const lead = T / 4
    const dv = 0.002
    const d = cwImpulseDisplacementKm({ aKm: A_REF, leadS: lead, dvRadialKmS: dv })
    // cos=0, sin=1: dx = 2(0−1)dv/Ω = −2dv/Ω ; dy = (2−0)dv/Ω = +2dv/Ω
    expect(d.dxKm).toBeCloseTo(-2 * dv / O, 12)
    expect(d.dyKm).toBeCloseTo(2 * dv / O, 12)
    expect(d.dzKm).toBe(0)
  })
  it('Ωτ = 2π (one full period): in-track burn leaves ZERO radial, drift −6π·dv/Ω', () => {
    const dv = 0.001
    const d = cwImpulseDisplacementKm({ aKm: A_REF, leadS: T, dvInTrackKmS: dv })
    expect(d.dxKm).toBeCloseTo(0, 12) // 2(cos 2π − 1) = 0 and sin 2π = 0
    expect(d.dyKm).toBeCloseTo(-6 * Math.PI * dv / O, 9) // the −3Ωτ secular term
    expect(d.dyKm).toBeLessThan(0) // prograde burn ends up AFT after one period
  })
  it('secular drift is exactly linear in whole periods (10T = 2× 5T)', () => {
    const dv = 0.001
    const d5 = cwImpulseDisplacementKm({ aKm: A_REF, leadS: 5 * T, dvInTrackKmS: dv })
    const d10 = cwImpulseDisplacementKm({ aKm: A_REF, leadS: 10 * T, dvInTrackKmS: dv })
    expect(d10.dyKm).toBeCloseTo(2 * d5.dyKm, 6)
    expect(Math.abs(d10.dyKm)).toBeGreaterThan(Math.abs(d5.dyKm))
  })
  it('cross-track is a pure oscillator: peak amplitude dv/Ω at Ωτ = π/2, zero at 2π', () => {
    const dv = 0.0015
    const q = cwImpulseDisplacementKm({ aKm: A_REF, leadS: T / 4, dvCrossKmS: dv })
    expect(q.dzKm).toBeCloseTo(dv / O, 9) // sin(π/2)/Ω
    const full = cwImpulseDisplacementKm({ aKm: A_REF, leadS: T, dvCrossKmS: dv })
    expect(full.dzKm).toBeCloseTo(0, 9)
    const early = cwImpulseDisplacementKm({ aKm: A_REF, leadS: 30, dvCrossKmS: dv })
    expect(early.dzKm).toBeCloseTo(dv * 30, 4) // small-Ωτ: dz ≈ dv·τ
  })
  it('axes superpose linearly (sum of single-axis runs = combined run)', () => {
    const p = { aKm: A_REF, leadS: 0.7 * T, dvRadialKmS: 0.0004, dvInTrackKmS: -0.0009, dvCrossKmS: 0.0006 }
    const comb = cwImpulseDisplacementKm(p)
    const r = cwImpulseDisplacementKm({ ...p, dvInTrackKmS: 0, dvCrossKmS: 0 })
    const i = cwImpulseDisplacementKm({ ...p, dvRadialKmS: 0, dvCrossKmS: 0 })
    const c = cwImpulseDisplacementKm({ ...p, dvRadialKmS: 0, dvInTrackKmS: 0 })
    expect(comb.dxKm).toBeCloseTo(r.dxKm + i.dxKm + c.dxKm, 12)
    expect(comb.dyKm).toBeCloseTo(r.dyKm + i.dyKm + c.dyKm, 12)
    expect(comb.dzKm).toBeCloseTo(r.dzKm + i.dzKm + c.dzKm, 12)
  })
  it('guards: leadS must be strictly positive, aKm finite', () => {
    expect(() => cwImpulseDisplacementKm({ aKm: A_REF, leadS: 0, dvCrossKmS: 1 }))
      .toThrow(/leadS must be > 0/)
    expect(() => cwImpulseDisplacementKm({ aKm: A_REF, leadS: -30, dvCrossKmS: 1 }))
      .toThrow(/leadS must be > 0/)
    expect(() => cwImpulseDisplacementKm({ aKm: Number.NaN, leadS: 60 })).toThrow(/finite/)
  })
})

describe('missAfterManeuverKm', () => {
  it('orthogonal geometry is exact Pythagoras: |m| = √(m0² + δ²)', () => {
    const r = missAfterManeuverKm({
      missVecKm: { x: 0, y: 0.4, z: 0 },
      dispKm: { dxKm: 0, dyKm: 0, dzKm: 0.3 },
    })
    expect(r.missKm).toBeCloseTo(0.5, 12)
  })
  it('canceling the miss exactly: δ = m ⇒ miss 0', () => {
    const m = { x: 1.1, y: -2.2, z: 0.3 }
    const r = missAfterManeuverKm({ missVecKm: m, dispKm: { dxKm: m.x, dyKm: m.y, dzKm: m.z } })
    expect(r.missKm).toBeLessThan(1e-12)
  })
})

describe('recommendManeuverKm — closed loop against the CW forward model', () => {
  const check = (rec, missVec, aKm, leadS, target) => {
    if (!rec.needed) return
    const dv = { radial: 'dvRadialKmS', inTrack: 'dvInTrackKmS', cross: 'dvCrossKmS' }[rec.axis]
    const disp = cwImpulseDisplacementKm({ aKm, leadS, [dv]: rec.dvSignedKmS })
    const after = missAfterManeuverKm({ missVecKm: missVec, dispKm: disp })
    expect(after.missKm).toBeGreaterThanOrEqual(target - 1e-6)
    expect(after.missKm).toBeCloseTo(rec.achievedMissKm, 12) // no second model
    expect(rec.dvKmS).toBeGreaterThan(0)
    expect(rec.dvKmS).toBeCloseTo(Math.abs(rec.dvSignedKmS), 15) // cost = magnitude
  }

  it('no-burn case: natural miss already above target ⇒ needed false, zero Δv', () => {
    const rec = recommendManeuverKm({
      missVecKm: { x: 0, y: 5, z: 0 }, aKm: A_REF, leadS: T / 4, targetMissKm: 1,
    })
    expect(rec.needed).toBe(false)
    expect(rec.dvKmS).toBe(0)
    expect(rec.naturalMissKm).toBeCloseTo(5, 12)
  })
  it('in-track-only miss, quarter-period lead: recommendation achieves target', () => {
    const target = 1
    const missVec = { x: 0, y: 0.2, z: 0 }
    const rec = recommendManeuverKm({ missVecKm: missVec, aKm: A_REF, leadS: T / 4, targetMissKm: target })
    expect(rec.needed).toBe(true)
    check(rec, missVec, A_REF, T / 4, target)
  })
  it('arbitrary 3-D miss vector at 0.6 periods: cheapest axis still reaches target', () => {
    const target = 0.8
    const missVec = { x: 0.15, y: -0.3, z: 0.25 }
    const rec = recommendManeuverKm({ missVecKm: missVec, aKm: A_REF, leadS: 0.6 * T, targetMissKm: target })
    expect(rec.needed).toBe(true)
    check(rec, missVec, A_REF, 0.6 * T, target)
  })
  it('cross-track burn is never used for a pure cross-track miss at Ωτ = 2π (zero authority)', () => {
    const missVec = { x: 0, y: 0, z: 0.1 }
    const rec = recommendManeuverKm({ missVecKm: missVec, aKm: A_REF, leadS: T, targetMissKm: 1 })
    expect(rec.axis).not.toBe('cross') // dz(2π) = sin(2π)/Ω ≈ 0 ⇒ no response
  })
  it('cheapest-axis property: no other feasible axis reaches target with less Δv', () => {
    const target = 1, leadS = 0.3 * T
    const missVec = { x: 0.3, y: 0.4, z: 0 }
    const rec = recommendManeuverKm({ missVecKm: missVec, aKm: A_REF, leadS, targetMissKm: target })
    // brute-force each axis with a fine scalar scan for an independent witness
    for (const axis of ['inTrack', 'radial', 'cross']) {
      const dvKey = { radial: 'dvRadialKmS', inTrack: 'dvInTrackKmS', cross: 'dvCrossKmS' }[axis]
      let best = null
      for (let k = 1; k <= 2000; k++) {
        for (const sign of [1, -1]) {
          const d = cwImpulseDisplacementKm({ aKm: A_REF, leadS, [dvKey]: sign * k * 2e-5 })
          if (missAfterManeuverKm({ missVecKm: missVec, dispKm: d }).missKm >= target) {
            best = k * 2e-5
          }
        }
        if (best !== null) break
      }
      if (best !== null) expect(rec.dvKmS).toBeLessThanOrEqual(best + 2e-5)
    }
  })
})

describe('relativeStateAtTcaKm + toHillFrameKm — ECI to Hill pipeline', () => {
  // analytic equatorial circular sampler honouring the M19 contract
  const circSampler = (aKm, phaseDeg, dz = 0) => {
    const n = Math.sqrt(MU_EARTH_KM3S2 / aKm ** 3)
    const v = n * aKm
    return (tMs) => {
      const th = (phaseDeg * Math.PI) / 180 + n * (tMs / 1000)
      return {
        posKm: { x: aKm * Math.cos(th), y: aKm * Math.sin(th), z: dz },
        velKmS: { x: -v * Math.sin(th), y: v * Math.cos(th), z: 0 },
      }
    }
  }

  it('relative position/velocity at TCA match the analytic difference', () => {
    const A = circSampler(A_REF, 0)
    const B = circSampler(A_REF + 50, 0.01)
    const tca = 1_730_000_000_000
    const rs = relativeStateAtTcaKm({ samplerA: A, samplerB: B, tcaMs: tca })
    const pa = A(tca), pb = B(tca)
    expect(rs.relPosKm.x).toBeCloseTo(pb.posKm.x - pa.posKm.x, 9)
    expect(rs.relVelKmS.y).toBeCloseTo(pb.velKmS.y - pa.velKmS.y, 9)
    expect(rs.rMagKm).toBeCloseTo(A_REF, 6)
  })
  it('Hill frame is orthonormal and right-handed for a circular equatorial case', () => {
    const A = circSampler(A_REF, 30)
    const tca = 0
    const rs = relativeStateAtTcaKm({ samplerA: A, samplerB: circSampler(A_REF, 30.001), tcaMs: tca })
    const hill = toHillFrameKm({
      rPrimeKm: rs.aPosKm, vPrimeKm: rs.aVelKmS, relPosKm: rs.relPosKm,
    })
    const dot = (u, w) => u.x * w.x + u.y * w.y + u.z * w.z
    expect(Math.hypot(hill.uR.x, hill.uR.y, hill.uR.z)).toBeCloseTo(1, 12)
    expect(Math.hypot(hill.uA.x, hill.uA.y, hill.uA.z)).toBeCloseTo(1, 12)
    expect(Math.hypot(hill.uC.x, hill.uC.y, hill.uC.z)).toBeCloseTo(1, 12)
    expect(dot(hill.uR, hill.uA)).toBeCloseTo(0, 12)
    expect(dot(hill.uA, hill.uC)).toBeCloseTo(0, 12)
    expect(dot(hill.uC, hill.uR)).toBeCloseTo(0, 12)
  })
  it('a pure outward separation reads as +x radial; a lead along velocity reads as +y', () => {
    // A at (R,0,0) moving +y: Hill axes coincide with ECI x=radial, y=in-track, z=cross
    const rel = toHillFrameKm({
      rPrimeKm: { x: A_REF, y: 0, z: 0 }, vPrimeKm: { x: 0, y: 7.6, z: 0 },
      relPosKm: { x: 2, y: 3, z: -1 },
    })
    expect(rel.relPosHillKm.x).toBeCloseTo(2, 12)
    expect(rel.relPosHillKm.y).toBeCloseTo(3, 12)
    expect(rel.relPosHillKm.z).toBeCloseTo(-1, 12)
  })
  it('Hill radius of the miss vector equals the ECI magnitude (rotation preserves norm)', () => {
    const A = circSampler(A_REF, 120)
    const B = circSampler(A_REF, 120.02, 25)
    const rs = relativeStateAtTcaKm({ samplerA: A, samplerB: B, tcaMs: 4_000_000 })
    const hill = toHillFrameKm({ rPrimeKm: rs.aPosKm, vPrimeKm: rs.aVelKmS, relPosKm: rs.relPosKm })
    const h = hill.relPosHillKm
    expect(Math.hypot(h.x, h.y, h.z)).toBeCloseTo(Math.hypot(rs.relPosKm.x, rs.relPosKm.y, rs.relPosKm.z), 9)
  })
  it('guards: non-finite TCA and degenerate radial vector throw', () => {
    expect(() => relativeStateAtTcaKm({ samplerA: circSampler(A_REF, 0), samplerB: circSampler(A_REF, 1), tcaMs: Number.NaN }))
      .toThrow(/finite/)
    expect(() => toHillFrameKm({ rPrimeKm: { x: 0, y: 0, z: 0 }, vPrimeKm: { x: 0, y: 1, z: 0 }, relPosKm: { x: 1, y: 0, z: 0 } }))
      .toThrow(/no direction/)
  })
})
