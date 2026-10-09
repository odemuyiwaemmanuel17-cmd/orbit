import { useEffect, useMemo, useRef, useState } from 'react'
import * as sm from 'satellite.js'
import * as THREE from 'three'
import { Link } from 'react-router-dom'
import { ArrowLeft, Globe2, Play, Pause, RotateCcw } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { StationLayer } from './GroundStationLabPage.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { loadStations } from '../../lib/stations.js'
import { stateToElementsKm } from '../../lib/kepler.js'
import { geodeticToScene } from '../../lib/coords.js'
import { orbitGroundSamples, visibilityFromSamples, gridCoverage, coveredFractionAt, capAreaFractionDeg } from '../../lib/coverage.js'
import { footprintRadiusDeg, footprintPolygonDeg } from '../../lib/los.js'

function CoverageOverlay({ cov, frac }) {
  const idx = Math.min(cov.samples.length - 1, Math.round(frac * (cov.samples.length - 1)))
  const now = cov.samples[idx]
  const scrubT = now.tMs
  const track = useMemo(() => cov.samples.map((s) =>
    geodeticToScene(s.latDeg, s.lonDeg, 0, new THREE.Vector3()).toArray()), [cov])
  const [coveredPos, openPos] = useMemo(() => {
    const a = [], b = []
    for (const c of cov.coverage.cells) {
      const p = geodeticToScene(c.latDeg, c.lonDeg, 0, new THREE.Vector3()).toArray()
      if (c.tMs !== null && c.tMs <= scrubT) a.push(p); else b.push(p)
    }
    return [new Float32Array(a.flat()), new Float32Array(b.flat())]
  }, [cov, scrubT])
  const g = footprintRadiusDeg(now.altKm, cov.maskDeg)
  const ring = footprintPolygonDeg(now.latDeg, now.lonDeg, g, 64)
    .map(([la, lo]) => geodeticToScene(la, lo, 0, new THREE.Vector3()).toArray())
  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[coveredPos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.016} color="#38D9FF" sizeAttenuation transparent opacity={0.9} toneMapped={false} depthWrite={false} />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[openPos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.009} color="#334155" sizeAttenuation transparent opacity={0.5} toneMapped={false} depthWrite={false} />
      </points>
      <Line points={track} color="#475569" lineWidth={1} transparent opacity={0.8} toneMapped={false} />
      <Line points={ring} color="#22d3ee" lineWidth={1.2} dashed dashSize={0.03} gapSize={0.018}
            transparent opacity={0.85} toneMapped={false} />
      <mesh position={geodeticToScene(now.latDeg, now.lonDeg, now.altKm, new THREE.Vector3()).toArray()}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshBasicMaterial color="#f8fafc" toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function CoverageLabPage() {
  const engine = useEngine()
  const [stations] = useState(() => loadStations(window.localStorage))
  const [stepDeg, setStepDeg] = useState(10)
  const [maskDeg, setMaskDeg] = useState(0)
  const [cov, setCov] = useState(null)
  const [running, setRunning] = useState(false)
  const [frac, setFrac] = useState(1)
  const [playing, setPlaying] = useState(false)
  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const drag = useRef(null)

  const simMs = engine.simMs
  const rec = satId ? engine.recordFor(satId) : null
  const el = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    return stateToElementsKm({ posKm: { ...pv.position }, velKmS: { ...pv.velocity } })
  }, [rec, Math.floor(simMs / 500)])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setFrac((f) => Math.min(1, f + 0.006)), 80)
    return () => clearInterval(id)
  }, [playing])
  useEffect(() => { if (frac >= 1 && playing) setPlaying(false) }, [frac, playing])

  const analyze = async () => {
    if (!el) return
    setRunning(true)
    await new Promise((r) => setTimeout(r, 16))
    try {
      const samples = orbitGroundSamples(el, { t0Ms: engine.simMs, samples: 240 })
      const coverage = gridCoverage(samples, { stepDeg, maskDeg })
      const vis = stations.map((st) => ({ station: st, v: visibilityFromSamples(samples, st) }))
      setCov({ samples, coverage, vis, el, satName: rec.meta.name, maskDeg, stepDeg })
      setFrac(0); setPlaying(true)
    } finally { setRunning(false) }
  }

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const scrubT = cov ? cov.samples[Math.min(cov.samples.length - 1, Math.round(frac * (cov.samples.length - 1)))].tMs : 0
  const shownFrac = cov ? coveredFractionAt(cov.coverage, scrubT) : 0
  const finalFrac = cov?.coverage.fraction ?? 0
  const gammaNow = cov ? footprintRadiusDeg(
    cov.samples[Math.round(frac * (cov.samples.length - 1))].altKm, cov.maskDeg) : 0

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Globe2 size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Orbit Coverage</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-300">
          ANALYTICAL MODEL
        </span>
      </div>
      <p className="text-[9px] text-mut mb-3">
        One-orbit sweep from the current state (two-body Kepler, sidereal Earth —
        no J2/SGP4 here; tracker passes remain the real-prediction path). Area
        numbers are a cos(lat)-weighted {cov ? cov.stepDeg : stepDeg}° grid —
        discretization O(step²), disclosed not hidden.
      </p>

      <div className="flex items-center gap-2 mb-2">
        <select value={stepDeg} onChange={(e) => setStepDeg(Number(e.target.value))}
                className="bg-black/30 border border-hi/20 rounded px-1.5 py-1 text-[11px] text-fg">
          {[5, 10].map((v) => <option key={v} value={v}>{v}° grid</option>)}
        </select>
        <select value={maskDeg} onChange={(e) => setMaskDeg(Number(e.target.value))}
                className="bg-black/30 border border-hi/20 rounded px-1.5 py-1 text-[11px] text-fg">
          {[0, 5, 10].map((v) => <option key={v} value={v}>mask {v}°</option>)}
        </select>
        <button onClick={analyze} disabled={running || !el}
                className="ml-auto px-3 py-1 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi disabled:opacity-50">
          {running ? 'SAMPLING…' : 'ANALYZE ORBIT'}
        </button>
      </div>

      {cov && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => { if (frac >= 1) setFrac(0); setPlaying(!playing) }}
                    className="p-1.5 rounded-md bg-black/30 border border-hi/20 text-hi">
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button onClick={() => { setFrac(1); setPlaying(false) }}
                    className="p-1.5 rounded-md bg-black/30 border border-hi/20 text-hi">
              <RotateCcw size={13} />
            </button>
            <input type="range" min={0} max={1} step={0.002} value={frac}
                   onChange={(e) => { setFrac(Number(e.target.value)); setPlaying(false) }}
                   className="flex-1 accent-hi" aria-label="Orbit progress" />
            <span className="font-mono text-[10px] text-fg tabular-nums w-9 text-right">
              {(frac * 100).toFixed(0)}%
            </span>
          </div>
          <div className="rounded-lg border border-hi/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[11px] text-fg flex justify-between">
            <span>COVERAGE NOW</span>
            <span><b className="text-cyan-300">{(shownFrac * 100).toFixed(1)}%</b>
              {' / '}full orbit {(finalFrac * 100).toFixed(1)}%</span>
          </div>

          <div className="text-[10px] font-mono text-pri mb-1">
            STATION VISIBILITY OVER ONE {cov.satName.toUpperCase()} ORBIT
          </div>
          <div className="space-y-1.5 mb-3">
            {cov.vis.map(({ station: st, v }) => (
              <div key={st.id} className="rounded-lg px-3 py-1.5 border border-hi/10 bg-black/25">
                <div className="flex justify-between text-[10px]">
                  <span className="text-fg font-semibold">{st.name}</span>
                  <span className="font-mono text-hi tabular-nums">
                    {(v.fraction * 100).toFixed(1)}% · {v.passCount}p · max {v.maxElevDeg.toFixed(0)}°
                  </span>
                </div>
                <div className="h-1 mt-1 rounded bg-black/40 overflow-hidden">
                  <div className="h-full bg-hi" style={{ width: `${Math.min(100, v.fraction * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <details>
            <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
            <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
              <div className="text-cyan-300">cap radius for mask m at altitude h (M8 identity)</div>
              <div>γ(m {cov.maskDeg}°, h {cov.samples[Math.round(frac * (cov.samples.length - 1))].altKm.toFixed(0)} km) = <b>{gammaNow.toFixed(2)}°</b></div>
              <div className="text-cyan-300 mt-1.5">exact cap area fraction (analytic check)</div>
              <div>(1 − cos γ)/2 = {((capAreaFractionDeg(gammaNow)) * 100).toFixed(1)}% per instance</div>
              <div className="text-cyan-300 mt-1.5">orbit union over grid</div>
              <div>fraction = Σ wᵢ·coveredᵢ / Σ wᵢ, wᵢ = cos(latᵢ) · {cov.stepDeg}° cells</div>
              <div className="mt-1.5 text-mut">Two-body track with sidereal rotation; time-grid fraction uses
                {cov.samples.length} uniform samples (±{((cov.samples[cov.samples.length - 1].tMs - cov.samples[0].tMs) / cov.samples.length / 1000).toFixed(0)} s resolution).</div>
            </div>
          </details>
        </>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={
        <group>
          <StationLayer stations={stations} selectedId={null} />
          {cov && <CoverageOverlay cov={cov} frac={frac} />}
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
        <div className="w-px h-6 bg-hi/15" />
        <div className="flex items-center gap-2">
          <Globe2 size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              ANALYZE · COVERAGE
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
