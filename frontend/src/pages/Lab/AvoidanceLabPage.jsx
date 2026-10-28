import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Orbit } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { screenCatalogKm } from '../../lib/conjunction.js'
import { MU_EARTH_KM3S2 } from '../../lib/constants.js'
import {
  cwImpulseDisplacementKm, missAfterManeuverKm, recommendManeuverKm,
  relativeStateAtTcaKm, toHillFrameKm, meanMotionRadS,
} from '../../lib/avoidance.js'

/** SGP4 sampler: same M19 contract the analytic tests exercised. */
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

const visVivaAkm = (pv) => {
  const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z)
  const v = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)
  return 1 / (2 / r - v * v / MU_EARTH_KM3S2)
}

function TcaOverlay({ pair }) {
  const gmst = sm.gstime(new Date(pair.tcaMs))
  const a = eciToSceneKm(pair.a[0], pair.a[1], pair.a[2], gmst, new THREE.Vector3()).toArray()
  const b = eciToSceneKm(pair.b[0], pair.b[1], pair.b[2], gmst, new THREE.Vector3()).toArray()
  return (
    <group>
      <Line points={[a, b]} color="#38D9FF" lineWidth={2} transparent opacity={0.9} toneMapped={false} />
      {[a, b].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.014, 10, 10]} />
          <meshBasicMaterial color={i === 0 ? '#38D9FF' : '#FF647C'} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Hill-plane (in-track × radial) view of the miss point before/after the burn. */
function HillDiagram({ m0, after, targetKm }) {
  const W = 220, H = 130, cx = W / 2, cy = H / 2
  const span = Math.max(1.15 * Math.hypot(m0.x, m0.y, 0), 1.15 * Math.hypot(after.x, after.y, 0), targetKm * 1.3, 0.5)
  const k = (W / 2 - 14) / span
  const px = (x, y) => [cx + y * k, cy - x * k] // radial up, in-track right
  const [x0, y0] = px(m0.x, m0.y)
  const [x1, y1] = px(after.x, after.y)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hill plane miss diagram">
      <line x1={0} y1={cy} x2={W} y2={cy} stroke="#91A6C2" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="#91A6C2" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
      <circle cx={cx} cy={cy} r={targetKm * k} fill="none" stroke="#34D399" strokeWidth={1} strokeDasharray="4 3" />
      <circle cx={cx} cy={cy} r={2.5} fill="#F5B942" />
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#38D9FF" strokeWidth={1.4} />
      <circle cx={x0} cy={y0} r={3.5} fill="#FF647C" />
      <circle cx={x1} cy={y1} r={3.5} fill="#34D399" />
      <text x={4} y={10} fontSize={7} fill="#91A6C2" fontFamily="monospace">RADIAL ↑ · IN-TRACK → · secondary at +</text>
      <text x={4} y={H - 4} fontSize={7} fill="#34D399" fontFamily="monospace">target circle {targetKm.toFixed(2)} km</text>
    </svg>
  )
}

export default function AvoidanceLabPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [windowDays, setWindowDays] = useState(2)
  const [bandKm, setBandKm] = useState(250)
  const [scenario, setScenario] = useState(null) // { aKm, periodS, m0, relVel, nameB, tcaMs, pair }
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [leadMin, setLeadMin] = useState(45)
  const [dvR, setDvR] = useState(0)   // m/s, signed
  const [dvI, setDvI] = useState(0)   // m/s in-track
  const [dvC, setDvC] = useState(0)   // m/s cross
  const [targetKm, setTargetKm] = useState(1)
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  const live = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    return { name: rec.meta.name, aKm: visVivaAkm(pv) }
  }, [rec, Math.floor(simMs / 100)])

  const scan = () => {
    if (!rec) return
    setScanning(true); setError(null); setScenario(null)
    setTimeout(() => {
      try {
        const t0 = simMs, t1 = simMs + windowDays * 86400e3
        const stepS = windowDays <= 1 ? 60 : windowDays <= 3 ? 120 : 240
        const primaryRec = rec.rec
        const aPrim = visVivaAkm(sm.propagate(primaryRec, new Date(t0)))
        const cands = []
        for (const other of engine.records) {
          if (other.meta.id === rec.meta?.id) continue
          if (cands.length >= 60) break
          try {
            const pv = sm.propagate(other.rec, new Date(t0))
            if (!pv?.position || Number.isNaN(pv.position.x)) continue
            if (Math.abs(visVivaAkm(pv) - aPrim) <= bandKm) {
              cands.push({ name: other.meta.name, id: other.meta.id, sampler: sgp4Sampler(other.rec) })
            }
          } catch { /* skip un-propagatable */ }
        }
        const pairs = screenCatalogKm({
          samplerPrimary: sgp4Sampler(primaryRec), candidates: cands,
          tStartMs: t0, tEndMs: t1, stepS, limitPairs: 1,
        })
        if (!pairs.length) throw new Error('no close approach found in window — widen the band or the window')
        const best = pairs[0]
        const candRec = engine.records.find((x) => x.meta.id === best.id)
        const pa = sgp4Sampler(primaryRec)(best.tcaMs)
        const pb = sgp4Sampler(candRec.rec)(best.tcaMs)
        const rs = relativeStateAtTcaKm({
          samplerA: sgp4Sampler(primaryRec), samplerB: sgp4Sampler(candRec.rec), tcaMs: best.tcaMs,
        })
        const hill = toHillFrameKm({ rPrimeKm: rs.aPosKm, vPrimeKm: rs.aVelKmS, relPosKm: rs.relPosKm })
        const aEq = rs.rMagKm // circular-reference radius = primary |r| at TCA (disclosed)
        setScenario({
          aKm: aEq, periodS: 2 * Math.PI / meanMotionRadS(aEq),
          m0: hill.relPosHillKm, relVelKmS: best.relVelKmS, missKm: best.missKm,
          nameB: candRec.meta.name, tcaMs: best.tcaMs, primary: rec.meta.name,
          pair: { a: [pa.posKm.x, pa.posKm.y, pa.posKm.z], b: [pb.posKm.x, pb.posKm.y, pb.posKm.z] },
        })
      } catch (err) {
        setError(err.message)
      } finally { setScanning(false) }
    }, 16)
  }

  const analysis = useMemo(() => {
    if (!scenario) return null
    const leadS = leadMin * 60
    const disp = cwImpulseDisplacementKm({
      aKm: scenario.aKm, leadS,
      dvRadialKmS: dvR / 1000, dvInTrackKmS: dvI / 1000, dvCrossKmS: dvC / 1000,
    })
    const after = missAfterManeuverKm({ missVecKm: scenario.m0, dispKm: disp })
    const recBurn = recommendManeuverKm({
      missVecKm: scenario.m0, aKm: scenario.aKm, leadS, targetMissKm: targetKm,
    })
    return { disp, after, recBurn }
  }, [scenario, leadMin, dvR, dvI, dvC, targetKm])

  const applyRec = () => {
    const r = analysis?.recBurn
    if (!r?.needed || r.dvKmS === null) return
    setDvR(0); setDvC(0); setDvI(0)
    if (r.axis === 'radial') setDvR(r.dvSignedKmS * 1000)
    else if (r.axis === 'inTrack') setDvI(r.dvSignedKmS * 1000)
    else setDvC(r.dvSignedKmS * 1000)
  }

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const dvSlider = (label, value, setValue, unit) => (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between text-[10px] mb-0.5">
        <span className="text-fg font-semibold">{label}</span>
        <span className="font-mono text-fg">{value > 0 ? '+' : ''}{value.toFixed(1)} {unit}</span>
      </div>
      <input type="range" min={-30} max={30} step={0.5} value={value}
             onChange={(e) => setValue(Number(e.target.value))}
             aria-label={label} className="w-full accent-hi h-5" />
    </div>
  )

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Orbit size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Avoidance Burn Planner</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/40 text-cau">
          SIMPLIFIED — CW LINEARIZATION
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        Clohessy-Wiltshire relative dynamics on a circular reference: one
        impulsive Δv applied leadS before closest approach, exact closed-form
        displacement at TCA. Valid for separations ≪ orbital radius
        (screening geometry). No execution errors, the secondary keeps its
        trajectory, covariance-based Pc remains out of scope (M19). Math
        validated against hand-exact CW values at Ωτ = π/2, π, 2π.
      </p>

      {live && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2 text-[10px] font-mono">
          <span className="text-mut">PRIMARY:</span> <span className="text-fg">{live.name.toUpperCase()}</span>
          {' '}· a {live.aKm.toFixed(0)} km · REAL-TIME SGP4
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-baseline justify-between text-[10px] mb-0.5">
          <span className="text-fg font-semibold">Screening window</span>
          <span className="font-mono text-fg">{windowDays} day{windowDays > 1 ? 's' : ''}</span>
        </div>
        <input type="range" min={1} max={5} step={1} value={windowDays}
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
        {scanning ? 'SCREENING + PROJECTING TO HILL FRAME…' : 'FIND CLOSEST APPROACH (ON-DEMAND)'}
      </button>
      {error && <div className="text-[10px] font-mono text-crit mb-2">{error}</div>}

      {scenario && analysis && (
        <div className="rounded-lg border border-hi/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-fg leading-relaxed">
          <div>{(scenario.primary ?? 'PRIMARY').toUpperCase()} ↔ {scenario.nameB.toUpperCase()}
            {' '}· TCA {new Date(scenario.tcaMs).toISOString().slice(0, 16)} UTC</div>
          <div>ECI miss {scenario.missKm.toFixed(2)} km · rel speed {scenario.relVelKmS.toFixed(2)} km/s</div>
          <div>Hill miss vector [rad, in-trk, cross]: {scenario.m0.x.toFixed(2)}, {scenario.m0.y.toFixed(2)}, {scenario.m0.z.toFixed(2)} km</div>
          <div className="text-mut">ref period {(scenario.periodS / 60).toFixed(1)} min · Ω = {Math.sqrt(MU_EARTH_KM3S2 / scenario.aKm ** 3).toExponential(3)} rad/s</div>
        </div>
      )}

      {scenario && (
        <div className="mb-1">
          <div className="flex items-baseline justify-between text-[10px] mb-0.5">
            <span className="text-fg font-semibold">Burn lead before TCA</span>
            <span className="font-mono text-fg">{leadMin} min ({(leadMin * 60 / scenario.periodS).toFixed(2)} periods)</span>
          </div>
          <input type="range" min={5} max={240} step={5} value={leadMin}
                 onChange={(e) => setLeadMin(Number(e.target.value))}
                 aria-label="Lead time" className="w-full accent-hi h-5" />
          <div className="flex items-baseline justify-between text-[10px] mt-1 mb-0.5">
            <span className="text-fg font-semibold">Target miss</span>
            <span className="font-mono text-fg">{targetKm.toFixed(2)} km</span>
          </div>
          <input type="range" min={0.1} max={5} step={0.1} value={targetKm}
                 onChange={(e) => setTargetKm(Number(e.target.value))}
                 aria-label="Target miss" className="w-full accent-hi h-5" />
        </div>
      )}

      {scenario && (
        <div className="rounded-lg border border-cyan-400/20 bg-black/25 px-3 py-2 mb-2">
          {dvSlider('Δv radial (+out)', dvR, setDvR, 'm/s')}
          {dvSlider('Δv in-track (+prograde)', dvI, setDvI, 'm/s')}
          {dvSlider('Δv cross-track', dvC, setDvC, 'm/s')}
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mt-1">
            <div className="text-mut">burn → TCA displacement</div>
            <div className="text-right text-fg">
              {analysis.disp.dxKm.toFixed(2)}, {analysis.disp.dyKm.toFixed(2)}, {analysis.disp.dzKm.toFixed(2)} km
            </div>
            <div className="text-mut">miss after burn</div>
            <div className="text-right" style={{ color: analysis.after.missKm >= targetKm ? '#34D399' : '#FF647C' }}>
              {analysis.after.missKm.toFixed(2)} km {analysis.after.missKm >= targetKm ? '✓ ≥ target' : '✗ < target'}
            </div>
          </div>
        </div>
      )}

      {analysis?.recBurn && (
        <div className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 mb-2 font-mono text-[10px] text-fg">
          {!analysis.recBurn.needed
            ? <>no burn needed — natural miss {analysis.recBurn.naturalMissKm.toFixed(2)} km ≥ target</>
            : analysis.recBurn.dvKmS === null
              ? <>no single-axis burn can reach this target at this lead time (zero CW authority — try a different lead)</>
              : <>RECOMMENDED: <span className="text-ok">{analysis.recBurn.axis.toUpperCase()}</span> burn{' '}
                  <span className="text-ok">{Math.abs(analysis.recBurn.dvSignedKmS * 1000).toFixed(1)} m/s</span>
                  {' '}{analysis.recBurn.dvSignedKmS >= 0 ? 'pro' : 'retro'} at {leadMin} min lead
                  <button onClick={applyRec}
                          className="block mt-1 px-2 py-1 rounded bg-ok text-bg text-[10px] font-semibold">
                    APPLY TO SLIDERS
                  </button>
                </>}
        </div>
      )}

      {scenario && (
        <div className="rounded-lg border border-hi/20 bg-black/25 p-1.5 mb-2">
          <HillDiagram m0={scenario.m0} targetKm={targetKm}
                      after={{ x: analysis.after.x, y: analysis.after.y }} />
        </div>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div>x(τ) = 2(cos Ωτ−1)·Δv_R/Ω + 2 sin Ωτ·Δv_I/Ω</div>
          <div>y(τ) = (2−2cos Ωτ)·Δv_R/Ω + (4 sin Ωτ−3Ωτ)·Δv_I/Ω</div>
          <div>z(τ) = sin Ωτ·Δv_C/Ω, Ω = √(μ/a³), a = {scenario?.aKm.toFixed(0)} km</div>
          <div>miss after = |m₀ − δ(τ)| · {analysis ? `τ = ${leadMin * 60}s → Ωτ = ${(Math.sqrt(MU_EARTH_KM3S2 / scenario.aKm ** 3) * leadMin * 60).toFixed(2)} rad` : ''}</div>
          <div className="text-mut mt-2">
            Ignored: J2 secular drift between burn and TCA (≈ Ω̇·τ ~ mdeg for
            minute-scale leads), eccentricity of both orbits (reference is the
            circular orbit matching the primary radius at TCA), finite-burn
            effects, Δv budget and attitude constraints, the secondary's own
            maneuver options (we plan for us only). The −3Ωτ secular term is
            why very long leads make prograde burns close the gap in-track —
            the recommendation searches both thrust signs per axis and picks
            the cheapest boundary root of |m₀ − Δv·r̂resp| = target.
          </div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={scenario ? <TcaOverlay pair={scenario.pair} /> : null} />
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
          <Orbit size={16} className="text-hi" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              ANALYZE · AVOIDANCE
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
