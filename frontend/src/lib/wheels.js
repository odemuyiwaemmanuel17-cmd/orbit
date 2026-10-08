/**
 * OrbitalPulse — reaction-wheel dynamics bench (M12).
 *
 * Rigid bus (diagonal inertia) + 3 wheel axes. Motor torque is INTERNAL:
 * commanding relative wheel acceleration u_i produces coupled motion
 *   tau_i = u_i * (I_i*Iw_i)/(I_i+Iw_i)          [reduced inertia]
 *   omega_dot_i = ((I_j - I_k) w_j w_k - tau_i)/I_i   [Euler equations]
 *   Omega_dot_i = u_i                             [wheel vs bus]
 * Total momentum H_i = (I_i+Iw_i) w_i + Iw_i Omega_i is conserved exactly
 * by the continuous system — tests pin the discrete integrator to it.
 *
 * Integrator (documented per platform rules): fixed-step RK4 on the state
 * [w(3), q(4, scalar-first), Omega(3)]; dt = 0.02 s default; quaternion
 * renormalized every step (drift O(dt^4) otherwise). Validity limits: dt
 * small vs both the maneuver time and 1/n_body; NO gravity-gradient, no
 * flex, no friction/drag torque — labeled SIMPLIFIED MODEL + BENCH frame
 * (orbit-rate effects are demonstrated separately in M11).
 *
 * Closed-form single-axis slew (zero initial rates):
 *   ramp both halves duration t1 with |u| = a:
 *   theta_final = (Iw/(I+Iw)) * a * t1^2   (body turns opposite to wheel spin-up)
 *   wheel returns to zero relative speed; H stays 0 throughout.
 */

// -- quaternion utilities (scalar-first) -------------------------------------
export function quatMult(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ]
}
export function quatNormalize(q) {
  const m = Math.hypot(...q)
  return m > 0 ? q.map((c) => c / m) : [1, 0, 0, 0]
}
export function quatFromAxisAngle(axis, rad) {
  const h = rad / 2, s = Math.sin(h)
  return [Math.cos(h), axis[0] * s, axis[1] * s, axis[2] * s]
}
/** Angle (rad) of q about a known unit axis — exact for single-axis motion. */
export function quatAngleAboutAxis(q, axis) {
  const vecDot = q[1] * axis[0] + q[2] * axis[1] + q[3] * axis[2]
  return 2 * Math.atan2(vecDot, q[0])
}
/** Rotate vector v by unit quaternion q: v' = v + 2 qw (w×v) + 2 w×(w×v). */
export function quatRotVec(q, v) {
  const w = [q[1], q[2], q[3]]
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const wxv = cr(w, v)
  const wxwxv = cr(w, wxv)
  return [0, 1, 2].map((i) => v[i] + 2 * q[0] * wxv[i] + 2 * wxwxv[i])
}

// -- command planning ---------------------------------------------------------
const AXIS_VEC = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

export function planSlew({ angleDeg, axis = 2, IbodyKgMm2, IwheelKgMm2, torqueNm }) {
  const I = Number(IbodyKgMm2), Iw = Number(IwheelKgMm2), tau = Number(torqueNm)
  if (!(I > 0) || !(Iw > 0) || !(tau > 0)) throw new RangeError('positive I, Iw, torque required')
  if (Math.abs(angleDeg) < 1e-9) throw new RangeError('nonzero slew required')
  const a = tau / Iw                    // relative wheel accel [rad/s^2]
  const k = Iw / (I + Iw)               // body fraction of relative accel
  const theta = Math.abs(angleDeg) * Math.PI / 180
  const t1 = Math.sqrt(theta / (k * a)) // each ramp half
  const omegaPeak = k * a * t1          // body rate peak [rad/s]
  const wheelRpmPeak = a * t1 * 60 / (2 * Math.PI)
  const hWheelAbsPeakNms = Number(IbodyKgMm2) * omegaPeak // = |I * w_peak| via H = 0
  // Reaction physics: to spin the body +theta, the wheel accelerates the
  // OPPOSITE way (momentum conservation, H = 0 from rest).
  return { angleDeg, axis, a: -Math.sign(angleDeg) * a, t1, durSec: 2 * t1,
    omegaPeakDps: omegaPeak * 180 / Math.PI, wheelRpmPeak, hWheelAbsPeakNms }
}

// -- integration --------------------------------------------------------------
function deriv(st, I3, Iw3, u3) {
  const tau = [0, 1, 2].map((i) => u3[i] * (I3[i] * Iw3[i]) / (I3[i] + Iw3[i]))
  const wdot = [
    ((I3[1] - I3[2]) * st.w[1] * st.w[2] - tau[0]) / I3[0],
    ((I3[2] - I3[0]) * st.w[2] * st.w[0] - tau[1]) / I3[1],
    ((I3[0] - I3[1]) * st.w[0] * st.w[1] - tau[2]) / I3[2],
  ]
  const w = st.w
  const qd = quatMult(st.q, [0, w[0], w[1], w[2]]).map((c) => 0.5 * c)
  return { w: wdot, q: qd, O: [...u3] }
}

const add = (a, b, s) => a.map((v, i) => v + s * b[i])

/**
 * RK4 over the bench timeline (pad + accel ramp + decel ramp + pad).
 * Returns samples every outEverySec seconds.
 */
export function integrateSlew(plan, {
  IbodyKgMm2, IwheelKgMm2, dtSec = 0.02, padSec = 1, outEverySec = 0.5,
} = {}) {
  const Ib = Number(IbodyKgMm2), Iw = Number(IwheelKgMm2)
  const I3 = [Ib, Ib, Ib]
  const Iw3 = [Iw, Iw, Iw]
  const axis = AXIS_VEC[plan.axis]
  let st = { w: [0, 0, 0], q: [1, 0, 0, 0], O: [0, 0, 0] }
  const stepRk4 = (h, u3) => {
    const k1 = deriv(st, I3, Iw3, u3)
    const s2 = { w: add(st.w, k1.w, h / 2), q: quatNormalize(add(st.q, k1.q, h / 2)), O: add(st.O, k1.O, h / 2) }
    const k2 = deriv(s2, I3, Iw3, u3)
    const s3 = { w: add(st.w, k2.w, h / 2), q: quatNormalize(add(st.q, k2.q, h / 2)), O: add(st.O, k2.O, h / 2) }
    const k3 = deriv(s3, I3, Iw3, u3)
    const s4 = { w: add(st.w, k3.w, h), q: quatNormalize(add(st.q, k3.q, h)), O: add(st.O, k3.O, h) }
    const k4 = deriv(s4, I3, Iw3, u3)
    st = {
      w: st.w.map((v, i) => v + (h / 6) * (k1.w[i] + 2 * k2.w[i] + 2 * k3.w[i] + k4.w[i])),
      q: quatNormalize(st.q.map((v, i) => v + (h / 6) * (k1.q[i] + 2 * k2.q[i] + 2 * k3.q[i] + k4.q[i]))),
      O: st.O.map((v, i) => v + (h / 6) * (k1.O[i] + 2 * k2.O[i] + 2 * k3.O[i] + k4.O[i])),
    }
  }
  const sample = () => {
    const wAxis = st.w[plan.axis], OAxis = st.O[plan.axis]
    return {
      angleDeg: quatAngleAboutAxis(st.q, axis) * 180 / Math.PI,
      bodyRateDps: wAxis * 180 / Math.PI,
      wheelRpm: OAxis * 60 / (2 * Math.PI),
      wheelAbsMomNms: Iw * (wAxis + OAxis),
      busMomNms: Ib * wAxis,
      totalMomNms: (Ib + Iw) * wAxis + Iw * OAxis,
      q: [...st.q],
    }
  }
  const ZERO = [0, 0, 0]
  const A = [0, 0, 0]; A[plan.axis] = plan.a
  const total = 2 * padSec + 2 * plan.t1
  // Segment-aligned integration: u is CONSTANT inside each segment, so the
  // command discontinuities land exactly on step boundaries and RK4 sees a
  // smooth system per segment (piecewise-exact for linear rates).
  const bps = [0, padSec, padSec + plan.t1, padSec + 2 * plan.t1, total]
  const us = [ZERO, A, A.map((c) => -c), ZERO]
  const out = [{ tSec: 0, ...sample() }]
  let nextT = outEverySec
  for (let s = 0; s < 4; s++) {
    const from = bps[s], to = bps[s + 1]
    if (!(to > from)) continue
    const n = Math.max(1, Math.ceil((to - from) / dtSec))
    const h = (to - from) / n
    for (let i = 0; i < n; i++) {
      stepRk4(h, us[s])
      const t = from + (i + 1) * h
      while (nextT <= t + 1e-9 && nextT < total - 1e-9) {
        out.push({ tSec: nextT, ...sample() })
        nextT += outEverySec
      }
    }
  }
  out.push({ tSec: total, ...sample() }) // exact settled end state
  return out
}
