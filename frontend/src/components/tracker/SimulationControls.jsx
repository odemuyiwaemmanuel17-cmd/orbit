import { Pause, Play, SkipBack, SkipForward, Radio, History, Camera, Ruler } from 'lucide-react'
import { useEngine } from '../../hooks/useEngine.js'

const SPEEDS = [0.25, 1, 10, 50, 100]

/**
 * Mission Control simulation console: the single source of simulation time.
 * Everything (scene, telemetry, passes, alerts) derives from engine.simMs.
 */
export default function SimulationControls() {
  const engine = useEngine()
  const playing = !engine.paused && !engine.isLive

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <div className="flex items-center gap-1 bg-black/60 backdrop-blur border border-hi/25 rounded-full px-2 py-1.5">
        <button
          onClick={() => engine.setLive()}
          title="Follow real time"
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono transition
            ${engine.isLive ? 'bg-pri text-bg font-bold'
                            : 'text-hi hover:bg-hi/10'}`}>
          <Radio size={11} /> LIVE
        </button>
        <div className="w-px h-5 bg-hi/20 mx-0.5" />
        <button onClick={() => engine.togglePause()}
                title={playing ? 'Pause' : 'Play'}
                className={`w-7 h-7 grid place-items-center rounded-full transition
                  ${playing ? 'bg-hi/15 text-hi hover:bg-hi/25'
                            : 'bg-pri text-bg'}`}>
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button onClick={() => engine.stepBy(-5)} title="Step back 5 min"
                className="w-7 h-7 grid place-items-center rounded-full text-hi hover:bg-hi/10">
          <SkipBack size={13} />
        </button>
        <button onClick={() => engine.stepBy(5)} title="Step forward 5 min"
                className="w-7 h-7 grid place-items-center rounded-full text-hi hover:bg-hi/10">
          <SkipForward size={13} />
        </button>
        <button onClick={() => { engine.setLive() }} title="Reset to now"
                className="w-7 h-7 grid place-items-center rounded-full text-hi hover:bg-hi/10">
          <History size={13} />
        </button>
        <button onClick={() => engine.setFollow(!engine.follow)}
                title="Camera follow: ease the view onto the selected spacecraft's true propagated position"
                aria-pressed={engine.follow}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono transition
                  ${engine.follow ? 'bg-hi/20 text-fg border border-hi/60 font-bold'
                                  : 'text-hi hover:bg-hi/10 border border-transparent'}`}>
          <Camera size={11} /> FOLLOW
        </button>
        <button onClick={() => engine.setTrueScale(!engine.trueScale)}
                title={engine.trueScale
                  ? 'True scale: models render at real physical size (ISS ~109 m wingspan) — tiny by design. Positions are always true-scale.'
                  : 'Size-exaggerated mode (~10×): positions exact, model SIZE exaggerated for visibility. Click for true scale.'}
                aria-pressed={engine.trueScale}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono transition
                  ${engine.trueScale ? 'bg-ok/20 text-ok border border-ok/60 font-bold'
                                     : 'text-hi hover:bg-hi/10 border border-transparent'}`}>
          <Ruler size={11} /> TRUE SCALE
        </button>
        <div className="w-px h-5 bg-hi/20 mx-0.5" />
        {SPEEDS.map((s) => (
          <button key={s} onClick={() => engine.setWarp(s)}
                  className={`px-2 py-1 rounded-full text-[10px] font-mono transition
                    ${!engine.isLive && engine.warp === s && !engine.paused
                      ? 'bg-pri text-bg font-bold'
                      : 'text-hi hover:bg-hi/10'}`}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
