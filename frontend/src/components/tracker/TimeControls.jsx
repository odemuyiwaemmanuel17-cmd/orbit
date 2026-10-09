import { Pause, Play, Plus, Minus, RotateCcw } from 'lucide-react'
import { useEngine } from '../../hooks/useEngine.js'

const PRESETS = [1, 10, 60, 300]

/** Bottom bar of the viewport: pause, time-warp presets, zoom, reset. */
export default function TimeControls() {
  const engine = useEngine()
  return (
    <div className="flex items-center gap-1 bg-black/60 backdrop-blur border border-hi/25 rounded-full px-2 py-1.5">
      <button onClick={() => engine.togglePause()}
              title={engine.paused ? 'Resume propagation' : 'Pause propagation'}
              className={`w-7 h-7 grid place-items-center rounded-full transition
                ${engine.paused ? 'bg-pri text-bg' : 'bg-hi/15 text-hi hover:bg-hi/25'}`}>
        {engine.paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
      <div className="w-px h-5 bg-hi/20 mx-1" />
      {PRESETS.map((w) => (
        <button key={w} onClick={() => engine.setWarp(w)}
                className={`px-2 py-1 rounded-full text-[10px] font-mono transition
                  ${engine.warp === w
                    ? 'bg-pri text-bg font-bold'
                    : 'text-hi hover:bg-hi/10'}`}>
          {w}×
        </button>
      ))}
      <div className="w-px h-5 bg-hi/20 mx-1" />
      <button onClick={() => engine.setZoom(engine.zoom * 0.8)} title="Zoom in"
              className="w-6 h-6 grid place-items-center rounded-full text-hi hover:bg-hi/10">
        <Plus size={13} />
      </button>
      <button onClick={() => engine.setZoom(engine.zoom * 1.25)} title="Zoom out"
              className="w-6 h-6 grid place-items-center rounded-full text-hi hover:bg-hi/10">
        <Minus size={13} />
      </button>
      <button onClick={() => engine.resetView()} title="Reset view"
              className="w-6 h-6 grid place-items-center rounded-full text-hi hover:bg-hi/10">
        <RotateCcw size={12} />
      </button>
    </div>
  )
}
