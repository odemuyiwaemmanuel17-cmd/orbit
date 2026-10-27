import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Wind } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import {
  densityKgM3, scaleHeightKm, dragAccelKmS2, circularDecayRateKmPerDay,
  dragPowerPerKgMWm2, DENSITY_RANGE_KM, USSA1976_RHO,
} from '../../lib/drag.js'
import { R_EARTH_MEAN_KM, MU_EARTH_KM3S2, OMEGA_EARTH_RADS } from '../../lib/constants.js'

const DRAG_COLOR = '#FF647C'

/** Two-point finite-difference direction into scene (same contract as the
 *  lab axes overlay: GMST rotation is linear, radial compression is not). */
function sceneDirAt(posKm, dirKm, gmst, out) {
  const eps = 50 // km
  const a = eciToSceneKm(posKm.x, posKm.y, posKm.z, gmst, new THREE.Vector3())
  const b = eciToSceneKm(posKm.x + dirKm.x * eps, posKm.y + dirKm.y * eps, posKm.z + dirKm.z * eps, gmst, new THREE.Vector3())
  return out.subVectors(b, a).normalize()
}

function DragOverlay({ live, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  if (!live) return null
  const posScene = eciToSceneKm(live.posKm.x, live.posKm.y, live.posKm.z, gmst, new THREE.Vector3())
  const vDir = new THREE.Vector3(-live.vRelKmS.x, -live.vRelKmS.y, -live.vRelKmS.z)
  const d = sceneDirAt(live.posKm, vDir, gmst, new THREE.Vector3())
  const len = 0.05 + Math.min(0.35, Math.log10(live.dragMs2 * 1e9) * 0.06)
  return (
    <group>
      <Line points={[posScene.toArray(), posScene.clone().add(d.clone().multiplyScalar(len)).toArray()]}
            color={DRAG_COLOR} lineWidth={3} transparent opacity={0.9} toneMapped={false} />
      <mesh position={posScene.toArray()}>
        <sphereGeometry args={[0.012, 10, 10]} />
        <meshBasicMaterial color={DRAG_COLOR} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** log10 density profile sparkline, 100-860 km, current altitude marker. */
function DensitySpark({ altKm }) {
  const W = 300, H = 74
  const lo = DENSITY_RANGE_KM.minKm, hi = DENSITY_RANGE_KM.maxKm
  const lgLo = -15.2, lgHi = -6.2
  const pts = useMemo(() => {
    const p = []
    for (let z = lo; z <= hi; z += 20) {
      const x = ((z - lo) / (hi - lo)) * W
      const y = H - ((Math.log10(densityKgM3(z)) - lgLo) / (lgHi - lgLo)) * H
      p.push(`${x.toFixed(1)},${y.toFixed(1)}`)
    }
    return p.join(' ')
  }, [])
  const mx = ((Math.min(Math.max(altKm, lo), hi) - lo) / (hi - lo)) * W
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[74px] mb-1" role="img" aria-label="Density profile">
      <polyline points={pts} fill="none" stroke="#38D9FF" strokeWidth="1.4" opacity="0.8" />
      <line x1={mx} y1={0} x2={mx} y2={H} stroke="#FF647C" strokeWidth="1" strokeDasharray="3 2" />
      <text x="3" y="10" fill="#91A6C2" fontSize="7">rho kg/m³ (log)</text>
      <text x={mx + 3} y={H - 3} fill="#FF647C" fontSize="7">{altKm.toFixed(0)} km</text>
    </svg>
  )
}

function Slider({ label, unit, min, max, step, value, onChange, fmt = (v) => v, disabled }) {
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-[10px] mb-0.5">
        <span className="text-fg font-semibold">{label}</span>
        <span className="font-mono text-fg tabular-nums">{fmt(value)} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
             onChange={(e) => onChange(Number(e.target.value))}
             aria-label={label} className="w-full accent-hi h-5 disabled:opacity-40" />
    </div>
  )
}

export default function DragLabPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [altKm, setAltKm] = useState(420)
  const [betaBallistic, setBetaBallistic] = useState(100) // B kg/m^2 (assumed)
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  const live = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const posKm = { x: pv.position.x, y: pv.position.y, z: pv.position.z }
    const velKmS = { x: pv.velocity.x, y: pv.velocity.y, z: pv.velocity.z }
    try {
      const d = dragAccelKmS2({ posKm, velKmS, ballisticCoeffKgM2: betaBallistic })
      return { name: rec.meta.name, posKm, velKmS, ...d }
    } catch {
      return { name: rec.meta.name, posKm, velKmS, outOfRange: true }
    }
  }, [rec, Math.floor(simMs / 100), betaBallistic])

  const test = useMemo(() => {
    const aKm = R_EARTH_MEAN_KM + altKm
    const rho = densityKgM3(altKm)
    const H = scaleHeightKm(altKm)
    const decay = circularDecayRateKmPerDay({ aKm, ballisticCoeffKgM2: betaBallistic })
    const vKmS = Math.sqrt(MU_EARTH_KM3S2 / aKm)
    const vRelMps = (vKmS - OMEGA_EARTH_RADS * aKm) * 1000
    return { aKm, rho, H, decay, vKmS,
      pPerKg: dragPowerPerKgMWm2({ vRelMps, densityKgM3: rho }),
      accel: dragAccelKmS2({ posKm: { x: aKm, y: 0, z: 0 },
        velKmS: { x: 0, y: vKmS, z: 0 }, ballisticCoeffKgM2: betaBallistic }).dragMs2 }
  }, [altKm, betaBallistic])

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Wind size={15} className="text-crit" />
          <span className="font-semibold text-fg text-sm">Atmospheric Drag</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/40 text-cau">
          SIMPLIFIED — MEAN ATMOSPHERE
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        Density from the U.S. Standard Atmosphere 1976 tabulated model
        (NOAA/NRL Part 4, {USSA1976_RHO.length} anchors, log-linear interpolation —
        sources in lib/drag.js). Real thermospheric density swings x2–x30 with
        the solar F10.7 cycle: NOT modeled here, and we do not pretend
        otherwise. Atmosphere co-rotates; wind ignored.
      </p>

      {live && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-mut">{live.name.toUpperCase()} · LIVE</span>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-crit/50 text-crit">
              {live.outOfRange ? 'ALTITUDE OUT OF TABLE RANGE' : `${(live.dragMs2 * 1e6).toFixed(2)} µm/s²`}
            </span>
          </div>
          {!live.outOfRange && (
            <div className="text-[10px] font-mono text-fg tabular-nums mt-0.5 leading-relaxed">
              alt {live.altKm.toFixed(1)} km · ρ {live.densityKgM3.toExponential(2)} kg/m³<br />
              v_rel {live.vRelMps.toFixed(0)} m/s (corotation {(OMEGA_EARTH_RADS * Math.hypot(live.posKm.x, live.posKm.y) ).toFixed(3)} km/s)<br />
              a_drag {(live.dragMs2 * 1e9).toFixed(2)} nm/s² opposing velocity vector ↓
            </div>
          )}
          <div className="text-[9px] font-mono text-mut mt-0.5">
            REAL-TIME PROPAGATION — SGP4 position every tick; B = {betaBallistic} kg/m² ASSUMED (catalogs carry no ballistic data)
          </div>
        </div>
      )}

      <Slider label="Test altitude" unit="km" min={Math.round(DENSITY_RANGE_KM.minKm)}
              max={Math.round(DENSITY_RANGE_KM.maxKm)} step={1} value={altKm} onChange={setAltKm} />
      <Slider label="Ballistic coefficient B = m/(Cd·A)" unit="kg/m²" min={20} max={400}
              step={5} value={betaBallistic} onChange={setBetaBallistic} />
      <div className="text-[9px] font-mono text-mut -mt-1 mb-2">
        dense box 20–60 · typical satellite 60–150 · heavy/sleek (high-B) 150–400 — representative bands, not mission data
      </div>

      <DensitySpark altKm={altKm} />

      <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-fg leading-relaxed">
        ρ = {test.rho.toExponential(3)} kg/m³ · H = {test.H.toFixed(1)} km scale height<br />
        v_circ = {test.vKmS.toFixed(3)} km/s · P_diss = <b>{test.pPerKg.toFixed(3)} W/kg</b><br />
        a_drag = <b className="text-crit">{(test.accel * 1e6).toFixed(2)} µm/s²</b> ({(test.accel / 9.80665 * 1e9).toFixed(2)} nm/s² = {(test.accel / 9.80665 * 1e6).toFixed(3)} µg)<br />
        da/dt = <b className="text-cau">{(test.decay.dadtKmPerDay * 1000).toFixed(1)} m/day</b> at a = {test.aKm.toFixed(0)} km
        <div className="text-mut mt-1">circular-orbit mean; eccentric perigee pumping is M16's scope</div>
      </div>

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">F_d/m = ½·ρ·v_rel²/B (Cd·A folded into B)</div>
          <div>v_rel = v − ω⊕×r; ω⊕ = {OMEGA_EARTH_RADS.toExponential(3)} rad/s (constants.js, IAU-76)</div>
          <div className="text-cyan-300 mt-2">Energy loss ⇒ da/dt (vis-viva chain):</div>
          <div>E = −μ/2a; dE/dt = −½ρv³/B; v² = μ/a ⇒ <b>da/dt = −√(μ·a)·ρ/B</b></div>
          <div>= −√({MU_EARTH_KM3S2}·{test.aKm.toFixed(0)})·({test.rho.toExponential(3)}/{betaBallistic})·1000 m⁻¹→km⁻¹</div>
          <div>= {(test.decay.dadtKmPerDay).toExponential(3)} km/s×86400 = {(test.decay.dadtKmPerDay * 1000).toFixed(1)} m/day</div>
          <div className="text-mut mt-2">
            Disclosed simplifications: solar-median USSA-1976 only (F10.7/Ap
            ignored — at 400 km real ρ can be x3-10 above this), rigid
            corotation, no winds, constant B, circular averaging. Anchors:
            US SA 1976 Part 4 (st76-1562 NOAA), 98.5–864.1 km geometric.
          </div>
        </div>
      </details>

      <div className="flex gap-2 mt-2 text-[8px] font-mono">
        <span style={{ color: DRAG_COLOR }}>→ drag (retrograde)</span>
        <span className="text-cyan-300">— log density profile</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={<DragOverlay live={live && !live.outOfRange ? live : null} simMs={simMs} />} />
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
          <Wind size={16} className="text-crit" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              ANALYZE · ATMOSPHERIC DRAG
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
