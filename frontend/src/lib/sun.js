/**
 * OrbitalPulse — low-precision solar ephemeris (M13 extraction).
 *
 * The formulas are the exact Meeus low-precision chain previously embedded
 * in coords.sunDirection (moved here verbatim, not re-derived), so the
 * scene lighting/eclipse tests that existed before stay byte-identical —
 * pinned by reference vectors in tests/eclipse.test.js.
 *
 *  - sunEquatorialRad: geometric ecliptic -> RA/Dec (obliquity 23.439 deg)
 *  - sunEciUnit: unit vector in ECI (satellite.js-compatible frame, z =
 *    celestial north, x toward the March equinox; Earth rotation NOT applied)
 *  - subsolarLonDeg: RA minus GMST, wrapped — what the scene projection wants
 */
import { RAD_PER_DEG } from './constants.js'

export function sunEquatorialRad(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0
  const L = (280.46 + 0.9856474 * n) * RAD_PER_DEG
  const g = (357.528 + 0.98560028 * n) * RAD_PER_DEG
  const lambda = L + 1.915 * Math.sin(g) * RAD_PER_DEG + 0.02 * Math.sin(2 * g) * RAD_PER_DEG
  const eps = (23.439 - 0.0000004 * n) * RAD_PER_DEG
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const gmstRad = (((280.46061837 + 360.98564736629 * n) % 360 + 360) % 360) * RAD_PER_DEG
  return { ra, dec, gmstRad }
}

export function sunEciUnit(date = new Date(), out = [0, 0, 0]) {
  const { ra, dec } = sunEquatorialRad(date)
  out[0] = Math.cos(dec) * Math.cos(ra)
  out[1] = Math.cos(dec) * Math.sin(ra)
  out[2] = Math.sin(dec)
  return out
}

export function subsolarLonDeg(date = new Date()) {
  const { ra, gmstRad } = sunEquatorialRad(date)
  return ((ra / RAD_PER_DEG - gmstRad / RAD_PER_DEG + 540) % 360) - 180
}
