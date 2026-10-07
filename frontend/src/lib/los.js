/**
 * OrbitalPulse — line-of-sight geometry (M8).
 *
 * Builds only on validated services: M6 lookAngleKm (topocentric elevation)
 * and the M6 horizon identity. No new propagation, no new Earth model.
 *
 * Core closed form (spherical Earth): the ground cap from which a satellite
 * at radius rk is seen at elevation >= e, centered on the sub-satellite
 * point, has angular radius
 *     gamma(e) = acos( (Rs/rk) * cos e ) - e        [Rs = surface radius]
 * Derivation: tan(elev) = (rk cos g - Rs)/(rk sin g)  =>  cos(g + e) =
 * (Rs/rk) cos e. At e = 0 this IS the M6 horizon identity (locked by test).
 */
import { R_EARTH_MEAN_KM, RAD_PER_DEG, DEG_PER_RAD, clamp } from './constants.js'
import { lookAngleKm } from './stations.js'

/** Angular radius (deg) of the >= maskDeg visibility footprint for a sat at altKm. */
export function footprintRadiusDeg(altKm, maskDeg = 0) {
  const ratio = R_EARTH_MEAN_KM / (R_EARTH_MEAN_KM + altKm)
  const cosArg = clamp(ratio * Math.cos(maskDeg * RAD_PER_DEG), -1, 1)
  return Math.acos(cosArg) * DEG_PER_RAD - maskDeg
}

/**
 * Three-state link verdict for a station looking at a geodetic satellite:
 *  LINK    elev >= station mask      (operational candidate — M7 pass state)
 *  LOS     0 <= elev < mask          (geometrically visible, below mask)
 *  BLOCKED elev < 0                  (Earth between station and satellite)
 */
export function losState(station, satGeoKm) {
  const look = lookAngleKm(station, satGeoKm)
  const state = look.elevDeg >= station.minElevDeg ? 'LINK'
    : look.elevDeg >= 0 ? 'LOS' : 'BLOCKED'
  return { ...look, state, inFootprint: look.elevDeg >= 0 }
}

/**
 * Footprint boundary polygon: constant angular-radius circle around the
 * sub-satellite point (spherical trig), returned as [lat, lon] degree pairs.
 * samples evenly spaced; the ring closes (last === first).
 */
export function footprintPolygonDeg(subLatDeg, subLonDeg, radiusDeg, samples = 96) {
  if (!(radiusDeg > 0)) return []
  const φ0 = subLatDeg * RAD_PER_DEG, λ0 = subLonDeg * RAD_PER_DEG
  const γ = radiusDeg * RAD_PER_DEG
  const pts = []
  for (let k = 0; k <= samples; k++) {
    const θ = (k / samples) * 2 * Math.PI
    const sinφ = Math.sin(φ0) * Math.cos(γ) + Math.cos(φ0) * Math.sin(γ) * Math.cos(θ)
    const φ = Math.asin(clamp(sinφ, -1, 1))
    const λ = λ0 + Math.atan2(
      Math.sin(θ) * Math.sin(γ) * Math.cos(φ0),
      Math.cos(γ) - Math.sin(φ0) * sinφ,
    )
    pts.push([φ * DEG_PER_RAD, ((λ * DEG_PER_RAD + 540) % 360) - 180])
  }
  return pts
}
