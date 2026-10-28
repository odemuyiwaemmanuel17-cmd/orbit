import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Radar } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { screenCatalogKm, severityBandKm, tcaOffsetMin } from '../../lib/conjunction.js'

const SEV_COLOR = {
  CRITICAL: '#FF647C', DANGER: '#F5B942', WATCH: '#38D9FF',
  INTERESTING: '#818CF8', BACKGROUND: '#91A6C2', UNKNOWN: '#64748b',
}

/** SGP4 sampler: the exact contract the analytic tests exercised. */
function sgp4Sampler(rec) {
  return (tMs) => {
    const pv = sm.propagate(rec, new Date(tMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) {
      return { posKm: { x: NaN, y: NaN, z: NaN }, velKmS: { x: 0, y: 0, z: 0 } }
    }
    return { posKm: { x: pv.position.x, y: pv.position.y, z: pv.position.z },
      velKmS: { x: pv.velocity.x, y: pv.velocity.y, z: pv.velocity.z } }
  }
}

function TcaOverlay({ pair }) {
  // positions arrive as raw ECI km AT the TCA; project through the same
  // GMST-consistent contract as everything else
  const gmst = sm.gstime(new Date(pair.tcaMs))
  const a = eciToSceneKm(pair.a[0], pair.a[1], pair.a[2], gmst, new THREE.Vector3()).toArray()
  const b = eciToSceneKm(pair.b[0], pair.b[1], pair.b[2], gmst, new THREE.Vector3()).toArray()
  return (
    <group>
      <Line points={[a, b]} color={SEV_COLOR[pair.severity] ?? '#38D9FF'} lineWidth={2}
            transparent opacity={0.9} toneMapped={false} />
      {[a, b].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.014, 10, 10]} />
          <meshBasicMaterial color={i === 0 ? '#38D9FF' : '#FF647C'} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export default function ConjunctionLabPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [windowDays, setWindowDays] = useState(3)
  const [bandKm, setBandKm] = useState(250)
  const [results, setResults] = useState(null)
  const [scanInfo, setScanInfo] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  const live = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    return { name: rec.meta.name, rKm: Math.hypot(pv.position.x, pv.position.y, pv.position.z) }
  }, [rec, Math.floor(simMs / 100)])

  const scan = () => {
    if (!rec) return
    setScanning(true); setError(null); setSelected(null)
    setTimeout(() => {
      try {
        const t0 = simMs, t1 = simMs + windowDays * 86400e3
        const stepS = windowDays <= 1 ? 60 : windowDays <= 3 ? 120 : 240
        const primaryRec = rec.rec
        // candidate pre-filter: osculating a within band at window start
        const aPrim = (() => {
          const pv = sm.propagate(primaryRec, new Date(t0))
          const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z)
          const v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
          return 1 / (2 / r - v * v / 398600.4418)
        })()
        const all = engine.records
        const cands = []
        for (const other of all) {
          if (other.meta.id === rec.meta?.id) continue
          if (cands.length >= 60) break
          try {
            const pv = sm.propagate(other.rec, new Date(t0))
            if (!pv?.position || Number.isNaN(pv.position.x)) continue
            const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z)
            const v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
            const a = 1 / (2 / r - v * v / 398600.4418)
            if (Math.abs(a - aPrim) <= bandKm) cands.push({ name: other.meta.name, id: other.meta.id, sampler: sgp4Sampler(other.rec) })
          } catch { /* skip un-propagatable */ }
        }
        const res = screenCatalogKm({
          samplerPrimary: sgp4Sampler(primaryRec), candidates: cands,
          tStartMs: t0, tEndMs: t1, stepS, limitPairs: 15,
        }).map((r) => ({ ...r, severity: severityBandKm(r) }))
        setResults(res)
        setScanInfo({ t0, t1, stepS, nCandidates: cands.length, primary: rec.meta.name,
          scans: res.reduce((acc, r) => acc + r.samples, 0) })
      } catch (err) {
        setError(err.message)
      } finally { setScanning(false) }
    }, 16)
  }

  const selectPair = (r) => {
    if (!scanInfo) return
    const cand = engine.records.find((x) => x.meta.id === r.id)
    if (!cand) return
    const pa = sgp4Sampler(rec.rec)(r.tcaMs).posKm
    const pb = sgp4Sampler(cand.rec)(r.tcaMs).posKm
    if (!Number.isFinite(pa.x) || !Number.isFinite(pb.x)) return
    setSelected({
      a: [pa.x, pa.y, pa.z], b: [pb.x, pb.y, pb.z],
      nameB: cand.meta.name, severity: r.severity, tcaMs: r.tcaMs,
    })
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
          <Radar size={15} className="text-crit" />
          <span className="font-semibold text-fg text-sm">Conjunction Pair View</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/40 text-cau">
          DISTANCE SCREENING — NO Pc
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        Collision probability needs covariance data (a CDM from the 18th
        Space Defense Squadron). TLEs carry NONE — so this lab reports
        what TLE-only data honestly supports: minimum ECI separation,
        time of closest approach and relative speed on a paired time grid.
        The same screening code is validated against analytic Kepler
        geometries in tests/conjunction.test.js.
      </p>

      {live && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2 text-[10px] font-mono">
          <span className="text-mut">PRIMARY:</span> <span className="text-fg">{live.name.toUpperCase()}</span>
          {' '}· |r| {live.rKm.toFixed(0)} km · REAL-TIME SGP4
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-baseline justify-between text-[10px] mb-0.5">
          <span className="text-fg font-semibold">Screening window</span>
          <span className="font-mono text-fg">{windowDays} day{windowDays > 1 ? 's' : ''}</span>
        </div>
        <input type="range" min={1} max={7} step={1} value={windowDays}
               onChange={(e) => setWindowDays(Number(e.target.value))}
               aria-label="Window" className="w-full accent-hi h-5" />
        <div className="flex items-baseline justify-between text-[10px] mt-1 mb-0.5">
          <span className="text-fg font-semibold">Candidate band |Δa|</span>
          <span className="font-mono text-fg">±{bandKm} km</span>
        </div>
        <input type="range" min={50} max={600} step={50} value={bandKm}
               onChange={(e) => setBandKm(Number(e.target.value))}
               aria-label="Altitude band" className="w-full accent-hi h-5" />
      </div>

      <button onClick={scan} disabled={scanning || !rec}
              className="w-full mb-2 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi disabled:opacity-50">
        {scanning ? 'PROPAGATING PAIRED GRID…' : 'RUN CONJUNCTION SCAN (ON-DEMAND)'}
      </button>
      {error && <div className="text-[10px] font-mono text-crit mb-2">{error}</div>}

      {results && (
        <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-2 py-2 mb-2">
          <div className="text-[9px] font-mono text-mut mb-1">
            {scanInfo.nCandidates} co-band candidates · step {scanInfo.stepS}s · {scanInfo.scans.toLocaleString('en-US')} paired samples
            {' '}· TCA resolution ±{scanInfo.stepS / 2}s (grid)
          </div>
          {results.length === 0 && <div className="text-[10px] font-mono text-mut">no close approaches in window</div>}
          {results.map((r, i) => (
            <button key={`${r.id}-${i}`} onClick={() => selectPair(r)} aria-pressed={selected?.tcaMs === r.tcaMs}
                    className="w-full flex items-center gap-2 text-left px-1.5 py-1 rounded hover:bg-white/5 mb-0.5">
              <span className="text-[9px] font-mono w-4 text-mut">{i + 1}</span>
              <span className="flex-1 text-[10px] font-mono text-fg truncate">{r.name.toUpperCase()}</span>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: r.missKm < 10 ? SEV_COLOR.DANGER : r.missKm < 100 ? SEV_COLOR.WATCH : '#91A6C2' }}>
                {r.missKm < 1000 ? `${r.missKm.toFixed(1)} km` : `${(r.missKm / 1000).toFixed(1)}e3 km`}
              </span>
              <span className="text-[8px] font-mono px-1 rounded border" style={{ color: SEV_COLOR[r.severity], borderColor: SEV_COLOR[r.severity] + '88' }}>
                {r.severity}
              </span>
            </button>
          ))}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="text-[9px] font-mono text-mut mb-2 leading-relaxed">
          top pair TCA {new Date(results[0].tcaMs).toISOString().slice(0, 16)} UTC (
          +{tcaOffsetMin({ tStartMs: scanInfo.t0, tcaMs: results[0].tcaMs }).toFixed(0)} min from start)
          · rel speed {results[0].relVelKmS.toFixed(2)} km/s. Select a row to place the TCA markers
          in the scene (both positions projected at the SAME GMST).
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-hi/25 bg-black/35 px-3 py-2 mb-2 font-mono text-[10px] text-fg">
          <span style={{ color: SEV_COLOR[selected.severity] }}>{selected.severity}</span>
          {' '}{(live?.name ?? 'PRIMARY').toUpperCase()} ↔ {selected.nameB.toUpperCase()}<br />
          separation line drawn at TCA — check the pair visually from the sun side before judging risk.
        </div>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW METHOD</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div>paired grid: both ephemerides sampled at IDENTICAL times</div>
          <div>d(t) = |r₁(t) − r₂(t)| · miss = min d · TCA = argmin · relV = |v₁ − v₂|(TCA)</div>
          <div className="text-mut mt-2">
            Limits disclosed: grid TCA ±step/2; TLE ephemeris error grows ~km/day
            unmodeled-drag-wise, so day-scale miss distances have their own uncertainty —
            a "12 km miss" on day 7 is screening, not an assessment. Severity bands use
            distance + relative speed only (labeled heuristic). Pc computation from
            covariance is intentionally NOT faked.
          </div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={selected ? <TcaOverlay pair={selected} simMs={simMs} /> : null} />
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
          <Radar size={16} className="text-crit" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              ANALYZE · CONJUNCTION
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
