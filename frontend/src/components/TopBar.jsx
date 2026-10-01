import { Activity, Gauge, RadioTower, Satellite, Timer } from 'lucide-react'

const WARP_PRESETS = [1, 10, 60]

/** Mission-control top bar: clock, tracked-object count, FPS, time-warp. */
export default function TopBar({ simTime, source, satelliteCount, fps, warp, setWarp }) {
  const fmt = simTime.toISOString().slice(0, 19).replace('T', ' ')
  const srcBadge = {
    celestrak: { text: 'CELESTRAK LIVE', cls: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' },
    fallback: { text: 'FALLBACK TLE', cls: 'text-amber-300 border-amber-400/40 bg-amber-400/10' },
    offline: { text: 'OFFLINE SNAPSHOT', cls: 'text-rose-300 border-rose-400/40 bg-rose-400/10' },
    boot: { text: 'LINKING…', cls: 'text-cyan-300 border-cyan-400/40 bg-cyan-400/10' },
  }[source] ?? { text: source.toUpperCase(), cls: 'text-cyan-300 border-cyan-400/40 bg-cyan-400/10' }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-3">
      <div className="hud-panel flex items-center gap-5 px-5 py-2.5">
        <div className="flex items-center gap-2 pr-4 border-r border-pulse-line">
          <Satellite size={17} className="text-pulse" />
          <span className="font-mono text-cyan-100 text-sm font-semibold tracking-widest">
            ORBITAL<span className="text-pulse">PULSE</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Timer size={14} className="text-cyan-500/70" />
          <div>
            <div className="hud-label">Mission UTC</div>
            <div className="hud-value tabular-nums">{fmt}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RadioTower size={14} className="text-cyan-500/70" />
          <div>
            <div className="hud-label">Tracked</div>
            <div className="hud-value">{satelliteCount}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Activity size={14} className="text-cyan-500/70" />
          <div>
            <div className="hud-label">Render</div>
            <div className="hud-value">{fps} FPS</div>
          </div>
        </div>

        <span className={`px-2 py-1 rounded text-[10px] font-mono tracking-wider border live-dot ${srcBadge.cls}`}>
          {srcBadge.text}
        </span>
      </div>

      {/* Time-warp console */}
      <div className="hud-panel flex items-center gap-3 px-4 py-2.5">
        <Gauge size={16} className="text-pulse" />
        <div className="flex gap-1">
          {WARP_PRESETS.map((w) => (
            <button
              key={w}
              onClick={() => setWarp(w)}
              className={`px-2.5 py-1 rounded font-mono text-xs border transition
                ${warp === w
                  ? 'bg-pulse/20 border-pulse text-cyan-100 shadow-glow'
                  : 'border-white/10 text-cyan-400/70 hover:border-pulse-line hover:text-cyan-200'}`}
            >
              {w}×
            </button>
          ))}
        </div>
        <input
          type="range" min="1" max="240" step="1" value={Math.min(warp, 240)}
          onChange={(e) => setWarp(Number(e.target.value))}
          className="warp-slider w-28"
          title="Time-warp multiplier"
        />
        <span className="hud-value w-12 text-right">{warp}×</span>
      </div>
    </div>
  )
}
