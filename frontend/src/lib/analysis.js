/**
 * Client-side mission analysis — mirrors backend/analysis.py so the demo
 * works fully offline; the FastAPI endpoints expose identical math.
 */
import * as sm from 'satellite.js'
import { EARTH_RADIUS_KM } from './coords.js'

const D2R = Math.PI / 180

export function footprintOf(altKm) {
  const horizon = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm))
  return {
    horizonDeg: horizon / D2R,
    radiusKm: EARTH_RADIUS_KM * horizon,
    slantKm: Math.sqrt((EARTH_RADIUS_KM + altKm) ** 2 - EARTH_RADIUS_KM ** 2),
  }
}

function ecefUnit(latDeg, lonDeg) {
  const la = latDeg * D2R, lo = lonDeg * D2R
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
}

/** Elevation/azimuth of a (lat, lon, alt) point seen from an observer. */
export function lookAngles(obsLat, obsLon, satLat, satLon, satAlt) {
  const up = ecefUnit(obsLat, obsLon)
  let east = [-up[1], up[0], 0]
  const en = Math.hypot(...east)
  east = east.map((c) => c / en)
  const north = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ]
  const sr = (EARTH_RADIUS_KM + satAlt)
  const rng = ecefUnit(satLat, satLon).map((c) => c * sr)
  const obs = up.map((c) => c * EARTH_RADIUS_KM)
  const d = [rng[0] - obs[0], rng[1] - obs[1], rng[2] - obs[2]]
  const e = d[0] * east[0] + d[1] * east[1] + d[2] * east[2]
  const n = d[0] * north[0] + d[1] * north[1] + d[2] * north[2]
  const u = d[0] * up[0] + d[1] * up[1] + d[2] * up[2]
  const h = Math.hypot(e, n)
  return {
    el: Math.atan2(u, h) / D2R,
    az: ((Math.atan2(e, n) / D2R) + 360) % 360,
  }
}

/** Flyover passes for one satrec over the next `hours` (mirrors backend). */
export function predictPassesClient(rec, obsLat, obsLon, t0Ms, hours = 24,
                                    minElev = 10, stepS = 30) {
  const out = []
  let cur = null
  const steps = Math.floor((hours * 3600) / stepS)
  for (let i = 0; i <= steps; i++) {
    const t = t0Ms + i * stepS * 1000
    const date = new Date(t)
    const pv = sm.propagate(rec, date)
    if (!pv?.position || Number.isNaN(pv.position.x)) continue
    const geo = sm.eciToGeodetic(pv.position, sm.gstime(date))
    const lat = sm.degreesLat(geo.latitude)
    const lon = sm.degreesLong(geo.longitude)
    const { el, az } = lookAngles(obsLat, obsLon, lat, lon, geo.height)
    if (el >= minElev) {
      if (!cur) cur = { aos: t, maxEl: el, maxAz: az, maxT: t, los: t }
      else {
        if (el > cur.maxEl) Object.assign(cur, { maxEl: el, maxAz: az, maxT: t })
        cur.los = t
      }
    } else if (cur) {
      out.push(formatPass(cur))
      cur = null
    }
    if (out.length >= 20) break
  }
  return out
}

const formatPass = (p) => ({
  rise: p.aos, max: p.maxT, set: p.los,
  maxElev: p.maxEl, azMax: p.maxAz,
  durationS: (p.los - p.aos) / 1000,
})

/** Catalog-wide conjunction screening (coarse scan + ternary refine). */
export function scanConjunctionsClient(records, t0Ms, hours = 6,
                                       thresholdKm = 50, coarseMin = 5) {
  const events = []
  const coarseS = coarseMin * 60_000
  const posAt = (rec, t) => {
    const pv = sm.propagate(rec, new Date(t))
    return pv?.position && !Number.isNaN(pv.position.x) ? pv.position : null
  }
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const A = records[i], B = records[j]
      const pa = posAt(A.rec, t0Ms), pb = posAt(B.rec, t0Ms)
      if (!pa || !pb) continue
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) > thresholdKm * 40 + 3000) continue
      const dist = (t) => {
        const a = posAt(A.rec, t), b = posAt(B.rec, t)
        if (!a || !b) return Infinity
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
      }
      let bestD = Infinity, bestT = null
      const steps = Math.max(2, Math.floor((hours * 3600_000) / coarseS))
      for (let k = 0; k <= steps; k++) {
        const t = t0Ms + k * coarseS
        const d = dist(t)
        if (d < bestD) { bestD = d; bestT = t }
      }
      if (bestT == null) continue
      let lo = bestT - coarseS, hi = bestT + coarseS
      for (let k = 0; k < 12; k++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
        if (dist(m1) < dist(m2)) hi = m2; else lo = m1
      }
      const tCa = (lo + hi) / 2
      const dCa = dist(tCa)
      if (dCa < bestD) { bestD = dCa; bestT = tCa }
      events.push({
        a: A.meta.id, aName: A.meta.name,
        b: B.meta.id, bName: B.meta.name,
        tCa: bestT, distanceKm: bestD,
        risk: bestD < thresholdKm && bestD >= 1,
        coOrbital: bestD < 1, // docked modules / duplicate entries — not traffic
      })
    }
  }
  const relevant = events.filter((e) => !e.coOrbital)
  relevant.sort((x, y) => x.distanceKm - y.distanceKm)
  const risks = relevant.filter((e) => e.risk)
  return { events: [...risks, ...relevant.filter((e) => !e.risk).slice(0, 5)],
           thresholdKm, windowHours: hours, at: t0Ms }
}

/** Synthetic space weather when the backend feed is unreachable. */
export function syntheticWeather(nowMs = Date.now()) {
  const phase = (nowMs / 86400000) * 2 * Math.PI
  const base = 2.6 + 1.9 * Math.sin(phase) + 0.7 * Math.sin(phase * 7.3)
  const jitter = (Math.sin(Math.floor(nowMs / 3600000) * 12.9898) * 43758.5453 % 1) * 1.3 - 0.4
  const kp = Math.min(9, Math.max(0, Math.round((base + jitter) * 10) / 10))
  return {
    kp_index: kp,
    flux_107cm: Math.round((140 + kp * 9 + 12 * Math.sin(nowMs / 2.6e9)) * 10) / 10,
    condition: kp < 2 ? 'QUIET' : kp < 4 ? 'UNSETTLED' : kp < 5 ? 'ACTIVE' : kp < 7 ? 'STORM G1-G2' : 'SEVERE STORM G3+',
    storm: kp >= 5,
    density_multiplier: Math.round((1 + 0.16 * Math.max(0, kp - 2) ** 1.75) * 100) / 100,
    source: 'synthetic',
  }
}

export async function fetchWeather() {
  try {
    const c = new AbortController()
    const h = setTimeout(() => c.abort(), 4000)
    const r = await fetch('/api/space-weather', { signal: c.signal })
    clearTimeout(h)
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } catch {
    return syntheticWeather()
  }
}
