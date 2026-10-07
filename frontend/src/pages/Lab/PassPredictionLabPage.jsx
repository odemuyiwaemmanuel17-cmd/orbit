import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { StationLayer } from './GroundStationLabPage.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { loadStations } from '../../lib/stations.js'
import { predictSchedule, elevationCurve, utcHm, passAgeLabel, PASS_CAP } from '../../lib/passes.js'

function ElevCurve({ rec, pass, stepS }) {
  const curve = useMemo(() => elevationCurve(rec,
    { id: pass.stationId, name: pass.stationName,
      latDeg: pass.latDeg, lonDeg: pass.lonDeg, minElevDeg: pass.maskDeg },
    pass.rise - 10 * 60000, pass.set + 10 * 60000, stepS),
  [rec, pass, stepS])
  if (!curve.samples.length) return null
  const W = 300, H = 110, lo = -15, hi = 92
  const x = (t) => ((t - (pass.rise - 10 * 60000)) / (pass.set - pass.rise + 20 * 60000)) * W
  const y = (e) => H - ((Math.max(lo, Math.min(hi, e)) - lo) / (hi - lo)) * H
  const pts = curve.samples.map((s) => `${x(s.tMs).toFixed(1)},${y(s.elevDeg).toFixed(1)}`).join(' ')
  const mask = pass.maskDeg
  return (
    <div className="rounded-lg border border-cyan-400/20 bg-black/25 p-2.5">
      <div className="flex justify-between text-[9px] font-mono text-emerald-600 mb-1">
        <span>ELEVATION vs TIME · AOS−10m → LOS+10m</span>
        <span>peak {curve.peak.elevDeg.toFixed(1)}°</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={0} x2={W} y1={y(mask)} y2={y(mask)} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth="0.8" />
        <line x1={x(pass.rise)} x2={x(pass.rise)} y1={0} y2={H} stroke="#22d3ee" strokeWidth="0.5" opacity="0.5" />
        <line x1={x(pass.set)} x2={x(pass.set)} y1={0} y2={H} stroke="#22d3ee" strokeWidth="0.5" opacity="0.5" />
        <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="1.4" />
        <circle cx={x(curve.peak.tMs)} cy={y(curve.peak.elevDeg)} r="2.5" fill="#a3e635" />
        <text x={x(pass.rise) + 2} y={y(mask) - 3} fontSize="7" fill="#f59e0b">mask {mask}°</text>
      </svg>
      <div className="flex justify-between text-[8px] font-mono text-emerald-700 mt-0.5">
        <span>{utcHm(pass.rise - 10 * 60000)}</span><span>UTC · curve step {stepS} s</span>
        <span>{utcHm(pass.set + 10 * 60000)}</span>
      </div>
    </div>
  )
}

export default function PassPredictionLabPage() {
  const engine = useEngine()
  const [stations] = useState(() => loadStations(window.localStorage))
  const [enabled, setEnabled] = useState(() => new Set(stations.map((s) => s.id)))
  const [hours, setHours] = useState(12)
  const [stepS, setStepS] = useState(30)
  const [res, setRes] = useState(null)
  const [running, setRunning] = useState(false)
  const [openPass, setOpenPass] = useState(null)
  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const drag = useRef(null)

  const rec = satId ? engine.recordFor(satId)?.rec ?? null : null
  const satName = satId ? engine.recordFor(satId)?.meta?.name ?? '' : ''

  const run = async () => {
    if (!rec) return
    setRunning(true)
    setOpenPass(null)
    const t0 = engine.simMs
    const active = stations.filter((s) => enabled.has(s.id))
    // yield one frame so the spinner paints before the sweep
    await new Promise((r) => setTimeout(r, 16))
    try {
      setRes(predictSchedule(rec, active, t0, hours, stepS))
    } finally {
      setRunning(false)
    }
  }

  const toggle = (id) => setEnabled((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const openRow = res?.schedule.find((p) => `${p.stationId}-${p.rise}` === openPass) ?? null

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <CalendarClock size={15} className="text-emerald-400" />
          <span className="font-semibold text-emerald-50 text-sm">Pass Schedule</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-emerald-400/40 text-emerald-300">
          SGP4 REAL-TIME PROPAGATION
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-3">
        Same validated pipeline as Mission Control (TLE → SGP4 → look angles),
        run per station against its min-elevation mask. Times resolve on the
        ±{stepS}s search grid; the schedule was computed at {res ? utcHm(res.t0Ms) : '—'} UTC
        and is cached until you re-run. {satName ? `Watching ${satName.toUpperCase()}.` : ''}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {stations.map((s) => (
          <button key={s.id} onClick={() => toggle(s.id)}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono border
                    ${enabled.has(s.id) ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10'
                                         : 'border-emerald-400/15 text-emerald-700'}`}>
            {s.name.toUpperCase()} ≥{s.minElevDeg}°
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
                className="bg-black/30 border border-emerald-400/20 rounded px-1.5 py-1 text-[11px] text-emerald-200">
          {[6, 12, 24].map((h) => <option key={h} value={h}>{h} h window</option>)}
        </select>
        <select value={stepS} onChange={(e) => setStepS(Number(e.target.value))}
                className="bg-black/30 border border-emerald-400/20 rounded px-1.5 py-1 text-[11px] text-emerald-200">
          {[30, 60].map((v) => <option key={v} value={v}>{v} s grid</option>)}
        </select>
        <button onClick={run} disabled={running || !rec}
                className="ml-auto px-3 py-1 rounded-md text-[11px] font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-50">
          {running ? 'PREDICTING…' : 'PREDICT'}
        </button>
      </div>

      {res && (
        <div className="text-[9px] font-mono text-emerald-600 mb-2">
          {res.schedule.length} passes over {res.perStation.length} stations
          {res.capped ? ` · a station hit the ${PASS_CAP}-pass/window cap` : ''} · grid ±{res.stepS}s
        </div>
      )}

      <div className="space-y-1.5">
        {(res?.schedule ?? []).map((p) => {
          const key = `${p.stationId}-${p.rise}`
          const open = openPass === key
          const st = stations.find((s) => s.id === p.stationId)
          const row = { ...p, latDeg: st?.latDeg, lonDeg: st?.lonDeg, maskDeg: st?.minElevDeg ?? 10 }
          return (
            <button key={key} onClick={() => setOpenPass(open ? null : key)}
                    className={`w-full text-left rounded-lg px-3 py-2 border transition
                      ${open ? 'border-cyan-400/50 bg-cyan-400/[0.06]' : 'border-emerald-400/10 bg-black/25'}`}>
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold text-emerald-100">{p.stationName}</span>
                <span className={`font-mono tabular-nums ${p.rise > engine.simMs ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  {passAgeLabel(p.rise, engine.simMs)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-emerald-500 mt-0.5 tabular-nums">
                <span>AOS {utcHm(p.rise)} → TCA {utcHm(p.max)} → LOS {utcHm(p.set)}</span>
                <span className="text-cyan-300">{p.maxElev.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between text-[9px] font-mono text-emerald-700 mt-0.5">
                <span>az {p.azMax.toFixed(0)}° at TCA · {Math.round(p.durationS / 60)} min arc</span>
                <span>{open ? 'HIDE CURVE' : 'ELEVATION CURVE'}</span>
              </div>
              {open && <div className="mt-2" onClick={(e) => e.stopPropagation()}><ElevCurve rec={rec} pass={row} stepS={20} /></div>}
            </button>
          )
        })}
        {res && !res.schedule.length && (
          <div className="text-[10px] font-mono text-emerald-700 py-2">
            NO PASS ABOVE MASKS in this window — widen hours, lower a mask, or pick another satellite.
          </div>
        )}
      </div>

      <details className="mt-3">
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW METHOD</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-200">
          <div>1. propagate(rec, t) → ECI → geodetic (sub-sat point + altitude)</div>
          <div>2. elev(t) = atan2(up·d, |horiz d|) from station ENU basis (spherical R⊕)</div>
          <div>3. walk t on {stepS}s grid, bracket elev ≥ mask intervals</div>
          <div>4. report AOS / TCA(argmax elev) / LOS · cap {PASS_CAP} per station</div>
          <div className="mt-1 text-emerald-700">Mirror of backend /api/satellites/{'{id}'}/passes; identical
            bracketing semantics including window-edge closing.</div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission overlay={<StationLayer stations={stations} selectedId={openRow?.stationId} />} />
      <div className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
           onPointerDown={onPointerDown} onPointerMove={onPointerMove}
           onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />

      <header className="absolute top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#04120b]/85 backdrop-blur-md border-b border-emerald-400/15">
        <Link to="/tracker" className="flex items-center gap-2 text-emerald-300 hover:text-emerald-200 text-[12px] font-mono">
          <ArrowLeft size={14} /> TRACKER
        </Link>
        <div className="w-px h-6 bg-emerald-400/15" />
        <Link to="/lab" className="text-[12px] font-mono text-emerald-400 hover:text-emerald-200">LABS</Link>
        <div className="w-px h-6 bg-emerald-400/15" />
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-emerald-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-emerald-300 align-middle">
              ANALYZE · PASS PREDICTION
            </span>
          </span>
        </div>
      </header>

      <div className="absolute bottom-2 lg:top-16 lg:bottom-6 right-2 lg:right-4 left-2 lg:left-auto w-auto lg:w-[360px] z-40 pointer-events-auto max-h-[62vh] lg:max-h-none">
        {panel}
      </div>
    </div>
  )
}
