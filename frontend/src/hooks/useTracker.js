import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCatalog, fetchOrbit, fetchPositions } from '../lib/api.js'
import offlineSnapshot from '../lib/offline-snapshot.json'

const POLL_MS = 1500
const ORBIT_REFRESH_SIM_S = 120

/**
 * Central tracker state: catalog, simulated clock (time-warp), polled
 * positions, selection, orbit polyline, toasts. Degrades gracefully to the
 * bundled offline snapshot when the backend is unreachable (AC-4).
 */
export function useTracker() {
  const [catalog, setCatalog] = useState(null)
  const [source, setSource] = useState('boot')
  const [positionsById, setPositionsById] = useState({})
  const [simTime, setSimTime] = useState(() => new Date())
  const [selectedId, setSelectedIdRaw] = useState(null)
  const [warp, setWarp] = useState(1)
  const [fps, setFps] = useState(0)
  const [toasts, setToasts] = useState([])
  const [orbitData, setOrbitData] = useState(null)
  const [showOrbit, setShowOrbit] = useState(true)
  const [focusMode, setFocusMode] = useState(false)

  const simRef = useRef({ simMs: Date.now(), lastRealMs: Date.now(), warp: 1 })
  const backendDown = useRef(false)

  const pushToast = useCallback((text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-3), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  // -- catalog bootstrap -----------------------------------------------------
  useEffect(() => {
    let alive = true
    fetchCatalog()
      .then((data) => {
        if (!alive) return
        setCatalog(data)
        setSource(data.source)
        pushToast(`TLE catalog loaded (${data.satellites.length} objects, ${data.source})`, 'ok')
      })
      .catch(() => {
        if (!alive) return
        backendDown.current = true
        setCatalog(offlineSnapshot.catalog)
        setSource('offline')
        setPositionsById(offlineSnapshot.positions)
        pushToast('Backend unreachable — serving bundled snapshot', 'warn')
      })
    return () => { alive = false }
  }, [pushToast])

  // -- time-warp simulated clock ---------------------------------------------
  useEffect(() => { simRef.current.warp = warp }, [warp])

  // -- position polling --------------------------------------------------------
  // Polls even after a failed bootstrap so the link self-heals when the
  // backend comes back; failures just hold the last-known positions.
  useEffect(() => {
    if (!catalog) return undefined
    const tick = () => {
      const nowReal = Date.now()
      const s = simRef.current
      s.simMs += (nowReal - s.lastRealMs) * s.warp
      s.lastRealMs = nowReal
      const iso = new Date(s.simMs).toISOString()
      setSimTime(new Date(s.simMs))
      fetchPositions(iso)
        .then((data) => {
          const map = {}
          for (const p of data.positions) map[p.id] = p
          setPositionsById(map)
          if (backendDown.current) {
            backendDown.current = false
            pushToast('Telemetry link restored', 'ok')
          }
        })
        .catch(() => {
          if (!backendDown.current) {
            backendDown.current = true
            pushToast('Telemetry link lost — holding last positions', 'warn')
          }
        })
    }
    tick()
    const h = setInterval(tick, POLL_MS)
    return () => clearInterval(h)
  }, [catalog, pushToast])

  // -- FPS counter (rAF based) -------------------------------------------------
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf
    const loop = () => {
      frames += 1
      const now = performance.now()
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // -- selection + orbit polyline ----------------------------------------------
  const setSelectedId = useCallback((id) => {
    setSelectedIdRaw(id)
    setOrbitData(null)
    const sat = catalog?.satellites.find((s) => s.id === id)
    if (sat) pushToast(`Target locked: ${sat.name}`, 'target')
  }, [catalog, pushToast])

  useEffect(() => {
    if (!selectedId) { setOrbitData(null); return undefined }
    let alive = true
    let simElapsedMs = 0
    const load = () => {
      fetchOrbit(selectedId, 90, 180, new Date(simRef.current.simMs).toISOString())
        .then((d) => alive && setOrbitData(d))
        .catch(() => {})
    }
    load()
    // Re-fetch when simulated elapsed time crosses the refresh window.
    const h = setInterval(() => {
      simElapsedMs += (POLL_MS * simRef.current.warp)
      if (simElapsedMs >= ORBIT_REFRESH_SIM_S * 1000) {
        simElapsedMs = 0
        load()
      }
    }, POLL_MS)
    return () => { alive = false; clearInterval(h) }
  }, [selectedId])

  // -- derived views -------------------------------------------------------------
  const selected = useMemo(() => {
    const entry = catalog?.satellites.find((s) => s.id === selectedId)
    return entry ? { ...entry, state: positionsById[entry.id] ?? null } : null
  }, [catalog, selectedId, positionsById])

  const satellites = useMemo(() => {
    if (!catalog) return []
    return catalog.satellites.map((s) => ({ ...s, state: positionsById[s.id] ?? null }))
  }, [catalog, positionsById])

  return {
    catalog,
    satellites,
    source,
    simTime,
    selected,
    selectedId,
    setSelectedId,
    warp,
    setWarp,
    fps,
    toasts,
    pushToast,
    orbitData,
    showOrbit,
    setShowOrbit,
    focusMode,
    setFocusMode,
    loading: catalog === null,
  }
}
