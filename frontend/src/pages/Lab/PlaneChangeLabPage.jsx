import { useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import * as THREE from 'three'
import { Link } from 'react-router-dom'
import { ArrowLeft, GitCompareArrows } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import LabOrbit, { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { circularElements } from '../../lib/hohmann.js'
import { planeChangeDvMps, planeChangeAltLadder, combinedPlaneChangeKm } from '../../lib/planechange.js'
import { circularVelocityKmS } from '../../lib/kepler.js'
import { R_EARTH_MEAN_KM } from '../../lib/constants.js'

const CUR = '#94a3b8'
const TGT = '#22d3ee'
const NODE = '#F5B942'

function PlaneOverlay({ altKm, i1, i2, simMs }) {
  const r = R_EARTH_MEAN_KM + altKm
  const gmst = sm.gstime(new Date(simMs))
  const node = useMemo(() => {
    // Shared ascending node (RAAN = 0): ECI (r, 0, 0) -> scene at current GMST.
    const p = eciToSceneKm(r, 0, 0, gmst, new THREE.Vector3()).toArray()
    return { p, origin: [0, 0, 0] }
  }, [r, gmst])
  return (
    <group>
      <LabOrbit elements={circularElements(r, { iDeg: i1, raanDeg: 0 })} simMs={simMs}
                options={{ hideSat: false, showMarkers: false, showConstruction: false,
                           showEquatorial: false, lineColor: CUR, opacity: 0.8 }} />
      <LabOrbit elements={circularElements(r, { iDeg: i2, raanDeg: 0 })} simMs={simMs}
                options={{ hideSat: true, showMarkers: false, showConstruction: false,
                           showEquatorial: false, lineColor: TGT, dashed: true, opacity: 0.95 }} />
      <Line points={[node.origin, node.p]} color={NODE} lineWidth={1.4} dashed dashSize={0.03}
            gapSize={0.02} transparent opacity={0.7} toneMapped={false} />
      <mesh position={node.p}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshBasicMaterial color={NODE} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function PlaneChangeLabPage() {
  const engine = useEngine()
  const [altKm, setAlt] = useState(400)
  const [i1, setI1] = useState(51.6)
  const [i2, setI2] = useState(28.5)
  const drag = useRef(null)

  const di = Math.abs(i2 - i1)
  const v = circularVelocityKmS(R_EARTH_MEAN_KM + altKm)
  const dv = planeChangeDvMps(v, di)
  const ladder = useMemo(() => planeChangeAltLadder(di, [400, 1000, 8000, 20200, 35786]), [di])
  const combined = useMemo(
    () => combinedPlaneChangeKm(R_EARTH_MEAN_KM + 6378, R_EARTH_MEAN_KM + 35786, di),
    [di])

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const Slider = ({ label, value, onChange, max, unit }) => (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between text-[11px] mb-1">
        <span className="text-fg font-semibold">{label}</span>
        <span className="font-mono text-fg tabular-nums">{value.toFixed(1)} {unit}</span>
      </div>
      <input type="range" min={0} max={max} step={0.1} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             className="w-full accent-hi h-6" aria-label={label} />
    </div>
  )

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <GitCompareArrows size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Plane Change</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-300">
          ANALYTICAL — IMPULSIVE
        </span>
      </div>
      <p className="text-[9px] text-mut mb-3">
        Burn on the node line (amber), rotating the velocity vector by Δi.
        Assumptions: impulsive, same speed before/after, two-body — exact
        only at the ascending/descending node.
      </p>

      <Slider label="Orbit altitude" value={altKm} onChange={setAlt} max={40000} unit="km" />
      <Slider label="Current inclination i₁" value={i1} onChange={setI1} max={180} unit="°" />
      <Slider label="Target inclination i₂" value={i2} onChange={setI2} max={180} unit="°" />

      <div className="rounded-lg border border-hi/25 bg-black/30 px-3 py-2 mb-3 font-mono text-[12px] text-fg">
        Δi = {di.toFixed(1)}° · v = {v.toFixed(4)} km/s · <b>ΔV = {dv.toFixed(0)} m/s</b>
      </div>

      <div className="text-[10px] font-mono text-pri mb-1">WHY HIGH ORBITS ARE CHEAPER (same Δi)</div>
      <table className="w-full text-[10px] font-mono tabular-nums mb-3">
        <thead className="text-mut">
          <tr><th className="text-left">alt</th><th className="text-right">v km/s</th><th className="text-right">ΔV m/s</th></tr>
        </thead>
        <tbody className="text-fg">
          {ladder.map((l) => (
            <tr key={l.altKm}>
              <td>{l.altKm.toLocaleString('en-US')} km</td>
              <td className="text-right">{l.vCircKmS.toFixed(3)}</td>
              <td className={`text-right ${l.altKm === Math.round(altKm) ? 'text-cyan-300' : ''}`}>{l.dvMps.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-[10px] font-mono text-pri mb-1">COMBINED BONUS — LEO 6378 km → GEO + Δi AT APOGEE</div>
      <div className="rounded-lg border border-cyan-400/25 bg-black/25 px-3 py-2 mb-3 font-mono text-[10px] text-fg leading-relaxed">
        separate (plane at apogee + circularize): <b>{combined.dvSeparateMps.toFixed(0)} m/s</b><br />
        one combined vector burn: <b className="text-cyan-300">{combined.dvCombinedMps.toFixed(0)} m/s</b><br />
        <span className="text-hi">saving: {combined.savingMps.toFixed(0)} m/s — rotate & slow in one triangle</span>
      </div>

      <details className="mb-2">
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">
          SHOW CALCULATION
        </summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">ΔV = 2 v sin(Δi/2)</div>
          <div>= 2 × {v.toFixed(4)} × sin({(di / 2).toFixed(2)}°) = {(dv / 1000).toFixed(4)} km/s</div>
          <div className="text-cyan-300 mt-2">combined at apogee (law of cosines):</div>
          <div>ΔV = √(v_a² + v_c² − 2 v_a v_c cos Δi)</div>
          <div>= √({combined.vApogeeKmS.toFixed(4)}² + {combined.vTargetKmS.toFixed(4)}² − 2·{combined.vApogeeKmS.toFixed(3)}·{combined.vTargetKmS.toFixed(3)}·cos {di.toFixed(1)}°) = {(combined.dvCombinedMps / 1000).toFixed(4)} km/s</div>
          <div className="mt-2 text-mut">v = √(μ/r) at r = {altKm} + {R_EARTH_MEAN_KM} km. 180° flip costs 2v — the plane formula's own bound.</div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={<PlaneOverlay altKm={altKm} i1={i1} i2={i2} simMs={engine.simMs} />} />
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
          <GitCompareArrows size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              DESIGN · PLANE CHANGE
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
