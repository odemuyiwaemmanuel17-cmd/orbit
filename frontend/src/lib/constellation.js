import * as sm from 'satellite.js'

/**
 * Constellation layer on top of the ISS pipeline: the SAME TLE -> twoline2satrec
 * -> SGP4 -> eciToGeodetic -> scene path, only batched. One ConstellationGroup
 * holds typed arrays for n satellites and refreshes unselected members in
 * time-sliced batches so the 10 Hz tick never pays for a full sweep.
 *
 * This module is deliberately free of THREE/React: the caller injects a
 * `project(lat, lon, altKm) -> [x, y, z]` function, which also makes the
 * scheduler testable under plain node (see frontend/tools).
 */

/** TLE epoch -> approximate 2-check period in minutes (from mean motion). */
export function periodFromTle(line2) {
  const motion = parseFloat(line2.slice(52, 63))
  return motion > 0 ? 1440 / motion : 100
}

/**
 * True when the TLE epoch has drifted further from `date` than half the
 * satellite's check period — SGP4 results are then unreliable and should not
 * be shown as live truth.
 */
export function tleStale(line1, line2, date) {
  const yy = parseInt(line1.slice(18, 20), 10)
  const doy = parseFloat(line1.slice(20, 32))
  if (!Number.isFinite(doy)) return true
  const year = yy < 57 ? 2000 + yy : 1900 + yy
  const ms = Date.UTC(year, 0, 1) + (doy - 1) * 86_400_000
  const halfPeriodMs = periodFromTle(line2) * 60_000 * 0.5
  return Math.abs(date.getTime() - ms) > halfPeriodMs
}

export class ConstellationGroup {
  /**
   * @param {{key, label, satellites: Array<{id, norad_id, name, line1, line2,
   *          regime, inclination_deg, period_min, sma_km, altitude_km,
   *          raan_deg, eccentricity, slot, description}>}} meta
   * @param {(lat:number, lon:number, altKm:number) => number[]} project
   *        scene-space projector (engine passes the THREE-backed one)
   * @param {{divisor?: number, minBatch?: number, maxBatch?: number}} budget
   *        divisor: ticks per full unselected refresh cycle (≈9 -> ~1 Hz @10Hz)
   */
  constructor(meta, project, budget = {}) {
    this.key = meta.key
    this.label = meta.label
    this.meta = meta.satellites
    this.project = project
    this.n = meta.satellites.length
    this.divisor = Math.max(1, budget.divisor ?? 9)
    this.minBatch = budget.minBatch ?? 16
    this.maxBatch = budget.maxBatch ?? 400

    // Reuse the featured-catalog record shape so every existing consumer
    // (orbitPoints, passes, conjunctions, telemetry) works unchanged.
    this.records = this.meta.map((sat) => ({
      meta: sat,
      rec: sm.twoline2satrec(sat.line1, sat.line2),
    }))

    this.lat = new Float64Array(this.n)
    this.lon = new Float64Array(this.n)
    this.alt = new Float64Array(this.n)
    this.px = new Float32Array(this.n)
    this.py = new Float32Array(this.n)
    this.pz = new Float32Array(this.n)
    this.initialized = new Uint8Array(this.n)
    /** Sim-clock ms of each satellite's last successful propagation — lets
     *  consumers (and the perf gate) prove slice coverage exactly. */
    this.lastUpdate = new Float64Array(this.n)
    this.lastSliceMs = 0
    this._phase = 0
  }

  /** Batch size for one tick: spread the sweep over `divisor` ticks,
   *  clamped so huge groups never produce an oversized single slice. */
  sliceSize() {
    const ideal = Math.max(1, Math.ceil(this.n / this.divisor))
    return Math.min(this.n, Math.max(this.minBatch, Math.min(this.maxBatch, ideal)))
  }

  /** True when `index` is the promoted (selected) satellite: the engine
   *  updates it at full rate through the high-accuracy path instead. */
  _isPromoted(index) {
    return this.promotedIndex >= 0 && this.promotedIndex === index
  }

  setPromoted(idOrNull) {
    if (this._promotedId === idOrNull) return
    this._promotedId = idOrNull
    this.promotedIndex = idOrNull
      ? this.meta.findIndex((m) => m.id === idOrNull)
      : -1
  }

  _propagateOne(i, date) {
    const { rec } = this.records[i]
    const pv = sm.propagate(rec, date)
    if (!pv || !pv.position || Number.isNaN(pv.position.x)) return false
    const geo = sm.eciToGeodetic(pv.position, sm.gstime(date))
    const lat = sm.degreesLat(geo.latitude)
    const lon = sm.degreesLong(geo.longitude)
    this.lat[i] = lat
    this.lon[i] = lon
    this.alt[i] = geo.height
    const p = this.project(lat, lon, geo.height)
    this.px[i] = p[0]
    this.py[i] = p[1]
    this.pz[i] = p[2]
    this.initialized[i] = 1
    this.lastUpdate[i] = date.getTime()
    return true
  }

  /**
   * Propagate the next contiguous round-robin window of unselected satellites.
   * Window size ~ n/divisor, so every member is refreshed once per `divisor`
   * ticks (~1 Hz per satellite at the 10 Hz heartbeat). Call once per tick
   * while the group is visible.
   */
  tickSlice(date) {
    if (!this.n) return
    const t0 = Date.now()
    const size = this.sliceSize()
    const promoted = this.promotedIndex
    for (let k = 0; k < size; k += 1) {
      const i = (this._phase + k) % this.n
      if (i === promoted) continue // covered at full rate by the engine
      this._propagateOne(i, date)
    }
    this._phase = (this._phase + size) % this.n
    this.lastSliceMs = Date.now() - t0
  }

  /** Full sweep — used on activation so the field never renders at origin. */
  propagateAll(date) {
    for (let i = 0; i < this.n; i += 1) this._propagateOne(i, date)
  }

  entryFor(id) {
    const i = this.meta.findIndex((m) => m.id === id)
    return i < 0 ? null : this.records[i]
  }
}
