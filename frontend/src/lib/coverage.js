/**
 * OrbitalPulse — one-orbit coverage analysis (M9).
 *
 * Layers strictly on validated services: kepler.js two-body propagation
 * (elements -> ECI), los.js footprint cap gamma(e), stations.js look angles.
 * This is the ANALYTICAL MODEL track (no J2, no SGP4 — the live tracker
 * pipeline remains the truth source for real passes; the UI labels both).
 *
 * Honest numerics (disclosed):
 *  - Ground samples are uniform in TIME over one period; visibility
 *    fractions count samples above mask (grid resolution = step, no
 *    sub-step refinement claimed).
 *  - Area coverage uses a cos(lat)-weighted equal lat/lon grid with
 *    dot-product cap tests; weighting fixes the pole overweight of naive
 *    cell counts, and the residual discretization error is O(step^2) —
 *    the analytic cap area is always reported alongside for comparison.
 */
import * as sm from 'satellite.js'
import { RAD_PER_DEG, DEG_PER_RAD, R_EARTH_MEAN_KM } from './constants.js'
import { elementsToStateKm, periodSec, meanToTrueAnomalyRad, eccentricFromTrueAnomalyRad } from './kepler.js'
import { lookAngleKm } from './stations.js'
import { footprintRadiusDeg } from './los.js'

function unitFromLatLon(latDeg, lonDeg) {
  const la = latDeg * RAD_PER_DEG, lo = lonDeg * RAD_PER_DEG
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
}

/** Great-circle angular distance, degrees. */
export function greatCircleDeg(a, b) {
  const dot = unitFromLatLon(a.latDeg, a.lonDeg)
    .reduce((s, c, i) => s + c * unitFromLatLon(b.latDeg, b.lonDeg)[i], 0)
  return Math.acos(Math.min(1, Math.max(-1, dot))) * DEG_PER_RAD
}

/** Exact spherical fraction of the Earth's surface inside a cap of radius gamma. */
export function capAreaFractionDeg(gammaDeg) {
  return (1 - Math.cos(gammaDeg * RAD_PER_DEG)) / 2
}

/**
 * Sub-satellite track over one (or `spanSec`) analytic orbit, sampled
 * uniformly in time. Longitude uses sm.gstime(t) so Earth rotation is the
 * real sidereal model, while position is two-body.
 */
export function orbitGroundSamples(el, { t0Ms, samples = 120, spanSec = periodSec(el.aKm) }) {
  const T = periodSec(el.aKm)
  const n = 2 * Math.PI / T
  const M0 = eccentricFromTrueAnomalyRad(el.trueAnomalyDeg * RAD_PER_DEG, el.e)
  const out = []
  for (let k = 0; k <= samples; k++) {
    const tSec = (k / samples) * spanSec
    const nu = meanToTrueAnomalyRad(M0 + n * tSec, el.e)
    const { posKm } = elementsToStateKm({ ...el, trueAnomalyDeg: nu * DEG_PER_RAD })
    const r = Math.hypot(posKm.x, posKm.y, posKm.z)
    const gmst = sm.gstime(new Date(t0Ms + tSec * 1000))
    const lonDeg = ((Math.atan2(posKm.y, posKm.x) - gmst) * DEG_PER_RAD % 360 + 540) % 360 - 180
    out.push({
      tMs: t0Ms + tSec * 1000,
      latDeg: Math.asin(posKm.z / r) * DEG_PER_RAD,
      lonDeg,
      altKm: r - R_EARTH_MEAN_KM,
    })
  }
  return out
}

/**
 * Station visibility over the sample set: fraction of orbit time above mask,
 * max elevation, and pass runs (>= 2 samples, M7 parity — a single grid hit
 * is not enough to call a pass).
 */
export function visibilityFromSamples(samples, station) {
  let above = 0, maxElev = -Infinity, runs = 0, runStart = null, runLen = 0
  const passes = []
  samples.forEach((s, i) => {
    const l = lookAngleKm(station, s)
    if (l.elevDeg > maxElev) maxElev = l.elevDeg
    if (l.elevDeg >= station.minElevDeg) {
      above += 1
      if (runStart === null) { runStart = s.tMs; runLen = 1 } else runLen += 1
    } else if (runStart !== null) {
      if (runLen >= 2) { runs += 1; passes.push({ startMs: runStart, endMs: samples[i - 1].tMs }) }
      runStart = null; runLen = 0
    }
  })
  if (runStart !== null && runLen >= 2) { runs += 1; passes.push({ startMs: runStart, endMs: samples[samples.length - 1].tMs }) }
  return { fraction: above / samples.length, maxElevDeg: maxElev, passes, passCount: runs }
}

/**
 * cos(lat)-weighted grid coverage of the ground track's footprints
 * (mask = maskDeg). Returns cumulative fraction + first-cover time per cell
 * so the UI can scrub coverage growth over the orbit.
 */
export function gridCoverage(samples, { stepDeg = 10, maskDeg = 0 } = {}) {
  const cells = []
  let wsum = 0
  for (let lat = -90 + stepDeg / 2; lat < 90; lat += stepDeg) {
    const w = Math.cos(lat * RAD_PER_DEG)
    for (let lon = -180 + stepDeg / 2; lon < 180; lon += stepDeg) {
      cells.push({ latDeg: lat, lonDeg: lon, w, u: unitFromLatLon(lat, lon), tMs: null })
      wsum += w
    }
  }
  // cap tests via dot >= cos(gamma) — one acos per sample, none per cell
  for (const s of samples) {
    const g = footprintRadiusDeg(s.altKm, maskDeg)
    if (!(g > 0)) continue
    const cosG = Math.cos(g * RAD_PER_DEG)
    const su = unitFromLatLon(s.latDeg, s.lonDeg)
    for (const c of cells) {
      if (c.tMs !== null) continue
      if (su.reduce((acc, v, i) => acc + v * c.u[i], 0) >= cosG) c.tMs = s.tMs
    }
  }
  let cw = 0
  for (const c of cells) if (c.tMs !== null) cw += c.w
  return { fraction: cw / wsum, cells, stepDeg, maskDeg }
}

/** Fraction of cells covered by time tMs (for the scrubber display). */
export function coveredFractionAt(coverage, tMs) {
  let cw = 0, wsum = 0
  for (const c of coverage.cells) {
    wsum += c.w
    if (c.tMs !== null && c.tMs <= tMs) cw += c.w
  }
  return wsum > 0 ? cw / wsum : 0
}
