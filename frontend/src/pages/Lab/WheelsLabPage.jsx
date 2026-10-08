import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Link } from 'react-router-dom'
import { ArrowLeft, Disc3, Play } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { planSlew, integrateSlew, quatRotVec } from '../../lib/wheels.js'

const C_X = '#34d399'; const C_Y = '#22d3ee'; const C_Z = '#f59e0b'; const C_BODY = '#e2e8f0'

function Chart({ title, unit, data, color, limit }) {
  if (!data.length) return null
  const xs = data.map((d) => d.x), ys = data.map((d) => d.y)
  const ymax = Math.max(...ys.map(Math.abs), limit ? Math.abs(limit) * 1.1 : 0, 1e-6)
  const W = 300, H = 64
  const X = (t) => (t / xs[xs.length - 1]) * W
  const Y = (v) => H / 2 - (v / ymax) * (H / 2 - 4)
  const pts = data.map((d) => `${X(d.x).toFixed(1)},${Y(d.y).toFixed(1)}`).join(' ')
  return (
    <div className="rounded-lg border border-emerald-400/15 bg-black/25 p-2 mb-1.5">
      <div className="flex justify-between text-[9px] font-mono text-emerald-600 mb-0.5">
        <span>{title}</span><span>±{ymax.toFixed(ymax < 2 ? 2 : 0)} {unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#1f3a2c" strokeWidth="0.6" />
        {limit && <line x1={0} x2={W} y1={Y(limit)} y2={Y(limit)} stroke="#f87171" strokeDasharray="4 3" strokeWidth="0.7" />}
        {limit && <line x1={0} x2={W} y1={Y(-limit)} y2={Y(-limit)} stroke="#f87171" strokeDasharray="4 3" strokeWidth="0.7" />}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" />
      </svg>
    </div>
  )
}

function BenchScene({ sample, satPct }) {
  if (!sample) return <group />
  const q = sample.q
  const L = 0.34
  const bodyTip = (local, len) => quatRotVec(q, local).map((c) => c * len)
  const col = satPct > 100 ? '#f87171' : C_BODY
  return (
    <group>
      {/* bench inertial triad (fixed) */}
      <Line points={[[0, 0, 0], [L, 0, 0]]} color={C_X} lineWidth={1.2} transparent opacity={0.4} toneMapped={false} />
      <Line points={[[0, 0, 0], [0, L, 0]]} color={C_Y} lineWidth={1.2} transparent opacity={0.4} toneMapped={false} />
      <Line points={[[0, 0, 0], [0, 0, L]]} color={C_Z} lineWidth={1.2} transparent opacity={0.4} toneMapped={false} />
      {/* bus body frame (rotates) */}
      <Line points={[[0, 0, 0], bodyTip([1, 0, 0], L * 0.8)]} color={col} lineWidth={2} transparent opacity={0.95} toneMapped={false} />
      <Line points={[[0, 0, 0], bodyTip([0, 1, 0], L * 0.8)]} color={col} lineWidth={2} transparent opacity={0.95} toneMapped={false} />
      <Line points={[[0, 0, 0], bodyTip([0, 0, 1], L)]} color={col} lineWidth={2.4} transparent opacity={0.95} toneMapped={false} />
      <mesh quaternion={new THREE.Quaternion(q[1], q[2], q[3], q[0])}>
        <boxGeometry args={[0.07, 0.09, 0.055]} />
        <meshStandardMaterial color="#0b3324" emissive="#064e3b" emissiveIntensity={0.6} metalness={0.2} roughness={0.6} />
      </mesh>
    </group>
  )
}

export default function WheelsLabPage() {
  const engine = useEngine()
  const [axis, setAxis] = useState(2)
  const [angleDeg, setAngle] = useState(30)
  const [Ibody, setIbody] = useState(100)
  const [Iwheel, setIwheel] = useState(0.1)
  const [torque, setTorque] = useState(0.05)
  const [limit, setLimit] = useState(2)
  const [run, setRun] = useState(null)
  const [running, setRunning] = useState(false)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const drag = useRef(null)

  const plan = useMemo(() => {
    try { return planSlew({ angleDeg, axis, IbodyKgMm2: Ibody, IwheelKgMm2: Iwheel, torqueNm: torque }) }
    catch { return null }
  }, [angleDeg, axis, Ibody, Iwheel, torque])
  const satPct = plan ? (plan.hWheelAbsPeakNms / limit) * 100 : 0

  const simulate = async () => {
    if (!plan) return
    setRunning(true)
    await new Promise((r) => setTimeout(r, 16))
    try {
      const samples = integrateSlew(plan, { IbodyKgMm2: Ibody, IwheelKgMm2: Iwheel })
      setRun({ samples, plan })
      setIdx(0); setPlaying(true)
    } finally { setRunning(false) }
  }

  useEffect(() => {
    if (!playing || !run) return
    const id = setInterval(() => setIdx((i) => (i + 1) % run.samples.length), 30)
    return () => clearInterval(id)
  }, [playing, run])

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const Num = ({ label, unit, value, onChange, step = 1, min, max }) => (
    <label className="flex items-center justify-between gap-2 text-[10px] font-mono py-0.5">
      <span className="text-emerald-300 flex-1">{label}</span>
      <input type="number" value={value} step={step} min={min} max={max}
             onChange={(e) => onChange(Number(e.target.value))}
             className="w-20 bg-black/30 border border-emerald-400/20 rounded px-1.5 py-0.5 text-emerald-50 tabular-nums text-right" />
      <span className="text-emerald-600 w-12">{unit}</span>
    </label>
  )

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Disc3 size={15} className="text-emerald-400" />
          <span className="font-semibold text-emerald-50 text-sm">Reaction Wheels</span>
        </div>
        <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${satPct > 100 ? 'border-red-400/50 text-red-300' : 'border-emerald-400/40 text-emerald-300'}`}>
          {satPct > 100 ? 'WHEEL SATURATES' : `MOMENTUM ${satPct.toFixed(0)}% OF LIMIT`}
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-2">
        BENCH MODEL — short maneuver, frame held inertial (orbit-rate reality is M11).
        Bus + wheels only: no gravity-gradient, no friction. Integrator: fixed-step RK4
        (dt 0.02 s), segment-aligned to command corners, quaternion renormalized per step.
      </p>

      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-emerald-200 font-semibold">Slew about body axis</span>
          <span className="flex gap-1.5 font-mono">
            {['ROLL X', 'PITCH Y', 'YAW Z'].map((lbl, i) => (
              <button key={lbl} onClick={() => setAxis(i)}
                      className={`px-1.5 py-0.5 rounded border text-[9px] ${axis === i ? 'border-cyan-400/60 text-cyan-300' : 'border-emerald-400/20 text-emerald-600'}`}>
                {lbl}
              </button>
            ))}
          </span>
        </div>
        <input type="range" min={5} max={60} step={1} value={angleDeg}
               onChange={(e) => setAngle(Number(e.target.value))}
               className="w-full accent-emerald-400" aria-label="Slew angle" />
        <div className="flex justify-between text-[10px] font-mono text-emerald-50">
          <span>angle</span><span>{angleDeg}°</span>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-400/15 bg-black/25 px-3 py-1.5 mb-2">
        <Num label="Bus inertia I" unit="kg·m²" value={Ibody} onChange={setIbody} step={5} min={1} />
        <Num label="Wheel inertia Iw" unit="kg·m²" value={Iwheel} onChange={setIwheel} step={0.01} min={0.001} />
        <Num label="Wheel torque τ" unit="N·m" value={torque} onChange={setTorque} step={0.01} min={0.001} />
        <Num label="Momentum limit" unit="N·m·s" value={limit} onChange={setLimit} step={0.5} min={0.1} />
      </div>

      {plan && (
        <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-emerald-200 leading-relaxed">
          ramp t₁ = √(θ(I+Iw)/τ) = <b>{plan.t1.toFixed(1)} s</b> · maneuver {plan.durSec.toFixed(1)} s<br />
          peak body rate {plan.omegaPeakDps.toFixed(2)} °/s · peak wheel {(plan.wheelRpmPeak).toFixed(0)} rpm<br />
          peak wheel momentum <b className={satPct > 100 ? 'text-red-400' : 'text-emerald-100'}>
            {plan.hWheelAbsPeakNms.toFixed(2)} N·m·s</b> = {satPct.toFixed(0)}% of {limit} ·
          k = Iw/(I+Iw) = {(Iwheel / (Ibody + Iwheel)).toExponential(2)}
        </div>
      )}

      <button onClick={simulate} disabled={running || !plan}
              className="w-full mb-2 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-50">
        {running ? 'INTEGRATING…' : 'RUN SIMULATION (RK4)'}
      </button>

      {run && (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <button onClick={() => { setIdx(0); setPlaying(true) }}
                    className="p-1 rounded bg-black/30 border border-emerald-400/20 text-cyan-300">
              <Play size={12} />
            </button>
            <input type="range" min={0} max={run.samples.length - 1} value={idx}
                   onChange={(e) => { setIdx(Number(e.target.value)); setPlaying(false) }}
                   className="flex-1 accent-emerald-400" aria-label="Timeline" />
            <span className="font-mono text-[10px] text-emerald-100 tabular-nums w-12 text-right">
              {run.samples[idx].tSec.toFixed(1)} s
            </span>
          </div>
          <div className="rounded-lg border border-emerald-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-emerald-100">
            θ {run.samples[idx].angleDeg.toFixed(2)}° · ω {run.samples[idx].bodyRateDps.toFixed(3)} °/s ·
            wheel {run.samples[idx].wheelRpm.toFixed(0)} rpm · H_tot {run.samples[idx].totalMomNms.toExponential(1)} N·m·s
          </div>
          <Chart title="BODY ANGLE" unit="deg" color="#e2e8f0" limit={null}
                 data={run.samples.map((s) => ({ x: s.tSec, y: s.angleDeg }))} />
          <Chart title="WHEEL SPEED (relative)" unit="rpm" color="#f59e0b" limit={null}
                 data={run.samples.map((s) => ({ x: s.tSec, y: s.wheelRpm }))} />
          <Chart title="MOMENTUM — wheel abs vs bus" unit="N·m·s" color="#34d399" limit={limit}
                 data={run.samples.map((s) => ({ x: s.tSec, y: s.wheelAbsMomNms }))} />
          <div className="flex justify-between text-[8px] font-mono text-emerald-700 mb-1">
            <span className="text-emerald-400">— wheel |bus| mirrored</span>
            <span className="text-red-400">┄ ±{limit} N·m·s wheel limit</span>
          </div>
          {satPct > 100 && (
            <div className="text-[9px] font-mono text-red-300 live-dot mb-1.5">
              ⚠ required momentum exceeds the wheel — slew would STOP EARLY. Fix: derate
              angle, add momentum dumping (desat), or a bigger wheel. (This run ignores
              the saturation limit to show the physics.)
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission overlay={
        <group position={[0, 1.7, 0]} scale={0.8}>
          <BenchScene sample={run?.samples[idx]} satPct={satPct} />
        </group>
      } />
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
          <Disc3 size={16} className="text-emerald-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-emerald-300 align-middle">
              ANALYZE · REACTION WHEELS
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
