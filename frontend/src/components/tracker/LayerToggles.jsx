import { useEngine } from '../../hooks/useEngine.js'

const LAYERS = [
  ['footprint', 'FOOTPRINT', '#3B82F6'],
  ['groundtrack', 'GND TRACK', '#22d3ee'],
  ['alerts', 'ALERTS', '#FF647C'],
  ['drag', 'DECAY', '#F5B942'],
]

/** Toggleable 3D overlays — shared by the landing viewport and Mission Control. */
export default function LayerToggles() {
  const engine = useEngine()
  return (
    <div className="flex flex-col gap-1 bg-black/60 backdrop-blur border border-hi/25 rounded-lg px-2.5 py-2">
      {LAYERS.map(([key, label, color]) => (
        <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={engine.layers[key]}
                 onChange={() => engine.toggleLayer(key)}
                 className="w-3 h-3 accent-pri" />
          <span className="text-[9px] font-mono tracking-wider"
                style={{ color: engine.layers[key] ? color : '#33507A' }}>
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}
