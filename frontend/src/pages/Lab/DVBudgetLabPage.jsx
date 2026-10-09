import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Fuel, Plus, Trash2 } from 'lucide-react'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { budgetVerdict, dvAvailableMps, presetLeoToGeo } from '../../lib/rocket.js'
import { hohmannTransferAltKm } from '../../lib/hohmann.js'
import { G0_MS2 } from '../../lib/constants.js'

const NUM = ({ label, value, onChange, min, max, step, unit }) => (
  <div className="mb-2.5">
    <div className="flex items-baseline justify-between text-[11px] mb-1">
      <span className="text-fg font-semibold">{label}</span>
      <span className="font-mono text-fg tabular-nums">{value.toLocaleString('en-US')} {unit}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
           onChange={(e) => onChange(Number(e.target.value))}
           className="w-full accent-hi h-6" aria-label={label} />
    <input type="number" min={min} max={max} value={value}
           onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
           className="w-28 bg-black/30 border border-hi/20 rounded px-2 py-1 text-[11px] font-mono text-fg" />
  </div>
)

export default function DVBudgetLabPage() {
  useEngine()
  const [ispSec, setIsp] = useState(320)
  const [dryMassKg, setDry] = useState(1200)
  const [propellantKg, setProp] = useState(2600)
  const [events, setEvents] = useState(() => presetLeoToGeo(hohmannTransferAltKm(400, 35786)))

  const v = budgetVerdict({ events, ispSec, dryMassKg, propellantKg })
  const maxBar = Math.max(v.requiredMps, v.availableMps, 1)

  const setEvent = (id, patch) => setEvents((evs) => evs.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const removeEvent = (id) => setEvents((evs) => evs.filter((e) => e.id !== id))
  const addEvent = () => setEvents((evs) => [...evs, { id: `e${Date.now()}`, label: 'New maneuver', dvMps: 50 }])

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Fuel size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Mission ΔV Budget</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-300">
          ANALYTICAL — TSIOLKOVSKY
        </span>
      </div>
      <p className="text-[9px] text-mut mb-3">
        Transfer burns come from the real Hohmann engine at 400 km → GEO.
        No gravity/drag losses modeled (launch-analysis scope).
      </p>

      <div className="flex gap-1 mb-3">
        <button onClick={() => setEvents(presetLeoToGeo(hohmannTransferAltKm(400, 35786)))}
                className="px-2 py-0.5 rounded text-[9px] font-mono border border-hi/20 text-hi hover:text-fg">
          PRESET LEO→GEO
        </button>
        <button onClick={() => setEvents([{ id: 'p1', label: 'Custom mission', dvMps: 1000 }])}
                className="px-2 py-0.5 rounded text-[9px] font-mono border border-hi/20 text-hi hover:text-fg">
          CLEAR
        </button>
      </div>

      <div className="mb-3">
        <div className="text-[10px] font-mono text-pri mb-1">MISSION EVENTS</div>
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-1.5 mb-1.5">
            <input value={e.label} onChange={(ev) => setEvent(e.id, { label: ev.target.value })}
                   className="flex-1 min-w-0 bg-black/30 border border-hi/15 rounded px-2 py-1 text-[10px] text-fg"
                   aria-label="Event label" />
            <input type="number" value={e.dvMps} min={0} max={10000}
                   onChange={(ev) => setEvent(e.id, { dvMps: Math.max(0, Number(ev.target.value) || 0) })}
                   className="w-16 bg-black/30 border border-hi/15 rounded px-1.5 py-1 text-[10px] font-mono text-fg text-right"
                   aria-label={`Delta-V for ${e.label}`} />
            <span className="text-[9px] font-mono text-mut">m/s</span>
            <button onClick={() => removeEvent(e.id)} className="p-1 text-mut hover:text-red-400" aria-label={`Remove ${e.label}`}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button onClick={addEvent}
                className="flex items-center gap-1 text-[10px] font-mono text-hi hover:text-fg">
          <Plus size={11} /> ADD EVENT
        </button>
      </div>

      <NUM label="Engine Isp" value={ispSec} onChange={setIsp} min={50} max={450} step={1} unit="s" />
      <NUM label="Dry mass" value={dryMassKg} onChange={setDry} min={50} max={10000} step={10} unit="kg" />
      <NUM label="Propellant load" value={propellantKg} onChange={setProp} min={0} max={40000} step={50} unit="kg" />

      {/* capacity vs requirement bars */}
      <div className="mb-3">
        <div className="text-[9px] font-mono text-mut mb-1">REQUIRED {v.requiredMps.toFixed(0)} m/s</div>
        <div className="h-3 rounded bg-black/40 border border-hi/20 overflow-hidden flex mb-2">
          {events.filter((e) => e.dvMps > 0).map((e, i) => (
            <div key={e.id} title={`${e.label}: ${e.dvMps} m/s`}
                 className="h-full border-r border-black/40"
                 style={{ width: `${(e.dvMps / maxBar) * 100}%`,
                          background: ['#3B82F6', '#0d9488', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#F5B942'][i % 7] }} />
          ))}
        </div>
        <div className="text-[9px] font-mono text-mut mb-1">AVAILABLE {v.availableMps.toFixed(0)} m/s (vehicle)</div>
        <div className="h-3 rounded bg-black/40 border border-hi/20 overflow-hidden">
          <div className={`h-full ${v.feasible ? 'bg-pri' : 'bg-red-500'}`}
               style={{ width: `${(v.availableMps / maxBar) * 100}%` }} />
        </div>
      </div>

      <div className={`mb-3 px-3 py-2 rounded-lg border font-mono text-[11px] flex items-center justify-between
        ${v.feasible ? 'border-hi/60 bg-hi/10 text-fg'
                      : 'border-red-500/60 bg-red-500/10 text-red-300'}`}>
        <span className="font-bold">{v.feasible ? 'MISSION FEASIBLE — GO' : 'NOT FEASIBLE — NO-GO'}</span>
        <span>{v.marginMps >= 0 ? '+' : ''}{v.marginMps.toFixed(0)} m/s margin</span>
      </div>

      <table className="w-full text-[10px] font-mono tabular-nums text-fg mb-3">
        <tbody>
          <tr><td className="text-pri py-0.5">ΔV required</td><td className="text-right">{v.requiredMps.toFixed(0)} m/s</td></tr>
          <tr><td className="text-pri">ΔV available</td><td className="text-right">{v.availableMps.toFixed(0)} m/s</td></tr>
          <tr><td className="text-pri">Propellant needed</td><td className="text-right">{v.propellantNeededKg.toFixed(0)} kg</td></tr>
          <tr><td className="text-pri">Propellant carried</td><td className="text-right">{v.propellantAvailableKg.toFixed(0)} kg</td></tr>
          {v.propellantShortfallKg > 0 && (
            <tr className="text-red-300"><td>Shortfall</td><td className="text-right">{v.propellantShortfallKg.toFixed(0)} kg</td></tr>
          )}
          <tr><td className="text-pri">Mass ratio m0/m1</td><td className="text-right">{v.massRatio.toFixed(3)}</td></tr>
        </tbody>
      </table>

      <details className="mb-2">
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">
          SHOW CALCULATION — rocket equation
        </summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">ΔV_avail = Isp · g0 · ln(m0/m1)</div>
          <div>= {ispSec} s × {G0_MS2} m/s² × ln({(dryMassKg + propellantKg)}/{dryMassKg}) = {v.availableMps.toFixed(0)} m/s</div>
          <div className="text-cyan-300 mt-2">m_p = m_dry · (e^(ΔV_req/(Isp·g0)) − 1)</div>
          <div>= {dryMassKg} · (e^({v.requiredMps.toFixed(0)}/{(ispSec * G0_MS2).toFixed(0)}) − 1) = {v.propellantNeededKg.toFixed(0)} kg</div>
          <div className="mt-2 text-mut">g0 = {G0_MS2} m/s² (standard gravity, constants.js). ΔV_req = Σ events.</div>
        </div>
      </details>
      <div className="text-[9px] font-mono text-mut">
        available ΔV {dvAvailableMps({ ispSec, dryMassKg, propellantKg }).toFixed(0)} m/s · Isp {ispSec} s
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission />
      <header className="absolute top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#0A1425]/85 backdrop-blur-md border-b border-hi/15">
        <Link to="/tracker" className="flex items-center gap-2 text-hi hover:text-fg text-[12px] font-mono">
          <ArrowLeft size={14} /> TRACKER
        </Link>
        <div className="w-px h-6 bg-hi/15" />
        <Link to="/lab" className="text-[12px] font-mono text-hi hover:text-fg">LABS</Link>
        <div className="w-px h-6 bg-hi/15" />
        <div className="flex items-center gap-2">
          <Fuel size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              DESIGN · ΔV BUDGET
            </span>
          </span>
        </div>
      </header>
      <div className="absolute bottom-2 lg:top-16 lg:bottom-6 right-2 lg:right-4 left-2 lg:left-auto w-auto lg:w-[340px] z-40 pointer-events-auto max-h-[62vh] lg:max-h-none">
        {panel}
      </div>
    </div>
  )
}
