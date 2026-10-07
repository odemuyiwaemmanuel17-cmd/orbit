/**
 * M11 attitude-frame validation: LVLH definition identities, RWFS
 * conventions, orthonormality, and the analytic inertial-hold drift.
 */
import { describe, expect, it } from 'vitest'
import {
  lvlhBasisEciKm, yawPitchRollMat, bodyAxesEciKm, nadirErrorDeg,
} from '../src/lib/attitude.js'
import { elementsToStateKm } from '../src/lib/kepler.js'

const V = (a) => ({ x: a[0], y: a[1], z: a[2] })
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
// -0/+0 artifacts must not fail vector comparisons: compare components.
const closeVec = (got, want, digits = 12) =>
  want.forEach((c, i) => expect(got[i]).toBeCloseTo(c, digits))

const CIRC = { aKm: 6371 + 400, e: 0, iDeg: 51.6, raanDeg: 40, argPerigeeDeg: 90, trueAnomalyDeg: 33 }

describe('LVLH basis', () => {
  it('classic prograde equatorial case: z=nadir, x=along-track, y=-h', () => {
    const b = lvlhBasisEciKm(V([7000, 0, 0]), V([0, 7.5, 0]))
    closeVec(b.z, [-1, 0, 0])
    closeVec(b.x, [0, 1, 0])
    closeVec(b.y, [0, 0, -1])
  })
  it('definition holds on a real inclined state: RH, z nadir, x aligned with v', () => {
    const { posKm, velKmS } = elementsToStateKm(CIRC)
    const b = lvlhBasisEciKm(posKm, velKmS)
    expect(dot(b.x, b.y)).toBeCloseTo(0, 12)
    expect(dot(b.y, b.z)).toBeCloseTo(0, 12)
    expect(dot(b.z, b.x)).toBeCloseTo(0, 12)
    for (const a of [b.x, b.y, b.z]) expect(Math.hypot(...a)).toBeCloseTo(1, 12)
    closeVec(cross(b.x, b.y), b.z)
    expect(dot(b.z, [-posKm.x, -posKm.y, -posKm.z])).toBeGreaterThan(0.999999) // nadir
    expect(dot(b.x, [velKmS.x, velKmS.y, velKmS.z])).toBeGreaterThan(0) // along-track
  })
  it('degenerate states throw instead of inventing axes', () => {
    expect(() => lvlhBasisEciKm(V([0, 0, 0]), V([0, 7, 0]))).toThrow(RangeError)
    expect(() => lvlhBasisEciKm(V([7000, 0, 0]), V([7, 0, 0]))).toThrow(RangeError) // pure radial
  })
})

describe('RWFS yaw-pitch-roll (intrinsic Z-Y-X)', () => {
  it('zero angles = LVLH aligned', () => {
    const { posKm, velKmS } = elementsToStateKm(CIRC)
    const b = lvlhBasisEciKm(posKm, velKmS)
    const axes = bodyAxesEciKm(b, [0, 0, 0])
    closeVec(axes[0], b.x)
    closeVec(axes[2], b.z)
    // acos() near |d|=1 amplifies fp roundoff: 1e-12 dot error -> ~1e-6 deg.
    // This is the double-precision floor, not a math error.
    expect(nadirErrorDeg(b, [0, 0, 0])).toBeLessThan(1e-4)
  })
  it('yaw 90 about nadir maps body-x onto LVLH-y (right-hand +)', () => {
    const b = lvlhBasisEciKm(V([7000, 0, 0]), V([0, 7.5, 0]))
    const axes = bodyAxesEciKm(b, [90, 0, 0])
    closeVec(axes[0], b.y, 9)
    closeVec(axes[2], b.z) // yaw keeps boresight on nadir
  })
  it('pitch and roll each tilt boresight exactly 90 deg at full deflection', () => {
    const b = lvlhBasisEciKm(V([7000, 0, 0]), V([0, 7.5, 0]))
    expect(nadirErrorDeg(b, [0, 90, 0])).toBeCloseTo(90, 9)
    expect(nadirErrorDeg(b, [0, 0, 90])).toBeCloseTo(90, 9)
  })
  it('body axes stay orthonormal under arbitrary attitude', () => {
    const { posKm, velKmS } = elementsToStateKm(CIRC)
    const b = lvlhBasisEciKm(posKm, velKmS)
    for (const ypr of [[123.4, -76.5, 44], [0, 45, 45], [180, 0, 0]]) {
      const axes = bodyAxesEciKm(b, ypr)
      for (const a of axes) expect(Math.hypot(...a)).toBeCloseTo(1, 12)
      expect(dot(axes[0], axes[1])).toBeCloseTo(0, 12)
      expect(dot(axes[1], axes[2])).toBeCloseTo(0, 12)
      // independent column-combination recomputation of axis 2
      const R = yawPitchRollMat(...ypr)
      const manual = [0, 1, 2].map((k) => R[0][2] * b.x[k] + R[1][2] * b.y[k] + R[2][2] * b.z[k])
      closeVec(axes[2], manual, 10)
    }
  })
})

describe('inertial-hold drift (the demo the page shows)', () => {
  it('a body locked in ECI sees nadir drift at exactly the orbit rate', () => {
    const { posKm, velKmS } = elementsToStateKm(CIRC)
    const b0 = lvlhBasisEciKm(posKm, velKmS)
    const bodyEci = bodyAxesEciKm(b0, [0, 0, 0]) // frozen at t0 (nadir-pointing attitude)
    for (const tFrac of [0.05, 0.15, 0.3]) {
      const nu = (CIRC.trueAnomalyDeg + 360 * tFrac) % 360
      const st = elementsToStateKm({ ...CIRC, trueAnomalyDeg: nu })
      const bT = lvlhBasisEciKm(st.posKm, st.velKmS)
      const d = Math.max(-1, Math.min(1, dot(bodyEci[2], bT.z)))
      expect(Math.acos(d) * (180 / Math.PI)).toBeCloseTo(360 * tFrac, 6)
    }
  })
})
