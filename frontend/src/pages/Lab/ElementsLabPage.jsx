import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Orbit, Sigma, Play, Pause, RotateCcw } from 'lucide-react'
import OrbitScene from '../../components/scene/OrbitScene.jsx'
import { useEngine } from '../../hooks/useEngine.js'
import {
  elementsToStateKm, periodSec, apoapsisRadiusKm, periapsisRadiusKm,
} from '../../lib/kepler.js'
import { MU_EARTH_KM3S2, R_EARTH_MEAN_KM } from '../../lib/constants.js'

const ELEMENTS_SPEC = [
  { key: 'aKm', label: 'Semi-major axis', unit: 'km', min: 6671, max: 120000, step: 1, fmt: (v) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }),
    help: 'Size of the ellipse: half the distance between the two apsis radii. Sets the orbital period on its own.' },
  { key: 'e', label: 'Eccentricity', unit: '–', min: 0, max: 0.95, step: 0.001, fmt: (v) => v.toFixed(4),
    help: 'How far the ellipse is from a circle. 0 = circular; higher = one deep fast dive per revolution.' },
  { key: 'iDeg', label: 'Inclination', unit: '°', min: 0, max: 180, step: 0.01, fmt: (v) => v.toFixed(2),
    help: 'Tilt of the orbital plane vs the equator. >90° = retrograde. Drives ground-track latitude limits.' },
  { key: 'raanDeg', label: 'RAAN Ω', unit: '°', min: 0, max: 360, step: 0.1, fmt: (v) => v.toFixed(1),
    help: 'Right ascension of the ascending node: where the orbit leaves the equatorial plane, measured eastward from the vernal equinox. Rotates the plane inertially (J2 precesses it in reality).' },
  { key: 'argPerigeeDeg', label: 'Arg. of perigee ω', unit: '°', min: 0, max: 360, step: 0.1, fmt: (v) => v.toFixed(1),
    help: 'Angle inside the orbital plane from the ascending node to perigee. Aims the ellipse within its plane.' },
  { key: 'trueAnomalyDeg', label: 'True anomaly ν', unit: '°', min: 0, max: 360, step: 0.5, fmt: (v) => v.toFixed(1),
    help: 'Where the spacecraft actually is on the ellipse, from perigee. Sweeps fast at perigee, slow at apogee (Kepler II).' },
]

const PRESETS = {
  ISS: { aKm: 6772, e: 0.0007, iDeg: 51.64, raanDeg: 200, argPerigeeDeg: 87, trueAnomalyDeg: 42 },
  Molniya: { aKm: 26600, e: 0.74, iDeg: 63.4, raanDeg: 300, argPerigeeDeg: 270, trueAnomalyDeg: 5 },
  GEO: { aKm: 42164, e: 0.0, iDeg: 0.03, raanDeg: 0, argPerigeeDeg: 0, trueAnomalyDeg: 120 },
  'Sun-sync': { aKm: 7078, e: 0.001, iDeg: 98.2, raanDeg: 60, argPerigeeDeg: 90, trueAnomalyDeg: 200 },
  'GTO-like': { aKm: 27000, e: 0.72, iDeg: 28.5, raanDeg: 40, argPerigeeDeg: 180, trueAnomalyDeg: 320 },
}

function Row({ spec, value, onChange, help }) {
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-emerald-200 font-semibold">{spec.label}</span>
        <span className="font-mono text-emerald-50 tabular-nums">
          {spec.fmt(value)} {spec.unit}
        </span>
      </div>
      <input type="range" min={spec.min} max={spec.max} step={spec.step} value={value}
             onChange={(e) => onChange(spec.key, Number(e.target.value))}
             aria-label={spec.label}
             className="w-full accent-emerald-400 h-6" />
      {help && <p className="text-[9px] text-emerald-700 leading-snug">{spec.help}</p>}
    </div>
  )
}

export default function ElementsLabPage() {
  const engine = useEngine() // 10 Hz heartbeat re-renders the analytic orbit
  const [el, setEl] = useState(PRESETS.ISS)
  const [opts, setOpts] = useState({ showMarkers: true, showConstruction: true,
                                     showEquatorial: false, animating: false, speed: 60 })
  const [help, setHelp] = useState(false)
  const [eng, setEng] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(true)
  const drag = useRef(null)

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    engine.rotateBy((e.clientX - drag.current.x) * 0.006, (e.clientY - drag.current.y) * 0.005)
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = () => { drag.current = null }

  const set = (key, v) => setEl((p) => ({ ...p, [key]: v }))

  const rKmNow = el.aKm * (1 - el.e * el.e)
    / (1 + el.e * Math.cos(el.trueAnomalyDeg * Math.PI / 180))
  const state = elementsToStateKm(el)
  const T = periodSec(el.aKm)
  const perAltKm = periapsisRadiusKm(el.aKm, el.e) - R_EARTH_MEAN_KM
  const apoAltKm = apoapsisRadiusKm(el.aKm, el.e) - R_EARTH_MEAN_KM
  const insideEarth = perAltKm < 0

  const panel = (
    <div className="glass rounded-xl p-4 overflow-y-auto thin-scroll h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sigma size={15} className="text-emerald-400" />
          <span className="font-semibold text-emerald-50 text-sm">Classical Elements</span>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-300">
          ANALYTICAL MODEL — TWO-BODY
        </span>
      </div>
      <p className="text-[9px] text-emerald-700 mb-3">
        Orbit regenerated from Keplerian geometry every frame — not a scaled
        decorative ellipse. Distances use the tracker’s documented radial compression.
      </p>

      <div className="flex gap-1 flex-wrap mb-3">
        {Object.entries(PRESETS).map(([k, v]) => (
          <button key={k} onClick={() => setEl(v)}
                  className="px-2 py-0.5 rounded text-[9px] font-mono border border-emerald-400/15 text-emerald-500 hover:text-emerald-200 hover:border-emerald-400/40">
            {k.toUpperCase()}
          </button>
        ))}
      </div>

      {ELEMENTS_SPEC.map((spec) => (
        <Row key={spec.key} spec={spec} value={el[spec.key]} onChange={set} help={help} />
      ))}

      {insideEarth && (
        <div className="text-[10px] font-mono text-red-300 bg-red-500/10 border border-red-500/50 rounded-md px-2 py-1.5 mb-3 live-dot">
          ⚠ PERIGEE {perAltKm.toFixed(0)} km — BELOW SURFACE. Geometry is still exact; a real
          orbit like this re-enters.
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setOpts((o) => ({ ...o, animating: !o.animating }))}
                aria-pressed={opts.animating}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border
                  ${opts.animating ? 'bg-emerald-500 text-emerald-950 border-emerald-400'
                                    : 'border-emerald-400/30 text-emerald-300'}`}>
          {opts.animating ? <Pause size={11} /> : <Play size={11} />} ν(t) KEPLER II
        </button>
        <select value={opts.speed} onChange={(e) => setOpts((o) => ({ ...o, speed: Number(e.target.value) }))}
                className="bg-black/30 border border-emerald-400/20 rounded px-1 py-0.5 text-[10px] text-emerald-200"
                aria-label="Animation speed">
          {[1, 10, 60, 300, 1200].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <button onClick={() => { setEl(PRESETS.ISS); setOpts((o) => ({ ...o, animating: false })) }}
                className="p-1.5 rounded-md border border-emerald-400/20 text-emerald-400" aria-label="Reset lab">
          <RotateCcw size={12} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {[['showMarkers', 'MARKERS'], ['showConstruction', 'CONSTRUCTION'], ['showEquatorial', 'EQUATOR']].map(([k, l]) => (
          <button key={k} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))} aria-pressed={opts[k]}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border
                    ${opts[k] ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-200'
                              : 'border-emerald-400/15 text-emerald-600'}`}>
            {l}
          </button>
        ))}
        <button onClick={() => setHelp((h) => !h)} aria-pressed={help}
                className="px-2 py-0.5 rounded text-[9px] font-mono border border-cyan-400/20 text-cyan-500 hover:text-cyan-300">
          EXPLAIN
        </button>
        <button onClick={() => setEng((h) => !h)} aria-pressed={eng}
                className="px-2 py-0.5 rounded text-[9px] font-mono border border-amber-400/20 text-amber-500 hover:text-amber-300">
          ENGINEERING
        </button>
      </div>
      <div className="text-[9px] font-mono text-emerald-700 mb-3 flex flex-wrap gap-x-3">
        <span><i className="text-amber-400">●</i> perigee</span>
        <span><i className="text-sky-400">●</i> apogee</span>
        <span><i className="text-cyan-300">●</i> asc node</span>
        <span><i className="text-pink-400">●</i> desc node</span>
        <span><i className="text-white">●</i> spacecraft</span>
      </div>

      {eng && (
        <div className="mb-3 rounded-lg border border-amber-400/20 bg-black/25 p-2.5 font-mono text-[10px] text-emerald-300 space-y-0.5">
          <div>radiusNowKm        {rKmNow.toFixed(1)} km</div>
          <div>velocityKmS        {state.vKmS.toFixed(4)} km/s</div>
          <div>posECI_km          [{state.posKm.x.toFixed(1)}, {state.posKm.y.toFixed(1)}, {state.posKm.z.toFixed(1)}]</div>
          <div>velECI_kmS         [{state.velKmS.x.toFixed(4)}, {state.velKmS.y.toFixed(4)}, {state.velKmS.z.toFixed(4)}]</div>
          <div>apoAltKm / perAltKm {apoAltKm.toFixed(0)} / {perAltKm.toFixed(0)} km</div>
          <div>energyKm2S2        {(state.vKmS ** 2 / 2 - MU_EARTH_KM3S2 / rKmNow).toPrecision(6)} km²/s²</div>
          <div>frame              ECI (TEME-consistent) · GMST applied in scene projection</div>
          <div>model              analytic two-body — no J2 / drag / third body</div>
        </div>
      )}

      <details className="mb-2">
        <summary className="text-[10px] font-mono text-cyan-500 cursor-pointer select-none">
          SHOW CALCULATION — conic, period, vis-viva
        </summary>
        <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/25 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-200">
          <div className="text-cyan-300">r(ν) = a(1−e²) / (1 + e·cos ν)</div>
          <div>= {el.aKm}·(1−{el.e}²) / (1 + {el.e}·cos({el.trueAnomalyDeg}°)) = {rKmNow.toFixed(1)} km</div>
          <div className="text-cyan-300 mt-2">T = 2π·√(a³/μ)</div>
          <div>= 2π·√({el.aKm}³ / {MU_EARTH_KM3S2} km³/s²) = {T.toFixed(1)} s = {(T / 60).toFixed(2)} min</div>
          <div className="text-cyan-300 mt-2">v = √( μ·(2/r − 1/a) )   (vis-viva)</div>
          <div>= √({MU_EARTH_KM3S2}·(2/{rKmNow.toFixed(1)} − 1/{el.aKm})) = {state.vKmS.toFixed(4)} km/s</div>
          <div className="text-emerald-700 mt-2">μ = {MU_EARTH_KM3S2} km³/s² (EGM-96) — see lib/constants.js</div>
        </div>
      </details>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden">
      <OrbitScene mission lab={{ elements: el, options: opts, simMs: engine.simMs }} />
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
          <Orbit size={16} className="text-emerald-400" />
          <span className="font-bold text-[15px] tracking-tight">
            <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
            <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-cyan-500 align-middle">
              ANALYZE · ORBITAL ELEMENTS LAB
            </span>
          </span>
        </div>
        <button onClick={() => setMobilePanel((v) => !v)}
                className="lg:hidden ml-auto px-3 py-1 rounded-md text-[11px] font-mono border border-emerald-400/30 text-emerald-200 bg-black/40">
          ELEMENTS
        </button>
      </header>

      <div className={`${mobilePanel ? 'flex' : 'hidden'} lg:flex absolute bottom-2 lg:top-16 lg:bottom-24 right-2 lg:right-4 left-2 lg:left-auto w-auto lg:w-[330px] z-40 lg:z-20 max-h-[62vh] lg:max-h-none pointer-events-auto`}>
        {panel}
      </div>

      <div className="absolute bottom-3 right-3 lg:bottom-4 z-30 text-[9px] font-mono text-emerald-700">
        sim {engine.date().toISOString().slice(11, 19)} UTC {engine.isLive ? '· LIVE' : `· WARP ${engine.warp}×`}
      </div>
    </div>
  )
}
