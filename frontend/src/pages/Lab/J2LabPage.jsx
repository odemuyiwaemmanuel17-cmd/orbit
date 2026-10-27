import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Orbit } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { j2SecularRatesDegDay, propagateJ2SecularKm, j2MeanMotionRadS, J2_SPECIAL_INCLINATIONS_DEG } from '../../lib/j2.js'
import { orbitPolylineKm, stateToElementsKm, sunSyncInclinationDeg } from '../../lib/kepler.js'
import { R_EARTH_EQUATORIAL_KM } from '../../lib/constants.js'

const GHOST_DAYS = [30, 90, 365]
const GHOST_COLORS = ['#2dd4bf', '#F5B942', '#FF647C']

function J2Overlay({ el }) {
  const engine = useEngine()
  const gmst = sm.gstime(new Date(engine.simMs))
  const TMP = useMemo(() => new THREE.Vector3(), [])
  const { base, ghosts, pole } = useMemo(() => {
    const project = (elems) => {
      const flat = orbitPolylineKm(elems, 96)
      const pts = []
      for (let k = 0; k <= 96; k++) {
        eciToSceneKm(flat[k * 3], flat[k * 3 + 1], flat[k * 3 + 2], gmst, TMP)
        pts.push([TMP.x, TMP.y, TMP.z])
      }
      return pts
    }
    return {
      base: project(el),
      ghosts: GHOST_DAYS.map((d) => project(propagateJ2SecularKm(el, d * 86400))),
      pole: (() => {
        // celestial north reference: ECI +Z at 12000 km through the same
        // projection contract (eciToSceneKm takes ECI KILOMETERS)
        eciToSceneKm(0, 0, 12000, gmst, TMP)
        return [[0, 0, 0], [TMP.x, TMP.y, TMP.z]]
      })(),
    }
  }, [el, Math.floor(engine.simMs / 100)])
  return (
    <group>
      <Line points={base} color="#38D9FF" lineWidth={1.8} transparent opacity={0.95} toneMapped={false} />
      {ghosts.map((g, i) => (
        <Line key={GHOST_DAYS[i]} points={g} color={GHOST_COLORS[i]} lineWidth={1.1} dashed dashSize={0.06}
              gapSize={0.04} transparent opacity={0.75} toneMapped={false} />
      ))}
      <Line points={pole} color="#91A6C2" lineWidth={0.8} transparent opacity={0.5} toneMapped={false} />
      {pole && (
        <mesh position={pole[1]}>
          <sphereGeometry args={[0.011, 8, 8]} />
          <meshBasicMaterial color="#91A6C2" toneMapped={false} />
        </mesh>
      )}
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

export default function J2LabPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [altKm, setAltKm] = useState(550)
  const [eEcc, setEEcc] = useState(0.001)
  const [iDeg, setIDeg] = useState(53)
  const [raanDeg, setRaanDeg] = useState(40)
  const [liveOrbit, setLiveOrbit] = useState(null)
  const drag = useRef(null)

  const satId = engine.selectedId ?? engine.records[0]?.meta?.id ?? null
  const rec = satId ? engine.recordFor(satId) : null

  const live = useMemo(() => {
    if (!rec) return null
    const pv = sm.propagate(rec.rec, new Date(simMs))
    if (!pv?.position || Number.isNaN(pv.position.x)) return null
    const el = stateToElementsKm({
      posKm: { x: pv.position.x, y: pv.position.y, z: pv.position.z },
      velKmS: { x: pv.velocity.x, y: pv.velocity.y, z: pv.velocity.z },
    })
    let rates = null
    try { rates = j2SecularRatesDegDay(el) } catch { /* unclassified regime */ }
    return { name: rec.meta.name, el, rates }
  }, [rec, Math.floor(simMs / 100)])

  const testEl = liveOrbit ?? {
    aKm: R_EARTH_EQUATORIAL_KM + altKm, e: eEcc, iDeg, raanDeg,
    argPerigeeDeg: 90, trueAnomalyDeg: 30,
  }
  const rates = useMemo(() => j2SecularRatesDegDay(testEl), [testEl])
  const mm = useMemo(() => j2MeanMotionRadS(testEl), [testEl])
  const ssoI = useMemo(() => sunSyncInclinationDeg(testEl.aKm), [testEl.aKm])
  const drift100 = rates.raanDegDay * 100

  const useLive = () => {
    if (!live) return
    setLiveOrbit({ ...live.el, name: live.name })
  }

  const onPointerDown = (ev) => { drag.current = { x: ev.clientX, y: ev.clientY }
    ev.currentTarget.setPointerCapture(ev.pointerId) }
  const onPointerMove = (ev) => { if (!drag.current) return
    engine.rotateBy((ev.clientX - drag.current.x) * 0.006, (ev.clientY - drag.current.y) * 0.005)
    drag.current = { x: ev.clientX, y: ev.clientY } }
  const onPointerUp = () => { drag.current = null }

  const near = (v, t, tol) => Math.abs(v - t) < tol
  const flags = [
    near(iDeg, J2_SPECIAL_INCLINATIONS_DEG.criticalApsidal, 1.5) && { label: 'CRITICAL i — ω FROZEN', cls: 'border-ok/50 text-ok' },
    ssoI && near(iDeg, ssoI, 0.8) && { label: 'SUN-SYNC — 1 ORBIT PLANE/YR', cls: 'border-cyan-400/50 text-cyan-300' },
    near(iDeg, J2_SPECIAL_INCLINATIONS_DEG.magicMeanMotion, 1) && { label: 'MAGIC i — n̄ = n', cls: 'border-amber-400/50 text-amber-300' },
    iDeg > 90 && { label: 'RETROGRADE — EASTWARD NODE', cls: 'border-hi/40 text-hi' },
  ].filter(Boolean)

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Orbit size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">J2 Secular Drift</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-hi/40 text-hi">
          ANALYTICAL — FIRST ORDER
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        Earth's oblateness (J2 = 1.0826e-3, EGM-96) makes the orbit plane
        and ellipse precess: the bulge torques the pole of the orbit. Rates
        are the classical averaged secular set (Brouwer/Kozai form, as
        documented by SatelliteToolbox.jl / Vallado ch.9) — secular terms
        only; short-period wiggles (&lt;1° amplitude) are not shown.
      </p>

      {live && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-mut">{live.name.toUpperCase()} · LIVE</span>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-hi/40 text-hi">
              {live.rates ? `${live.rates.raanDegDay.toFixed(3)}°/day node` : 'BELOW VALID RANGE'}
            </span>
          </div>
          <div className="text-[10px] font-mono text-fg mt-0.5">
            i {live.el.iDeg.toFixed(2)}° · a {live.el.aKm.toFixed(0)} km · e {live.el.e.toFixed(4)}
          </div>
          <div className="text-[9px] font-mono text-mut mt-0.5">REAL-TIME SGP4 elements → secular rate estimate</div>
        </div>
      )}

      <div className="mb-2 flex gap-1.5 flex-wrap">
        <button onClick={useLive} disabled={!live}
                className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-cyan-400/40 text-cyan-300 disabled:opacity-40">
          USE LIVE ORBIT
        </button>
        {liveOrbit && (
          <button onClick={() => setLiveOrbit(null)}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-crit/40 text-crit">
            CLEAR {liveOrbit.name.toUpperCase()}
          </button>
        )}
        {ssoI && (
          <button onClick={() => { setLiveOrbit(null); setIDeg(Math.round(ssoI * 100) / 100) }}
                  className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-ok/40 text-ok">
            SET SSO i ({ssoI.toFixed(1)}°)
          </button>
        )}
      </div>

      {liveOrbit ? (
        <div className="text-[9px] font-mono text-mut mb-2">
          captured: a={liveOrbit.aKm.toFixed(0)} km · e={liveOrbit.e.toFixed(4)} · i={liveOrbit.iDeg.toFixed(2)}°
        </div>
      ) : (
        <>
          <Slider label="Altitude" unit="km" min={200} max={1500} step={5} value={altKm} onChange={setAltKm} />
          <Slider label="Eccentricity" unit="–" min={0} max={0.4} step={0.005} value={eEcc} onChange={setEEcc} fmt={(v) => v.toFixed(3)} />
          <Slider label="Inclination" unit="°" min={0} max={180} step={0.1} value={iDeg} onChange={setIDeg} fmt={(v) => v.toFixed(1)} />
          <Slider label="RAAN Ω₀" unit="°" min={0} max={360} step={1} value={raanDeg} onChange={setRaanDeg} />
        </>
      )}

      {flags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {flags.map((f) => (
            <span key={f.label} className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${f.cls}`}>{f.label}</span>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-fg leading-relaxed">
        Ω̇ (node) = <b style={{ color: rates.raanDegDay < 0 ? '#FF647C' : '#2dd4bf' }}>{rates.raanDegDay.toFixed(4)}°/day</b>
        {' '}{rates.raanDegDay < 0 ? '· westward' : ' · eastward'} · 100 d → {drift100.toFixed(1)}° plane drift<br />
        ω̇ (apsides) = <b>{rates.argPerigeeDegDay.toFixed(4)}°/day</b><br />
        n̄ − n = {(mm.nBarRadS - mm.nRadS).toExponential(2)} rad/s ({rates.meanMotionDeltaDegDay.toFixed(3)}°/day phase advance)<br />
        <span className="text-mut">drift visualized: dashed rings = orbit plane after +30 / +90 / +365 days</span>
      </div>

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">p = a(1−e²) = {(testEl.aKm * (1 - testEl.e * testEl.e)).toFixed(1)} km</div>
          <div className="text-cyan-300">n̄ = n[1 + ¾J₂(R⊕/p)²√(1−e²)(2 − 3sin²i)]</div>
          <div className="text-cyan-300">Ω̇ = −3/2 J₂(R⊕/p)² n̄ cos i</div>
          <div className="text-cyan-300">ω̇ = +3/4 J₂(R⊕/p)² n̄ (4 − 5sin²i)</div>
          <div>i = {testEl.iDeg}°: sin²i = {(Math.sin(testEl.iDeg * Math.PI / 180) ** 2).toFixed(4)}</div>
          <div className="text-mut mt-2">
            J2_EARTH = 1.08262668e-3 (EGM-96), R_EARTH_EQUATORIAL_KM = 6378.137 (WGS84) — constants.js.
            Secular-only: short-period J2 oscillations and J3+ terms omitted; over long arcs SGP4 (what the
            tracker uses) contains them — this lab isolates the averaged drift so its structure is visible.
            Cross-check: the n₀-form pre-validated in kepler.js agrees within 0.1%.
          </div>
        </div>
      </details>

      <div className="flex gap-2 mt-2 text-[8px] font-mono flex-wrap">
        <span className="text-cyan-300">— t = 0</span>
        {GHOST_DAYS.map((d, i) => (
          <span key={d} style={{ color: GHOST_COLORS[i] }}>┄ +{d} d</span>
        ))}
        <span className="text-mut">┈ celestial N pole</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={<J2Overlay el={testEl} />} />
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
              ANALYZE · J2 PRECESSION
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
