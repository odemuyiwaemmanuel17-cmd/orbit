import * as sm from 'satellite.js'
import * as THREE from 'three'
import catalog from '../data/satellites.json'
import { geodeticToScene } from './coords.js'
import { fetchWeather, scanConjunctionsClient, predictPassesClient, syntheticWeather } from './analysis.js'

/**
 * In-browser SGP4 tracker engine. Propagates the curated demo catalog with
 * satellite.js — the scene runs at 60 fps, DOM telemetry samples at 10 Hz,
 * and the simulated clock supports pause + time-warp up to 300x.
 */
class TrackerEngine {
  constructor() {
    this.records = catalog.satellites.map((meta) => ({
      meta,
      rec: sm.twoline2satrec(meta.line1, meta.line2),
    }))
    this.simMs = Date.now()
    this._lastReal = Date.now()
    this.warp = 1
    this.paused = false
    this.zoom = 1
    this.yaw = 0.8
    this.pitch = 0.25
    this.selectedId = 'norad-25544'
    this._listeners = new Set()
    this._orbitCaches = {}
    // Toggleable 3D layers (footprint cone, conjunction alerts, decay vectors).
    this.layers = { footprint: true, alerts: true, drag: false }
    this.weather = syntheticWeather()
    this.conjunctions = null
    this.passes = null // { id, observer, list }
    this.tick = this.tick.bind(this)
    setInterval(this.tick, 100) // 10 Hz telemetry heartbeat
    fetchWeather().then((w) => { this.weather = w; this.emit() })
  }

  // -- clock ---------------------------------------------------------------
  tick() {
    const now = Date.now()
    if (!this.paused) this.simMs += (now - this._lastReal) * this.warp
    this._lastReal = now
    this.snapshot = this.propagateAll()
    this.emit()
  }

  advanceToRealTime() {
    const now = Date.now()
    this.simMs = now
    this._lastReal = now
  }

  date() { return new Date(this.simMs) }

  // -- propagation -----------------------------------------------------------
  propagateAll(date = this.date()) {
    const out = []
    const later = new Date(date.getTime() + 20_000)
    for (const { meta, rec } of this.records) {
      const pv = sm.propagate(rec, date)
      if (!pv || !pv.position || Number.isNaN(pv.position.x)) { out.push(null); continue }
      const { position, velocity } = pv
      const gmst = sm.gstime(date)
      const geo = sm.eciToGeodetic(position, gmst)
      const lat = sm.degreesLat(geo.latitude)
      const lon = sm.degreesLong(geo.longitude)
      // Finite-difference scene-space heading for the decay/drag vectors.
      let velScene = null
      const pv2 = sm.propagate(rec, later)
      if (pv2?.position && !Number.isNaN(pv2.position.x)) {
        const g2 = sm.eciToGeodetic(pv2.position, sm.gstime(later))
        const p1 = geodeticToScene(lat, lon, geo.height, new THREE.Vector3())
        const p2 = geodeticToScene(sm.degreesLat(g2.latitude), sm.degreesLong(g2.longitude), g2.height, new THREE.Vector3())
        velScene = p2.sub(p1).normalize()
      }
      out.push({
        id: meta.id,
        meta,
        lat, lon,
        alt: geo.height,
        speed: Math.hypot(velocity.x, velocity.y, velocity.z),
        pos: position,
        velScene,
      })
    }
    return out.filter(Boolean)
  }

  /** One full orbital period of trajectory points, in scene coordinates. */
  orbitPoints(id, steps = 96) {
    const entry = this.records.find((r) => r.meta.id === id)
    if (!entry) return []
    const t0 = this.simMs
    const periodMs = entry.meta.period_min * 60_000
    const pts = []
    for (let i = 0; i <= steps; i += 1) {
      const date = new Date(t0 + (i / steps) * periodMs)
      const pv = sm.propagate(entry.rec, date)
      if (!pv || !pv.position || Number.isNaN(pv.position.x)) continue
      const geo = sm.eciToGeodetic(pv.position, sm.gstime(date))
      const v = geodeticToScene(
        sm.degreesLat(geo.latitude),
        sm.degreesLong(geo.longitude),
        geo.height,
      )
      pts.push([v.x, v.y, v.z])
    }
    return pts
  }

  // -- controls ------------------------------------------------------------
  setWarp(w) { this.warp = w; this.emit() }
  togglePause() { this.paused = !this.paused; this._lastReal = Date.now(); this.emit() }
  setZoom(z) { this.zoom = Math.min(2.6, Math.max(0.55, z)); this.emit() }
  rotateBy(dyaw, dpitch) {
    this.yaw += dyaw
    this.pitch = Math.min(1.35, Math.max(-1.35, this.pitch + dpitch))
  }
  resetView() { this.zoom = 1; this.yaw = 0.8; this.pitch = 0.25; this.emit() }
  select(id) {
    if (id === this.selectedId) return
    this.selectedId = id
    this.emit()
  }

  toggleLayer(name) {
    this.layers[name] = !this.layers[name]
    this.emit()
  }

  /** Run the close-approach screening for the next `hours` (async chunked). */
  async runConjunctionScan(hours = 6, thresholdKm = 50) {
    this.scanning = true
    this.emit()
    // Yield first so the UI can show the scanning state.
    await new Promise((r) => setTimeout(r, 0))
    this.conjunctions = scanConjunctionsClient(this.records, this.simMs,
                                               hours, thresholdKm)
    this.scanning = false
    this.emit()
    return this.conjunctions
  }

  /** Flyover schedule for a satellite over an observer, computed locally. */
  async computePasses(id, lat, lon, hours = 24, minElev = 10) {
    this.passesBusy = true
    this.emit()
    await new Promise((r) => setTimeout(r, 0))
    const entry = this.records.find((r) => r.meta.id === id)
    const list = entry ? predictPassesClient(entry.rec, lat, lon, this.simMs,
                                             hours, minElev) : []
    this.passes = { id, observer: { lat, lon }, list, minElev, hours,
                    generatedAt: this.simMs }
    this.passesBusy = false
    this.emit()
    return this.passes
  }

  async refreshWeather() {
    this.weather = await fetchWeather()
    this.emit()
  }

  /** Trajectory cache per satellite; rebuilt when the sample window drifts. */
  orbitPointsCached(id) {
    const entry = this.records.find((r) => r.meta.id === id)
    if (!entry) return []
    const cache = this._orbitCaches[id]
    const periodMs = entry.meta.period_min * 60_000
    if (!cache || Math.abs(cache.t - this.simMs) > periodMs * 0.25) {
      this._orbitCaches[id] = { t: this.simMs, pts: this.orbitPoints(id) }
    }
    return this._orbitCaches[id].pts
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn) }
  emit() { this._listeners.forEach((fn) => fn(this)) }
}

export const engine = new TrackerEngine()
export const catalogSatellites = catalog.satellites
export const catalogGeneratedAt = catalog.generated_at
