import * as THREE from 'three'
import * as sm from 'satellite.js'
import { sunEquatorialRad, subsolarLonDeg } from './sun.js'

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

/**
 * ECI km (TEME, as returned by satellite.js sgp4) -> scene units through
 * the EXACT inverse the tracker uses every tick — sm.eciToGeodetic (WGS84
 * geodetic latitude + height above ellipsoid), then geodeticToScene.
 * V3 found and fixed a real bug here: the previous hand-rolled asin(z/r)
 * was GEocentric latitude, which disagreed with the tracker's GEodetic
 * placement by up to ~0.2° (~0.003 scene units) at mid latitudes. Both
 * render paths now agree to <1e-9 (tests/coordinates.test.js).
 */
export function eciToSceneKm(x, y, z, gmstRad, target = new THREE.Vector3()) {
  const geo = sm.eciToGeodetic({ x, y, z }, gmstRad)
  return geodeticToScene(sm.degreesLat(geo.latitude), sm.degreesLong(geo.longitude),
    geo.height, target)
}

export const REGIME_COLORS = {
  LEO: '#38D9FF',
  MEO: '#3B82F6',
  GEO: '#818CF8',
}

/**
 * Low-precision apparent sun direction (Meeus — formulas extracted verbatim
 * to lib/sun.js, output byte-identical, pinned by reference vectors) as a
 * unit vector in the same scene frame as geodeticToScene — used for eclipse
 * tests and lighting.
 */
export function sunDirection(date = new Date(), target = new THREE.Vector3()) {
  const { dec } = sunEquatorialRad(date)
  return geodeticToScene(dec / DEG, subsolarLonDeg(date), 0, target).normalize()
}

export const REGIME_LABELS = {
  LEO: 'Low Earth Orbit',
  MEO: 'Medium Earth Orbit',
  GEO: 'Geostationary Orbit',
}
