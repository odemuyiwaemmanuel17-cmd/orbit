import { useEffect, useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, RadioTower, Plus, Trash2 } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { geodeticToScene } from '../../lib/coords.js'
import {
  DEFAULT_STATIONS, loadStations, saveStations, validateStation, lookAngleKm,
} from '../../lib/stations.js'

const CUR = '#F5B942'
const SEL = '#22d3ee'

/** Station markers on the approved globe — meshes only, no per-station React tree.
 *  Exported for reuse by M7 (pass schedule scene). */
export function StationLayer({ stations, selectedId }) {
  return (
    <group>
      {stations.map((s) => {
        const p = geodeticToScene(s.latDeg, s.lonDeg, s.elevKm)
        const top = p.clone().addScaledVector(p.clone().normalize(), 0.06)
        return (
          <group key={s.id}>
            <mesh position={p.toArray()}>
              <sphereGeometry args={[s.id === selectedId ? 0.022 : 0.014, 12, 12]} />
              <meshBasicMaterial color={s.id === selectedId ? SEL : CUR} toneMapped={false} />
            </mesh>
            <Line points={[p.toArray(), top.toArray()]} color={s.id === selectedId ? SEL : CUR}
                  lineWidth={1.2} transparent opacity={0.8} toneMapped={false} />
          </group>
        )
      })}
    </group>
  )
}

export default function GroundStationLabPage() {
  const engine = useEngine()
  const [stations, setStations] = useState(() => loadStations(window.localStorage))
  const [selId, setSelId] = useState(() => stations[0]?.id ?? null)
  const [form, setForm] = useState({ name: '', latDeg: '', lonDeg: '', elevKm: '', minElevDeg: '10' })
  const [formErr, setFormErr] = useState([])
  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const drag = useRef(null)

  useEffect(() => { saveStations(stations, window.localStorage) }, [stations])

  const simMs = engine.simMs
  // The reference pipeline: TLE -> SGP4 -> geodetic, same calls the tracker uses.
  const rec = satId ? engine.recordFor(satId) : null
  const satGeo = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const geo = sm.eciToGeodetic(pv.position, sm.gstime(new Date(simMs)))
    return {
      latDeg: sm.degreesLat(geo.latitude),
      lonDeg: sm.degreesLong(geo.longitude),
      altKm: geo.height,
      name: rec.meta.name,
    }
  }, [rec, Math.floor(simMs / 100)])

  const looks = useMemo(() => stations.map((s) => ({
    station: s, look: satGeo ? lookAngleKm(s, satGeo) : null,
  })), [stations, satGeo])

  const selected = stations.find((s) => s.id === selId) ?? stations[0] ?? null

  const addStation = () => {
    const raw = {
      id: `user-${Date.now()}`,
      name: form.name,
      latDeg: Number(form.latDeg),
      lonDeg: Number(form.lonDeg),
      elevKm: Number(form.elevKm || 0),
      minElevDeg: Number(form.minElevDeg),
      source: 'user-defined',
    }
    const res = validateStation(raw)
    if (!res.ok) { setFormErr(res.errors); return }
    setFormErr([])
    setStations((prev) => [...prev, res.value])
    setSelId(res.value.id)
    setForm({ name: '', latDeg: '', lonDeg: '', elevKm: '', minElevDeg: '10' })
  }

  const removeStation = (id) => {
    setStations((prev) => prev.filter((s) => s.id !== id))
    if (selId === id) setSelId(stations.find((s) => s.id !== id)?.id ?? null)
  }

  const patchSelected = (key, value) => {
    setStations((prev) => prev.map((s) => (s.id === selected.id ? { ...s, [key]: value } : s)))
  }

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
          <RadioTower size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Ground Network</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-300">
          ANALYTICAL — SPHERICAL EARTH
        </span>
      </div>
      <p className="text-[9px] text-mut mb-3">
        Stations are static infrastructure (own state domain, persisted locally).
        Look angles use the spherical mean Earth; WGS84-vs-spherical tilt (~0.2°
        near LEO horizons) is a labeled simplification, not hidden.
      </p>

      <div className="text-[10px] font-mono text-pri mb-1">
        LIVE ELEVATION {satGeo ? <>· <span className="text-hi">{satGeo.name.toUpperCase()}</span>
          <span className="text-mut"> (REAL-TIME PROPAGATION)</span></> : '· no satellite selected'}
      </div>
      <div className="space-y-1.5 mb-3">
        {looks.map(({ station: s, look }) => (
          <button key={s.id} onClick={() => setSelId(s.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 border transition
                    ${s.id === selected?.id ? 'border-cyan-400/50 bg-cyan-400/[0.06]' : 'border-hi/10 bg-black/25'}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-fg">{s.name}</span>
              {look && (
                <span className={`text-[11px] font-mono tabular-nums ${look.aboveMinElev ? 'text-hi' : 'text-mut'}`}>
                  {look.elevDeg.toFixed(1)}° {look.aboveMinElev ? '▲' : '▽'}
                </span>
              )}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-mut mt-0.5">
              <span>{s.latDeg.toFixed(2)}°, {s.lonDeg.toFixed(2)}° · mask ≥{s.minElevDeg.toFixed(0)}°</span>
              {look && <span>{look.slantRangeKm.toFixed(0)} km</span>}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-lg border border-hi/15 bg-black/25 px-3 py-2 mb-3">
          <div className="text-[10px] font-mono text-cyan-400 mb-1.5">
            {selected.name.toUpperCase()} · MIN ELEVATION MASK
          </div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={90} step={1} value={selected.minElevDeg}
                   onChange={(e) => patchSelected('minElevDeg', Number(e.target.value))}
                   className="flex-1 accent-hi" aria-label="Min elevation" />
            <span className="font-mono text-[11px] text-fg tabular-nums w-10 text-right">
              {selected.minElevDeg.toFixed(0)}°
            </span>
          </div>
          {selected.id.startsWith('user-') && (
            <button onClick={() => removeStation(selected.id)}
                    className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-red-400 hover:text-red-300">
              <Trash2 size={12} /> REMOVE THIS STATION
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-hi/15 bg-black/25 px-3 py-2 mb-3">
        <div className="text-[10px] font-mono text-pri mb-1.5">ADD STATION</div>
        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
          <input placeholder="Name" value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })}
                 className="col-span-2 bg-black/30 border border-hi/20 rounded px-2 py-1 text-[11px] text-fg" />
          <input placeholder="Lat °" value={form.latDeg} inputMode="decimal"
                 onChange={(e) => setForm({ ...form, latDeg: e.target.value })}
                 className="bg-black/30 border border-hi/20 rounded px-2 py-1 text-[11px] text-fg" />
          <input placeholder="Lon °" value={form.lonDeg} inputMode="decimal"
                 onChange={(e) => setForm({ ...form, lonDeg: e.target.value })}
                 className="bg-black/30 border border-hi/20 rounded px-2 py-1 text-[11px] text-fg" />
          <input placeholder="Elev km (opt)" value={form.elevKm} inputMode="decimal"
                 onChange={(e) => setForm({ ...form, elevKm: e.target.value })}
                 className="bg-black/30 border border-hi/20 rounded px-2 py-1 text-[11px] text-fg" />
          <input placeholder="Min elev °" value={form.minElevDeg} inputMode="decimal"
                 onChange={(e) => setForm({ ...form, minElevDeg: e.target.value })}
                 className="bg-black/30 border border-hi/20 rounded px-2 py-1 text-[11px] text-fg" />
        </div>
        {formErr.map((er) => <div key={er} className="text-[9px] font-mono text-red-400">{er}</div>)}
        <button onClick={addStation}
                className="mt-1.5 flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi">
          <Plus size={12} /> ADD
        </button>
        <button onClick={() => { setStations(DEFAULT_STATIONS.map((s) => ({ ...s }))); setSelId(DEFAULT_STATIONS[0].id) }}
                className="mt-1.5 ml-2 text-[9px] font-mono text-mut hover:text-hi">
          RESET CATALOGUE
        </button>
      </div>

      {selected && satGeo && (
        <details className="mb-2">
          <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
          <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
            <div className="text-cyan-300">spherical topocentric look angle</div>
            <div>S = (R⊕+{selected.elevKm.toFixed(3)} km)·û(lat {selected.latDeg.toFixed(2)}°, lon {selected.lonDeg.toFixed(2)}°)</div>
            <div>K = (R⊕+{satGeo.altKm.toFixed(1)} km)·û(lat {satGeo.latDeg.toFixed(2)}°, lon {satGeo.lonDeg.toFixed(2)}°)</div>
            <div>d = K − S · cos ζ = (S·d)/(|S||d|)</div>
            {(() => {
              const l = lookAngleKm(selected, satGeo)
              return (
                <>
                  <div>elev = 90° − ζ = <b>{l.elevDeg.toFixed(3)}°</b> · slant = <b>{l.slantRangeKm.toFixed(1)} km</b></div>
                  <div className="mt-1 text-mut">mask ≥ {selected.minElevDeg.toFixed(0)}° → {l.aboveMinElev ? 'ABOVE (link candidate)' : 'BELOW'}.
                    slant range feeds the M10 link budget; the mask feeds M7 passes.</div>
                </>
              )
            })()}
          </div>
        </details>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={<StationLayer stations={stations} selectedId={selected?.id} />} />
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
          <RadioTower size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              DESIGN · GROUND NETWORK
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
