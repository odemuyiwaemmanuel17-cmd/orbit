import { useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Rocket, RotateCcw, Zap } from 'lucide-react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import LabOrbit, { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { catalogSatellites } from '../../lib/engine.js'
import { stateToElementsKm } from '../../lib/kepler.js'
import { BURN_DIRECTIONS, applyBurnKm, burnDirectionEciKm, maneuverDeltas } from '../../lib/maneuver.js'

const ORIG = '#94a3b8'
const PRED = '#22d3ee'
const BURN = '#f59e0b'

/** Scene overlay: original (live SGP4-derived) orbit, predicted analytic
 *  orbit, and the burn vector at the spacecraft state. */
function ManeuverOverlay({ liveState, working, preview, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  const liveEl = useMemo(() => stateToElementsKm(liveState), [liveState])
  const shown = preview ?? working
  const arrow = useMemo(() => {
    if (!preview) return null
    const d = burnDirectionEciKm(preview.baseKm.posKm, preview.baseKm.velKmS, preview.dirKey)
    const p0 = eciToSceneKm(preview.baseKm.posKm.x, preview.baseKm.posKm.y, preview.baseKm.posKm.z, gmst, new THREE.Vector3()).toArray()
    const r = Math.hypot(preview.baseKm.posKm.x, preview.baseKm.posKm.y, preview.baseKm.posKm.z)
    const tip = { x: preview.baseKm.posKm.x + d.x * r * 0.12,
                  y: preview.baseKm.posKm.y + d.y * r * 0.12,
                  z: preview.baseKm.posKm.z + d.z * r * 0.12 }
    const p1 = eciToSceneKm(tip.x, tip.y, tip.z, gmst, new THREE.Vector3()).toArray()
    return [p0, p1]
  }, [preview, gmst])

  return (
    <group>
      <LabOrbit elements={liveEl} options={{ showMarkers: false, showConstruction: false,
                                             lineColor: ORIG, opacity: 0.5 }} simMs={simMs} />
      {shown && (
        <LabOrbit elements={shown.elements}
                  options={{ showMarkers: false, showConstruction: false,
                             lineColor: PRED, dashed: true, opacity: 0.95,
                             animating: false }} simMs={simMs} />
      )}
      {arrow && (
        <Line points={arrow} color={BURN} lineWidth={2.4} transparent opacity={0.95} toneMapped={false} />
      )}
    </group>
  )
}

export default function ManeuverLabPage() {
  const engine = useEngine()
  const [satId, setSatId] = useState('norad-25544')
  const [dirKey, setDirKey] = useState('prograde')
  const [dvMps, setDvMps] = useState(100)
  const [working, setWorking] = useState(null) // {stateKm, elements, burns:[...]}
  const [preview, setPreview] = useState(null) // candidate burn (not committed)
  const [mobilePanel, setMobilePanel] = useState(true)
  const drag = useRef(null)

  const simMs = engine.simMs
  const rec = engine.recordFor(satId)
  const liveState = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    return { posKm: { ...pv.position }, velKmS: { ...pv.velocity } }
  }, [rec, Math.floor(simMs / 100)])

  const baseState = working?.stateKm ?? liveState
  const doPreview = () => {
    if (!baseState) return
    const r = applyBurnKm(baseState, dirKey, dvMps)
    setPreview({ ...r, baseKm: baseState, dirKey, dvMps })
  }
  const applyBurn = () => {
    if (!preview) return
    setWorking({ stateKm: preview.afterKm, elements: preview.afterElements,
                 burns: [...(working?.burns ?? []), { dirKey: preview.dirKey,
                   dvMps: preview.dvMps, atSimMs: simMs,
                   totalDvMps: preview.dvAppliedMps }] })
    setPreview(null)
  }
  const reset = () => { setWorking(null); setPreview(null) }

  const deltas = preview ? maneuverDeltas(preview.beforeElements, preview.afterElements)
    : working ? maneuverDeltas(
        stateToElementsKm(liveState ?? working.stateKm), working.elements) : null

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const totalDv = working?.burns.reduce((s, b) => s + b.dvMps, 0) ?? 0

  const fmt = (v, unit, digits = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)} ${unit}`

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-amber-400" />
          <span className="font-semibold text-emerald-50 text-sm">Maneuver</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-300">
          ANALYTICAL — IMPULSIVE TWO-BODY
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-3">
        Burns act on a working copy of the spacecraft state. The live SGP4
        orbit and the satellite itself are never modified.
      </p>

      <label className="block text-[10px] font-mono text-emerald-500 mb-1">SPACECRAFT</label>
      <select value={satId} onChange={(e) => { setSatId(e.target.value); reset() }}
              className="w-full bg-black/30 border border-emerald-400/20 rounded-md px-2 py-1.5 text-xs text-emerald-100 mb-3">
        {catalogSatellites.map((s) => (
          <option key={s.id} value={s.id}>{s.name} · NORAD {s.norad_id}</option>
        ))}
      </select>

      <label className="block text-[10px] font-mono text-emerald-500 mb-1">DIRECTION (RSW / velocity basis)</label>
      <div className="grid grid-cols-3 gap-1 mb-3">
        {BURN_DIRECTIONS.map((d) => (
          <button key={d.key} onClick={() => { setDirKey(d.key); setPreview(null) }} aria-pressed={dirKey === d.key}
                  className={`px-1.5 py-1 rounded text-[9px] font-mono border
                    ${dirKey === d.key ? 'border-amber-400/70 bg-amber-400/15 text-amber-200'
                                        : 'border-emerald-400/15 text-emerald-500 hover:text-emerald-200'}`}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="flex items-baseline justify-between text-[11px] mb-1">
        <span className="text-emerald-200 font-semibold">Delta-V</span>
        <span className="font-mono text-emerald-50 tabular-nums">{dvMps} m/s</span>
      </div>
      <input type="range" min={0} max={2000} step={5} value={dvMps}
             onChange={(e) => { setDvMps(Number(e.target.value)); setPreview(null) }}
             className="w-full accent-amber-400 h-6 mb-1" aria-label="Delta-V magnitude" />
      <input type="number" min={0} max={5000} value={dvMps}
             onChange={(e) => { setDvMps(Math.max(0, Math.min(5000, Number(e.target.value) || 0))); setPreview(null) }}
             className="w-24 bg-black/30 border border-emerald-400/20 rounded px-2 py-1 text-[11px] font-mono text-emerald-100 mb-3" />

      <div className="flex gap-2 mb-3">
        <button onClick={doPreview} disabled={!liveState}
                className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-40">
          PREVIEW BURN
        </button>
        <button onClick={applyBurn} disabled={!preview}
                className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold border
                  ${preview ? 'bg-amber-500 text-amber-950 border-amber-400'
                            : 'border-emerald-400/20 text-emerald-700'}`}>
          {preview ? `APPLY ${preview.dvMps} m/s` : 'APPLY BURN'}
        </button>
        <button onClick={reset} className="p-1.5 rounded-md border border-emerald-400/20 text-emerald-400" aria-label="Reset burns">
          <RotateCcw size={13} />
        </button>
      </div>

      {preview && (
        <div className="text-[10px] font-mono text-amber-300 mb-2">
          PREVIEW — {preview.dirKey.toUpperCase()} {preview.dvMps} m/s · grey = live orbit ·
          dashed cyan = predicted · amber = burn vector
        </div>
      )}
      {working && (
        <div className="text-[10px] font-mono text-emerald-400 mb-2">
          {working.burns.length} burn(s) committed · total ΔV {totalDv.toFixed(0)} m/s
        </div>
      )}

      {deltas && (
        <table className="w-full text-[10px] font-mono mb-3">
          <thead>
            <tr className="text-emerald-600 border-b border-emerald-400/15">
              <th className="text-left py-1">BEFORE</th><th className="text-right">LIVE</th><th className="text-right">AFTER</th>
            </tr>
          </thead>
          <tbody className="text-emerald-200 tabular-nums">
            <tr><td className="py-0.5">Apogee alt</td>
              <td className="text-right">{deltas.beforeApoapsisAltKm.toFixed(1)}</td>
              <td className="text-right text-cyan-300">{deltas.afterApoapsisAltKm.toFixed(1)} km</td></tr>
            <tr><td className="py-0.5">Perigee alt</td>
              <td className="text-right">{deltas.beforePeriapsisAltKm.toFixed(1)}</td>
              <td className="text-right text-cyan-300">{deltas.afterPeriapsisAltKm.toFixed(1)} km</td></tr>
            <tr><td className="py-0.5">Period</td>
              <td className="text-right">{deltas.beforePeriodMin.toFixed(2)}</td>
              <td className="text-right text-cyan-300">{deltas.afterPeriodMin.toFixed(2)} min</td></tr>
            <tr><td className="py-0.5">Eccentricity</td>
              <td className="text-right">{deltas.beforeEccentricity.toFixed(4)}</td>
              <td className="text-right text-cyan-300">{deltas.afterEccentricity.toFixed(4)}</td></tr>
            <tr><td className="py-0.5">Semi-major axis</td>
              <td className="text-right">{deltas.beforeSemiMajorAxisKm.toFixed(1)}</td>
              <td className="text-right text-cyan-300">{deltas.afterSemiMajorAxisKm.toFixed(1)} km</td></tr>
            <tr><td className="py-0.5">Inclination</td>
              <td className="text-right">{deltas.beforeInclinationDeg.toFixed(3)}</td>
              <td className="text-right text-cyan-300">{deltas.afterInclinationDeg.toFixed(3)}°</td></tr>
            <tr className="text-emerald-500">
              <td className="py-1" colSpan={3}>
                Δ: apogee {fmt(deltas.dApoapsisAltKm, 'km')} · perigee {fmt(deltas.dPeriapsisAltKm, 'km')} ·
                period {fmt(deltas.dPeriodMin, 'min', 2)} · i {fmt(deltas.dInclinationDeg, '°', 3)} ·
                a {fmt(deltas.dSemiMajorAxisKm, 'km')}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <details className="mb-2">
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">
          SHOW CALCULATION — how a burn changes the orbit
        </summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-200">
          <div className="text-cyan-300">v' = v + ΔV·d̂  (impulsive: position unchanged)</div>
          <div className="text-cyan-300 mt-2">ε' = |v'|²/2 − μ/r  →  a' = −μ/(2ε')</div>
          <div className="text-cyan-300 mt-2">e' = |( v'×h')/μ − r̂| , h' = r × v'</div>
          <div className="mt-2 text-emerald-600">
            Prograde raises the apsis AHEAD of the burn (burn point → perigee);
            retrograde lowers it ahead; normal/anti-normal rotate the plane
            (Δi ≈ ΔV·cos(u)/|v| for out-of-plane at argument of latitude u).
          </div>
          <div className="mt-1 text-emerald-700">
            Post-burn orbit shown analytically; J2/drag would perturb it over
            time (M16/M17 add those models).
          </div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission
        overlay={liveState && (
          <ManeuverOverlay
            liveState={liveState}
            working={working}
            preview={preview ? { ...preview, elements: preview.afterElements, baseKm: preview.baseKm } : null}
            simMs={simMs} />
        )} />
      <div className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
           onPointerDown={onPointerDown} onPointerMove={onPointerMove}
           onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />

      <header className="absolute top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#04120b]/85 backdrop-blur-md border-b border-emerald-400/15">
        <Link to="/tracker" className="flex items-center gap-2 text-emerald-300 hover:text-emerald-200 text-[12px] font-mono">
          <ArrowLeft size={14} /> TRACKER
        </Link>
        <div className="w-px h-6 bg-emerald-400/15" />
        <Link to="/lab/elements" className="hidden md:flex items-center gap-1.5 text-emerald-400 hover:text-emerald-200 text-[12px] font-mono">
          ELEMENTS LAB
        </Link>
        <div className="hidden md:block w-px h-6 bg-emerald-400/15" />
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-emerald-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-amber-500 align-middle">
              DESIGN · MANEUVER LAB
            </span>
          </span>
        </div>
        <button onClick={() => setMobilePanel((v) => !v)}
                className="lg:hidden ml-auto px-3 py-1 rounded-md text-[11px] font-mono border border-emerald-400/30 text-emerald-200 bg-black/40">
          MANEUVER
        </button>
      </header>

      <div className={`${mobilePanel ? 'flex' : 'hidden'} lg:flex absolute bottom-2 lg:top-16 lg:bottom-24 right-2 lg:right-4 left-2 lg:left-auto w-auto lg:w-[340px] z-40 lg:z-20 max-h-[62vh] lg:max-h-none pointer-events-auto`}>
        {panel}
      </div>

      <div className="absolute bottom-3 right-3 lg:bottom-4 z-30 text-[9px] font-mono text-emerald-700">
        burn epoch {engine.date().toISOString().slice(11, 19)} UTC · state frozen at PREVIEW/APPLY
      </div>
    </div>
  )
}
