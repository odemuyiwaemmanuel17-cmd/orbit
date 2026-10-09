import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, List, Gauge, Orbit, FlaskConical } from 'lucide-react'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import CatalogPanel from '../../components/tracker/CatalogPanel.jsx'
import TelemetryPanel from '../../components/tracker/TelemetryPanel.jsx'
import SimulationControls from '../../components/tracker/SimulationControls.jsx'
import LayerToggles from '../../components/tracker/LayerToggles.jsx'
import { useEngine } from '../../hooks/useEngine.js'

/**
 * Mission Control — the engineering surface behind the approved landing UI.
 * Desktop: catalog left, telemetry dock right, Earth dominant in the middle.
 * Mobile: Earth full-bleed with bottom sheets and a floating control dock.
 */
export default function TrackerPage() {
  const engine = useEngine()
  const [sheet, setSheet] = useState(null) // mobile: 'catalog' | 'hud'
  const drag = useRef(null)

  const clock = engine.date().toISOString().slice(11, 19)
  const nowMs = Date.now()
  const offsetMin = engine.isLive
    ? 0
    : Math.max(-720, Math.min(720, Math.round((engine.simMs - nowMs) / 60000)))

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006,
                    (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => { drag.current = null }

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission />

      {/* Drag layer for globe rotation (below panels, above canvas) */}
      <div
        className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <Diagnostics />

      {/* ---------------- top bar ---------------- */}
      <header className="absolute top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#0A1425]/85 backdrop-blur-md border-b border-hi/15">
        <Link to="/" className="flex items-center gap-2 text-hi hover:text-fg text-[12px] font-mono">
          <ArrowLeft size={14} /> SITE
        </Link>
        <div className="w-px h-6 bg-hi/15" />
        <Link to="/lab" className="hidden md:flex items-center gap-1.5 text-cyan-400 hover:text-cyan-200 text-[12px] font-mono">
          <FlaskConical size={14} /> LABS
        </Link>
        <div className="hidden md:block w-px h-6 bg-hi/15" />
        <div className="flex items-center gap-2">
          <Orbit size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-mut align-middle">
              MISSION CONTROL
            </span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono border live-dot
            ${engine.isLive ? 'border-hi/50 text-hi'
                            : 'border-amber-400/50 text-amber-300'}`}>
            {engine.isLive ? '● LIVE' : `⏱ WARP ${engine.warp}×`}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-black/40 border border-hi/20 text-[11px] font-mono text-fg tabular-nums">
            {clock} UTC
          </span>
        </div>
      </header>

      {/* ---------------- desktop layout ---------------- */}
      <div className="hidden lg:block absolute top-16 bottom-24 left-4 w-[300px] z-20 pointer-events-auto">
        <CatalogPanel />
      </div>
      <div className="hidden lg:block absolute top-16 bottom-24 right-4 w-[330px] z-20 pointer-events-auto">
        <TelemetryPanel />
      </div>
      <div className="hidden lg:block absolute left-4 top-1/2 z-20">
        <LayerToggles />
      </div>

      {/* timeline + controls dock (desktop) */}
      <div className="hidden lg:flex absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex-col items-center gap-2 w-[min(860px,92vw)]">
        <TimelineScrubber value={offsetMin}
                          onChange={(v) => engine.setSimTime(nowMs + v * 60000)}
                          disabled={engine.isLive} />
        <SimulationControls />
      </div>

      {/* ---------------- mobile layout ---------------- */}
      <div className="lg:hidden absolute bottom-0 inset-x-0 z-40 flex flex-col items-center gap-2 pb-3 px-3">
        {/* bottom sheet */}
        {sheet && (
          <div className="w-full max-h-[58vh] overflow-hidden glass rounded-t-2xl flex">
            <div className="flex-1 min-h-0 max-h-[56vh] overflow-y-auto thin-scroll p-1">
              {sheet === 'catalog' ? <CatalogPanel /> : <TelemetryPanel />}
            </div>
          </div>
        )}
        <SimulationControls />
        <div className="flex gap-2">
          <button onClick={() => setSheet(sheet === 'catalog' ? null : 'catalog')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-mono border backdrop-blur
                    ${sheet === 'catalog' ? 'bg-pri text-bg border-hi'
                                          : 'bg-black/60 border-hi/30 text-hi'}`}>
            <List size={13} /> CATALOG
          </button>
          <button onClick={() => setSheet(sheet === 'hud' ? null : 'hud')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-mono border backdrop-blur
                    ${sheet === 'hud' ? 'bg-pri text-bg border-hi'
                                      : 'bg-black/60 border-hi/30 text-hi'}`}>
            <Gauge size={13} /> TELEMETRY
          </button>
        </div>
      </div>
    </div>
  )
}

/** ±12 h scrubber around real now; disabled while LIVE pins the clock. */
function TimelineScrubber({ value, onChange, disabled }) {
  return (
    <div className={`w-full flex items-center gap-3 bg-black/60 backdrop-blur border border-hi/25 rounded-full px-4 py-2 ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-[9px] font-mono text-mut shrink-0">-12h</span>
      <input
        type="range" min={-720} max={720} step={1} value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-pri"
        aria-label="Simulation timeline offset in minutes"
      />
      <span className="text-[9px] font-mono text-mut shrink-0">+12h</span>
      <span className="text-[10px] font-mono text-hi tabular-nums w-16 text-right shrink-0">
        {value === 0 ? 'NOW±' : `${value > 0 ? '+' : ''}${value}m`}
      </span>
    </div>
  )
}

/** Developer diagnostics — visible only with ?debug in the URL. */
function Diagnostics() {
  const engine = useEngine()
  const [fps, setFps] = useState(0)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return undefined
    let frames = 0, last = performance.now(), raf
    const loop = () => {
      frames += 1
      const now = performance.now()
      if (now - last >= 1000) { setFps(Math.round((frames * 1000) / (now - last))); frames = 0; last = now }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  if (!new URLSearchParams(window.location.search).has('debug')) return null
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 font-mono text-[10px] text-hi bg-black/75 border border-hi/25 rounded-md px-3 py-1.5 flex gap-4 pointer-events-none">
      <span>FPS {fps}</span>
      <span>SATS {engine.snapshot?.length ?? 0}</span>
      <span>CONST {engine.activeConstellationGroups().reduce((a, g) => a + g.n, 0)}</span>
      <span>SLICE {Math.round(engine.activeConstellationGroups().reduce((a, g) => a + g.lastSliceMs, 0))} ms</span>
      <span>PROP 10 Hz</span>
      <span>WARP {engine.warp}×</span>
      <span>SEL {engine.selectedId}</span>
      <span>SIM {engine.date().toISOString().slice(11, 23)}</span>
    </div>
  )
}
