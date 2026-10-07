/**
 * OrbitalPulse — multi-station pass scheduling layer (M7).
 *
 * No new orbital physics here: propagation + look angles come from the
 * validated reference pipeline (analysis.predictPassesClient, which mirrors
 * backend/analysis.py predict_passes step-for-step), and station data from
 * the M6 domain. This module only merges, sorts, and shapes results for the
 * schedule UI, and samples elevation curves on demand.
 *
 * Resolution trade (disclosed, not hidden): the scheduler walks the sky on a
 * stepS grid, so AOS/LOS times carry up to ±stepS of discretization error
 * (peak elevation is refined only to the same grid). The UI shows the grid
 * instead of pretending sub-second truth. Backend caps passes at 20 per
 * station per window; the client mirror does the same and reports `capped`.
 */
import * as sm from 'satellite.js'
import { lookAngles, predictPassesClient } from './analysis.js'

export const PASS_CAP = 20

/**
 * Predict passes of one satrec over every station, merge into one schedule
 * sorted by rise time. Pure except for satellite.js propagation.
 */
export function predictSchedule(rec, stations, t0Ms, hours = 12, stepS = 30) {
  const perStation = []
  for (const st of stations) {
    const passes = predictPassesClient(rec, st.latDeg, st.lonDeg, t0Ms, hours,
      st.minElevDeg, stepS)
    perStation.push({
      station: st,
      capped: passes.length >= PASS_CAP,
      passes: passes.map((p) => ({ ...p, stationId: st.id, stationName: st.name })),
    })
  }
  const all = perStation.flatMap((x) => x.passes)
  all.sort((a, b) => a.rise - b.rise || a.stationId.localeCompare(b.stationId))
  const anyCapped = perStation.some((x) => x.capped)
  return { t0Ms, hours, stepS, perStation, schedule: all, capped: anyCapped }
}

/** Elevation/azimuth samples for the curve around a pass (or a window). */
export function elevationCurve(rec, station, fromMs, toMs, stepS = 20) {
  const samples = []
  let peak = null
  for (let t = fromMs; t <= toMs; t += stepS * 1000) {
    const date = new Date(t)
    const pv = sm.propagate(rec, date)
    if (!pv?.position || Number.isNaN(pv.position.x)) continue
    const geo = sm.eciToGeodetic(pv.position, sm.gstime(date))
    const lat = sm.degreesLat(geo.latitude)
    const lon = sm.degreesLong(geo.longitude)
    const { el, az } = lookAngles(station.latDeg, station.lonDeg, lat, lon, geo.height)
    const s = { tMs: t, elevDeg: el, azDeg: az }
    samples.push(s)
    if (!peak || el > peak.elevDeg) peak = s
  }
  return { samples, peak, station, stepS }
}

/** UTC clock label for schedule rows (minutes resolution is the contract). */
export function utcHm(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** Countdown/addage label relative to the simulation clock. */
export function passAgeLabel(passMs, nowMs) {
  const dt = passMs - nowMs
  const abs = Math.abs(dt)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const s = Math.floor((abs % 60000) / 1000)
  const txt = h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m${String(s).padStart(2, '0')}s`
  return dt >= 0 ? `T-${txt}` : `T+${txt}`
}
