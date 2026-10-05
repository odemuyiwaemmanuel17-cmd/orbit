import * as THREE from 'three'

export const EARTH_RADIUS_KM = 6371.0
const DEG = Math.PI / 180

/**
 * Radial compression so LEO, MEO and GEO shells stay visually compact:
 * altitude (km) -> scene radius around a unit Earth.
 */
export function altToRadius(altKm) {
  return 1 + 0.26 * Math.log10(1 + Math.max(altKm, 0) / 90)
}

export function geodeticToScene(latDeg, lonDeg, altKm, target = new THREE.Vector3()) {
  const r = altToRadius(altKm)
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  return target.set(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(lon),
  )
}

export const REGIME_COLORS = {
  LEO: '#4ade80',
  MEO: '#2dd4bf',
  GEO: '#a3e635',
}

/**
 * Low-precision apparent sun direction (Meeus) as a unit vector in the same
 * scene frame as geodeticToScene — used for eclipse tests and lighting.
 */
export function sunDirection(date = new Date(), target = new THREE.Vector3()) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0
  const L = (280.46 + 0.9856474 * n) * DEG
  const g = (357.528 + 0.98560028 * n) * DEG
  const lambda = L + 1.915 * Math.sin(g) * DEG + 0.02 * Math.sin(2 * g) * DEG
  const eps = (23.439 - 0.0000004 * n) * DEG
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const gmstDeg = ((280.46061837 + 360.98564736629 * n) % 360 + 360) % 360
  const subsolarLon = (ra / DEG - gmstDeg + 540) % 360 - 180
  return geodeticToScene(dec / DEG, subsolarLon, 0, target).normalize()
}

export const REGIME_LABELS = {
  LEO: 'Low Earth Orbit',
  MEO: 'Medium Earth Orbit',
  GEO: 'Geostationary Orbit',
}
