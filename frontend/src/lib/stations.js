/**
 * OrbitalPulse — ground station domain (M6).
 *
 * Separate state domain from the engine/constellations: stations are static
 * infrastructure, not propagated objects. This module is pure (no THREE, no
 * React, no localStorage import) so the geometry and validation are testable
 * in node and reusable by M7 (pass prediction), M8 (LOS) and M10 (link
 * budget, which needs the slant range computed here).
 *
 * Elevation geometry (documented simplification): spherical Earth at the
 * mean radius. Station and satellite positions are built as radial vectors
 * (same contract the scene uses via geodeticToScene), then
 *   d = K - S,  cos(zenith) = (S · d) / (|S| |d|),  elev = 90 - zenith.
 * Satellite.js returns WGS84 geodetic coordinates, so topocentric elevation
 * from a spherical model carries the classic geodetic-vs-parametric tilt
 * (max ~0.2° near mid-latitudes for a LEO horizon) — labeled in the UI as
 * SPHERICAL EARTH, not silently ignored.
 */
import { R_EARTH_MEAN_KM, RAD_PER_DEG, DEG_PER_RAD, clamp } from './constants.js'

/** Publicly documented anchor stations (coordinates published by their
 *  operators; elevations are approximate site elevations, labeled as such). */
export const DEFAULT_STATIONS = [
  { id: 'goldstone', name: 'Goldstone DSS-14', latDeg: 35.4267, lonDeg: -116.8975, elevKm: 1.076, minElevDeg: 10, source: 'NASA DSN (published coords, elev approx.)' },
  { id: 'madrid', name: 'Madrid DSS', latDeg: 40.4314, lonDeg: -4.2520, elevKm: 0.83, minElevDeg: 10, source: 'NASA DSN (published coords, elev approx.)' },
  { id: 'canberra', name: 'Canberra DSS-43', latDeg: -35.4014, lonDeg: 148.9815, elevKm: 0.575, minElevDeg: 10, source: 'NASA DSN (published coords, elev approx.)' },
  { id: 'malargue', name: 'Malargüe', latDeg: -35.7859, lonDeg: -69.2986, elevKm: 1.0, minElevDeg: 10, source: 'ESA Estrack (published coords, elev approx.)' },
  { id: 'svalbard', name: 'Svalbard SG-1', latDeg: 78.2299, lonDeg: 15.3846, elevKm: 0.455, minElevDeg: 5, source: 'KSAT (published coords, elev approx.)' },
]

export const STORAGE_KEY = 'orbitalpulse.ground-stations.v1'

/** Range/shape validation — invalid input never becomes a station. */
export function validateStation(raw) {
  const errors = []
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['station must be an object'], value: null }
  if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push('name required')
  if (!num(raw.latDeg) || raw.latDeg < -90 || raw.latDeg > 90) errors.push('latDeg must be within [-90, 90]')
  if (!num(raw.lonDeg) || raw.lonDeg < -180 || raw.lonDeg > 180) errors.push('lonDeg must be within [-180, 180]')
  if (!num(raw.elevKm) || raw.elevKm < -0.5 || raw.elevKm > 5) errors.push('elevKm must be within [-0.5, 5] km')
  if (!num(raw.minElevDeg) || raw.minElevDeg < 0 || raw.minElevDeg > 90) errors.push('minElevDeg must be within [0, 90]')
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null
  if (!id) errors.push('id required')
  return { ok: errors.length === 0, errors, value: errors.length ? null : {
    id, name: raw.name.trim(), latDeg: raw.latDeg, lonDeg: raw.lonDeg,
    elevKm: raw.elevKm, minElevDeg: raw.minElevDeg, source: raw.source ?? 'user-defined',
  } }
}

/** Storage-agnostic persistence (pass any {getItem,setItem,removeItem}). */
export function loadStations(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY))
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_STATIONS.map((s) => ({ ...s }))
    const clean = parsed.map(validateStation).filter((r) => r.ok).map((r) => r.value)
    return clean.length ? clean : DEFAULT_STATIONS.map((s) => ({ ...s }))
  } catch {
    return DEFAULT_STATIONS.map((s) => ({ ...s }))
  }
}

export function saveStations(stations, storage) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(stations)) } catch { /* non-fatal */ }
}

function radialVecKm(latDeg, lonDeg, radiusKm, out) {
  const la = latDeg * RAD_PER_DEG, lo = lonDeg * RAD_PER_DEG
  out[0] = radiusKm * Math.cos(la) * Math.cos(lo)
  out[1] = radiusKm * Math.cos(la) * Math.sin(lo)
  out[2] = radiusKm * Math.sin(la)
  return out
}

/**
 * Topocentric elevation + slant range of a satellite given in geodetic
 * (lat/lon) + altitude km, observed from a station on the mean sphere.
 * Returns elevDeg in [-90, 90], slantRangeKm, and the min-elevation verdict
 * that M7/M8 will consume.
 */
export function lookAngleKm(station, satGeoKm) {
  const S = radialVecKm(station.latDeg, station.lonDeg, R_EARTH_MEAN_KM + station.elevKm, [0, 0, 0])
  const K = radialVecKm(satGeoKm.latDeg, satGeoKm.lonDeg, R_EARTH_MEAN_KM + satGeoKm.altKm, [0, 0, 0])
  const d = [K[0] - S[0], K[1] - S[1], K[2] - S[2]]
  const dMag = Math.hypot(...d)
  if (dMag < 1e-9) return { elevDeg: 90, slantRangeKm: 0, aboveMinElev: true }
  const sMag = Math.hypot(...S)
  const cosZenith = clamp((S[0] * d[0] + S[1] * d[1] + S[2] * d[2]) / (sMag * dMag), -1, 1)
  const elevDeg = 90 - Math.acos(cosZenith) * DEG_PER_RAD
  return { elevDeg, slantRangeKm: dMag, aboveMinElev: elevDeg >= station.minElevDeg }
}

/**
 * Geocentric half-angle at which the line of sight grazes the spherical
 * horizon (elev = 0): cos(gamma) = (R + h_station) / (R + h_sat), valid for
 * h_sat >= h_station. Used as an analytical anchor in tests and by M8.
 */
export function horizonHalfAngleDeg(station, satAltKm) {
  const rs = R_EARTH_MEAN_KM + station.elevKm
  const rk = R_EARTH_MEAN_KM + satAltKm
  if (rk < rs) return null
  return Math.acos(clamp(rs / rk, -1, 1)) * DEG_PER_RAD
}
