/**
 * OrbitalPulse — plane change service (M5).
 *
 * Pure inclination change at speed v (both velocity vectors same magnitude,
 * angle di apart):  dV = 2 v sin(di/2).
 * Combined circularize+plane-change burn at apogee (law of cosines on the
 * velocity triangle): dV = sqrt(vt^2 + vc^2 - 2 vt vc cos(di)).
 *
 * Applicability (documented, not hidden): the pure formula assumes the burn
 * happens exactly on the node line, |v| unchanged, impulsive, two-body.
 * Combined-burn savings exist because the transfer apogee speed is LOWER
 * than the target circular speed - plane changes belong where v is small,
 * which is why missions pay at high altitude or combine with circularization.
 */
import { circularVelocityKmS } from './kepler.js'
import { hohmannTransferKm } from './hohmann.js'
import { R_EARTH_MEAN_KM } from './constants.js'

export function planeChangeDvMps(vKmS, deltaIDeg) {
  return 2 * vKmS * Math.abs(Math.sin((deltaIDeg * Math.PI / 180) / 2)) * 1000
}

/** Pure plane change cost for a circular orbit at given altitude. */
export function planeChangeAtAltMps(altKm, deltaIDeg) {
  return planeChangeDvMps(circularVelocityKmS(R_EARTH_MEAN_KM + altKm), deltaIDeg)
}

/**
 * Combined transfer-to-circular-with-plane-change burn at apogee.
 * r1/r2 are endpoint radii, di the inclination difference at apogee.
 */
export function combinedPlaneChangeKm(r1Km, r2Km, deltaIDeg) {
  const t = hohmannTransferKm(r1Km, r2Km)
  const di = Math.abs(deltaIDeg) * Math.PI / 180
  const va = t.vTransferApogeeKmS
  const vc = t.vTargetCircularKmS
  const dvCombined = Math.sqrt(va * va + vc * vc - 2 * va * vc * Math.cos(di))
  const dvSeparate = planeChangeDvMps(va, deltaIDeg) / 1000 + Math.abs(vc - va)
  return {
    dvCombinedMps: dvCombined * 1000,
    dvSeparateMps: dvSeparate * 1000,
    savingMps: (dvSeparate - dvCombined) * 1000,
    vApogeeKmS: va,
    vTargetKmS: vc,
    transfer: t,
  }
}

/** Altitude cost ladder for the UI: same Δi at different circular orbits. */
export function planeChangeAltLadder(deltaIDeg, altsKm) {
  return altsKm.map((altKm) => ({
    altKm,
    vCircKmS: circularVelocityKmS(R_EARTH_MEAN_KM + altKm),
    dvMps: planeChangeAtAltMps(altKm, deltaIDeg),
  }))
}
