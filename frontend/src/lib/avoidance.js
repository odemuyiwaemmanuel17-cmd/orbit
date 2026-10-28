/**
 * OrbitalPulse — collision-avoidance maneuver planning (M20).
 *
 * Clohessy-Wiltshire (Hill) impulse response for a chaser-target pair on
 * a common CIRCULAR reference orbit. Frame: x = radial-out, y = along
 * (in-track, velocity direction), z = cross-track. Standard exact CW
 * solution for an impulsive relative velocity (vx,vy,vz) [km/s] applied
 * at t0, with initial relative velocity zero:
 *
 *   x(τ) = 2(cos Ωτ − 1)·vx/Ω + (2 sin Ωτ)/Ω·vy        (radial)
 *   y(τ) = (2 − 2cos Ωτ)·vx/Ω + (4 sin Ωτ − 3Ωτ)/Ω·vy  (in-track)
 *   z(τ) = (sin Ωτ)/Ω·vz                                 (cross-track)
 *
 * The well-known long-arc signature is visible in y: a PROGRADE (vy>0)
 * impulse eventually displaces the burner AFT (the −3Ωτ term) because it
 * trades altitude for slower mean motion — the reason avoidance burns
 * are planned in the direction that opens the RIGHT side of the
 * engagement window.
 *
 * SIMPLIFIED, disclosed: linearized relative dynamics (valid for
 * separations << orbital radius, i.e. < ~100 km screening geometry);
 * circular reference; single impulsive burn; the secondary keeps its
 * trajectory (we move the primary only); no execution/attitude errors.
 * Units: km and km/s end-to-end; UI converts to m/s for display.
 */
import { MU_EARTH_KM3S2 } from './constants.js'

const requireFinite = (name, v) => {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite, got ${v}`)
}

export function meanMotionRadS(aKm) {
  requireFinite('aKm', aKm)
  if (!(aKm > 0)) throw new RangeError('aKm must be positive')
  return Math.sqrt(MU_EARTH_KM3S2 / aKm ** 3)
}

/**
 * CW displacement at TCA [km] from one impulsive Δv [km/s] applied leadS
 * seconds earlier on a circular orbit of semimajor axis aKm.
 */
export function cwImpulseDisplacementKm({ aKm, leadS, dvRadialKmS = 0, dvInTrackKmS = 0, dvCrossKmS = 0 }) {
  requireFinite('leadS', leadS)
  if (!(leadS > 0)) throw new RangeError('leadS must be > 0 (burn BEFORE closest approach)')
  const O = meanMotionRadS(aKm)
  const x = O * leadS
  const c = Math.cos(x), s = Math.sin(x)
  return {
    dxKm: 2 * (c - 1) * dvRadialKmS / O + 2 * s * dvInTrackKmS / O,
    dyKm: (2 - 2 * c) * dvRadialKmS / O + (4 * s - 3 * x) * dvInTrackKmS / O,
    dzKm: s * dvCrossKmS / O,
    omegaRadS: O, leadS,
  }
}

/**
 * Post-maneuver miss: natural miss vector at TCA plus the NEGATIVE of our
 * displacement (relative geometry: moving us by δ moves the separation
 * vector by −δ for a fixed secondary).
 */
export function missAfterManeuverKm({ missVecKm, dispKm }) {
  const m = missVecKm, d = dispKm
  const nx = m.x - d.dxKm, ny = m.y - d.dyKm, nz = m.z - d.dzKm
  return {
    x: nx, y: ny, z: nz,
    missKm: Math.hypot(nx, ny, nz),
  }
}

/**
 * Minimum single-axis Δv [km/s] to reach a target miss. Per axis the burn
 * direction is the fixed CW response vector r (any scalar Δv, signed — a
 * negative Δv is simply the opposite thrust direction, equally executable).
 * |m0 − dv·r| = target is a quadratic in dv; since natural < target the
 * two roots straddle the infeasible interval, so the smallest |dv| root
 * is the cheapest boundary burn on that axis. The axis achieving the
 * target with least cost wins.
 */
export function recommendManeuverKm({ missVecKm, aKm, leadS, targetMissKm = 1 }) {
  const O = meanMotionRadS(aKm)
  const x = O * leadS
  const c = Math.cos(x), s = Math.sin(x)
  // per-axis displacement derivative w.r.t. dv (km per km/s)
  const resp = {
    inTrack: { dx: 2 * s / O, dy: (4 * s - 3 * x) / O, dz: 0 },
    radial: { dx: 2 * (c - 1) / O, dy: (2 - 2 * c) / O, dz: 0 },
    cross: { dx: 0, dy: 0, dz: s / O },
  }
  const m0 = missVecKm
  const natural = Math.hypot(m0.x, m0.y, m0.z)
  if (natural >= targetMissKm) {
    return { needed: false, dvKmS: 0, axis: 'NONE', naturalMissKm: natural, achievedMissKm: natural }
  }
  const evalAxis = (axis) => {
    const r = resp[axis]
    const len = Math.hypot(r.dx, r.dy, r.dz)
    if (!(len > 1e-12)) return null // zero authority at this lead time
    const A = r.dx * r.dx + r.dy * r.dy + r.dz * r.dz
    const B = -2 * (r.dx * m0.x + r.dy * m0.y + r.dz * m0.z)
    const C = natural ** 2 - targetMissKm ** 2
    const disc = B * B - 4 * A * C
    if (disc < 0) return null
    const sq = Math.sqrt(disc)
    const roots = [(-B + sq) / (2 * A), (-B - sq) / (2 * A)]
    let best = null
    for (const dv of roots) {
      const after = missAfterManeuverKm({ missVecKm: m0,
        dispKm: { dxKm: r.dx * dv, dyKm: r.dy * dv, dzKm: r.dz * dv } })
      if (after.missKm >= targetMissKm - 1e-9
        && (best === null || Math.abs(dv) < Math.abs(best))) best = dv
    }
    if (best === null) return null
    const after = missAfterManeuverKm({ missVecKm: m0,
      dispKm: { dxKm: r.dx * best, dyKm: r.dy * best, dzKm: r.dz * best } })
    return { axis, dvKmS: Math.abs(best), dvSignedKmS: best, achievedMissKm: after.missKm }
  }
  const options = ['inTrack', 'radial', 'cross'].map(evalAxis).filter(Boolean)
  if (!options.length) return { needed: true, dvKmS: null, axis: 'NONE', naturalMissKm: natural, achievedMissKm: natural }
  options.sort((p, q) => p.dvKmS - q.dvKmS)
  return { needed: true, naturalMissKm: natural, targetMissKm, ...options[0] }
}

/**
 * Relative state of B w.r.t. A at TCA, from two M19-contract samplers
 * ((tMs) => {posKm, velKmS}) — feeds real conjunction results into the
 * Hill frame of A's instantaneous orbit.
 */
export function relativeStateAtTcaKm({ samplerA, samplerB, tcaMs }) {
  requireFinite('tcaMs', tcaMs)
  const a0 = samplerA(tcaMs), b0 = samplerB(tcaMs)
  for (const [n, v] of Object.entries({ a0, b0 })) {
    if (!v || !Number.isFinite(v.posKm?.x) || !Number.isFinite(v.velKmS?.x)) {
      throw new RangeError(`sampler ${n} invalid at TCA`)
    }
  }
  return {
    relPosKm: { x: b0.posKm.x - a0.posKm.x, y: b0.posKm.y - a0.posKm.y, z: b0.posKm.z - a0.posKm.z },
    relVelKmS: {
      x: b0.velKmS.x - a0.velKmS.x, y: b0.velKmS.y - a0.velKmS.y, z: b0.velKmS.z - a0.velKmS.z,
    },
    aPosKm: a0.posKm,
    aVelKmS: a0.velKmS,
    rMagKm: Math.hypot(a0.posKm.x, a0.posKm.y, a0.posKm.z),
  }
}

/** Rotate ECI relative position into A's Hill frame (radial/in-track/cross). */
export function toHillFrameKm({ rPrimeKm, vPrimeKm, relPosKm }) {
  const xh = { x: rPrimeKm.x, y: rPrimeKm.y, z: rPrimeKm.z }
  const xr = Math.hypot(xh.x, xh.y, xh.z)
  if (!(xr > 0)) throw new RangeError('radial vector has no direction')
  const uR = { x: xh.x / xr, y: xh.y / xr, z: xh.z / xr }
  // along-track: velocity component perpendicular to the radial unit vector
  const vRadial = vPrimeKm.x * uR.x + vPrimeKm.y * uR.y + vPrimeKm.z * uR.z
  const va = { x: vPrimeKm.x - vRadial * uR.x, y: vPrimeKm.y - vRadial * uR.y, z: vPrimeKm.z - vRadial * uR.z }
  const lv = Math.hypot(va.x, va.y, va.z)
  if (!(lv > 1e-9)) throw new RangeError('degenerate velocity direction')
  const uA = { x: va.x / lv, y: va.y / lv, z: va.z / lv }
  const uC = { x: uR.y * uA.z - uR.z * uA.y, y: uR.z * uA.x - uR.x * uA.z, z: uR.x * uA.y - uR.y * uA.x }
  const dot = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z
  return {
    relPosHillKm: { x: dot(uR, relPosKm), y: dot(uA, relPosKm), z: dot(uC, relPosKm) },
    uR, uA, uC,
  }
}
