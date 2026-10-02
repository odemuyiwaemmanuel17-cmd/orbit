import { useRef } from 'react'
import { Radio } from 'lucide-react'
import CatalogPanel from '../tracker/CatalogPanel.jsx'
import TelemetryPanel from '../tracker/TelemetryPanel.jsx'
import TimeControls from '../tracker/TimeControls.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { catalogSatellites } from '../../lib/engine.js'
import { REGIME_LABELS } from '../../lib/coords.js'

/** Toggleable 3D overlays — kept as compact checkboxes inside the viewport. */
function LayerToggles() {
  const engine = useEngine()
  const layers = [
    ['footprint', 'FOOTPRINT', '#4ade80'],
    ['alerts', 'ALERTS', '#ef4444'],
    ['drag', 'DECAY', '#f59e0b'],
  ]
  return (
    <div className="flex flex-col gap-1 bg-black/60 backdrop-blur border border-emerald-400/25 rounded-lg px-2.5 py-2">
      {layers.map(([key, label, color]) => (
        <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={engine.layers[key]}
                 onChange={() => engine.toggleLayer(key)}
                 className="w-3 h-3 accent-emerald-500" />
          <span className="text-[9px] font-mono tracking-wider"
                style={{ color: engine.layers[key] ? color : '#1d5c3c' }}>
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}

/**
 * The scrollytelling centerpiece: catalog + live 3D viewport + telemetry HUD.
 * The viewport itself is transparent — the fixed WebGL scene shows through —
 * and a pointer-catcher over it forwards drag rotation to the engine.
 */
export default function TrackerSection() {
  const engine = useEngine()
  const drag = useRef(null)

  const selected = catalogSatellites.find((s) => s.id === engine.selectedId)
  const clock = engine.date().toISOString().slice(11, 19)

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
    <section id="tracker" className="relative py-24 px-5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div className="max-w-2xl">
            <div className="text-[11px] font-mono tracking-[0.3em] text-emerald-400 mb-2">
              MISSION CONTROL
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-emerald-50 tracking-tight">
              Live Orbital Tracker
            </h2>
            <p className="mt-3 text-sm md:text-[15px] text-emerald-100/60 leading-relaxed">
              Select a spacecraft from the catalog, drag the globe to explore, and
              watch live telemetry stream into the HUD. Positions are propagated in
              your browser.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/30 bg-emerald-400/5">
            <Radio size={13} className="text-emerald-400" />
            <span className="text-[11px] font-mono text-emerald-300">
              Demo catalog · live CelesTrak elements
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)_320px] gap-4 h-[600px]">
          <CatalogPanel />

          {/* Transparent viewport frame — the fixed scene renders behind it */}
          <div className="relative rounded-xl border border-emerald-400/15 bg-transparent overflow-hidden">
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-emerald-400/30 text-[10px] font-mono text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
                LIVE PROPAGATION
              </span>
              <span className="px-2.5 py-1 rounded-full bg-black/60 border border-emerald-400/20 text-[10px] font-mono text-emerald-200 tabular-nums">
                {clock} UTC
              </span>
            </div>
            {selected && (
              <div className="absolute top-3 right-3 pointer-events-none bg-black/70 border border-emerald-400/30 rounded-lg px-3 py-2 text-right">
                <div className="text-xs font-bold text-emerald-50">{selected.name}</div>
                <div className="text-[10px] font-mono text-emerald-500 mt-0.5">
                  NORAD {selected.norad_id} · {REGIME_LABELS[selected.regime]}
                </div>
              </div>
            )}
            <div className="absolute left-3 bottom-16 pointer-events-auto">
              <LayerToggles />
            </div>
            <div className="absolute bottom-3 inset-x-0 flex flex-col items-center gap-1.5 pointer-events-none">
              <div className="pointer-events-auto"><TimeControls /></div>
              <div className="text-[10px] font-mono text-emerald-700">
                Drag to rotate · use +/− to zoom · click a target in the catalog to track
              </div>
            </div>
          </div>

          <TelemetryPanel />
        </div>
      </div>
    </section>
  )
}
