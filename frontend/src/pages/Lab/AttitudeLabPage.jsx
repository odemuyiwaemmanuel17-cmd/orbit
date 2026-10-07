import { useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import * as THREE from 'three'
import { Link } from 'react-router-dom'
import { ArrowLeft, Axis3d } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { stateToElementsKm, periodSec } from '../../lib/kepler.js'
import { lvlhBasisEciKm, bodyAxesEciKm, angleBetweenDeg } from '../../lib/attitude.js'

const C_X = '#34d399' // along-track (roll axis, flight)
const C_Y = '#22d3ee' // wheel axis (-orbit normal)
const C_Z = '#f59e0b' // nadir (yaw/boresight)
const C_BODY = '#f8fafc'

function FrameOverlay({ posKm, velKmS, gmst, ypr, inertialHold }) {
  let basis
  try { basis = lvlhBasisEciKm(posKm, velKmS) } catch { return null }
  const origin = eciToSceneKm(posKm.x, posKm.y, posKm.z, gmst, new THREE.Vector3())
  const arrow = (vecEci, color, len, dashed) => {
    const tip = eciToSceneKm(posKm.x + vecEci[0] * len * 6371, posKm.y + vecEci[1] * len * 6371,
      posKm.z + vecEci[2] * len * 6371, gmst, new THREE.Vector3())
    return <Line key={`${color}${len}${dashed ? 'd' : ''}`} points={[origin.toArray(), tip.toArray()]}
                 color={color} lineWidth={dashed ? 1 : 2} dashed={!!dashed} dashSize={0.02}
                 gapSize={0.015} transparent opacity={dashed ? 0.65 : 0.95} toneMapped={false} />
  }
  const L = 0.3
  // In inertial-hold mode the BODY keeps its ECI orientation (frozen at the
  // moment HOLD was pressed); nadir-pointing mode uses live attitude sliders.
  const body = inertialHold ? inertialHold : bodyAxesEciKm(basis, ypr)
  return (
    <group>
      {arrow(basis.x, C_X, L)}
      {arrow(basis.y, C_Y, L)}
      {arrow(basis.z, C_Z, L)}
      {arrow(body[0], C_BODY, L * 0.72, true)}
      {arrow(body[1], C_BODY, L * 0.72, true)}
      {arrow(body[2], C_BODY, L * 0.9, true)}
      <mesh position={origin.toArray()}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshBasicMaterial color="#e2e8f0" toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function AttitudeLabPage() {
  const engine = useEngine()
  const [ypr, setYpr] = useState([0, 0, 0])
  const [hold, setHold] = useState(null) // frozen body axes (ECI) or null
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null
  const simMs = engine.simMs
  const state = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    return { posKm: { ...pv.position }, velKmS: { ...pv.velocity } }
  }, [rec, Math.floor(simMs / 100)])

  const info = useMemo(() => {
    if (!state) return null
    try {
      const basis = lvlhBasisEciKm(state.posKm, state.velKmS)
      const el = stateToElementsKm(state)
      const body = hold ?? bodyAxesEciKm(basis, ypr)
      return { basis, el, body, nadirErrDeg: angleBetweenDeg(body[2], basis.z),
        orbitRateDegMin: 360 / periodSec(el.aKm) * 60 }
    } catch { return null }
  }, [state, ypr, hold])

  const gmst = useMemo(() => (state ? sm.gstime(new Date(simMs)) : 0),
    [state, Math.floor(simMs / 100)])

  const setAxis = (i) => (v) => { const n = [...ypr]; n[i] = v; setYpr(n); setHold(null) }

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const Slider = ({ label, value, onChange, min, max, color }) => (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-[10px] mb-0.5">
        <span className="font-semibold" style={{ color }}>{label}</span>
        <span className="font-mono text-emerald-50 tabular-nums">{value.toFixed(1)}°</span>
      </div>
      <input type="range" min={min} max={max} step={0.5} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             className="w-full accent-emerald-400 h-5" aria-label={label} />
    </div>
  )

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Axis3d size={15} className="text-emerald-400" />
          <span className="font-semibold text-emerald-50 text-sm">Attitude Frames</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-emerald-400/40 text-emerald-300">
          REAL-TIME PROPAGATION
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-3">
        LVLH (solid): x along-track, y = z×x (−orbit normal), z nadir — RWFS axes.
        Body (dashed white) = yaw about nadir, pitch about y, roll about x (intrinsic
        Z-Y-X). Geometry only: wheel dynamics are M12, sun-pointing arrives with M13.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {[['NADIR POINT', [0, 0, 0]], ['YAW 180 (RETRO)', [180, 0, 0]],
          ['PITCH OVER 30', [0, 30, 0]], ['ROLL 90', [0, 0, 90]]].map(([lbl, v]) => (
          <button key={lbl} onClick={() => setAxisAll(v)}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-emerald-400/20 text-emerald-300 hover:bg-emerald-400/10">
            {lbl}
          </button>
        ))}
        <button onClick={toggleHold}
                className={`px-2 py-0.5 rounded-full text-[9px] font-mono border ${hold ? 'border-cyan-400/60 text-cyan-300' : 'border-emerald-400/20 text-emerald-300'}`}>
          {hold ? '● INERTIAL HOLD' : 'INERTIAL HOLD'}
        </button>
      </div>

      {info && (
        <>
          <Slider label="Yaw ψ (about nadir z)" value={ypr[0]} min={-180} max={180}
                  color={C_Z} onChange={setAxis(0)} />
          <Slider label="Pitch θ (about wheel y)" value={ypr[1]} min={-90} max={90}
                  color={C_Y} onChange={setAxis(1)} />
          <Slider label="Roll φ (about flight x)" value={ypr[2]} min={-180} max={180}
                  color={C_X} onChange={setAxis(2)} />

          <div className="rounded-lg border border-emerald-400/25 bg-black/30 px-3 py-2 mb-3 font-mono text-[11px] text-emerald-100 flex justify-between">
            <span>NADIR ANGLE</span>
            <span className="text-cyan-300 tabular-nums">{info.nadirErrDeg.toFixed(2)}°</span>
          </div>
          <div className="rounded-lg border border-amber-400/25 bg-black/25 px-3 py-2 mb-3 text-[9px] leading-relaxed text-amber-200/90">
            {hold
              ? `INERTIAL HOLD ON — the body keeps its frozen ECI orientation while the LVLH frame rotates under it at the orbit rate ≈ ${info.orbitRateDegMin.toFixed(3)}°/min (one full turn per orbit). The solid and dashed frames diverge: nadir pointing is a MOTION, not a setting.`
              : 'Nadir-pointed spacecraft must rotate continuously about the orbit normal at exactly the orbit rate — press INERTIAL HOLD to freeze the body in space and watch the LVLH frame drift away from it.'}
          </div>

          <details>
            <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
            <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-200">
              <div className="text-cyan-300">LVLH Gram-Schmidt from ECI state (SGP4)</div>
              <div>ẑ = −r̂ · x̂ = normalize(v − (v·r̂)r̂) · ŷ = ẑ×x̂</div>
              <div>r = ({state.posKm.x.toFixed(1)}, {state.posKm.y.toFixed(1)}, {state.posKm.z.toFixed(1)}) km</div>
              <div>v = ({state.velKmS.x.toFixed(3)}, {state.velKmS.y.toFixed(3)}, {state.velKmS.z.toFixed(3)}) km/s</div>
              <div className="text-cyan-300 mt-1.5">body→LVLH R = Rz(ψ)Ry(θ)Rx(φ)</div>
              <div>ψ {ypr[0].toFixed(1)}° θ {ypr[1].toFixed(1)}° φ {ypr[2].toFixed(1)}°</div>
              <div>nadir angle = acos(ẑ_body·ẑ_LVLH) = {info.nadirErrDeg.toFixed(3)}°</div>
              <div className="mt-1.5 text-emerald-700">a = {info.el.aKm.toFixed(0)} km · e = {info.el.e.toFixed(4)} —
                orbit rate n = √(μ/a³) expressed in °/min.</div>
            </div>
          </details>
        </>
      )}
    </div>
  )

  function setAxisAll(v) { setYpr(v); setHold(null) }
  function toggleHold() {
    if (hold) { setHold(null); return }
    if (!info) return
    setHold(info.body.map((a) => [...a]))
  }

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission
        lab={info ? { elements: stateToElementsKm(state), options: {
          lineColor: '#10b981', opacity: 0.35, hideSat: true,
          showMarkers: false, showConstruction: false, showEquatorial: false },
          simMs } : null}
        overlay={state && info ? <FrameOverlay posKm={state.posKm} velKmS={state.velKmS} gmst={gmst}
                                               ypr={ypr} inertialHold={hold} /> : <group />} />
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
          <Axis3d size={16} className="text-emerald-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-emerald-300 align-middle">
              ANALYZE · ATTITUDE
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
