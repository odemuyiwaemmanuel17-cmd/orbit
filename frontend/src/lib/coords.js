import * as THREE from 'three'

export const EARTH_RADIUS_KM = 6371.0
/** Scene units: Earth radius == 1. */
export const kmToScene = (km) => km / EARTH_RADIUS_KM

const DEG = Math.PI / 180

/** Convert geodetic lat/lon (deg) + altitude (km) to a scene-space position. */
export function geodeticToScene(latDeg, lonDeg, altKm, target = new THREE.Vector3()) {
  const r = 1 + kmToScene(altKm)
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  return target.set(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.cos(lat) * Math.sin(lon),
    r * Math.sin(lat),
  )
}

/** Scale an ECI [x,y,z] km vector into scene space. */
export function eciToScene(x, y, z, target = new THREE.Vector3()) {
  return target.set(kmToScene(x), kmToScene(y), kmToScene(z))
}

/**
 * Low-precision apparent sun position (Meeus, good to ~0.25 deg / 15 min of
 * time) expressed as a scene-space light direction, so the day/night
 * terminator on the globe roughly tracks real UTC time.
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
  // Greenwich hour angle of the sun -> subsolar longitude.
  const gmstDeg = ((280.46061837 + 360.98564736629 * n) % 360 + 360) % 360
  const subsolarLon = (ra / DEG - gmstDeg + 540) % 360 - 180
  return geodeticToScene(dec / DEG, subsolarLon, 149597870 - EARTH_RADIUS_KM, target)
}

export const GROUP_COLORS = {
  stations: '#facc15', // amber
  science: '#a78bfa', // violet
  navigation: '#34d399', // emerald
  starlink: '#22d3ee', // cyan
}

export const GROUP_LABELS = {
  stations: 'Space Stations',
  science: 'Science',
  navigation: 'Navigation',
  starlink: 'Starlink',
}
