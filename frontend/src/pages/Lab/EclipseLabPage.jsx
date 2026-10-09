import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sun } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { shadowStateKm, umbraApexKm, orbitEclipseKm, cylindricalEclipseFraction, sunEciUnit } from '../../lib/eclipse.js'
import { sunDirection } from '../../lib/coords.js'
import { stateToElementsKm, periodSec } from '../../lib/kepler.js'
import { R_EARTH_MEAN_KM, SUN_RADIUS_KM, AU_KM, RAD_PER_DEG } from '../../lib/constants.js'

const C_SUNLIT = '#34d399'
const C_PENUM = '#f59e0b'
const C_UMBRA = '#475569'
const REGION_COLOR = { SUNLIT: C_SUNLIT, PENUMBRA: C_PENUM, UMBRA: C_UMBRA }

/** Cross the cyclic sample ring into contiguous same-region polylines. */
function regionRuns(points) {
  const runs = []
  if (!points.length) return runs
  runs.push({ region: points[0].region, pts: [points[0].posKm] })
  for (let i = 1; i < points.length; i++) {
    const last = runs[runs.length - 1]
    if (points[i].region === last.region) last.pts.push(points[i].posKm)
    else runs.push({ region: points[i].region, pts: [points[i].posKm] })
  }
  if (runs.length > 1 && runs[0].region === runs[runs.length - 1].region) {
    runs[0].pts = runs.pop().pts.concat(runs[0].pts)
  }
  return runs
}

function EclipseOverlay({ analysis, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  const sunScene = sunDirection(new Date(simMs), new THREE.Vector3()).normalize()
  const rings = useMemo(() => {
    if (!analysis) return []
    return regionRuns(analysis.points).map((run) => ({
      color: REGION_COLOR[run.region],
      pts: run.pts.map((p) => eciToSceneKm(p[0], p[1], p[2], gmst, new THREE.Vector3()).toArray()),
    })).filter((r) => r.pts.length > 1)
  }, [analysis, Math.floor(simMs / 100)])
  return (
    <group>
      {rings.map((r, i) => (
        <Line key={i} points={r.pts} color={r.color} lineWidth={r.color === C_UMBRA ? 3 : 1.6}
              transparent opacity={r.color === C_SUNLIT ? 0.5 : 0.95} toneMapped={false} />
      ))}
      {/* sun marker + shadow axis (anti-sunward) */}
      <mesh position={sunScene.clone().multiplyScalar(2.35).toArray()}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color="#fbbf24" toneMapped={false} />
      </mesh>
      <Line points={[sunScene.clone().multiplyScalar(1.9).toArray(), [0, 0, 0]]}
            color="#fbbf24" lineWidth={1} transparent opacity={0.5} toneMapped={false} />
      {analysis && (
        <Line
          points={[sunScene.clone().multiplyScalar(-0.55).toArray(), sunScene.clone().multiplyScalar(-1.65).toArray()]}
          color="#1e293b" lineWidth={5} transparent opacity={0.55} toneMapped={false} />
      )}
    </group>
  )
}

export default function EclipseLabPage() {
  const engine = useEngine()
  const [altKm, setAltKm] = useState(550)
  const [betaDeg, setBetaDeg] = useState(0)
  const [liveOrbit, setLiveOrbit] = useState(null) // {aKm, nU, name} when captured
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const drag = useRef(null)

  const simMs = engine.simMs
  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  // Sun unit vector in ECI — changes ~0.01 deg/min, quantize to 10 s.
  const sunU = useMemo(() => sunEciUnit(new Date(simMs)), [Math.floor(simMs / 10000)])

  // Live satellite: ECI state + current shadow region (REAL-TIME PROPAGATION).
  const live = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const pos = { x: pv.position.x, y: pv.position.y, z: pv.position.z }
    const vel = { x: pv.velocity.x, y: pv.velocity.y, z: pv.velocity.z }
    return { name: rec.meta.name, pos, vel, shadow: shadowStateKm(pos, sunU) }
  }, [rec, Math.floor(simMs / 100), sunU])

  // Orbit-plane normal from beta angle: angle between sun vector and plane.
  // n = sin(beta)·sun + cos(beta)·w, w = unit(z − (z·sun)·sun)  (dec ≤ 23.44°
  // in the Meeus model, so sun is never parallel to z).
  const betaNormal = useMemo(() => {
    const zd = sunU[2]
    const w = [-sunU[0] * zd, -sunU[1] * zd, 1 - zd * zd]
    const wl = Math.hypot(...w)
    const b = betaDeg * RAD_PER_DEG
    return [0, 1, 2].map((i) => Math.sin(b) * sunU[i] + Math.cos(b) * (w[i] / wl))
  }, [sunU, betaDeg])

  const activeOrbit = liveOrbit ?? { aKm: R_EARTH_MEAN_KM + altKm, nU: betaNormal }

  const analyze = () => {
    if (!activeOrbit) return
    setAnalyzing(true)
    setTimeout(() => {
      try {
        const res = orbitEclipseKm(activeOrbit.aKm, activeOrbit.nU, sunU, { steps: 360 })
        setAnalysis({ ...res, capturedMs: simMs, sunU: [...sunU], name: liveOrbit?.name ?? 'TEST ORBIT' })
      } finally { setAnalyzing(false) }
    }, 16)
  }

  const useLive = () => {
    if (!live) return
    const el = stateToElementsKm({ posKm: live.pos, velKmS: live.vel })
    const h = [
      live.pos.y * live.vel.z - live.pos.z * live.vel.y,
      live.pos.z * live.vel.x - live.pos.x * live.vel.z,
      live.pos.x * live.vel.y - live.pos.y * live.vel.x,
    ]
    const hl = Math.hypot(...h)
    setLiveOrbit({ aKm: el.aKm, nU: h.map((c) => c / hl), name: live.name, e: el.e, iDeg: el.iDeg })
  }

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId) }
  const onPointerMove = (e) => { if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = () => { drag.current = null }

  const aUsed = analysis?.aKm ?? activeOrbit.aKm
  const periodMin = periodSec(aUsed) / 60
  const kCone = (SUN_RADIUS_KM - R_EARTH_MEAN_KM) / AU_KM
  const psiE = Math.asin(R_EARTH_MEAN_KM / (aUsed * Math.hypot(1, kCone))) - Math.atan(kCone)
  const rhoU = R_EARTH_MEAN_KM - aUsed * (SUN_RADIUS_KM - R_EARTH_MEAN_KM) / AU_KM
  const rhoP = R_EARTH_MEAN_KM + aUsed * (SUN_RADIUS_KM + R_EARTH_MEAN_KM) / AU_KM

  const badge = analysis
    ? `${((analysis.fractionUmbra + analysis.fractionPenumbra) * 100).toFixed(1)}% IN SHADOW`
    : 'NO ANALYSIS YET'

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sun size={15} className="text-amber-400" />
          <span className="font-semibold text-emerald-50 text-sm">Eclipse Analysis</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-emerald-400/40 text-emerald-300">
          SIMPLIFIED CONE MODEL
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-2">
        Umbra/penumbra cones from similar triangles (R⊕, R☉, 1 AU) against the
        low-precision Meeus sun ephemeris — the same scene-lighting direction,
        now with tests. Penumbral obscuration is a linear band approximation
        (labeled); fraction scan uses circular orbits, 360-step grid.
      </p>

      {live && (
        <div className="rounded-lg border border-emerald-400/20 bg-black/25 px-3 py-2 mb-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-emerald-600">{live.name.toUpperCase()} · LIVE</span>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border"
                  style={{ color: REGION_COLOR[live.shadow.region], borderColor: REGION_COLOR[live.shadow.region] + '88' }}>
              {live.shadow.region}
            </span>
          </div>
          <div className="text-[10px] font-mono text-emerald-100 tabular-nums mt-0.5">
            {live.shadow.region === 'SUNLIT'
              ? `r_anti = ${live.shadow.rAntiKm.toFixed(0)} km ${live.shadow.rAntiKm <= 0 ? '(sun-facing half-space)' : `· perp ${live.shadow.perpKm.toFixed(0)} km > ρp ${live.shadow.penumbraRadiusKm.toFixed(0)} km`}`
              : `perp ${live.shadow.perpKm.toFixed(0)} km vs ρu ${live.shadow.umbraRadiusKm.toFixed(0)} / ρp ${live.shadow.penumbraRadiusKm.toFixed(0)} km`}
            {live.shadow.region !== 'SUNLIT' && <> · obscuration {live.shadow.obscurationPct.toFixed(0)}%</>}
          </div>
          <div className="text-[9px] font-mono text-emerald-700 mt-0.5">REAL-TIME PROPAGATION — re-evaluated every tick from SGP4 state</div>
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-emerald-200 font-semibold">Test orbit altitude</span>
          {liveOrbit && (
            <button onClick={() => setLiveOrbit(null)}
                    className="px-1.5 py-0.5 rounded border text-[9px] font-mono border-red-400/40 text-red-300">
              CLEAR {liveOrbit.name.toUpperCase()} CAPTURE
            </button>
          )}
        </div>
        <input type="range" min={200} max={36000} step={50} value={altKm}
               disabled={!!liveOrbit} onChange={(e) => setAltKm(Number(e.target.value))}
               className="w-full accent-emerald-400 disabled:opacity-40" aria-label="Altitude" />
        <div className="flex justify-between text-[10px] font-mono text-emerald-50">
          <span>altitude h</span>
          <span>{liveOrbit ? `LIVE: a = ${liveOrbit.aKm.toFixed(0)} km (e=${liveOrbit.e.toFixed(4)}, i=${liveOrbit.iDeg.toFixed(1)}°)` : `${altKm} km → a = ${(R_EARTH_MEAN_KM + altKm).toFixed(0)} km`}</span>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-emerald-200 font-semibold">Sun angle β to plane</span>
          <span className="font-mono text-emerald-50">{betaDeg}°</span>
        </div>
        <input type="range" min={0} max={90} step={1} value={betaDeg}
               disabled={!!liveOrbit} onChange={(e) => setBetaDeg(Number(e.target.value))}
               className="w-full accent-amber-400 disabled:opacity-40" aria-label="Sun beta angle" />
        <div className="flex flex-wrap gap-1.5 mt-1">
          {[[0, 'β=0 MAX ECLIPSE'], [45, 'β=45°'], [90, 'β=90° SUNLIT']].map(([b, lbl]) => (
            <button key={b} onClick={() => { setLiveOrbit(null); setBetaDeg(b) }}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-mono border
                      ${!liveOrbit && betaDeg === b ? 'border-amber-400/60 text-amber-300 bg-amber-400/10' : 'border-emerald-400/20 text-emerald-600'}`}>
              {lbl}
            </button>
          ))}
          <button onClick={useLive} disabled={!live}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-cyan-400/40 text-cyan-300 disabled:opacity-40">
            USE LIVE ORBIT
          </button>
        </div>
      </div>

      <button onClick={analyze} disabled={analyzing}
              className="w-full mb-2 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-50">
        {analyzing ? 'SCANNING 360 POSITIONS…' : 'ANALYZE ECLIPSE (ON-DEMAND)'}
      </button>

      {analysis && (
        <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-emerald-200 leading-relaxed">
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-cyan-300">{analysis.name}</span>
            <span className="text-emerald-600">{badge}</span>
          </div>
          UMBRA <b style={{ color: C_UMBRA }}>{(analysis.fractionUmbra * 100).toFixed(1)}%</b>
          {' '}({(analysis.fractionUmbra * periodSec(analysis.aKm) / 60).toFixed(1)} min/orbit) ·{' '}
          PENUMBRA <b style={{ color: C_PENUM }}>{(analysis.fractionPenumbra * 100).toFixed(1)}%</b><br />
          orbit period {(periodSec(analysis.aKm) / 60).toFixed(1)} min · cylindrical textbook ref{' '}
          {(cylindricalEclipseFraction(analysis.aKm) * 100).toFixed(1)}% (Δ{' '}
          {((analysis.fractionUmbra - cylindricalEclipseFraction(analysis.aKm)) * 100).toFixed(2)} pp — cone is narrower at apogee-side altitudes)<br />
          <span className="text-emerald-700">snapshot at sim clock — β and a frozen at ANALYZE time (sun moves 0.011°/day)</span>
        </div>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-200">
          <div className="text-cyan-300">shadow cone geometry (similar triangles)</div>
          <div>umbra apex L_u = R·d/(R☉−R) = 6371·1.496e8/(695700−6371) = <b>{(umbraApexKm() / 1e3).toFixed(0)}e3 km</b></div>
          <div>at r = a = {aUsed.toFixed(0)} km: ρu = R − r·(R☉−R)/d = <b>{rhoU.toFixed(1)} km</b></div>
          <div>ρp = R + r·(R☉+R)/d = <b>{rhoP.toFixed(1)} km</b> → penumbral band {(rhoP - rhoU).toFixed(1)} km (thin!)</div>
          <div className="mt-1 text-cyan-300">analytic cone root (sun-plane orbit)</div>
          <div>ψ_e = asin(R/(a·√(1+k²))) − atan(k), k = (R☉−R)/d = {kCone.toExponential(3)}</div>
          <div>umbra fraction = ψ_e/π = <b>{(psiE / Math.PI * 100).toFixed(2)}%</b> vs scanned{' '}
            <b>{analysis ? (analysis.fractionUmbra * 100).toFixed(2) + '%' : '—'}</b> (0.5° grid)</div>
          <div className="mt-1 text-emerald-700">
            region test: r_anti = p·(−ŝun) ≤ 0 → SUNLIT half-space; else perp = √(|p|²−r_anti²) vs ρu/ρp.
            Penumbral obscuration = linear ramp (ρp−perp)/(ρp−ρu) — approximation, labeled.
            Sources: SUN_RADIUS_KM = 6.957e5 km (IAU nominal), AU_KM, R_EARTH_MEAN_KM — constants.js.
          </div>
        </div>
      </details>

      <div className="flex gap-2 mt-2 text-[8px] font-mono">
        <span style={{ color: C_SUNLIT }}>— sunlit</span>
        <span style={{ color: C_PENUM }}>— penumbra</span>
        <span style={{ color: '#94a3b8' }}>━ umbra</span>
        <span className="text-amber-400">● sun (scene dir)</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission overlay={<EclipseOverlay analysis={analysis} simMs={simMs} />} />
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
          <Sun size={16} className="text-amber-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-emerald-300 align-middle">
              ANALYZE · ECLIPSE
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
