import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Plus, Trash2, ChevronUp, ChevronDown, Play } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { stateToElementsKm, orbitPolylineKm, apoapsisRadiusKm, periapsisRadiusKm } from '../../lib/kepler.js'
import { BURN_DIRECTIONS } from '../../lib/maneuver.js'
import { runMissionKm, missionMassesKm, coastDriftDegKm } from '../../lib/mission.js'
import { dvAvailableMps } from '../../lib/rocket.js'
import { R_EARTH_MEAN_KM } from '../../lib/constants.js'

const LEG_COLORS = ['#38D9FF', '#818CF8', '#F5B942', '#34D399', '#F472B6', '#91A6C2', '#FF647C', '#C084FC']

let nextId = 1
const mkEvent = (type) => type === 'burn'
  ? { id: nextId++, type: 'burn', dirKey: 'prograde', dvMps: 100 }
  : { id: nextId++, type: 'coast', minutes: 45 }

/** One polyline per distinct leg (post-burn shape), oldest dimmest. */
function MissionOverlay({ result, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  const TMP = useMemo(() => new THREE.Vector3(), [])
  const legs = useMemo(() => {
    if (!result) return []
    const out = [{ el: result.steps[0]?.beforeElements, color: '#3B82F6', opacity: 0.5 }]
    for (const st of result.steps) {
      const changed = st.dvMps > 0 || st.index === result.steps.length - 1
      if (changed) out.push({ el: st.afterElements,
        color: LEG_COLORS[out.length % LEG_COLORS.length], opacity: 0.95 })
    }
    return out.filter((l) => l.el && l.el.aKm > 0 && l.el.e < 1)
  }, [result])
  return (
    <group>
      {legs.map((l, i) => {
        const flat = orbitPolylineKm(l.el, 96)
        const pts = []
        for (let k = 0; k <= 96; k += 1) {
          eciToSceneKm(flat[k * 3], flat[k * 3 + 1], flat[k * 3 + 2], gmst, TMP)
          pts.push([TMP.x, TMP.y, TMP.z])
        }
        return <Line key={i} points={pts} color={l.color} lineWidth={1.4}
                     transparent opacity={l.opacity} toneMapped={false} />
      })}
    </group>
  )
}

export default function MissionBuilderPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [events, setEvents] = useState([mkEvent('burn'), mkEvent('coast')])
  const [j2, setJ2] = useState(false)
  const [ispSec, setIsp] = useState(312)
  const [mass0Kg, setMass0Kg] = useState(1200)
  const [dryMassKg, setDryMassKg] = useState(800)
  const [result, setResult] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  const start = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    return { name: rec.meta.name,
      elements: stateToElementsKm({ posKm: { ...pv.position }, velKmS: { ...pv.velocity } }) }
  }, [rec, Math.floor(simMs / 100)])

  const run = () => {
    if (!start) return
    setRunning(true); setError(null); setResult(null); setLedger(null)
    setTimeout(() => {
      try {
        const res = runMissionKm({ elements0: start.elements, events, j2Secular: j2 })
        setResult(res)
        setLedger(missionMassesKm({ result: res, mass0Kg, ispSec }))
      } catch (err) {
        setError(err.message)
      } finally { setRunning(false) }
    }, 16)
  }

  const patch = (id, part) => setEvents((evs) => evs.map((e) => (e.id === id ? { ...e, ...part } : e)))
  const remove = (id) => setEvents((evs) => evs.filter((e) => e.id !== id))
  const move = (idx, dir) => setEvents((evs) => {
    const j = idx + dir
    if (j < 0 || j >= evs.length) return evs
    const out = [...evs]; [out[idx], out[j]] = [out[j], out[idx]]; return out
  })

  const totals = useMemo(() => {
    const dv = events.reduce((s, e) => s + (e.type === 'burn' ? Math.max(0, Number(e.dvMps) || 0) : 0), 0)
    const prop = Math.max(mass0Kg - dryMassKg, 0)
    const avail = dvAvailableMps({ ispSec, dryMassKg, propellantKg: prop })
    return { dv, propKg: prop, avail, feasible: dv <= avail }
  }, [events, ispSec, mass0Kg, dryMassKg])

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const altKm = (r) => (r - R_EARTH_MEAN_KM).toFixed(0)

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Mission Builder</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/40 text-cau">
          ANALYTICAL — IMPULSIVE + KEPLER/J2
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        Chain coast and burn events on the selected object's live osculating
        orbit. Burns reuse the M2 impulsive maneuver service; coasts advance
        mean anomaly (two-body) or optionally drift node/apsides with the
        M17 secular J2 engine. Propellant uses the M4 rocket equation step
        by step. Validated event-by-event against a hand-executed Hohmann
        transfer (sub-mm in aKm).
      </p>

      {start && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2 text-[10px] font-mono">
          <span className="text-mut">START:</span> <span className="text-fg">{start.name.toUpperCase()}</span>
          {' '}· a {start.elements.aKm.toFixed(0)} km · e {start.elements.e.toFixed(4)} · i {start.elements.iDeg.toFixed(1)}°
          · REAL-TIME SGP4
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-fg">Event sequence</span>
          <div className="flex gap-1">
            <button onClick={() => setEvents((e) => [...e, mkEvent('burn')])}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-pri text-bg text-[9px] font-semibold hover:bg-hi">
              <Plus size={10} /> BURN
            </button>
            <button onClick={() => setEvents((e) => [...e, mkEvent('coast')])}
                    className="flex items-center gap-1 px-2 py-0.5 rounded border border-hi/40 text-hi text-[9px] font-semibold hover:bg-hi/10">
              <Plus size={10} /> COAST
            </button>
          </div>
        </div>
        {events.map((ev, i) => (
          <div key={ev.id} className="flex items-center gap-1 mb-1 rounded border border-white/10 bg-black/25 px-1.5 py-1">
            <span className="text-[9px] font-mono text-mut w-4">{i + 1}</span>
            {ev.type === 'burn' ? (
              <>
                <select value={ev.dirKey} onChange={(e) => patch(ev.id, { dirKey: e.target.value })}
                        aria-label="Direction" className="bg-[#0A1425] text-fg text-[9px] font-mono rounded border border-hi/30 px-1">
                  {BURN_DIRECTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
                <input type="number" value={ev.dvMps} step={10} min={0}
                       onChange={(e) => patch(ev.id, { dvMps: Number(e.target.value) })}
                       aria-label="DeltaV" className="w-16 bg-[#0A1425] text-fg text-[10px] font-mono rounded border border-hi/30 px-1" />
                <span className="text-[9px] font-mono text-mut">m/s</span>
              </>
            ) : (
              <>
                <span className="text-[9px] font-mono text-mut">COAST</span>
                <input type="number" value={ev.minutes} step={5} min={0}
                       onChange={(e) => patch(ev.id, { minutes: Number(e.target.value) })}
                       aria-label="Minutes" className="w-16 bg-[#0A1425] text-fg text-[10px] font-mono rounded border border-hi/30 px-1" />
                <span className="text-[9px] font-mono text-mut">min</span>
              </>
            )}
            <span className="flex-1" />
            <button onClick={() => move(i, -1)} aria-label="Move up" className="text-mut hover:text-fg"><ChevronUp size={11} /></button>
            <button onClick={() => move(i, 1)} aria-label="Move down" className="text-mut hover:text-fg"><ChevronDown size={11} /></button>
            <button onClick={() => remove(ev.id)} aria-label="Remove" className="text-crit/70 hover:text-crit"><Trash2 size={11} /></button>
          </div>
        ))}
        {events.length === 0 && <div className="text-[9px] font-mono text-mut">empty sequence — add a burn or coast</div>}
      </div>

      <label className="flex items-center gap-2 text-[10px] text-fg mb-2 cursor-pointer">
        <input type="checkbox" checked={j2} onChange={(e) => setJ2(e.target.checked)} className="accent-hi" />
        Coast with secular J2 (node + apsides drift)
      </label>

      <div className="mb-1">
        <div className="flex items-baseline justify-between text-[10px] mb-0.5">
          <span className="text-fg font-semibold">Engine Isp</span>
          <span className="font-mono text-fg">{ispSec} s</span>
        </div>
        <input type="range" min={200} max={450} step={1} value={ispSec}
               onChange={(e) => setIsp(Number(e.target.value))} aria-label="Isp" className="w-full accent-hi h-5" />
        <div className="flex items-baseline justify-between text-[10px] mt-1 mb-0.5">
          <span className="text-fg font-semibold">Wet mass at start</span>
          <span className="font-mono text-fg">{mass0Kg} kg</span>
        </div>
        <input type="range" min={100} max={5000} step={50} value={mass0Kg}
               onChange={(e) => setMass0Kg(Number(e.target.value))} aria-label="Wet mass" className="w-full accent-hi h-5" />
        <div className="flex items-baseline justify-between text-[10px] mt-1 mb-0.5">
          <span className="text-fg font-semibold">Dry mass floor</span>
          <span className="font-mono text-fg">{dryMassKg} kg</span>
        </div>
        <input type="range" min={50} max={4000} step={50} value={dryMassKg}
               onChange={(e) => setDryMassKg(Number(e.target.value))} aria-label="Dry mass" className="w-full accent-hi h-5" />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 mb-2 font-mono text-[9px] text-mut">
        sequence Δv <span className="text-fg">{totals.dv.toFixed(0)} m/s</span>
        {' '}· propellant {(totals.propKg).toFixed(0)} kg → capability{' '}
        <span className="text-fg">{totals.avail.toFixed(0)} m/s</span>
        {' '}· margin <span style={{ color: totals.feasible ? '#34D399' : '#FF647C' }}>{(totals.avail - totals.dv).toFixed(0)} m/s</span>
      </div>

      <button onClick={run} disabled={running || !start || events.length === 0}
              className="w-full mb-2 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi disabled:opacity-50 flex items-center justify-center gap-1.5">
        <Play size={12} /> {running ? 'EXECUTING SEQUENCE…' : 'RUN MISSION (ON-DEMAND)'}
      </button>
      {error && <div className="text-[10px] font-mono text-crit mb-2">{error}</div>}

      {result && ledger && (
        <>
          <div className="rounded-lg border border-hi/25 bg-black/30 px-2 py-2 mb-2">
            <div className="text-[9px] font-mono text-mut mb-1">
              {result.steps.length} events · {(result.missionMinutes / 60).toFixed(1)} h elapsed ·
              total Δv {result.totalDvMps.toFixed(0)} m/s · mass at end {ledger.massAtEndKg.toFixed(0)} kg
              {' '}<span style={{ color: ledger.massAtEndKg >= dryMassKg && !result.belowSurfaceSeen ? '#34D399' : '#FF647C' }}>
                [{ledger.massAtEndKg >= dryMassKg && !result.belowSurfaceSeen ? 'GO' : 'NO-GO'}]</span>
              {result.belowSurfaceSeen && <span className="text-crit"> · PERIGEE BELOW SURFACE (impacting leg)</span>}
              {ledger.massAtEndKg < dryMassKg && <span className="text-crit"> · PROPELLANT FLOOR BREACHED</span>}
              {j2 && result.steps.some((s) => s.event.type === 'coast') && (() => {
                const c = result.steps.find((s) => s.event.type === 'coast')
                const d = coastDriftDegKm({ elements: c.beforeElements, minutes: c.event.minutes })
                return ` · J2 drift Ω ${d.raanDeg >= 0 ? '+' : ''}${d.raanDeg.toFixed(3)}°/leg`
              })()}
            </div>
            <table className="w-full font-mono text-[9px] text-fg">
              <thead>
                <tr className="text-mut text-left">
                  <th className="font-normal">t+</th><th className="font-normal">event</th>
                  <th className="font-normal text-right">Δv</th><th className="font-normal text-right">a km</th>
                  <th className="font-normal text-right">e</th><th className="font-normal text-right">apo/per km</th>
                  <th className="font-normal text-right">mass</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((st, i) => (
                  <tr key={st.index} className={st.periapsisBelowSurface ? 'text-crit' : ''}>
                    <td>{st.tMinCumulative.toFixed(0)}m</td>
                    <td>{st.event.type === 'burn' ? st.event.dirKey.slice(0, 6) : 'coast'}</td>
                    <td className="text-right">{st.dvMps > 0 ? st.dvMps.toFixed(0) : '—'}</td>
                    <td className="text-right">{st.afterElements.aKm.toFixed(0)}</td>
                    <td className="text-right">{st.afterElements.e.toFixed(4)}</td>
                    <td className="text-right">{altKm(apoapsisRadiusKm(st.afterElements.aKm, st.afterElements.e))}/{altKm(st.periapsisRadiusKm)}</td>
                    <td className="text-right">{ledger.rows[i].massAfterKg.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[9px] font-mono text-mut mb-2 leading-relaxed">
            final orbit: apogee {altKm(apoapsisRadiusKm(result.finalElements.aKm, result.finalElements.e))} km ·
            perigee {altKm(periapsisRadiusKm(result.finalElements.aKm, result.finalElements.e))} km ·
            i {result.finalElements.iDeg.toFixed(2)}° · propellant used {ledger.propellantUsedKg.toFixed(0)} kg
          </div>
        </>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW METHOD</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div>burn: v⁺ = v + Δv·d̂(r,v,h) (M2 RSW directions) → full state→elements re-solve</div>
          <div>coast: M ← M + nΔt (two-body), or M ← M + n̄Δt with Ω̇,ω̇ secular drift (M17) when J2 is on</div>
          <div>mass: m ← m·e^(−Δv/(Isp·g₀)); budget = Isp·g₀·ln(m₀/m_dry)</div>
          <div className="text-mut mt-2">
            Ignored: finite burn duration, thrust misalignment, third-body,
            drag between events, Earth-oblate PERIODIC (non-secular) terms,
            target-phase constraints (windows are not searched — place coasts
            yourself). Burns execute at the CURRENT position of the sequence;
            a burn's direction basis uses the instantaneous r, v, h at that
            point, exactly like the M2 lab.
          </div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={result ? <MissionOverlay result={result} simMs={simMs} /> : null} />
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
          <ClipboardList size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              DESIGN · MISSION BUILDER
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
