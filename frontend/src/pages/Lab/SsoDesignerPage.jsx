import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sun } from 'lucide-react'
import { Line } from '@react-three/drei'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { eciToSceneKm } from '../../components/scene/LabOrbit.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import { designSunSyncOrbit, classifySsoCandidate, sunRaDeg } from '../../lib/sso.js'
import { propagateJ2SecularKm } from '../../lib/j2.js'
import { orbitPolylineKm, stateToElementsKm } from '../../lib/kepler.js'
import { sunEciUnit } from '../../lib/sun.js'
import { SUN_MEAN_MOTION_DEGDAY } from '../../lib/constants.js'

const RING = '#2dd4bf'
const GHOST = '#818CF8'
const LTAN_PRESETS = [
  [6, 'DAWN'], [10.5, 'MORNING'], [12, 'NOON'], [14.5, 'AFTERNOON'], [18, 'DUSK'], [0, 'MIDNIGHT'],
]

const fmtH = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} LT`

function SsoOverlay({ design, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  const TMP = useMemo(() => new THREE.Vector3(), [])
  const rings = useMemo(() => {
    if (!design.solvable) return []
    const project = (el) => {
      const flat = orbitPolylineKm(el, 96)
      const pts = []
      for (let k = 0; k <= 96; k++) {
        eciToSceneKm(flat[k * 3], flat[k * 3 + 1], flat[k * 3 + 2], gmst, TMP)
        pts.push([TMP.x, TMP.y, TMP.z])
      }
      return pts
    }
    const el0 = { aKm: design.aKm, e: design.e, iDeg: design.iDeg,
      raanDeg: design.raanDeg, argPerigeeDeg: 0, trueAnomalyDeg: 0 }
    const DATE0 = new Date(simMs)
    const ghostEl = propagateJ2SecularKm(el0, 92 * 86400)
    // ghost sun: RA advanced by 92 x mean solar motion (design intent)
    const sunNow = sunEciUnit(DATE0, new THREE.Vector3())
    const sunGhost = sunEciUnit(new Date(DATE0.getTime() + 92 * 86400e3), new THREE.Vector3())
    return { now: project(el0), ghost: project(ghostEl), sunNow, sunGhost }
  }, [design, Math.floor(simMs / 100)])
  if (!rings.now) return null
  return (
    <group>
      <Line points={rings.now} color={RING} lineWidth={1.8} transparent opacity={0.95} toneMapped={false} />
      <Line points={rings.ghost} color={GHOST} lineWidth={1.1} dashed dashSize={0.06} gapSize={0.04}
            transparent opacity={0.75} toneMapped={false} />
      <mesh position={rings.sunNow.clone().multiplyScalar(2.3).toArray()}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color="#F5B942" toneMapped={false} />
      </mesh>
      <mesh position={rings.sunGhost.clone().multiplyScalar(2.3).toArray()}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color={GHOST} toneMapped={false} />
      </mesh>
    </group>
  )
}

export default function SsoDesignerPage() {
  const engine = useEngine()
  const simMs = engine.simMs
  const [altKm, setAltKm] = useState(705)
  const [ltanH, setLtanH] = useState(10.5)
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
    return { name: rec.meta.name, el, cls: classifySsoCandidate(el, new Date(simMs)) }
  }, [rec, Math.floor(simMs / 100)])

  const design = useMemo(
    () => designSunSyncOrbit({ altKm, ltanH, date: new Date(simMs) }),
    [altKm, ltanH, Math.floor(simMs / 600000)],
  )

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
          <Sun size={15} className="text-ok" />
          <span className="font-semibold text-fg text-sm">Sun-Sync Designer</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-ok/40 text-ok">
          DESIGN · J2 LOCKED TO SUN
        </span>
      </div>
      <p className="text-[9px] text-mut mb-2">
        A sun-synchronous orbit uses Earth's oblateness (J2) to walk the
        orbital plane eastward at exactly the sun's apparent motion
        (+{SUN_MEAN_MOTION_DEGDAY}°/day), so the local solar time of the
        ascending node (LTAN) never drifts. Built on the pre-validated
        kepler + j2 + sun layers; LTAN uses MEAN solar time (±16 min
        equation-of-time not applied — disclosed).
      </p>

      {live && (
        <div className="rounded-lg border border-hi/20 bg-black/25 px-3 py-2 mb-2">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-mut">{live.name.toUpperCase()} · LIVE</span>
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${live.cls.sso ? 'border-ok/50 text-ok' : 'border-hi/30 text-mut'}`}>
              {fmtH(live.cls.ltanH)}
            </span>
          </div>
          <div className="text-[10px] font-mono text-fg mt-0.5">{live.cls.note}</div>
          <div className="text-[9px] font-mono text-mut mt-0.5">
            i {live.el.iDeg.toFixed(2)}°{Number.isFinite(live.cls.inclDeltaDeg) ? ` · ${live.cls.inclDeltaDeg >= 0 ? '+' : ''}${live.cls.inclDeltaDeg.toFixed(2)}° vs SSO i at its altitude` : ''}
          </div>
        </div>
      )}

      <div className="mb-2">
        <div className="flex items-baseline justify-between text-[10px] mb-0.5">
          <span className="text-fg font-semibold">Altitude</span>
          <span className="font-mono text-fg">{altKm} km</span>
        </div>
        <input type="range" min={300} max={1200} step={5} value={altKm}
               onChange={(e) => setAltKm(Number(e.target.value))}
               aria-label="Altitude" className="w-full accent-hi h-5" />
      </div>
      <div className="mb-1">
        <div className="flex items-baseline justify-between text-[10px] mb-0.5">
          <span className="text-fg font-semibold">Target LTAN</span>
          <span className="font-mono text-fg">{fmtH(ltanH)}</span>
        </div>
        <input type="range" min={0} max={24} step={0.25} value={ltanH}
               onChange={(e) => setLtanH(Number(e.target.value))}
               aria-label="Target local time of ascending node" className="w-full accent-amber-400 h-5" />
      </div>
      <div className="flex gap-1 flex-wrap mb-2">
        {LTAN_PRESETS.map(([h, l]) => (
          <button key={l} onClick={() => setLtanH(h)} aria-pressed={ltanH === h}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border
                    ${ltanH === h ? 'border-amber-400/60 text-amber-300 bg-amber-400/10' : 'border-hi/20 text-mut'}`}>
            {l}
          </button>
        ))}
      </div>

      {!design.solvable ? (
        <div className="text-[10px] font-mono text-cau bg-cau/10 border border-cau/40 rounded-md px-2 py-1.5 mb-2">
          ⚠ {design.reason}
        </div>
      ) : (
        <div className="rounded-lg border border-cyan-400/25 bg-black/30 px-3 py-2 mb-2 font-mono text-[10px] text-fg leading-relaxed">
          inclination <b className="text-ok">{design.iDeg.toFixed(3)}°</b> · period <b>{design.periodMin.toFixed(1)} min</b><br />
          RAAN on design date: <b>{design.raanDeg.toFixed(1)}°</b> (sun RA {sunRaDeg(new Date(simMs)).toFixed(1)}° + {(ltanH - 12).toFixed(2)}×15°)<br />
          J2 drift {design.raanDriftDegDay.toFixed(4)}°/day vs sun {SUN_MEAN_MOTION_DEGDAY}°/day
          → mismatch <b className={design.driftMismatchDegDay < 0.01 ? 'text-ok' : 'text-cau'}>{design.driftMismatchDegDay.toFixed(4)}°/day</b><br />
          sun angle β = <b>{design.betaDeg.toFixed(1)}°</b> — <span className={design.illumination.startsWith('NEAR') ? 'text-ok' : design.illumination.startsWith('HIGH') ? 'text-crit' : 'text-cau'}>{design.illumination}</span>
          <div className="text-mut mt-1">
            check real eclipse fractions in the Eclipse lab; power budget in Solar Power.
            {design.betaDeg > 60 && ' β this high ⇒ umbra-free: arrays never sleep.'}
          </div>
        </div>
      )}

      {design.solvable && (
        <div className="text-[9px] font-mono text-mut mb-2 leading-relaxed">
          ghost rings: the dashed violet plane + smaller sun are the SAME
          design 92 days later — the J2 walk keeps pace with the sun, LTAN
          unchanged. This is why sun-sync maps get repeat lighting.
        </div>
      )}

      <details>
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">SHOW CALCULATION</summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-fg">
          <div className="text-cyan-300">SSO condition (Vallado 9-24 solved for i):</div>
          <div>cos i = Ω̇☉ / [−3/2 J₂ (Re/p)² n̄] ⇒ i = {design.solvable ? design.iDeg.toFixed(3) : '—'}°</div>
          <div className="text-cyan-300 mt-2">LTAN geometry (mean solar time):</div>
          <div>LTAN = ((Ω − α☉)/15°/h + 12) mod 24 → Ω = α☉ + (LTAN − 12)·15°</div>
          <div className="text-cyan-300 mt-2">β = asin(|n̂ · ŝun|), n̂ = (sin i sin Ω, −sin i cos Ω, cos i)</div>
          <div className="text-mut mt-2">
            Design date = sim clock {new Date(simMs).toISOString().slice(0, 16)} UTC.
            Equation of time (±16 min), RAAN oscillation from J22 harmonic
            and seasonal β drift (±few°) not applied — MEAN values only.
          </div>
        </div>
      </details>

      <div className="flex gap-2 mt-2 text-[8px] font-mono">
        <span style={{ color: RING }}>— design plane now</span>
        <span style={{ color: GHOST }}>┄ +92 days</span>
        <span className="text-amber-400">● sun</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden">
      <OrbitScene mission overlay={design.solvable ? <SsoOverlay design={design} simMs={simMs} /> : null} />
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
          <Sun size={16} className="text-ok" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">
              DESIGN · SUN-SYNCHRONOUS
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
