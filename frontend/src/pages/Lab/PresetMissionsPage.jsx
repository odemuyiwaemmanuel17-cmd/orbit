import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Layers, Play, Flame } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { listPresets, equivalentBurnTimeSec } from '../../lib/presets.js'
import { runMissionKm, missionMassesKm } from '../../lib/mission.js'
import { apoapsisRadiusKm, orbitPolylineKm } from '../../lib/kepler.js'
import { R_EARTH_MEAN_KM } from '../../lib/constants.js'

const LEG_COLORS = ['#38D9FF', '#818CF8', '#F5B942', '#34D399', '#F472B6', '#91A6C2', '#FF647C', '#C084FC']

function LegLine({ el, color, opacity, gmst, TMP }) {
  const pts = useMemo(() => {
    const flat = orbitPolylineKm(el, 96)
    const out = []
    for (let k = 0; k <= 96; k += 1) {
      eciToSceneKm(flat[k * 3], flat[k * 3 + 1], flat[k * 3 + 2], gmst, TMP)
      out.push([TMP.x, TMP.y, TMP.z])
    }
    return out
  }, [el, gmst, TMP])
  return <Line points={pts} color={color} lineWidth={1.4} transparent opacity={opacity} toneMapped={false} />
}

function PresetOverlay({ result, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  const TMP = useMemo(() => new THREE.Vector3(), [])
  const legs = useMemo(() => {
    if (!result) return []
    const out = [{ el: result.steps[0]?.beforeElements, color: '#3B82F6', opacity: 0.4 }]
    for (const st of result.steps) {
      if (st.dvMps > 0) out.push({ el: st.afterElements,
        color: LEG_COLORS[out.length % LEG_COLORS.length], opacity: 0.95 })
    }
    return out.filter((l) => l.el && l.el.aKm > 0 && l.el.e < 1)
  }, [result])
  return (
    <group>
      {legs.map((l, i) => (
        <LegLine key={i} el={l.el} color={l.color} opacity={l.opacity} gmst={gmst} TMP={TMP} />
      ))}
    </group>
  )
}

export default function PresetMissionsPage() {
  const engine = useEngine()
  const presets = useMemo(() => listPresets(), [])
  const [selId, setSelId] = useState(presets[0].id)
  const [mass0Kg, setMass0Kg] = useState(1200)
  const [result, setResult] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const drag = useRef(null)

  const preset = useMemo(() => presets.find((p) => p.id === selId), [presets, selId])

  const run = () => {
    setRunning(true); setError(null); setResult(null); setLedger(null)
    setTimeout(() => {
      try {
        const res = runMissionKm({ elements0: preset.elements0, events: preset.events })
        setResult(res)
        setLedger(missionMassesKm({ result: res, mass0Kg, ispSec: preset.engine.ispSec }))
      } catch (err) {
        setError(err.message)
      } finally { setRunning(false) }
    }, 16)
  }

  const burnDays = useMemo(() => {
    if (!preset) return null
    return equivalentBurnTimeSec({ dvMps: preset.analytic.dvMps, massKg: mass0Kg, thrustN: preset.engine.thrustN }) / 86400
  }, [preset, mass0Kg])

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const fmtDv = (v) => (v >= 1000 ? `${(v / 1000).toFixed(3)} km/s` : `${v.toFixed(1)} m/s`)

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Preset Missions</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/40 text-cau">
          SIMPLIFIED — IMPULSIVE APPROX.
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        Four reference missions flown on REAL engines whose vacuum specs were
        verified against public sources (cited on each card). Every Δv is
        COMPUTED from the Kepler primitives at page build — none typed in —
        and the sequences execute on the M21 mission engine, inheriting its
        Hohmann-validated spine.
      </p>

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {presets.map((p) => (
          <button key={p.id} onClick={() => { setSelId(p.id); setResult(null); setLedger(null); setError(null) }}
                  aria-pressed={p.id === selId}
                  className={`text-left rounded-lg border px-2 py-1.5 ${p.id === selId ? 'border-hi bg-hi/10' : 'border-white/10 bg-black/20 hover:border-hi/40'}`}>
            <div className="text-[10px] font-semibold text-fg leading-tight">{p.name}</div>
            <div className="text-[8px] font-mono text-mut">{p.engine.name}</div>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-hi/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[9px] text-fg leading-relaxed">
        <div className="flex items-center gap-1 text-cau mb-1"><Flame size={10} /> {preset.engine.name} · {preset.engine.cls}</div>
        <div>{preset.engine.propellant} · Isp <span className="text-hi">{preset.engine.ispSec} s</span> · thrust{' '}
          <span className="text-hi">{preset.engine.thrustN >= 1 ? `${(preset.engine.thrustN / 1000).toFixed(1)} kN` : `${(preset.engine.thrustN * 1000).toFixed(0)} mN`}</span>
          {preset.engine.powerW ? <> · <span className="text-hi">{(preset.engine.powerW / 1000).toFixed(2)} kW</span></> : null}</div>
        <div className="text-mut mt-0.5">src: {preset.engine.source}</div>
        <div className="mt-1">{preset.rationale}</div>
      </div>

      <div className="flex items-baseline justify-between text-[10px] mb-0.5">
        <span className="text-fg font-semibold">Vehicle wet mass</span>
        <span className="font-mono text-fg">{mass0Kg} kg</span>
      </div>
      <input type="range" min={100} max={5000} step={50} value={mass0Kg}
             onChange={(e) => setMass0Kg(Number(e.target.value))} aria-label="Wet mass" className="w-full accent-hi h-5 mb-1" />
      <div className="text-[9px] font-mono text-mut mb-2">
        nominal Δv {fmtDv(preset.analytic.dvMps)} · continuous-thrust time at {mass0Kg} kg:{' '}
        <span className="text-hi">{burnDays < 0.01 ? '<1 h' : `${burnDays.toFixed(1)} days`}</span>
        {preset.engine.thrustN < 1 ? ' (modeled impulsively — the flight version thrusts all the while)' : ''}
      </div>

      <button onClick={run} disabled={running}
              className="w-full mb-2 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi disabled:opacity-50 flex items-center justify-center gap-1.5">
        <Play size={12} /> {running ? 'EXECUTING PRESET…' : 'FLY PRESET MISSION'}
      </button>
      {error && <div className="text-[10px] font-mono text-crit mb-2">{error}</div>}

      {result && ledger && (
        <>
          <div className="rounded-lg border border-hi/25 bg-black/30 px-2 py-2 mb-2">
            <div className="text-[9px] font-mono text-mut mb-1">
              {result.steps.length} events · {(result.missionMinutes / 1440).toFixed(2)} d elapsed ·
              ΣΔv {result.totalDvMps.toFixed(1)} m/s · propellant {ledger.propellantUsedKg.toFixed(1)} kg ·
              end mass {ledger.massAtEndKg.toFixed(1)} kg
              {result.belowSurfaceSeen && <span className="text-crit"> · REENTRY BAND REACHED</span>}
            </div>
            <table className="w-full font-mono text-[9px] text-fg">
              <thead>
                <tr className="text-mut text-left">
                  <th className="font-normal">t+</th><th className="font-normal">event</th>
                  <th className="font-normal text-right">Δv m/s</th><th className="font-normal text-right">a km</th>
                  <th className="font-normal text-right">e</th><th className="font-normal text-right">apo/per alt</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((st) => (
                  <tr key={st.index} className={st.periapsisBelowSurface ? 'text-crit' : ''}>
                    <td>{st.tMinCumulative < 1440 ? `${st.tMinCumulative.toFixed(0)}m` : `${(st.tMinCumulative / 1440).toFixed(1)}d`}</td>
                    <td className="truncate max-w-[110px]">{st.event.label ?? st.event.type}</td>
                    <td className="text-right">{st.dvMps > 0 ? st.dvMps.toFixed(1) : '—'}</td>
                    <td className="text-right">{st.afterElements.aKm.toFixed(0)}</td>
                    <td className="text-right">{st.afterElements.e.toFixed(5)}</td>
                    <td className="text-right">
                      {(apoapsisRadiusKm(st.afterElements.aKm, st.afterElements.e) - R_EARTH_MEAN_KM).toFixed(0)} /
                      {(st.periapsisAltKm).toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[9px] font-mono text-ok mb-2">
            target check: a {result.finalElements.aKm.toFixed(1)} km vs planned {preset.targets.aKm.toFixed(1)} km ·
            e {result.finalElements.e.toExponential(1)} {result.finalElements.e < preset.targets.eMax ? '✓' : '✗'} ·
            i {result.finalElements.iDeg.toFixed(2)}°
          </div>
        </>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW METHOD</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div>engine table: vacuum Isp / thrust / power exactly as cited (2026-10-27)</div>
          <div>all preset Δv: vis-viva + Hohmann primitives (M3/M21), recomputed each load</div>
          <div>burn time display: t = Δv·m/F (continuous-thrust honesty for electric engines)</div>
          <div className="text-mut mt-2">
            What a real flight adds and this does not: finite-thrust gravity
            and spiral losses, eclipse/power duty cycle for electric engines
            (link to the M14 power lab), station-keeping margin, transfer
            windows, Earth oblateness J2 during long coasts (toggle exists on
            the Mission Builder for that), and launch-vehicle injection
            dispersions. Presets are REFERENCE PROFILES, not mission copies.
          </div>
        </div>
      </details>
    </div>
  )

  const { simMs } = engine
  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={result ? <PresetOverlay result={result} simMs={simMs} /> : null} />
      <div className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
           onPointerDown={onPointerDown} onPointerMove={onPointerMove}
           onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />

      <header className="absolute top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#0A1425]/85 backdrop-blur-md border-b border-hi/15">
        <Link to="/tracker" className="flex items-center gap-2 text-hi hover:text-fg text-[12px] font-mono">
          <ArrowLeft size={14} /> TRACKER
        </Link>
        <div className="w-px h-6 bg-hi/15" />
        <Link to="/lab" className="text-[12px] font-mono text-hi hover:text-fg">LABS</Link>
        <div className="w-px h-6 bg-hi/15" />
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              DESIGN · PRESET MISSIONS
            </span>
          </span>
        </div>
      </header>

      <div className="absolute bottom-2 lg:top-16 lg:bottom-6 right-2 lg:right-4 left-2 lg:left-auto w-auto lg:w-[380px] z-40 pointer-events-auto max-h-[62vh] lg:max-h-none">
        {panel}
      </div>
    </div>
  )
}
