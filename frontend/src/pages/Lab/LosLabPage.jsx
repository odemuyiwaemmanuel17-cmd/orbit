import { useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Radar } from 'lucide-react'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { StationLayer } from './GroundStationLabPage.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { loadStations } from '../../lib/stations.js'
import { geodeticToScene } from '../../lib/coords.js'
import { footprintRadiusDeg, footprintPolygonDeg, losState } from '../../lib/los.js'

const C_LINK = '#34d399'
const C_LOS = '#22d3ee'
const C_BLOCKED = '#64748b'
const C_FOOT = '#22d3ee'
const C_MASK = '#f59e0b'

function stateColor(state) {
  return state === 'LINK' ? C_LINK : state === 'LOS' ? C_LOS : C_BLOCKED
}

function LosOverlay({ stations, satGeo, showFootprint, showBeams, looks }) {
  const satScene = geodeticToScene(satGeo.latDeg, satGeo.lonDeg, satGeo.altKm, new THREE.Vector3())
  const gH = footprintRadiusDeg(satGeo.altKm, 0)
  // 97 boundary points at the engine's 10 Hz tick is trivial compute — no
  // quantization needed, so ring, sub-sat dot and beams stay perfectly aligned.
  const ring = footprintPolygonDeg(satGeo.latDeg, satGeo.lonDeg, gH, 96)
    .map(([la, lo]) => geodeticToScene(la, lo, 0, new THREE.Vector3()).toArray())
  const sub = geodeticToScene(satGeo.latDeg, satGeo.lonDeg, 0, new THREE.Vector3())
  return (
    <group>
      {showFootprint && ring.length > 2 && (
        <Line points={ring} color={C_FOOT} lineWidth={1.2} dashed dashSize={0.035}
              gapSize={0.02} transparent opacity={0.75} toneMapped={false} />
      )}
      {showFootprint && (
        <mesh position={sub.toArray()}>
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshBasicMaterial color={C_FOOT} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
      {showBeams && stations.map((st) => {
        const l = looks[st.id]
        if (!l) return null
        const from = geodeticToScene(st.latDeg, st.lonDeg, st.elevKm, new THREE.Vector3())
        const blocked = l.state === 'BLOCKED'
        return (
          <Line key={st.id} points={[from.toArray(), satScene.toArray()]}
                color={stateColor(l.state)} lineWidth={blocked ? 0.8 : 1.6}
                transparent opacity={blocked ? 0.28 : 0.9} toneMapped={false}
                dashed={blocked} dashSize={0.02} gapSize={0.02} />
        )
      })}
      <mesh position={satScene.toArray()}>
        <sphereGeometry args={[0.016, 10, 10]} />
        <meshBasicMaterial color="#f8fafc" toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function LosLabPage() {
  const engine = useEngine()
  const [stations] = useState(() => loadStations(window.localStorage))
  const [showFootprint, setShowFootprint] = useState(true)
  const [showBeams, setShowBeams] = useState(true)
  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const drag = useRef(null)

  const simMs = engine.simMs
  const rec = satId ? engine.recordFor(satId) : null
  const satGeo = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const geo = sm.eciToGeodetic(pv.position, sm.gstime(new Date(simMs)))
    return { latDeg: sm.degreesLat(geo.latitude), lonDeg: sm.degreesLong(geo.longitude),
      altKm: geo.height, name: rec.meta.name }
  }, [rec, Math.floor(simMs / 100)])

  const looks = useMemo(() => {
    const out = {}
    if (!satGeo) return out
    for (const st of stations) out[st.id] = losState(st, satGeo)
    return out
  }, [stations, satGeo])

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const gH = satGeo ? footprintRadiusDeg(satGeo.altKm, 0) : 0
  const linkN = Object.values(looks).filter((l) => l.state === 'LINK').length
  const losN = Object.values(looks).filter((l) => l.state === 'LOS').length
  const blockedN = Object.values(looks).filter((l) => l.state === 'BLOCKED').length

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Radar size={15} className="text-emerald-400" />
          <span className="font-semibold text-emerald-50 text-sm">Line of Sight</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-emerald-400/40 text-emerald-300">
          REAL-TIME PROPAGATION
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-2">
        Footprint ring = where the {satGeo ? satGeo.name.toUpperCase() : 'satellite'} is above the
        geometric horizon (elev ≥ 0°, spherical Earth, {gH.toFixed(1)}° ground radius right now).
        Beam states are computed from true look angles; the scene compresses radius, so trust the
        numbers over beam intersections near the limb.
      </p>

      <div className="flex gap-2 mb-3">
        {[['FOOTPRINT', showFootprint, setShowFootprint], ['BEAMS', showBeams, setShowBeams]].map(([lbl, v, set]) => (
          <button key={lbl} onClick={() => set(!v)}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono border
                    ${v ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10' : 'border-emerald-400/15 text-emerald-700'}`}>
            {lbl}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[8px] font-mono">
          <span className="text-emerald-300">■ LINK</span><span className="text-cyan-300">■ LOS</span>
          <span className="text-slate-500">┄ BLOCKED</span>
        </div>
      </div>

      <div className="text-[9px] font-mono text-emerald-600 mb-1.5">
        {linkN} LINK · {losN} LOS · {blockedN} BLOCKED — over {stations.length} stations
      </div>
      <div className="space-y-1.5 mb-3">
        {stations.map((st) => {
          const l = looks[st.id]
          if (!l) return null
          return (
            <div key={st.id} className="rounded-lg px-3 py-2 border border-emerald-400/10 bg-black/25">
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] font-semibold text-emerald-100">{st.name}</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: stateColor(l.state) }}>
                  {l.state}
                </span>
              </div>
              <div className="flex justify-between text-[9px] font-mono text-emerald-600 mt-0.5 tabular-nums">
                <span>elev {l.elevDeg.toFixed(1)}° · mask ≥{st.minElevDeg.toFixed(0)}°</span>
                <span>{l.state === 'BLOCKED' ? 'behind Earth' : `${l.slantRangeKm.toFixed(0)} km`}</span>
              </div>
            </div>
          )
        })}
      </div>

      {satGeo && (
        <details>
          <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
          <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-200">
            <div className="text-cyan-300">footprint cap for elevation ≥ e (spherical Earth)</div>
            <div>γ(e) = acos( (R⊕/(R⊕+h)) · cos e ) − e</div>
            <div>γ(0°) = acos(6371/{(6371 + satGeo.altKm).toFixed(1)}) = <b>{gH.toFixed(2)}°</b>
              {' '}— identical to the M6 horizon identity</div>
            {(() => {
              const st = stations[0]
              const gM = footprintRadiusDeg(satGeo.altKm, st.minElevDeg)
              return <div>γ({st.name} mask {st.minElevDeg}°) = <b>{gM.toFixed(2)}°</b> — inner cap of stations in {st.name.toUpperCase()}</div>
            })()}
            <div className="mt-1 text-emerald-700">
              state = LINK if elev ≥ mask, LOS if 0 ≤ elev &lt; mask, BLOCKED if elev &lt; 0.
              All from lookAngleKm — same validated geometry as M6/M7.
            </div>
          </div>
        </details>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission overlay={
        <group>
          <StationLayer stations={stations} selectedId={null} />
          {satGeo && (
            <LosOverlay stations={stations} satGeo={satGeo} looks={looks}
                        showFootprint={showFootprint} showBeams={showBeams} />
          )}
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
          <Radar size={16} className="text-emerald-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-emerald-300 align-middle">
              ANALYZE · LINE OF SIGHT
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
