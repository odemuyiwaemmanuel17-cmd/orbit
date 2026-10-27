import { useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Hourglass } from 'lucide-react'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { orbitMeanAdotKmS, integrateDecayKm } from '../../lib/decay.js'
import { stateToElementsKm } from '../../lib/kepler.js'
import { DENSITY_RANGE_KM } from '../../lib/drag.js'
import { R_EARTH_MEAN_KM } from '../../lib/constants.js'

function Slider({ label, unit, min, max, step, value, onChange, fmt = (v) => v }) {
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-[10px] mb-0.5">
        <span className="text-fg font-semibold">{label}</span>
        <span className="font-mono text-fg tabular-nums">{fmt(value)} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             aria-label={label} className="w-full accent-hi h-5" />
    </div>
  )
}

function DecayChart({ series }) {
  const W = 310, H = 96
  if (series.length < 2) return null
  const tMax = series[series.length - 1].tDays || 1
  const zMax = Math.max(...series.map((s) => s.altApogeeKm), 200)
  const x = (t) => (t / tMax) * W
  const y = (z) => H - Math.min(z / zMax, 1) * (H - 8) - 4
  const line = (key) => series.map((s) => `${x(s.tDays).toFixed(1)},${y(s[key]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mb-1" role="img" aria-label="Decay trajectory">
      <line x1={0} y1={y(120)} x2={W} y2={y(120)} stroke="#FF647C" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />
      <text x={2} y={y(120) - 2} fill="#FF647C" fontSize="6.5">reentry band 120 km</text>
      <polyline points={line('altApogeeKm')} fill="none" stroke="#38D9FF" strokeWidth="1.4" />
      <polyline points={line('altPerigeeKm')} fill="none" stroke="#F5B942" strokeWidth="1.6" />
      <text x={W - 58} y={8} fill="#91A6C2" fontSize="6.5">t = {tMax < 365 ? `${tMax.toFixed(0)} d` : `${(tMax / 365.25).toFixed(1)} yr`}</text>
    </svg>
  )
}

export default function DecayLabPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [hPeri, setHPeri] = useState(400)
  const [hApo, setHApo] = useState(430)
  const [bBallistic, setBBallistic] = useState(100)
  const [stepDays, setStepDays] = useState(4)
  const [liveOrbit, setLiveOrbit] = useState(null)
  const [run, setRun] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  const live = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const posKm = { x: pv.position.x, y: pv.position.y, z: pv.position.z }
    const velKmS = { x: pv.velocity.x, y: pv.velocity.y, z: pv.velocity.z }
    const el = stateToElementsKm({ posKm, velKmS })
    let rate = null
    const altP = el.aKm * (1 - el.e) - R_EARTH_MEAN_KM
    const altA = el.aKm * (1 + el.e) - R_EARTH_MEAN_KM
    if (altP >= DENSITY_RANGE_KM.minKm && altA <= DENSITY_RANGE_KM.maxKm) {
      rate = orbitMeanAdotKmS({ aKm: el.aKm, e: el.e, ballisticCoeffKgM2: bBallistic, steps: 90 })
        .meanAdotKmS * 86400 * 1000
    }
    return { name: rec.meta.name, altP, altA, e: el.e, aKm: el.aKm, rate }
  }, [rec, Math.floor(simMs / 100), bBallistic])

  const preview = useMemo(() => {
    const aKm = (2 * R_EARTH_MEAN_KM + hPeri + hApo) / 2
    const e = (hApo - hPeri) / (2 * aKm)
    if (hApo <= hPeri) return null
    try {
      const m = orbitMeanAdotKmS({ aKm, e, ballisticCoeffKgM2: bBallistic, steps: 90 })
      return { aKm, e, mPerDay: m.meanAdotKmS * 86400 * 1000 }
    } catch (err) { return { err: err.message } }
  }, [hPeri, hApo, bBallistic])

  const runDecay = () => {
    setRunning(true); setError(null)
    setTimeout(() => {
      try {
        const aKm = (2 * R_EARTH_MEAN_KM + hPeri + hApo) / 2
        const e = (hApo - hPeri) / (2 * aKm)
        const r = integrateDecayKm({ aKm0: aKm, e, ballisticCoeffKgM2: bBallistic,
          stepDays, maxDays: 20000, steps: 90, sampleEvery: 10 })
        setRun({ ...r, periAtStart: hPeri, apoAtStart: hApo, capturedMs: simMs })
      } catch (err) {
        setError(err.message)
      } finally { setRunning(false) }
    }, 16)
  }

  const useLive = () => {
    if (!live) return
    setLiveOrbit({ name: live.name, aKm: live.aKm, e: live.e })
    setHPeri(Math.max(120, Math.min(860, live.altP)))
    setHApo(Math.max(121, Math.min(DENSITY_RANGE_KM.maxKm, live.altA)))
  }

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const years = run ? run.lifetimeDays / 365.25 : null
  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Hourglass size={15} className="text-crit" />
          <span className="font-semibold text-fg text-sm">Orbit Decay &amp; Lifetime</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/40 text-cau">
          SIMPLIFIED — MEDIAN ATMOSPHERE
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        RK4 integration of the M15/M16 orbit-averaged decay law on the
        USSA-1976 mean atmosphere. Real lifetimes vary by the same x2–x30
        as solar-cycle density: every number here is an ESTIMATE at solar
        median, never a reentry prediction.
      </p>

      {live && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-mut">{live.name.toUpperCase()} · LIVE</span>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/50 text-cau">
              {live.rate === null ? 'OUTSIDE TABLE RANGE' : `${live.rate.toFixed(1)} m/day`}
            </span>
          </div>
          <div className="text-[10px] font-mono text-fg mt-0.5">
            perigee {live.altP.toFixed(0)} km · apogee {live.altA.toFixed(0)} km · e {live.e.toFixed(4)}
          </div>
          <div className="text-[9px] font-mono text-mut mt-0.5">REAL-TIME — SGP4 elements; decay rate at ASSUMED B = {bBallistic} kg/m²</div>
        </div>
      )}

      <div className="mb-2 flex gap-1.5">
        <button onClick={useLive} disabled={!live}
                className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-cyan-400/40 text-cyan-300 disabled:opacity-40">
          USE LIVE ORBIT
        </button>
        {liveOrbit && (
          <button onClick={() => setLiveOrbit(null)}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-crit/40 text-crit">
            CLEAR {liveOrbit.name.toUpperCase()}
          </button>
        )}
      </div>

      <Slider label="Perigee altitude h_p" unit="km" min={120} max={860} step={5}
              value={hPeri} onChange={(v) => { setLiveOrbit(null); setHPeri(v); if (hApo <= v) setHApo(v + 5) }} />
      <Slider label="Apogee altitude h_a" unit="km" min={125} max={Math.round(DENSITY_RANGE_KM.maxKm)} step={5}
              value={hApo} onChange={(v) => { setLiveOrbit(null); setHApo(Math.max(v, hPeri + 1)) }} />
      <Slider label="Ballistic coefficient B" unit="kg/m²" min={20} max={400} step={5}
              value={bBallistic} onChange={setBBallistic} />
      <div className="text-[9px] font-mono text-mut -mt-1 mb-2">
        representative bands 20–400 · apogee ceiling {DENSITY_RANGE_KM.maxKm} km = tabulated range (no extrapolation)
      </div>

      {preview && !preview.err && (
        <div className="text-[10px] font-mono text-fg mb-2">
          current mean da/dt = <b className="text-cau">{preview.mPerDay.toFixed(2)} m/day</b> at e={preview.e.toFixed(3)}
        </div>
      )}
      {preview?.err && <div className="text-[10px] font-mono text-crit mb-2">{preview.err}</div>}

      <div className="flex items-center gap-2 mb-2">
        <button onClick={runDecay} disabled={running || !preview || !!preview?.err}
                className="flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi disabled:opacity-50">
          {running ? 'INTEGRATING RK4…' : 'INTEGRATE DECAY (ON-DEMAND)'}
        </button>
        <select value={stepDays} onChange={(e) => setStepDays(Number(e.target.value))}
                aria-label="Integration step"
                className="bg-black/30 border border-hi/20 rounded px-1 py-0.5 text-[10px] text-fg">
          {[0.25, 1, 4, 16].map((s) => <option key={s} value={s}>{s} d step</option>)}
        </select>
      </div>
      {error && <div className="text-[10px] font-mono text-crit mb-2">{error}</div>}

      {run && (
        <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-fg leading-relaxed">
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-cyan-300">{liveOrbit ? liveOrbit.name.toUpperCase() : 'TEST ORBIT'}</span>
            <span className="text-crit">{run.terminatedBy === 'REENTRY' ? 'TERMINAL DECAY ENTERED' : 'HORIZON EXPIRED (still orbiting)'}</span>
          </div>
          <DecayChart series={run.series} />
          lifetime to reentry band: <b>{run.lifetimeDays < 365
            ? `${run.lifetimeDays.toFixed(0)} days` : `${years.toFixed(1)} years`}</b>
          {' '}(step {stepDays} d, median atmosphere)<br />
          start {run.periAtStart}×{run.apoAtStart} km → last resolved perigee {run.final.altPerigeeKm.toFixed(0)} km
          <div className="text-mut mt-1">
            x2 denser air (active sun) ≈ halve this; x10 ≈ one tenth. Constant-e simplification
            is slightly optimistic at high e; terminal phase below ~150 km is outside
            the orbit-averaged model.
          </div>
        </div>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">instantaneous (vis-viva energy balance):</div>
          <div>da/dt = −a²·ρ(r)·v³/(μ·B) · 1000, v² = μ(2/r − 1/a)</div>
          <div className="text-cyan-300 mt-2">eccentric averaging (uniform in E, dt ∝ 1−e·cosE):</div>
          <div>⟨da/dt⟩ = (1/2π)∫₀²ᵖⁱ da/dt(E)·(1−e cosE) dE — 90 samples</div>
          <div className="text-cyan-300 mt-2">RK4 step (documented limits: ≤40000 steps, stepDays&gt;0):</div>
          <div>aₙ₊₁ = aₙ + (h/6)(k₁+2k₂+2k₃+k₄), h = {stepDays} d × 86400 s</div>
          <div className="text-cyan-300 mt-2">validated: circular ≡ M15 law to 1e-12; exponential-
          atmosphere analytic root matched to 50 m; lifetime monotone in h_p.</div>
          <div className="text-mut mt-2">ρ anchors: USSA-1976 Part 4 (drag.js). e held constant
          (real e-damping shrinks apogee first). No solar-flux history modeled.</div>
        </div>
      </details>

      <div className="flex gap-2 mt-2 text-[8px] font-mono">
        <span className="text-cau">— perigee altitude</span>
        <span className="text-cyan-300">— apogee altitude</span>
        <span className="text-crit">┄ reentry band</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission />
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
          <Hourglass size={16} className="text-crit" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              ANALYZE · ORBIT DECAY
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
