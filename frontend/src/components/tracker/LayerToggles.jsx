import { useEngine } from '../../hooks/useEngine.js'

const LAYERS = [
  ['footprint', 'FOOTPRINT', '#4ade80'],
  ['alerts', 'ALERTS', '#ef4444'],
  ['drag', 'DECAY', '#f59e0b'],
]

/** Toggleable 3D overlays — shared by the landing viewport and Mission Control. */
export default function LayerToggles() {
  const engine = useEngine()
  return (
    <div className="flex flex-col gap-1 bg-black/60 backdrop-blur border border-emerald-400/25 rounded-lg px-2.5 py-2">
      {LAYERS.map(([key, label, color]) => (
        <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={engine.layers[key]}
                 onChange={() => engine.toggleLayer(key)}
                 className="w-3 h-3 accent-emerald-500" />
          <span className="text-[9px] font-mono tracking-wider"
                style={{ color: engine.layers[key] ? color : '#1d5c3c' }}>
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}
