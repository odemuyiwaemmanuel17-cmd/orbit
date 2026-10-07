import { useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import * as THREE from 'three'
import { Link } from 'react-router-dom'
import { ArrowLeft, Signal } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { StationLayer } from './GroundStationLabPage.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { loadStations } from '../../lib/stations.js'
import { geodeticToScene } from '../../lib/coords.js'
import { K_DBM_HZ_290K } from '../../lib/constants.js'
import { slantFromElevationKm, linkBudgetKm, LINK_PRESETS, MODULATION_REFERENCE_DB } from '../../lib/linkbudget.js'

function Num({ label, unit, value, onChange, step = 1, min = -999, max = 999 }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] font-mono py-0.5">
      <span className="text-emerald-300 flex-1">{label}</span>
      <input type="number" value={value} step={step} min={min} max={max}
             onChange={(e) => onChange(Number(e.target.value))}
             className="w-20 bg-black/30 border border-emerald-400/20 rounded px-1.5 py-0.5 text-emerald-50 tabular-nums text-right" />
      <span className="text-emerald-600 w-10">{unit}</span>
    </label>
  )
}

function ChainRow({ k, v, hot }) {
  return (
    <div className="flex justify-between text-[11px] font-mono py-1 border-b border-emerald-400/10 last:border-0">
      <span className="text-emerald-500">{k}</span>
      <span className={`tabular-nums ${hot ? 'font-bold text-cyan-300' : 'text-emerald-100'}`}>{v}</span>
    </div>
  )
}

export default function LinkBudgetLabPage() {
  const engine = useEngine()
  const [stations] = useState(() => loadStations(window.localStorage))
  const [stationId, setStationId] = useState(stations[0]?.id ?? null)
  const station = stations.find((s) => s.id === stationId) ?? stations[0]
  const [worstCase, setWorstCase] = useState(true)
  const [altKm, setAlt] = useState(400)
  const [elevDeg, setElev] = useState(10)
  const [p, setP] = useState({ ...LINK_PRESETS.leoSband, rxGainDbi: 20 })
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null
  const simMs = engine.simMs
  const satGeo = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const geo = sm.eciToGeodetic(pv.position, sm.gstime(new Date(simMs)))
    return { latDeg: sm.degreesLat(geo.latitude), lonDeg: sm.degreesLong(geo.longitude),
      altKm: geo.height, name: rec.meta.name }
  }, [rec, Math.floor(simMs / 100)])

  const useAlt = worstCase && satGeo ? satGeo.altKm : altKm
  const useElev = worstCase && station ? station.minElevDeg : elevDeg
  const slantKm = useMemo(() => slantFromElevationKm(useElev, useAlt), [useElev, useAlt])
  const budget = useMemo(() => linkBudgetKm({ ...p, slantKm }), [p, slantKm])

  const set = (k) => (v) => setP((prev) => ({ ...prev, [k]: v }))

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const linkScene = satGeo && station && (() => {
    const a = geodeticToScene(station.latDeg, station.lonDeg, station.elevKm, new THREE.Vector3())
    const b = geodeticToScene(satGeo.latDeg, satGeo.lonDeg, satGeo.altKm, new THREE.Vector3())
    const good = budget.verdict === 'GO'
    return (
      <group>
        <Line points={[a.toArray(), b.toArray()]} color={good ? '#34d399' : '#f87171'}
              lineWidth={2} transparent opacity={0.9} toneMapped={false} />
        <mesh position={b.toArray()}>
          <sphereGeometry args={[0.016, 10, 10]} />
          <meshBasicMaterial color="#f8fafc" toneMapped={false} />
        </mesh>
      </group>
    )
  })()

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Signal size={15} className="text-emerald-400" />
          <span className="font-semibold text-emerald-50 text-sm">Link Budget</span>
        </div>
        <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${budget.verdict === 'GO' ? 'border-emerald-400/50 text-emerald-300' : 'border-red-400/50 text-red-300'}`}>
          {budget.verdict} · MARGIN {budget.marginDb.toFixed(1)} dB
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-2">
        Losses are lumped SIMPLIFIED MODEL inputs; modulation Eb/N0 targets are EDUCATIONAL
        textbook values (uncoded/coded typicals). Slant geometry is exact spherical —
        worst case uses the LIVE satellite altitude at the station mask angle.
      </p>

      <div className="flex gap-1.5 mb-2 flex-wrap">
        {Object.entries(LINK_PRESETS).map(([k, v]) => (
          <button key={k} onClick={() => setP({ ...v, rxGainDbi: p.rxGainDbi })}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-emerald-400/20 text-emerald-300 hover:bg-emerald-400/10">
            {k.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-emerald-400/15 bg-black/25 px-3 py-2 mb-2">
        <div className="flex items-center gap-2 mb-1.5">
          <select value={stationId} onChange={(e) => setStationId(e.target.value)}
                  className="flex-1 bg-black/30 border border-emerald-400/20 rounded px-1.5 py-1 text-[11px] text-emerald-200">
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => setWorstCase(!worstCase)}
                  className={`px-2 py-1 rounded-md text-[9px] font-mono border ${worstCase ? 'border-emerald-400/50 text-emerald-300' : 'border-emerald-400/20 text-emerald-600'}`}>
            {worstCase ? '● LIVE WORST CASE' : 'MANUAL GEOMETRY'}
          </button>
        </div>
        {!worstCase && (
          <div className="grid grid-cols-2 gap-2 mb-1.5">
            <Num label="Altitude" unit="km" value={altKm} onChange={setAlt} step={10} min={160} max={42000} />
            <Num label="Elevation" unit="°" value={elevDeg} onChange={setElev} step={1} min={0} max={90} />
          </div>
        )}
        <div className="flex justify-between font-mono text-[11px] text-emerald-100">
          <span className="text-emerald-500">slant @ elev {useElev.toFixed(0)}° · {useAlt.toFixed(0)} km alt</span>
          <span className="text-cyan-300 tabular-nums">{slantKm.toFixed(0)} km</span>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-400/15 bg-black/25 px-3 py-2 mb-2">
        <Num label="Tx power" unit="dBm" value={p.ptxDbm} onChange={set('ptxDbm')} />
        <Num label="Tx antenna gain" unit="dBi" value={p.txGainDbi} onChange={set('txGainDbi')} />
        <Num label="Frequency" unit="MHz" value={p.freqMhz} onChange={set('freqMhz')} step={10} min={100} />
        <Num label="Rx antenna gain" unit="dBi" value={p.rxGainDbi} onChange={set('rxGainDbi')} />
        <Num label="Rx noise figure" unit="dB" value={p.nfDb} onChange={set('nfDb')} step={0.1} />
        <Num label="Bit rate" unit="kbps" value={p.bitRateKbps} onChange={set('bitRateKbps')} step={10} min={1} />
        <Num label="Required Eb/N0" unit="dB" value={p.requiredEbN0Db} onChange={set('requiredEbN0Db')} step={0.5} />
        <div className="flex flex-wrap gap-1 mt-1">
          {MODULATION_REFERENCE_DB.map((m) => (
            <button key={m.id} onClick={() => set('requiredEbN0Db')(m.ebN0Db)}
                    className="px-1.5 py-0.5 rounded text-[8px] font-mono border border-amber-400/30 text-amber-300"
                    title={`${m.label} reference value`}>
              {m.name.toUpperCase()} · {m.ebN0Db} dB
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-2 mt-1.5">
          <Num label="Atmos loss" unit="dB" value={p.atmosLossDb} onChange={set('atmosLossDb')} step={0.1} />
          <Num label="Pointing" unit="dB" value={p.pointingLossDb} onChange={set('pointingLossDb')} step={0.1} />
          <Num label="Misc loss" unit="dB" value={p.otherLossDb} onChange={set('otherLossDb')} step={0.1} />
          <Num label="Impl. loss" unit="dB" value={p.implementationLossDb} onChange={set('implementationLossDb')} step={0.1} />
        </div>
      </div>

      <div className="rounded-lg border border-cyan-400/20 bg-black/30 px-3 py-1.5 mb-2">
        <ChainRow k="EIRP" v={`${budget.eirpDbm.toFixed(1)} dBm`} />
        <ChainRow k="Free-space loss" v={`−${budget.fsplDb.toFixed(1)} dB`} />
        <ChainRow k="Total path loss" v={`−${budget.pathLossDb.toFixed(1)} dB`} />
        <ChainRow k="Rx power at LNA" v={`${budget.prxDbm.toFixed(1)} dBm`} />
        <ChainRow k="Carrier-to-noise C/N₀" v={`${budget.cN0DbHz.toFixed(1)} dB-Hz`} hot />
        <ChainRow k="Eb/N₀ (after impl.)" v={`${budget.ebN0DbDb.toFixed(1)} dB`} hot />
        <ChainRow k="Max bitrate at this geometry" v={`${budget.maxBitRateKbps.toFixed(0)} kbps`} />
      </div>

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-200">
          <div>slant: ρ = −R⊕·sin e + √(R⊕²sin²e + (R⊕+h)² − R⊕²) = {slantKm.toFixed(1)} km</div>
          <div className="mt-1">FSPL = 32.44 + 20·log₁₀({slantKm.toFixed(0)} km) + 20·log₁₀({p.freqMhz} MHz) = {budget.fsplDb.toFixed(2)} dB</div>
          <div className="mt-1">Prx = {budget.eirpDbm} − {budget.pathLossDb.toFixed(1)} + {p.rxGainDbi} = {budget.prxDbm.toFixed(1)} dBm</div>
          <div className="mt-1">C/N₀ = Prx − k(290 K) − NF = {budget.prxDbm.toFixed(1)} − ({K_DBM_HZ_290K.toFixed(3)}) − {p.nfDb} = {budget.cN0DbHz.toFixed(2)} dB-Hz</div>
          <div className="mt-1">Eb/N₀ = C/N₀ − 10·log₁₀({(p.bitRateKbps * 1000).toExponential(2)} bps) − {p.implementationLossDb} = {budget.ebN0DbDb.toFixed(2)} dB</div>
          <div className="mt-1 text-emerald-700">k exact (2019 SI) → kT(290 K) = −173.976 dBm/Hz (ITU-R ref). Noise figure path;
            the service also models an equivalent G/T path — the tests pin their identity.</div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission overlay={
        <group>
          <StationLayer stations={stations} selectedId={stationId} />
          {linkScene}
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
          <Signal size={16} className="text-emerald-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-emerald-300 align-middle">
              DESIGN · LINK BUDGET
            </span>
          </span>
        </div>
        {satGeo && (
          <span className="ml-auto hidden md:inline text-[9px] font-mono text-emerald-600">
            SLANT USES LIVE {satGeo.name.toUpperCase()} ALTITUDE
          </span>
        )}
      </header>

      <div className="absolute bottom-2 lg:top-16 lg:bottom-6 right-2 lg:right-4 left-2 lg:left-auto w-auto lg:w-[340px] z-40 pointer-events-auto max-h-[62vh] lg:max-h-none">
        {panel}
      </div>
    </div>
  )
}
