import * as sm from 'satellite.js'
import * as THREE from 'three'
import catalog from '../data/satellites.json'
import { geodeticToScene, sunDirection } from './coords.js'
import { fetchWeather, scanConjunctionsClient, predictPassesClient, syntheticWeather } from './analysis.js'

const SUN_TMP = new THREE.Vector3()

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
    // Live mode pins the simulation clock to wall-clock UTC; any manual
    // control (pause, step, scrub) drops out of live automatically.
    this.isLive = true
    this.zoom = 1
    this.yaw = 0.8
    this.pitch = 0.25
    this.selectedId = 'norad-25544'
    this._listeners = new Set()
    this._orbitCaches = {}
    this._gtCaches = {}
    // Gentle focus easing target (set by focusOn, cleared by user drag).
    this.focusTarget = null
    // Toggleable 3D layers (footprint cone, conjunction alerts, decay vectors).
    this.layers = { footprint: true, groundtrack: true, alerts: true, drag: false }
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
    if (this.isLive) {
      this.simMs = now
    } else if (!this.paused) {
      this.simMs += (now - this._lastReal) * this.warp
    }
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
        sunlit: this.sunlitAt(lat, lon, geo.height, date),
      })
    }
    return out.filter(Boolean)
  }

  /**
   * Cylindrical Earth-shadow model in scene units (Earth radius = 1):
   * a satellite on the anti-sun side whose perpendicular distance from the
   * sun axis is under one Earth radius is in eclipse.
   */
  sunlitAt(lat, lon, altKm, date) {
    const p = geodeticToScene(lat, lon, altKm, new THREE.Vector3())
    const s = sunDirection(date, SUN_TMP)
    const along = p.dot(s)
    if (along >= 0) return true
    const perp2 = p.lengthSq() - along * along
    return perp2 > 1.0
  }

  /** Antimeridian-safe ground track: { past, future } scene-unit segments. */
  groundTrackSegments(id) {
    const entry = this.records.find((r) => r.meta.id === id)
    if (!entry) return { past: [], future: [] }
    const cache = this._gtCaches[id]
    if (cache && Math.abs(cache.t - this.simMs) < 60_000) return cache.out
    const t0 = this.simMs - 45 * 60_000
    const spanMs = (45 + 90) * 60_000
    const steps = 270 // 30-second resolution
    const raw = [] // [ [x,y,z], timeMin ]
    let prev = null
    let cur = []
    for (let i = 0; i <= steps; i += 1) {
      const date = new Date(t0 + (i / steps) * spanMs)
      const pv = sm.propagate(entry.rec, date)
      if (!pv || !pv.position || Number.isNaN(pv.position.x)) continue
      const geo = sm.eciToGeodetic(pv.position, sm.gstime(date))
      const lat = sm.degreesLat(geo.latitude)
      const lon = sm.degreesLong(geo.longitude)
      if (prev !== null && Math.abs(lon - prev) > 180) { raw.push(cur); cur = [] }
      const v = geodeticToScene(lat, lon, 0, new THREE.Vector3()).multiplyScalar(1.006)
      cur.push([[v.x, v.y, v.z], (i / steps) * 135 - 45])
      prev = lon
    }
    if (cur.length) raw.push(cur)
    const past = []
    const future = []
    for (const seg of raw) {
      const p = seg.filter(([, m]) => m <= 0).map(([v]) => v)
      const f = seg.filter(([, m]) => m >= 0).map(([v]) => v)
      if (p.length > 1) past.push(p)
      if (f.length > 1) future.push(f)
    }
    this._gtCaches[id] = { t: this.simMs, out: { past, future } }
    return this._gtCaches[id].out
  }

  /**
   * Trajectory polyline from SGP4: 45 minutes of past track plus one full
   * period ahead of the simulation clock (M5). Points are propagated, not
   * fitted to a conic.
   */
  orbitPoints(id, steps = 120) {
    const entry = this.records.find((r) => r.meta.id === id)
    if (!entry) return []
    const t0 = this.simMs - 45 * 60_000
    const periodMs = entry.meta.period_min * 60_000
    const spanMs = periodMs + 45 * 60_000
    const pts = []
    for (let i = 0; i <= steps; i += 1) {
      const date = new Date(t0 + (i / steps) * spanMs)
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
  setWarp(w) { this.warp = w; this.isLive = false; this.paused = false; this._lastReal = Date.now(); this.emit() }
  togglePause() { this.paused = !this.paused; this.isLive = false; this._lastReal = Date.now(); this.emit() }
  setLive() { this.isLive = true; this.paused = false; this.warp = 1; this.emit() }
  /** Jump the simulation clock by +/- `minutes` (drops out of live). */
  stepBy(minutes) {
    this.isLive = false
    this.paused = true
    this.simMs += minutes * 60_000
    this._orbitCaches = {}
    this._gtCaches = {}
    this.emit()
  }
  /** Timeline scrubber entry point: absolute time in epoch ms. */
  setSimTime(ms) {
    this.isLive = false
    this.simMs = ms
    this._lastReal = Date.now()
    this._orbitCaches = {}
    this._gtCaches = {}
    this.emit()
  }
  setZoom(z) { this.zoom = Math.min(2.6, Math.max(0.55, z)); this.emit() }
  rotateBy(dyaw, dpitch) {
    this.focusTarget = null // user control cancels the focus ease
    this.yaw += dyaw
    this.pitch = Math.min(1.35, Math.max(-1.35, this.pitch + dpitch))
  }

  /**
   * Ease the globe so the selected satellite faces the mission camera.
   * Never teleports: GlobeGroup damps yaw/pitch toward this target per frame.
   */
  focusOn(id = this.selectedId) {
    const s = (this.snapshot ?? []).find((x) => x.id === id)
    if (!s) return
    const lonRad = (s.lon * Math.PI) / 180
    const latRad = (s.lat * Math.PI) / 180
    // Camera azimuth in mission mode is ~0.7 rad + slow drift; globe yaw
    // contributes to both terms, hence the 0.75 divisor.
    let yaw = (0.7 - lonRad) / 0.75
    yaw = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw)) + this.yaw
    this.focusTarget = { yaw, pitch: Math.max(-1.2, Math.min(1.2, 0.3 - latRad * 0.85)) }
    this.emit()
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
