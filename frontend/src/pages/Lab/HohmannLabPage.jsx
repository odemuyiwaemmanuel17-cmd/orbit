import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Play, Pause, RotateCcw, Waypoints } from 'lucide-react'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import LabOrbit from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { meanToTrueAnomalyRad } from '../../lib/kepler.js'
import { hohmannTransferAltKm, transferElements, circularElements, coastFractionSec } from '../../lib/hohmann.js'
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM } from '../../lib/constants.js'

const PRESETS = [
  { label: 'LEO 400 -> GEO', a1: 400, a2: 35786 },
  { label: 'LEO 300 -> MEO GPS', a1: 300, a2: 20200 },
  { label: 'SSO 700 -> 1200', a1: 700, a2: 1200 },
  { label: 'GEO -> LEO (deorbit pair)', a1: 35786, a2: 400 },
]

const AltField = ({ label, value, onChange, min, max }) => (
  <div className="mb-3">
    <div className="flex items-baseline justify-between text-[11px] mb-1">
      <span className="text-fg font-semibold">{label}</span>
      <span className="font-mono text-fg tabular-nums">{value.toLocaleString('en-US')} km</span>
    </div>
    <input type="range" min={min} max={max} step={10} value={value}
           onChange={(e) => onChange(Number(e.target.value))}
           className="w-full accent-hi h-6" aria-label={label} />
    <input type="number" min={min} max={max} value={value}
           onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
           className="w-28 bg-black/30 border border-hi/20 rounded px-2 py-1 text-[11px] font-mono text-fg" />
  </div>
)

export default function HohmannLabPage() {
  const engine = useEngine()
  const [alt1, setAlt1] = useState(400)
  const [alt2, setAlt2] = useState(35786)
  const [iDeg, setIDeg] = useState(51.6)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(300)
  const anchorRef = useRef(engine.simMs)
  const nuRef = useRef(0)
  const drag = useRef(null)

  const simMs = engine.simMs
  const t = hohmannTransferAltKm(alt1, alt2)
  const plane = { iDeg, raanDeg: 0 }
  const transferEl0 = transferElements(t, plane)
  const circ1 = circularElements(alt1 + R_EARTH_MEAN_KM, plane)
  const circ2 = circularElements(alt2 + R_EARTH_MEAN_KM, plane)

  // Spacecraft phase over the transfer ellipse: mean anomaly advances with
  // the sim clock; true anomaly via the validated Kepler solver.
  const elapsed = ((simMs - anchorRef.current) / 1000) * speed
  const frac = (((elapsed % t.transferPeriodSec) + t.transferPeriodSec) % t.transferPeriodSec) / t.transferPeriodSec
  const nuAnim = (((meanToTrueAnomalyRad(frac * 2 * Math.PI, t.transferEccentricity) * 180 / Math.PI) % 360) + 360) % 360
  if (playing) nuRef.current = nuAnim
  const nuShown = playing ? nuAnim : nuRef.current
  const coastSec = coastFractionSec(t, nuShown)
  const outbound = nuShown <= 180

  const reset = () => { anchorRef.current = engine.simMs; nuRef.current = 0 }

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const fmtDv = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} m/s`

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Waypoints size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Hohmann Transfer</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-300">
          ANALYTICAL — TWO-BODY
        </span>
      </div>
      <p className="text-[9px] text-mut mb-3">
        Two-impulse coplanar transfer. Burn 1 at perigee of the transfer
        ellipse, 180° coast, burn 2 circularizes. Endpoint circles shown
        grey; transfer ellipse dashed cyan.
      </p>

      <div className="flex gap-1 flex-wrap mb-3">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => { setAlt1(p.a1); setAlt2(p.a2); reset() }}
                  className="px-2 py-0.5 rounded text-[9px] font-mono border border-hi/15 text-pri hover:text-fg hover:border-hi/40">
            {p.label.toUpperCase()}
          </button>
        ))}
      </div>

      <AltField label="Initial orbit altitude" value={alt1} min={200} max={40000} onChange={(v) => { setAlt1(v); reset() }} />
      <AltField label="Target orbit altitude" value={alt2} min={200} max={40000} onChange={(v) => { setAlt2(v); reset() }} />
      <div className="mb-3">
        <div className="flex items-baseline justify-between text-[11px] mb-1">
          <span className="text-fg font-semibold">Orbit inclination</span>
          <span className="font-mono text-fg tabular-nums">{iDeg.toFixed(1)}°</span>
        </div>
        <input type="range" min={0} max={180} step={0.1} value={iDeg}
               onChange={(e) => setIDeg(Number(e.target.value))}
               className="w-full accent-hi h-6" aria-label="Inclination" />
        <p className="text-[9px] font-mono text-mut mt-1">
          plane shared by all three orbits — plane-change cost is M5
        </p>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setPlaying((p) => !p)} aria-pressed={playing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border
                  {playing ? 'bg-pri text-bg border-hi' : 'border-hi/30 text-hi'}">
          {playing ? <Pause size={11} /> : <Play size={11} />}{playing ? 'PAUSE' : 'PLAY'}
        </button>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                className="bg-black/30 border border-hi/20 rounded px-1 py-0.5 text-[10px] text-fg"
                aria-label="Transfer animation speed">
          {[1, 10, 60, 300, 1800].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <button onClick={reset} className="p-1.5 rounded-md border border-hi/20 text-hi" aria-label="Reset transfer animation">
          <RotateCcw size={12} />
        </button>
      </div>

      <table className="w-full text-[11px] font-mono mb-3 tabular-nums">
        <tbody className="text-fg">
          <tr className="border-b border-hi/15 text-mut">
            <td className="py-1">TRANSFER</td><td className="text-right">VALUE</td>
          </tr>
          <tr><td className="py-0.5 text-hi">ΔV1 (burn at r1)</td><td className="text-right">{fmtDv(t.dv1Mps)}</td></tr>
          <tr><td className="py-0.5 text-hi">ΔV2 (burn at r2)</td><td className="text-right">{fmtDv(t.dv2Mps)}</td></tr>
          <tr><td className="py-0.5 font-semibold">TOTAL ΔV</td><td className="text-right font-semibold">{t.totalDvMps.toFixed(0)} m/s</td></tr>
          <tr><td className="py-0.5">Coast time</td><td className="text-right">{(t.coastSec / 60).toFixed(1)} min ({(t.coastSec / 3600).toFixed(2)} h)</td></tr>
          <tr><td className="py-0.5">a_transfer</td><td className="text-right">{t.transferSemiMajorAxisKm.toFixed(1)} km</td></tr>
          <tr><td className="py-0.5">e_transfer</td><td className="text-right">{t.transferEccentricity.toFixed(5)}</td></tr>
          <tr><td className="py-0.5">v_circ(initial)</td><td className="text-right">{t.vInitCircularKmS.toFixed(4)} km/s</td></tr>
          <tr><td className="py-0.5">v_circ(target)</td><td className="text-right">{t.vTargetCircularKmS.toFixed(4)} km/s</td></tr>
          <tr><td className="py-0.5">v_transfer @ r1 / r2</td><td className="text-right">{t.vTransferPerigeeKmS.toFixed(4)} / {t.vTransferApogeeKmS.toFixed(4)}</td></tr>
        </tbody>
      </table>

      <div className="text-[10px] font-mono mb-3">
        <span className={outbound ? 'text-hi live-dot' : 'text-mut'}>
          {outbound
            ? `COASTING t = ${(coastSec / 60).toFixed(1)} min / ${(t.coastSec / 60).toFixed(1)} min · ν = ${nuShown.toFixed(1)}°`
            : 'DISPLAY RETURN HALF — real mission circularizes at apogee'}
        </span>
      </div>

      <details className="mb-2">
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">
          SHOW CALCULATION — every number above
        </summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">r = altitude + R_mean = {alt1} + {R_EARTH_MEAN_KM} = {(alt1 + R_EARTH_MEAN_KM).toFixed(0)} km</div>
          <div className="text-cyan-300 mt-2">a_t = (r1 + r2)/2 = ({(alt1 + R_EARTH_MEAN_KM).toFixed(0)} + {(alt2 + R_EARTH_MEAN_KM).toFixed(0)})/2 = {t.transferSemiMajorAxisKm.toFixed(1)} km</div>
          <div className="text-cyan-300 mt-2">e_t = (r2 − r1)/(r2 + r1) = {t.transferEccentricity.toFixed(5)}</div>
          <div className="text-cyan-300 mt-2">ΔV1 = √(μ(2/r1 − 1/a_t)) − √(μ/r1)</div>
          <div>= {t.vTransferPerigeeKmS.toFixed(4)} − {t.vInitCircularKmS.toFixed(4)} = {(t.dv1Mps / 1000).toFixed(4)} km/s</div>
          <div className="text-cyan-300 mt-2">ΔV2 = √(μ/r2) − √(μ(2/r2 − 1/a_t))</div>
          <div>= {t.vTargetCircularKmS.toFixed(4)} − {t.vTransferApogeeKmS.toFixed(4)} = {(t.dv2Mps / 1000).toFixed(4)} km/s</div>
          <div className="text-cyan-300 mt-2">t_coast = T_t/2 = π√(a_t³/μ) = {(t.coastSec / 3600).toFixed(3)} h</div>
          <div className="mt-2 text-mut">μ = {MU_EARTH_KM3S2} km³/s². Impulsive two-body; real GEO insertion adds plane-change + finite burns (M4/M5).</div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission
        overlay={
          <group>
            <LabOrbit elements={circ1} simMs={simMs}
                      options={{ hideSat: true, showMarkers: false, showConstruction: false,
                                 showEquatorial: false, lineColor: '#94a3b8', opacity: 0.55 }} />
            <LabOrbit elements={circ2} simMs={simMs}
                      options={{ hideSat: true, showMarkers: false, showConstruction: false,
                                 showEquatorial: false, lineColor: '#94a3b8', opacity: 0.55 }} />
            <LabOrbit elements={{ ...transferEl0, trueAnomalyDeg: nuShown }}
                      simMs={simMs}
                      options={{ showMarkers: true, showConstruction: false, showEquatorial: false,
                                 lineColor: '#22d3ee', dashed: true, opacity: 0.95 }} />
          </group>
        } />
      <div className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
           onPointerDown={onPointerDown} onPointerMove={onPointerMove}
           onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />

      <header className="absolute top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#0A1425]/85 backdrop-blur-md border-b border-hi/15">
        <Link to="/tracker" className="flex items-center gap-2 text-hi hover:text-fg text-[12px] font-mono">
          <ArrowLeft size={14} /> TRACKER
        </Link>
        <div className="w-px h-6 bg-hi/15" />
        <Link to="/lab" className="text-[12px] font-mono text-hi hover:text-fg">LABS</Link>
        <div className="hidden lg:block w-px h-6 bg-hi/15" />
        <div className="flex items-center gap-2">
          <Waypoints size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              DESIGN · HOHMANN PLANNER
            </span>
          </span>
        </div>

      </header>

      <div className="absolute bottom-2 lg:top-16 lg:bottom-24 right-2 lg:right-4 left-2 lg:left-auto w-auto lg:w-[340px] z-40 pointer-events-auto max-h-[62vh] lg:max-h-none">
        {panel}
      </div>
    </div>
  )
}
