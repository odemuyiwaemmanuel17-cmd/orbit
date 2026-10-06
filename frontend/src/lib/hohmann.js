/**
 * OrbitalPulse — Hohmann transfer service (M3).
 *
 * Two-impulse coplanar transfer between circular orbits, solved analytically
 * on the validated kepler.js/vis-viva primitives. Pure module.
 *
 * Physics (Vallado §8.6): transfer ellipse a_t = (r1 + r2)/2, burn 1 at
 * perigee (prograde for outward), burn 2 at apogee. Direction of the burns
 * is handled by sign convention: OUTWARD dv1>0/dv2>0 (raise & circularize),
 * INWARD both negative (retrograde pair). The 180° plane geometry is exact
 * because apsis lines are shared.
 *
 * Fidelity: ANALYTICAL — impulsive, two-body, coplanar circular endpoints.
 * Real GEO insertion splits dv2 across a plane-change; not modeled here.
 */
import { MU_EARTH_KM3S2 as MU, R_EARTH_MEAN_KM } from './constants.js'
import { periodSec, circularVelocityKmS, velocityKmS } from './kepler.js'

/**
 * @param rInitKm   initial circular orbit radius from Earth CENTER (km)
 * @param rTargetKm target circular orbit radius (km)
 * Altitudes (km above mean radius) can be passed via altToR = alt + Re.
 * Throws on degenerate geometry (below surface, equal radii handled as dv=0).
 */
export function hohmannTransferKm(rInitKm, rTargetKm) {
  if (!(rInitKm > R_EARTH_MEAN_KM) || !(rTargetKm > R_EARTH_MEAN_KM)) {
    throw new Error('orbit radius must be above the surface')
  }
  const outward = rTargetKm > rInitKm
  const rPeri = outward ? rInitKm : rTargetKm
  const rApo = outward ? rTargetKm : rInitKm
  const aT = (rPeri + rApo) / 2
  const eT = (rApo - rPeri) / (rApo + rPeri)
  const vCirc1 = circularVelocityKmS(rInitKm)
  const vCirc2 = circularVelocityKmS(rTargetKm)
  // Transfer apsis speeds via vis-viva on the transfer ellipse:
  const vPeri = velocityKmS(aT, eT, rPeri)
  const vApo = velocityKmS(aT, eT, rApo)
  // Signed deltas at the actual initial/target radii:
  const dv1KmS = outward ? vPeri - vCirc1 : vApo - vCirc1
  const dv2KmS = outward ? vCirc2 - vApo : vCirc2 - vPeri
  return {
    outward,
    transferSemiMajorAxisKm: aT,
    transferEccentricity: eT,
    dv1Mps: dv1KmS * 1000,
    dv2Mps: dv2KmS * 1000,
    totalDvMps: Math.abs(dv1KmS) * 1000 + Math.abs(dv2KmS) * 1000,
    coastSec: periodSec(aT) / 2, // half of the transfer ellipse
    transferPeriodSec: periodSec(aT),
    meanMotionRadS: Math.sqrt(MU / aT ** 3),
    vInitCircularKmS: vCirc1,
    vTargetCircularKmS: vCirc2,
    vTransferPerigeeKmS: vPeri,
    vTransferApogeeKmS: vApo,
    rInitKm, rTargetKm,
  }
}

/** Convenience: altitudes above mean Earth radius. */
export function hohmannTransferAltKm(altInitKm, altTargetKm) {
  return hohmannTransferKm(altInitKm + R_EARTH_MEAN_KM, altTargetKm + R_EARTH_MEAN_KM)
}

/**
 * Classical elements of the transfer ellipse for rendering, given the
 * mission plane (i/RAAN) with perigee at RAAN (argPerigee 0) and the burn-1
 * longitude aligned to the initial orbit phase. Outward: perigee at r1.
 */
export function transferElements(result, plane = { iDeg: 51.6, raanDeg: 0 }) {
  return {
    aKm: result.transferSemiMajorAxisKm,
    e: result.transferEccentricity,
    iDeg: plane.iDeg,
    raanDeg: plane.raanDeg,
    argPerigeeDeg: result.outward ? 0 : 180, // perigee sits at the LOWER radius
    trueAnomalyDeg: 0,
  }
}

/** Circular orbit elements for the endpoint rings. */
export function circularElements(rKm, plane = { iDeg: 51.6, raanDeg: 0 }) {
  return { aKm: rKm, e: 0, iDeg: plane.iDeg, raanDeg: plane.raanDeg,
           argPerigeeDeg: 0, trueAnomalyDeg: 0 }
}

/**
 * Fraction of coast time elapsed for a transfer-ellipse true anomaly band,
 * used by the animation: nu in [0, pi] maps to t in [0, coastSec].
 */
export function coastFractionSec(result, nuDeg) {
  const nu = ((nuDeg % 360) + 360) % 360
  const nuRad = nu > 180 ? (360 - nu) * Math.PI / 180 : nu * Math.PI / 180
  // E from nu, then M, then t = M/n; mirrored for the display return half.
  const e = result.transferEccentricity
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nuRad / 2))
  const M = E - e * Math.sin(E)
  return M / result.meanMotionRadS
}
