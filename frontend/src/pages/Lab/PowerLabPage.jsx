import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, BatteryCharging } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { sunEciUnit, sunDistanceAu } from '../../lib/sun.js'
import { shadowStateKm } from '../../lib/eclipse.js'
import { sunDirection } from '../../lib/coords.js'
import { powerFactorForShadow, solarFluxWm2, analyzeOrbitPowerKm, REPRESENTATIVE_DEFAULTS } from '../../lib/power.js'
import { stateToElementsKm } from '../../lib/kepler.js'
import { R_EARTH_MEAN_KM, RAD_PER_DEG } from '../../lib/constants.js'

const C_SUNLIT = '#38D9FF'
const C_PENUM = '#F5B942'
const C_UMBRA = '#475569'

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

function PowerOverlay({ analysis, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  const sunScene = sunDirection(new Date(simMs), new THREE.Vector3()).normalize()
  const rings = useMemo(() => {
    if (!analysis) return []
    return regionRuns(analysis.points).map((run) => ({
      color: run.region === 'SUNLIT' ? C_SUNLIT : run.region === 'PENUMBRA' ? C_PENUM : C_UMBRA,
      pts: run.pts.map((p) => eciToSceneKm(p[0], p[1], p[2], gmst, new THREE.Vector3()).toArray()),
    })).filter((r) => r.pts.length > 1)
  }, [analysis, Math.floor(simMs / 100)])
  return (
    <group>
      {rings.map((r, i) => (
        <Line key={i} points={r.pts} color={r.color} lineWidth={r.color === C_UMBRA ? 3 : 1.6}
              transparent opacity={r.color === C_SUNLIT ? 0.5 : 0.95} toneMapped={false} />
      ))}
      <mesh position={[sunScene.x * 2.35, sunScene.y * 2.35, sunScene.z * 2.35]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color="#F5B942" toneMapped={false} />
      </mesh>
    </group>
  )
}

function Slider({ label, unit, min, max, step, value, onChange, fmt = (v) => v }) {
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-[10px] mb-0.5">
        <span className="text-fg font-semibold">{label}</span>
        <span className="font-mono text-fg tabular-nums">{fmt(value)} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))}
             aria-label={label} className="w-full accent-hi h-5" />
    </div>
  )
}

export default function PowerLabPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [altKm, setAltKm] = useState(550)
  const [betaDeg, setBetaDeg] = useState(0)
  const [liveOrbit, setLiveOrbit] = useState(null)
  const [area, setArea] = useState(REPRESENTATIVE_DEFAULTS.arrayAreaM2)
  const [load, setLoad] = useState(REPRESENTATIVE_DEFAULTS.busLoadW)
  const [incidence, setIncidence] = useState(0)
  const [degrad, setDegrad] = useState(REPRESENTATIVE_DEFAULTS.degradationFactor)
  const [eff, setEff] = useState(REPRESENTATIVE_DEFAULTS.cellEfficiency)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  const sunU = useMemo(() => sunEciUnit(new Date(simMs)), [Math.floor(simMs / 10000)])

  // Live instantaneous array output for the watched satellite: real SGP4
  // position through the validated cone -> linear obscuration -> cos law.
  const live = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const pos = { x: pv.position.x, y: pv.position.y, z: pv.position.z }
    const vel = { x: pv.velocity.x, y: pv.velocity.y, z: pv.velocity.z }
    const shadow = shadowStateKm(pos, sunU)
    const flux = solarFluxWm2(new Date(simMs))
    const pMax = flux * area * eff * degrad * Math.cos(incidence * RAD_PER_DEG)
    return { name: rec.meta.name, pos, vel, shadow, factor: powerFactorForShadow(shadow),
      watts: pMax * powerFactorForShadow(shadow), pMax }
  }, [rec, Math.floor(simMs / 100), sunU, area, eff, degrad, incidence])

  const betaNormal = useMemo(() => {
    const zd = sunU[2]
    const w = [-sunU[0] * zd, -sunU[1] * zd, 1 - zd * zd]
    const wl = Math.hypot(...w)
    const b = betaDeg * RAD_PER_DEG
    return [0, 1, 2].map((i) => Math.sin(b) * sunU[i] + Math.cos(b) * (w[i] / wl))
  }, [sunU, betaDeg])

  const activeOrbit = liveOrbit ?? { aKm: R_EARTH_MEAN_KM + altKm, nU: betaNormal }

  const analyze = () => {
    setAnalyzing(true)
    setTimeout(() => {
      try {
        const res = analyzeOrbitPowerKm({
          aKm: activeOrbit.aKm, nU: activeOrbit.nU, sunU, date: new Date(simMs),
          params: { arrayAreaM2: area, busLoadW: load, incidenceDeg: incidence,
            cellEfficiency: eff, degradationFactor: degrad },
          steps: 360,
        })
        setAnalysis({ ...res, capturedMs: simMs, name: liveOrbit?.name ?? 'TEST ORBIT' })
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

  const marginColor = !analysis ? 'text-mut'
    : analysis.marginWhPerOrbit >= 1.2 ? 'text-ok'
    : analysis.marginWhPerOrbit >= 1 ? 'text-cau' : 'text-crit'

  const rAuNow = analysis ? sunDistanceAu(new Date(analysis.capturedMs)) : sunDistanceAu(new Date(simMs))

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <BatteryCharging size={15} className="text-ok" />
          <span className="font-semibold text-fg text-sm">Solar Power &amp; Battery</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cau/40 text-cau">
          SIMPLIFIED MODEL
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        Array output = S·A·η·derate·cos(incidence), with S the solar constant
        scaled by the real Earth-Sun distance (inverse square). Eclipse duty
        cycle comes from the validated M13 cone scan — umbra 0 W, penumbra at
        its linear-ramp average (half output). Battery sized on design-practice
        DOD / round-trip / specific-energy values (representative, labeled).
      </p>

      {live && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-mut">{live.name.toUpperCase()} · LIVE</span>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-hi/40 text-hi">
              {live.watts.toFixed(0)} W · {live.shadow.region}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-black/50 overflow-hidden">
            <div className="h-full bg-pri" style={{ width: `${(live.factor * 100).toFixed(1)}%` }} />
          </div>
          <div className="text-[9px] font-mono text-mut mt-1">
            {live.factor * 100 < 99.5
              ? `output factor ${live.factor.toFixed(3)} (obscuration ${live.shadow.obscurationPct.toFixed(0)}%)`
              : `factor 1.000 of ${live.pMax.toFixed(0)} W sunlit maximum`} · REAL-TIME from SGP4 position
          </div>
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-fg font-semibold">Test orbit</span>
          {liveOrbit && (
            <button onClick={() => setLiveOrbit(null)}
                    className="px-1.5 py-0.5 rounded border text-[9px] font-mono border-crit/40 text-crit">
              CLEAR CAPTURE
            </button>
          )}
        </div>
        <input type="range" min={200} max={36000} step={50} value={altKm} disabled={!!liveOrbit}
               onChange={(e) => setAltKm(Number(e.target.value))}
               className="w-full accent-hi disabled:opacity-40" aria-label="Altitude" />
        <div className="flex justify-between text-[10px] font-mono text-fg mb-1">
          <span>altitude h</span>
          <span>{liveOrbit ? `LIVE: a = ${liveOrbit.aKm.toFixed(0)} km (e=${liveOrbit.e.toFixed(4)}, i=${liveOrbit.iDeg.toFixed(1)}°)` : `${altKm} km → a = ${(R_EARTH_MEAN_KM + altKm).toFixed(0)} km`}</span>
        </div>
        <input type="range" min={0} max={90} step={1} value={betaDeg} disabled={!!liveOrbit}
               onChange={(e) => setBetaDeg(Number(e.target.value))}
               className="w-full accent-amber-400 disabled:opacity-40" aria-label="Sun beta angle" />
        <div className="flex justify-between text-[10px] font-mono text-fg">
          <span>sun angle β</span><span>{betaDeg}° {betaDeg === 0 ? '(max eclipse)' : betaDeg >= 70 ? '(near-continuous sun)' : ''}</span>
        </div>
        <div className="flex gap-1.5 mt-1">
          <button onClick={useLive} disabled={!live}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-cyan-400/40 text-cyan-300 disabled:opacity-40">
            USE LIVE ORBIT
          </button>
        </div>
      </div>

      <Slider label="Array area" unit="m²" min={1} max={120} step={1} value={area} onChange={setArea} />
      <Slider label="Cell efficiency" unit="η" min={0.15} max={0.35} step={0.01} value={eff} onChange={setEff} fmt={(v) => v.toFixed(2)} />
      <Slider label="EOL derate (radiation+MMOD)" unit="×" min={0.75} max={1} step={0.01} value={degrad} onChange={setDegrad} fmt={(v) => v.toFixed(2)} />
      <Slider label="Sun incidence" unit="°" min={0} max={90} step={1} value={incidence} onChange={setIncidence} />
      <Slider label="Average bus load" unit="W" min={50} max={2500} step={10} value={load} onChange={setLoad} />

      <button onClick={analyze} disabled={analyzing}
              className="w-full mb-2 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi disabled:opacity-50">
        {analyzing ? 'SCANNING SHADOW + ENERGY…' : 'ANALYZE POWER (ON-DEMAND)'}
      </button>

      {analysis && (
        <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-fg leading-relaxed">
          <div className="flex justify-between text-[9px] mb-1">
            <span className="text-cyan-300">{analysis.name}</span>
            <span className={marginColor}>MARGIN {analysis.marginWhPerOrbit.toFixed(2)}×</span>
          </div>
          flux S = {analysis.fluxWm2.toFixed(1)} W/m² (R = {rAuNow.toFixed(5)} AU)<br />
          sunlit max <b>{analysis.sunlitPowerW.toFixed(0)} W</b> · umbra {(analysis.fractionUmbra * 100).toFixed(1)}% ·
          penumbra {(analysis.fractionPenumbra * 100).toFixed(1)}% · duty {analysis.dutyCycle.toFixed(3)}<br />
          generation <b className="text-ok">{analysis.genWhPerOrbit.toFixed(1)} Wh/orbit</b> vs demand{' '}
          <b className="text-cau">{analysis.demandWhPerOrbit.toFixed(1)} Wh/orbit</b> ({(analysis.periodS / 60).toFixed(1)} min)<br />
          battery: shortfall {analysis.eclipseShortfallWh.toFixed(1)} Wh → capacity{' '}
          <b>{analysis.batteryCapacityWh.toFixed(1)} Wh</b> ≈ <b>{analysis.batteryMassKg.toFixed(1)} kg</b> (DOD 30%, 150 Wh/kg)<br />
          array sized to margin 1: <b>{Number.isFinite(analysis.areaForMargin1M2) ? `${analysis.areaForMargin1M2.toFixed(1)} m²` : '∞ (no duty)'}</b>
          <div className="text-mut mt-1">snapshot at ANALYZE time — sun β, a and date frozen</div>
        </div>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">S = S₀/R² — irradiance at true Earth-Sun distance</div>
          <div>= 1361/{rAuNow.toFixed(5)}² = {solarFluxWm2(new Date(simMs)).toFixed(1)} W/m² (Meeus low-precision R, ±3.4% annual)</div>
          <div className="text-cyan-300 mt-2">P_sunlit = S·A·η·derate·cos(inc)</div>
          <div>= {solarFluxWm2(new Date(simMs)).toFixed(1)}·{area}·{eff.toFixed(2)}·{degrad.toFixed(2)}·cos({incidence}°) = {(solarFluxWm2(new Date(simMs)) * area * eff * degrad * Math.cos(incidence * RAD_PER_DEG)).toFixed(1)} W</div>
          <div className="text-cyan-300 mt-2">duty = 1 − f_umbra − f_pen/2 (linear penumbral ramp average)</div>
          <div>E_gen = P_sunlit · duty · T/3600 · E_dem = P_bus · T/3600 · margin = E_gen/E_dem</div>
          <div className="text-cyan-300 mt-2">battery worst-eclipse shortfall</div>
          <div>E_ecl = T/3600·[P_bus·f_u + max(P_bus − 0.5·P_sun, 0)·f_p]</div>
          <div>capacity = E_ecl/(DOD·η_rt), mass = capacity/(Wh/kg)</div>
          <div className="text-mut mt-2">
            Simplifications (disclosed): albedo/IR ignored (minor for orbit-average power),
            no temperature/spectral coupling, single incidence angle, circular-orbit scan
            (M13), DOD 0.30 / 150 Wh/kg / 95% η_rt = representative Li-ion design practice,
            NOT a mission data sheet. Constants: SOLAR_CONSTANT_WM2 = 1361 (ASTM E490) — constants.js.
          </div>
        </div>
      </details>

      <div className="flex gap-2 mt-2 text-[8px] font-mono">
        <span style={{ color: C_SUNLIT }}>— sunlit</span>
        <span style={{ color: C_PENUM }}>— penumbra</span>
        <span style={{ color: '#94a3b8' }}>━ umbra (0 W)</span>
        <span className="text-amber-400">● sun</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={<PowerOverlay analysis={analysis} simMs={simMs} />} />
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
          <BatteryCharging size={16} className="text-ok" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              ANALYZE · SOLAR POWER
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
