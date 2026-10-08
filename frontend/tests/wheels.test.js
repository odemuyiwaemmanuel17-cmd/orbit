/**
 * M12 wheel-dynamics validation: RK4 against the exact single-axis closed
 * form, momentum conservation invariants, planning identities, quat math.
 */
import { describe, expect, it } from 'vitest'
import {
  planSlew, integrateSlew, quatFromAxisAngle, quatNormalize, quatMult,
  quatAngleAboutAxis, quatRotVec,
} from '../src/lib/wheels.js'

const IB = 100, IW = 0.1, TAU = 0.05
const opts = { IbodyKgMm2: IB, IwheelKgMm2: IW }

describe('quaternion math', () => {
  it('axis-angle -> angle round-trips, rotation of a vector agrees', () => {
    const q = quatFromAxisAngle([0, 0, 1], Math.PI / 3)
    expect(quatAngleAboutAxis(q, [0, 0, 1])).toBeCloseTo(Math.PI / 3, 12)
    const v = quatRotVec(q, [1, 0, 0])
    expect(v[0]).toBeCloseTo(Math.cos(Math.PI / 3), 12)
    expect(v[1]).toBeCloseTo(Math.sin(Math.PI / 3), 12)
    expect(v[2]).toBeCloseTo(0, 12)
  })
  it('composition matches angles added on a shared axis; norm stays 1', () => {
    const a = quatFromAxisAngle([1, 0, 0], 0.7), b = quatFromAxisAngle([1, 0, 0], -0.2)
    const c = quatMult(a, b)
    expect(Math.hypot(...c)).toBeCloseTo(1, 12)
    expect(quatAngleAboutAxis(c, [1, 0, 0])).toBeCloseTo(0.5, 12)
    expect(Math.hypot(...quatNormalize([2, 0, 0, 0]))).toBeCloseTo(1, 12)
  })
})

describe('slew planner (closed form)', () => {
  const plan = planSlew({ angleDeg: 30, axis: 2, IbodyKgMm2: IB, IwheelKgMm2: IW, torqueNm: TAU })
  it('theta = (Iw/(I+Iw)) a t1^2 exactly', () => {
    const k = IW / (IB + IW), a = TAU / IW
    expect(k * a * plan.t1 ** 2 * 180 / Math.PI).toBeCloseTo(30, 9)
  })
  it('quadrupling torque halves t1 (t1 ~ 1/sqrt(a))', () => {
    const hi = planSlew({ angleDeg: 30, IbodyKgMm2: IB, IwheelKgMm2: IW, torqueNm: TAU * 4 })
    expect(hi.t1 / plan.t1).toBeCloseTo(0.5, 9)
  })
  it('invalid configs throw instead of planning garbage', () => {
    expect(() => planSlew({ angleDeg: 0, IbodyKgMm2: IB, IwheelKgMm2: IW, torqueNm: TAU })).toThrow(RangeError)
    expect(() => planSlew({ angleDeg: 10, IbodyKgMm2: -5, IwheelKgMm2: IW, torqueNm: TAU })).toThrow(RangeError)
  })
})

describe('RK4 integration vs the exact solution', () => {
  const plan = planSlew({ angleDeg: 30, axis: 2, IbodyKgMm2: IB, IwheelKgMm2: IW, torqueNm: TAU })
  const run = integrateSlew(plan, { ...opts })
  const last = run[run.length - 1]
  it('body settles at the commanded angle (dt=0.02 s error < 0.01 deg)', () => {
    expect(last.angleDeg).toBeCloseTo(30, 2)
    expect(Math.abs(last.bodyRateDps)).toBeLessThan(0.05)
    expect(Math.abs(last.wheelRpm)).toBeLessThan(5)
  })
  it('TOTAL momentum is conserved at zero through every sample (H = 0 start)', () => {
    for (const s of run) expect(Math.abs(s.totalMomNms)).toBeLessThan(1e-6)
  })
  it('wheel absolute momentum = -bus momentum (reaction pair) at peak rate', () => {
    const peak = run.reduce((m, s) => Math.abs(s.bodyRateDps) > Math.abs(m.bodyRateDps) ? s : m, run[0])
    expect(peak.wheelAbsMomNms).toBeCloseTo(-peak.busMomNms, 9)
    // 0.5 s sample grid can sit up to 0.25 s off the true apex — 1 digit
    expect(Math.abs(peak.wheelAbsMomNms)).toBeCloseTo(plan.hWheelAbsPeakNms, 1)
  })
  it('peak body rate matches the closed form k*a*t1', () => {
    const k = IW / (IB + IW)
    const expectedDps = k * (TAU / IW) * plan.t1 * 180 / Math.PI
    const maxDps = Math.max(...run.map((s) => Math.abs(s.bodyRateDps)))
    expect(maxDps).toBeCloseTo(expectedDps, 1)
  })
  it('quaternion stays unit-normalized across the run', () => {
    for (const s of run) expect(Math.hypot(...s.q)).toBeCloseTo(1, 9)
  })
})

describe('saturation behaviour (what the demo is about)', () => {
  it('a 60 deg slew on the 2 Nms wheel needs more momentum than it holds', () => {
    const plan = planSlew({ angleDeg: 60, IbodyKgMm2: IB, IwheelKgMm2: IW, torqueNm: TAU })
    expect(plan.hWheelAbsPeakNms).toBeGreaterThan(2)
    const run = integrateSlew(plan, { IbodyKgMm2: IB, IwheelKgMm2: IW })
    const peak = Math.max(...run.map((s) => Math.abs(s.wheelAbsMomNms)))
    expect(peak).toBeGreaterThan(2) // honest: it exceeds the rated limit
  })
  it('halving the angle keeps peak momentum under the same limit', () => {
    const plan = planSlew({ angleDeg: 30, IbodyKgMm2: IB, IwheelKgMm2: IW, torqueNm: TAU })
    expect(plan.hWheelAbsPeakNms).toBeLessThan(2)
  })
})
