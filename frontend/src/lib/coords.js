import * as THREE from 'three'
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

export const REGIME_COLORS = {
  LEO: '#4ade80',
  MEO: '#2dd4bf',
  GEO: '#a3e635',
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
