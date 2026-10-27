/**
 * OrbitalPulse — sun-synchronous mission designer (M18).
 *
 * Composes already-validated pieces: the J2 secular rates of lib/j2.js,
 * the Meeus sun ephemeris of lib/sun.js and the pre-validated
 * kepler.sunSyncInclinationDeg solver. New here is only the LTAN
 * (Local Time of Ascending Node) geometry:
 *
 *   The ascending node is a fixed right ascension Ω in the equatorial
 *   frame. Local mean solar time at the node crossing is the node's RA
 *   measured against the sun's RA, plus 12 h (the sun is at LOCAL NOON):
 *       LTAN [h] = ((Ω − α☉) / 15°/h + 12) mod 24
 *   Sanity: Ω = α☉ (node points at the sun) => 12:00 noon crossing;
 *   Ω = α☉ + 90° => 18:00 dusk; Ω = α☉ − 90° => 06:00 dawn.
 *
 * An SSO keeps LTAN ~constant because its J2 nodal drift EQUALS the sun's
 * apparent motion (+360° per tropical year, 0.9856°/day) — that identity
 * is exactly the condition kepler.sunSyncInclinationDeg solves.
 *
 * Disclosed simplifications: LTAN is MEAN solar time (equation of time,
 * ~±16 min, not applied); sun RA is the validated low-precision Meeus
 * chain; β uses the instantaneous sun vector at the design epoch (it
 * drifts a few degrees over a season — recheck at execution epoch).
 */
import { RAD_PER_DEG, DEG_PER_RAD, R_EARTH_EQUATORIAL_KM, SUN_MEAN_MOTION_DEGDAY } from './constants.js'
import { sunEquatorialRad, sunEciUnit } from './sun.js'
import { sunSyncInclinationDeg, periodSec } from './kepler.js'
import { j2SecularRatesDegDay } from './j2.js'

const wrap360 = (d) => ((d % 360) + 360) % 360
const wrap24 = (h) => ((h % 24) + 24) % 24

/** Sun right ascension in degrees for a date (validated Meeus chain). */
export function sunRaDeg(date = new Date()) {
  return wrap360(sunEquatorialRad(date).ra * DEG_PER_RAD)
}

/** Mean solar time [h] at the ascending node: LTAN = ((Ω − α☉)/15 + 12) mod 24. */
export function ltanOfNodeDeg(raanDeg, date = new Date()) {
  const diff = ((raanDeg - sunRaDeg(date)) % 360 + 360) % 360 // [0,360)
  return wrap24(diff / 15 + 12)
}

/** Node RA [deg] that gives the requested LTAN at a date. */
export function nodeRaForLtanDeg(ltanH, date = new Date()) {
  return wrap360(sunRaDeg(date) + (ltanH - 12) * 15)
}

/** Orbit-plane unit normal for RAAN/inclination (equatorial frame). */
export function planeNormalU(iDeg, raanDeg) {
  const s = Math.sin(iDeg * RAD_PER_DEG)
  return [s * Math.sin(raanDeg * RAD_PER_DEG), -s * Math.cos(raanDeg * RAD_PER_DEG),
    Math.cos(iDeg * RAD_PER_DEG)]
}

/** Sun angle β [deg]: angle between the sun vector and the orbit plane. */
export function betaAngleDeg({ iDeg, raanDeg, date = new Date() }) {
  const n = planeNormalU(iDeg, raanDeg)
  const s = sunEciUnit(date)
  const dot = Math.abs(n[0] * s[0] + n[1] * s[1] + n[2] * s[2])
  return Math.asin(Math.min(1, dot)) * DEG_PER_RAD
}

/**
 * Full design: altitude (km) + LTAN hours + design date -> SSO elements,
 * drift numbers, sun angle and the illumination classification that ties
 * into the eclipse/power labs.
 */
export function designSunSyncOrbit({ altKm, ltanH = 10.5, date = new Date() }) {
  if (!Number.isFinite(altKm)) throw new TypeError('altKm must be finite')
  const aKm = R_EARTH_EQUATORIAL_KM + altKm
  const iDeg = sunSyncInclinationDeg(aKm)
  if (iDeg === null) {
    return { solvable: false, altKm, aKm,
      reason: 'No inclination satisfies the SSO condition at this altitude (|cos i| > 1 — above the ~12,000 km SSO ceiling).' }
  }
  const raanDeg = nodeRaForLtanDeg(ltanH, date)
  const rates = j2SecularRatesDegDay({ aKm, e: 0.001, iDeg })
  const betaDeg = betaAngleDeg({ iDeg, raanDeg, date })
  const periodMin = periodSec(aKm) / 60
  return {
    solvable: true, altKm, aKm, e: 0.001, iDeg, raanDeg, ltanH,
    periodMin,
    raanDriftDegDay: rates.raanDegDay,
    sunRateDegDay: SUN_MEAN_MOTION_DEGDAY,
    driftMismatchDegDay: Math.abs(rates.raanDegDay - SUN_MEAN_MOTION_DEGDAY),
    betaDeg,
    illumination: betaDeg > 60 ? 'NEAR-CONTINUOUS SUNLIT (dawn/dusk class)'
      : betaDeg < 25 ? 'HIGH-ECLIPSE CLASS (noon/midnight geometry)'
      : 'MODERATE ECLIPSE SEASON',
  }
}

/** Compare a live (watch-satellite) element set against the SSO family. */
export function classifySsoCandidate({ aKm, iDeg, raanDeg }, date = new Date()) {
  const ssoI = sunSyncInclinationDeg(aKm)
  const ltan = ltanOfNodeDeg(raanDeg, date)
  if (ssoI === null) return { sso: false, ltanH: ltan, note: 'altitude above SSO ceiling' }
  const dI = iDeg - ssoI
  // LTAN drift comes from the NODE-RATE mismatch, computed from the same
  // validated j2 rates (deg/day -> hours/day at 15 deg/h): no magic number.
  const rateHere = j2SecularRatesDegDay({ aKm, e: 0.001, iDeg }).raanDegDay
  const rateSso = j2SecularRatesDegDay({ aKm, e: 0.001, iDeg: ssoI }).raanDegDay
  const driftMinPerDay = Math.abs(rateHere - rateSso) / 15 * 60
  return {
    sso: Math.abs(dI) < 0.5,
    inclDeltaDeg: dI,
    ssoInclinationDeg: ssoI,
    ltanH: ltan,
    driftMinPerDay,
    note: Math.abs(dI) < 0.5 ? 'SUN-SYNCHRONOUS (±0.5°)'
      : Math.abs(dI) < 2 ? `NEAR-SSO — LTAN slides ${driftMinPerDay.toFixed(1)} min/day`
      : 'not SSO family',
  }
}
