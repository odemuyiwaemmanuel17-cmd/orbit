import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { ChevronDown } from 'lucide-react'
import CinematicScene, { RECS, HERO_ID } from '../landing/CinematicScene.jsx'
import catalog from '../data/satellites.json'
import {
  SCENES, windowOpacity, windowLocal, qualityTier, supportsWebGL,
  satStateAt, telemetryRows, elementRows, transferViz,
} from '../lib/cinematic.js'

const SCROLL_VH = 5.2 // total journey length in viewports

function Wordmark({ size = 'text-5xl md:text-7xl' }) {
  return (
    <div className={`font-black tracking-tight leading-none ${size}`}>
      <span className="text-fg">ORBITAL</span><span className="text-hi">PULSE</span>
    </div>
  )
}

function SceneOverlay({ id, children, style }) {
  return (
    <div aria-hidden={(style?.opacity ?? 1) < 0.05}
         className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center px-6"
         style={style}>
      <div className="pointer-events-auto w-full max-w-3xl text-center">{children}</div>
    </div>
  )
}

function TelemetryCard({ rows, badge }) {
  return (
    <div className="inline-block text-left glass rounded-xl px-4 py-3 min-w-[280px]">
      <div className="flex items-center justify-between gap-6 mb-1.5">
        <span className="text-[10px] font-mono tracking-[0.25em] text-hi">{badge}</span>
        <span className="text-[9px] font-mono text-mut">SGP4 model estimate — not onboard telemetry</span>
      </div>
      <table className="font-mono text-[11px] text-fg">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="pr-4 text-mut font-normal">{r.label}</td>
              <td className="text-right tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CinematicLandingPage() {
  const progressRef = useRef(0)
  const [p, setP] = useState(0)
  const [selectedId, setSelectedId] = useState(HERO_ID)
  const [tel, setTel] = useState(null)
  const tier = useMemo(() => qualityTier({
    mobile: typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,
    reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  }), [])
  const webgl = useMemo(() => supportsWebGL(), [])
  const transfer = useMemo(() => transferViz({ altFromKm: 428, altToKm: 1200, incDeg: 51.6 }), [])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const v = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      progressRef.current = v
      setP((old) => (Math.abs(old - v) > 0.0015 ? v : old))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const tick = () => {
      const entry = RECS.find((r) => r.meta.id === selectedId) ?? RECS[0]
      const st = satStateAt(entry.rec, Date.now())
      if (st) setTel({ meta: entry.meta, st })
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [selectedId])

  const win = (id) => SCENES.find((s) => s.id === id)
  const op = (id, fade = 0.05) => windowOpacity(p, win(id), fade)
  const selectedName = tel?.meta.name ?? ''

  if (!webgl) {
    // graceful fallback: same story, no 3D
    return (
      <div className="min-h-screen bg-[#020409] text-fg flex flex-col items-center justify-center px-6 text-center">
        <Wordmark />
        <p className="mt-3 text-hi font-semibold tracking-[0.35em] text-sm">UNDERSTAND THE ORBIT.</p>
        <p className="text-hi font-semibold tracking-[0.35em] text-sm">CONTROL THE MISSION.</p>
        <p className="mt-4 max-w-md text-mut text-sm">Real-time satellite tracking and orbital mechanics
          analysis. Your browser could not start WebGL, so the cinematic scene is disabled — the full
          platform is one click away.</p>
        <div className="mt-6 flex gap-3">
          <Link to="/tracker" className="px-5 py-2 rounded-md bg-pri text-bg text-sm font-semibold">EXPLORE ORBITALPULSE</Link>
          <Link to="/platform" className="px-5 py-2 rounded-md border border-hi/40 text-hi text-sm">EXPLORE THE PLATFORM</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-[#020409]">
      {/* fixed WebGL world */}
      <div className="fixed inset-0 z-0">
        <Canvas dpr={tier.dpr}
                camera={{ fov: 45, near: 0.02, far: 140, position: [0.4, 0.9, 9.2] }}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping }}>
          <CinematicScene progressRef={progressRef} tier={tier} selectedId={selectedId}
                          onSelect={setSelectedId} />
        </Canvas>
      </div>

      {/* minimal nav */}
      <header className="fixed top-0 inset-x-0 z-40 h-14 flex items-center justify-between px-5 bg-gradient-to-b from-[#020409]/85 to-transparent">
        <div className="font-bold text-sm tracking-tight">
          <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
        </div>
        <nav className="flex items-center gap-3 text-[11px] font-mono">
          <Link to="/lab" className="text-hi hover:text-fg">LABS</Link>
          <Link to="/platform" className="text-mut hover:text-fg">PLATFORM</Link>
          <Link to="/tracker" className="px-3 py-1 rounded bg-pri text-bg font-semibold hover:bg-hi">OPEN TRACKER</Link>
        </nav>
      </header>

      {/* SCENE 01 — ENTER ORBIT */}
      <SceneOverlay id="enter" style={{ opacity: op('enter'), transform: `translateY(${(1 - windowLocal(p, win('enter'))) * 24}px)` }}>
        <Wordmark />
        <p className="mt-4 text-[15px] md:text-xl text-fg font-semibold tracking-[0.3em]">
          UNDERSTAND THE ORBIT.
        </p>
        <p className="text-[15px] md:text-xl text-hi font-semibold tracking-[0.3em]">
          CONTROL THE MISSION.
        </p>
        <p className="mt-4 text-[13px] md:text-sm text-mut max-w-lg mx-auto">
          Real-time satellite tracking and orbital mechanics analysis, brought
          to life in an interactive 3D environment.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to="/tracker"
                className="px-6 py-2.5 rounded-md bg-pri text-bg text-[13px] font-semibold hover:bg-hi transition-colors">
            EXPLORE ORBITALPULSE
          </Link>
          <Link to="/platform"
               className="px-6 py-2.5 rounded-md border border-hi/40 text-hi text-[13px] font-semibold hover:border-hi hover:text-fg transition-colors">
            EXPLORE THE PLATFORM
          </Link>
        </div>
        <div className="mt-10 text-mut animate-bounce"><ChevronDown size={18} className="mx-auto" /></div>
      </SceneOverlay>

      {/* SCENE 02 — TRACK THE ORBIT */}
      <SceneOverlay id="track" style={{ opacity: op('track'), alignItems: 'flex-end' }}>
        <div className="flex md:block justify-center pb-16">
          <div className="text-left">
            <p className="text-[11px] font-mono tracking-[0.3em] text-hi mb-2">TRACK THE ORBIT</p>
            {tel && <TelemetryCard badge={`LIVE · ${selectedName.toUpperCase()}`} rows={telemetryRows(tel.meta, tel.st)} />}
            <p className="mt-2 text-[10px] font-mono text-mut">
              click any glowing node to switch the tracked object · positions from SGP4 on TLE snapshots
            </p>
          </div>
        </div>
      </SceneOverlay>

      {/* SCENE 03 — ANALYZE THE MISSION */}
      <SceneOverlay id="analyze" style={{ opacity: op('analyze') }}>
        <div className="flex justify-center">
          <div className="text-left">
            <p className="text-[11px] font-mono tracking-[0.3em] text-hi mb-2">ANALYZE THE MISSION</p>
            {tel && <TelemetryCard badge={`ELEMENTS · ${selectedName.toUpperCase()}`} rows={elementRows(tel.st)} />}
          </div>
        </div>
      </SceneOverlay>

      {/* SCENE 04 — DESIGN AND SIMULATE */}
      <SceneOverlay id="design" style={{ opacity: op('design') }}>
        <div className="flex justify-center">
          <div className="text-left">
            <p className="text-[11px] font-mono tracking-[0.3em] text-hi mb-2">DESIGN AND SIMULATE</p>
            <div className="glass rounded-xl px-4 py-3 font-mono text-[11px] text-fg min-w-[300px]">
              <div className="text-[9px] tracking-[0.25em] text-cau mb-1.5">HOHMANN TRANSFER — ANALYTICAL MODEL</div>
              <div className="flex justify-between gap-8"><span className="text-mut">428 → 1200 km · i 51.6°</span></div>
              <div className="flex justify-between gap-8"><span className="text-mut">ΔV1 (departure)</span><span>{transfer.dv1Mps.toFixed(1)} m/s</span></div>
              <div className="flex justify-between gap-8"><span className="text-mut">ΔV2 (circularize)</span><span>{transfer.dv2Mps.toFixed(1)} m/s</span></div>
              <div className="flex justify-between gap-8"><span className="text-mut">TOTAL ΔV</span><span className="text-hi">{transfer.totalDvMps.toFixed(1)} m/s</span></div>
              <div className="flex justify-between gap-8"><span className="text-mut">COAST</span><span>{(transfer.coastSec / 60).toFixed(1)} min</span></div>
            </div>
            <p className="mt-2 text-[10px] font-mono text-mut">
              computed by the same Hohmann engine as the Maneuver Labs — full planner in LABS
            </p>
          </div>
        </div>
      </SceneOverlay>

      {/* SCENE 05 — THE REVEAL */}
      <SceneOverlay id="reveal" style={{ opacity: op('reveal', 0.08) }}>
        <Wordmark size="text-4xl md:text-6xl" />
        <p className="mt-3 text-[12px] md:text-sm font-mono tracking-[0.45em] text-hi">
          TRACK. ANALYZE. DESIGN.
        </p>
        <p className="mt-3 text-[12px] text-mut">
          Real-time satellite intelligence. Orbital mechanics. Mission visualization.
        </p>
        <Link to="/tracker"
              className="inline-block mt-6 px-7 py-2.5 rounded-md bg-pri text-bg text-[13px] font-semibold hover:bg-hi transition-colors">
          ENTER ORBITALPULSE
        </Link>
        <p className="mt-8 text-[9px] font-mono text-mut">
          TLE snapshot {catalog.generated_at ?? 'n/a'} · propagated in-browser with satellite.js SGP4 ·
          positions are model estimates, not measured telemetry
        </p>
      </SceneOverlay>

      {/* scroll spacer — the only thing that scrolls */}
      <div style={{ height: `${SCROLL_VH * 100}vh` }} />
    </div>
  )
}
