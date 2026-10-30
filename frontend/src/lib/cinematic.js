/**
 * OrbitalPulse — cinematic landing math (pure, unit-tested).
 *
 * Everything the scroll-driven experience needs EXCEPT rendering:
 * scene windows, opacity curves, the camera flight path (Catmull-Rom
 * through keyed waypoints), and REAL-DATA builders — orbit rings from
 * TLEs via SGP4, ground-station beam curves, telemetry rows, and the
 * Hohmann transfer visualization. No fabricated numbers anywhere: the
 * telemetry path is the same satellite.js + kepler.js pipeline the
 * tracker uses, and the transfer Δv comes from hohmann.js.
 */
import * as sm from 'satellite.js'
import * as THREE from 'three'
import { eciToSceneKm, geodeticToScene } from './coords.js'
import { stateToElementsKm, periodSec, apoapsisRadiusKm, periapsisRadiusKm, conicRadiusKm } from './kepler.js'
import { hohmannTransferKm } from './hohmann.js'
import { EARTH_RADIUS_KM } from './coords.js'

const SCRATCH = new THREE.Vector3()

export const clamp01 = (v) => Math.min(1, Math.max(0, v))
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/**
 * Five narrative moments on the scroll progress line [0,1]. Windows are
 * contiguous: the experience is one journey, not stacked sections.
 */
export const SCENES = Object.freeze([
  { id: 'enter', from: 0.00, to: 0.16 },
  { id: 'track', from: 0.16, to: 0.38 },
  { id: 'analyze', from: 0.38, to: 0.58 },
  { id: 'design', from: 0.58, to: 0.80 },
  { id: 'reveal', from: 0.80, to: 1.00 },
])

export function sceneById(id) {
  const s = SCENES.find((x) => x.id === id)
  if (!s) throw new RangeError(`unknown scene '${id}'`)
  return s
}

/** Overlay opacity for a scene window with edge fades (0 outside). */
export function windowOpacity(p, win, fade = 0.05) {
  if (p < win.from - fade || p > win.to + fade) return 0
  const rise = smoothstep(win.from - fade, win.from + fade * 0.6, p)
  const fall = 1 - smoothstep(win.to - fade * 0.6, win.to + fade, p)
  return Math.min(rise, fall)
}

/** Local progress INSIDE a window, eased — for per-scene reveals. */
export function windowLocal(p, win) {
  return smoothstep(win.from, win.to, p)
}

/**
 * Camera flight keys: position + look-at in scene units (unit Earth).
 * Choreographed against the reference frames: deep space with scattered
 * craft (0.00) → night-Earth rise with arcs (0.12) → hero-satellite
 * close pass with limb sunrise (0.30) → downlink beams (0.46) → tracking
 * over the day side (0.60) → pull-back to the orbit necklace (0.86) →
 * final deep-space reveal (1.00).
 */
export const CAM_KEYS = Object.freeze([
  { p: 0.00, pos: [0.4, 0.9, 9.2], look: [0.0, 0.15, 3.0] },
  { p: 0.12, pos: [1.6, -1.1, 5.6], look: [0.0, -0.25, 0.6] },
  { p: 0.24, pos: [2.4, -0.2, 3.1], look: [0.35, 0.15, 0.9] },
  { p: 0.34, pos: [1.15, 0.55, 2.05], look: [0.30, 0.22, 1.10] },
  { p: 0.46, pos: [0.55, 0.40, 2.45], look: [0.10, 0.10, 1.00] },
  { p: 0.60, pos: [1.95, 0.95, 1.75], look: [0.30, 0.30, 0.90] },
  { p: 0.74, pos: [3.30, 1.70, 3.60], look: [0.0, 0.15, 0.60] },
  { p: 0.86, pos: [0.60, 1.60, 6.20], look: [0.0, 0.05, 0.30] },
  { p: 1.00, pos: [0.0, 0.70, 8.60], look: [0.0, 0.02, 0.0] },
])

/** Uniform Catmull-Rom through keys parameterized by their p values. */
function crPoint(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return [0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
    + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))
}

export function cameraAt(p) {
  const x = clamp01(p)
  let i = 0
  while (i < CAM_KEYS.length - 2 && x > CAM_KEYS[i + 1].p) i += 1
  const a = CAM_KEYS[i]
  const b = CAM_KEYS[i + 1]
  const k0 = CAM_KEYS[Math.max(0, i - 1)]
  const k3 = CAM_KEYS[Math.min(CAM_KEYS.length - 1, i + 2)]
  const t = (x - a.p) / (b.p - a.p)
  const pos = crPoint(k0.pos, a.pos, b.pos, k3.pos, t)
  const look = crPoint(k0.look, a.look, b.look, k3.look, t)
  return { pos, look }
}

/* ---------------------------------------------------------- real data */

/** One full period of a satrec, sampled in ECI km. */
export function eciOrbitKm(rec, tMs, samples = 96) {
  // satrec.no is rad/min (Kozai mean motion); fall back to 95 min LEO
  const perMin = rec?.no > 0 ? (2 * Math.PI) / rec.no : 95
  const perMs = perMin * 60000
  const out = new Array(samples + 1)
  for (let k = 0; k <= samples; k++) {
    const pv = sm.propagate(rec, new Date(tMs + (k / samples) * perMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    out[k] = pv.position
  }
  return out
}

/** Scene-unit ring points for one satrec at epoch tMs (Earth-fixed frame). */
export function orbitScenePoints(rec, tMs, samples = 96) {
  const eci = eciOrbitKm(rec, tMs, samples)
  if (!eci) return null
  const gmst = sm.gstime(new Date(tMs))
  const pts = new Array(samples + 1)
  for (let k = 0; k <= samples; k++) {
    const s = eciToSceneKm(eci[k].x, eci[k].y, eci[k].z, gmst, SCRATCH)
    pts[k] = [s.x, s.y, s.z]
  }
  return pts
}

/** Live scene position + geodetic telemetry for one satrec. */
export function satStateAt(rec, tMs) {
  const pv = sm.propagate(rec, new Date(tMs))
  if (!pv?.position || Number.isNaN(pv.position.x)) return null
  const gmst = sm.gstime(new Date(tMs))
  const geo = sm.eciToGeodetic(pv.position, gmst)
  const scene = eciToSceneKm(pv.position.x, pv.position.y, pv.position.z, gmst, SCRATCH)
  const el = stateToElementsKm({ posKm: { ...pv.position }, velKmS: { ...pv.velocity } })
  const speed = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
  return {
    scene: [scene.x, scene.y, scene.z],
    rKm: Math.hypot(pv.position.x, pv.position.y, pv.position.z),
    latDeg: sm.degreesLat(geo.latitude),
    lonDeg: sm.degreesLong(geo.longitude),
    altKm: geo.height,
    speedKmS: speed,
    elements: el,
    periodMin: periodSec(el.aKm) / 60,
    apogeeAltKm: apoapsisRadiusKm(el.aKm, el.e) - EARTH_RADIUS_KM,
    perigeeAltKm: periapsisRadiusKm(el.aKm, el.e) - EARTH_RADIUS_KM,
  }
}

/** Restrained monospace telemetry rows — every value computed above. */
export function telemetryRows(meta, st) {
  const f = (v, d) => Number.isFinite(v) ? v.toFixed(d) : '—'
  return [
    { label: 'NAME', value: meta.name },
    { label: 'NORAD', value: String(meta.norad_id) },
    { label: 'ALT', value: `${f(st.altKm, 1)} km` },
    { label: 'VEL', value: `${f(st.speedKmS, 3)} km/s` },
    { label: 'LAT', value: `${f(st.latDeg, 2)}°` },
    { label: 'LON', value: `${f(st.lonDeg, 2)}°` },
    { label: 'INC', value: `${f(st.elements.iDeg, 2)}°` },
    { label: 'PERIOD', value: `${f(st.periodMin, 1)} min` },
  ]
}

/** Engineering rows for scene 03 (orbital elements, not decoration). */
export function elementRows(st) {
  const f = (v, d) => Number.isFinite(v) ? v.toFixed(d) : '—'
  return [
    { label: 'APOGEE', value: `${f(st.apogeeAltKm, 1)} km` },
    { label: 'PERIGEE', value: `${f(st.perigeeAltKm, 1)} km` },
    { label: 'SEMIMAJOR', value: `${f(st.elements.aKm, 1)} km` },
    { label: 'ECC', value: f(st.elements.e, 5) },
    { label: 'INCL', value: `${f(st.elements.iDeg, 3)}°` },
    { label: 'RAAN', value: `${f(st.elements.raanDeg, 2)}°` },
    { label: 'ARG PER', value: `${f(st.elements.argPerigeeDeg, 2)}°` },
    { label: 'TRUE ANOM', value: `${f(st.elements.trueAnomalyDeg, 2)}°` },
  ]
}

/* ------------------------------------------------------- beams (S2/S3) */

/** Great-circle-ish arc from a station to the satellite, scene units. */
export function beamCurve(station, satScenePos, bump = 0.22, samples = 24) {
  const a = geodeticToScene(station.latDeg ?? station.lat, station.lonDeg ?? station.lon, 0, SCRATCH)
  const av = [a.x, a.y, a.z]
  const len = Math.hypot(...av)
  const dir = av.map((c) => c / len)
  const out = []
  for (let k = 0; k <= samples; k++) {
    const u = k / samples
    // linear chord lifted radially by a sine bump — reads as an uplink arc
    const lift = 1 + bump * Math.sin(Math.PI * u)
    out.push([
      (dir[0] * (1 - u) + satScenePos[0] * u) * lift,
      (dir[1] * (1 - u) + satScenePos[1] * u) * lift + 0.04 * Math.sin(Math.PI * u),
      (dir[2] * (1 - u) + satScenePos[2] * u) * lift,
    ])
  }
  return out
}

/** Stations within line-of-sight-ish range of the sub-satellite point. */
export function visibleStations(stations, st, maxCenterAngleDeg = 55) {
  const lat1 = (st.latDeg * Math.PI) / 180
  const lon1 = (st.lonDeg * Math.PI) / 180
  return stations.filter((s) => {
    const lat2 = ((s.latDeg ?? s.lat) * Math.PI) / 180
    const lon2 = ((s.lonDeg ?? s.lon) * Math.PI) / 180
    const c = Math.sin(lat1) * Math.sin(lat2)
      + Math.cos(lat1) * Math.cos(lat2) * Math.cos(Math.abs(lon2 - lon1))
    return Math.acos(Math.min(1, Math.max(-1, c))) * 180 / Math.PI <= maxCenterAngleDeg
  })
}

/* ------------------------------------------------- transfer (scene 04) */

/**
 * Hohmann demo from the selected satellite's current circular-equivalent
 * radius to a higher shell. Δv values come from hohmann.js (validated M3);
 * the transfer ellipse is sampled from the conic in the orbit plane.
 */
export function transferViz({ altFromKm, altToKm, incDeg = 51.6, samples = 64 }) {
  const r1 = EARTH_RADIUS_KM + altFromKm
  const r2 = EARTH_RADIUS_KM + altToKm
  const h = hohmannTransferKm(r1, r2)
  const aT = h.transferSemiMajorAxisKm
  const eT = h.transferEccentricity
  const el = { aKm: aT, e: eT, iDeg: incDeg, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
  const pts = []
  for (let k = 0; k <= samples; k++) {
    const nu = (k / samples) * 180 // half ellipse: perigee -> apogee
    const r = conicRadiusKm(aT, eT, nu)
    const nuR = (nu * Math.PI) / 180
    const iR = (incDeg * Math.PI) / 180
    // perifocal -> ECI (raan=argp=0)
    const x = r * Math.cos(nuR)
    const y = r * Math.sin(nuR) * Math.cos(iR)
    const z = r * Math.sin(nuR) * Math.sin(iR)
    const gmst = 0
    const s = eciToSceneKm(x, y, z, gmst, SCRATCH)
    pts.push([s.x, s.y, s.z])
  }
  return {
    pts,
    dv1Mps: h.dv1Mps, dv2Mps: h.dv2Mps, totalDvMps: h.totalDvMps,
    coastSec: h.coastSec, r1Km: r1, r2Km: r2,
  }
}

/* -------------------------------------------------------- perf tiers */

export function qualityTier(env) {
  const mobile = !!env.mobile
  const reduced = !!env.reducedMotion
  return {
    dpr: mobile ? [1, 1.5] : [1, 2],
    earthSeg: mobile ? 64 : 128,
    orbitSamples: mobile ? 64 : 96,
    maxSats: mobile ? 7 : 14,
    beams: !mobile,
    clouds: true,
    stars: mobile ? 1500 : 3500,
    cameraDamping: reduced ? 14 : 2.4,
  }
}

/** WebGL support probe for the graceful fallback path. */
export function supportsWebGL(gl) {
  try {
    const c = gl || (typeof document !== 'undefined' && document.createElement('canvas'))
    if (!c || !c.getContext) return false
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}
