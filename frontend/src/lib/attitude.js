/**
 * OrbitalPulse — attitude kinematics (M11).
 *
 * Pure, THREE-free frame math on top of the validated state pipeline:
 * LVLH (local-vertical/local-horizontal, "nadir-pointing" reference) built
 * by Gram-Schmidt from ECI position/velocity, plus a body frame described
 * by aerospace 3-1-2... no — standard intrinsic Z-Y-X yaw/pitch/roll about
 * LVLH axes (yaw about nadir z, pitch about wheel axis y, roll about
 * flight axis x; RWFS convention). Attitude DYNAMICS (torques, wheels) are
 * M12 — this module is geometry only, and the page says so.
 *
 * Conventions (fixed here, tested):
 *   LVLH  x = horizontal velocity (along-track),  y = z x x,  z = nadir
 *         => y = -orbit-normal for prograde orbits (classic Hill/CW frame)
 *   Body  axes start aligned with LVLH and rotate by yaw(z) -> pitch(y')
 *         -> roll(x''): R = Rz(yaw) Ry(pitch) Rx(roll), body->LVLH.
 */
import { RAD_PER_DEG, DEG_PER_RAD } from './constants.js'

const norm = (v) => {
  const m = Math.hypot(...v)
  return m > 0 ? v.map((c) => c / m) : null
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Right-handed LVLH basis expressed in ECI as [x, y, z] unit vectors.
 * Throws on degenerate states (zero radius / zero velocity / radial motion).
 */
export function lvlhBasisEciKm(posKm, velKmS) {
  const r = norm([posKm.x, posKm.y, posKm.z])
  const v = [velKmS.x, velKmS.y, velKmS.z]
  if (!r) throw new RangeError('zero position')
  const along = norm([v[0] - dot(v, r) * r[0], v[1] - dot(v, r) * r[1], v[2] - dot(v, r) * r[2]])
  if (!along) throw new RangeError('radial-only velocity: along-track axis undefined')
  const z = [-r[0], -r[1], -r[2]] // nadir
  const y = cross(z, along)
  return { x: along, y, z }
}

/** Body->LVLH rotation matrix (intrinsic yaw-pitch-roll, Z-Y-X). */
export function yawPitchRollMat(yawDeg, pitchDeg, rollDeg) {
  const [Y, P, Rr] = [yawDeg, pitchDeg, rollDeg].map((d) => d * RAD_PER_DEG)
  const c = Math.cos, s = Math.sin
  const Rz = [[c(Y), -s(Y), 0], [s(Y), c(Y), 0], [0, 0, 1]]
  const Ry = [[c(P), 0, s(P)], [0, 1, 0], [-s(P), 0, c(P)]]
  const Rx = [[1, 0, 0], [0, c(Rr), -s(Rr)], [0, s(Rr), c(Rr)]]
  const mul = (A, B) => A.map((row) => row.map((_, j) => row.reduce((acc, a, k) => acc + a * B[k][j], 0)))
  return mul(Rz, mul(Ry, Rx))
}

/**
 * Body unit axes expressed in ECI. R maps body coords -> LVLH coords, so
 * body axis i = sum_j R[j][i] * lvlhAxis[j] (the COLUMNS of R weight the
 * LVLH basis). Rows of R would be the inverse (LVLH axes in body coords).
 */
export function bodyAxesEciKm(basis, yprDeg) {
  const R = yawPitchRollMat(...yprDeg)
  const lvlh = [basis.x, basis.y, basis.z]
  return [0, 1, 2].map((i) =>
    [0, 1, 2].map((k) => lvlh.reduce((acc, bVec, j) => acc + R[j][i] * bVec[k], 0)))
}

/** Angle between two unit directions, degrees (safe for fp roundoff). */
export function angleBetweenDeg(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * DEG_PER_RAD
}

/** Angle between the body z (boresight/nadir axis) and true nadir, degrees. */
export function nadirErrorDeg(basis, yprDeg) {
  const body = bodyAxesEciKm(basis, yprDeg)
  return angleBetweenDeg(body[2], basis.z)
}
