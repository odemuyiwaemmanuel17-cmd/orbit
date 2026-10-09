import { Link } from 'react-router-dom'

const STATS = [
  ['14', 'Spacecraft tracked'],
  ['3', 'Orbital regimes'],
  ['10 Hz', 'Telemetry refresh'],
  ['300×', 'Time-warp max'],
]

export default function Hero() {
  return (
    <section id="top" className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-5 pt-20">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-hi/30 bg-hi/5 mb-7">
        <span className="w-1.5 h-1.5 rounded-full bg-hi live-dot" />
        <span className="text-[11px] font-mono tracking-[0.2em] text-hi">
          LIVE ORBITAL PROPAGATION · 2026 EPOCH
        </span>
      </div>

      <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05]">
        <span className="text-fg drop-shadow-[0_2px_18px_rgba(0,0,0,0.8)]">Track every orbit.</span>
        <br />
        <span className="bg-gradient-to-r from-hi via-green-400 to-hi bg-clip-text text-transparent">
          Feel the pulse of space.
        </span>
      </h1>

      <p className="mt-6 max-w-2xl text-[15px] md:text-base leading-relaxed text-fg/70 drop-shadow">
        OrbitalPulse turns orbital mechanics into an interactive experience — spin a
        living 3D Earth, follow satellites in real time, and read professional-grade
        telemetry, right in your browser.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/tracker"
           className="px-6 py-3 rounded-xl font-semibold text-sm bg-pri text-bg hover:bg-hi shadow-[0_0_28px_rgba(16,185,129,0.45)] transition">
          Launch the Tracker
        </Link>
        <a href="#how"
           className="px-6 py-3 rounded-xl font-semibold text-sm border border-hi/30 text-fg hover:border-hi/70 bg-black/20 backdrop-blur transition">
          See How It Works
        </a>
      </div>

      <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl">
        {STATS.map(([v, l]) => (
          <div key={l} className="glass rounded-xl px-4 py-4">
            <div className="text-2xl font-black text-hi">{v}</div>
            <div className="text-[11px] text-fg/60 mt-1">{l}</div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-pri/60 text-[10px] font-mono tracking-[0.25em] animate-bounce">
        SCROLL TO ORBIT ↓
      </div>
    </section>
  )
}
