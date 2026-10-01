import { Crosshair, Orbit, Ruler, Waves, Zap } from 'lucide-react'

function Field({ label, value, unit }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="hud-label">{label}</span>
      <span className="hud-value tabular-nums">
        {value ?? '——'}
        {value != null && unit && <span className="text-cyan-600 text-[10px] ml-1">{unit}</span>}
      </span>
    </div>
  )
}

/** Right-hand live telemetry readout for the locked target. */
export default function TelemetryHUD({
  selected, state, orbitData, showOrbit, setShowOrbit, focusMode, setFocusMode,
}) {
  if (!selected) {
    return (
      <div className="absolute right-3 top-24 z-10 w-72">
        <div className="hud-panel p-4 text-center">
          <Orbit size={22} className="mx-auto text-cyan-700 mb-2" />
          <p className="font-mono text-xs text-cyan-600">
            NO TARGET LOCKED
            <br />
            <span className="text-cyan-700">select an object from the catalog</span>
          </p>
        </div>
      </div>
    )
  }

  const periodMin = selected.line2 ? 1440 / parseFloat(selected.line2.slice(52, 63)) : null

  return (
    <div className="absolute right-3 top-24 z-10 w-72 flex flex-col gap-3">
      <div className="hud-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <Crosshair size={15} className="text-pulse live-dot" />
          <div className="min-w-0">
            <div className="font-mono text-sm text-cyan-100 truncate">{selected.name}</div>
            <div className="hud-label">NORAD #{selected.norad_id}</div>
          </div>
        </div>

        <div className="space-y-2">
          <Field label="Latitude" value={state?.latitude?.toFixed(4)} unit="deg" />
          <Field label="Longitude" value={state?.longitude?.toFixed(4)} unit="deg" />
          <Field label="Altitude" value={state?.altitude_km?.toFixed(1)} unit="km" />
          <div className="h-px bg-pulse-line my-1" />
          <Field label="Velocity" value={state?.velocity_km_s?.toFixed(3)} unit="km/s" />
          <Field label="Inclination" value={selected.inclination_deg?.toFixed(3)} unit="deg" />
          <Field label="Period" value={periodMin?.toFixed(1)} unit="min" />
          <Field label="Epoch" value={selected.epoch?.slice(5, 16).replace('T', ' ')} />
        </div>

        <div className="mt-3 pt-3 border-t border-pulse-line grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowOrbit(!showOrbit)}
            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-mono border transition
              ${showOrbit
                ? 'border-pulse bg-pulse/15 text-cyan-100'
                : 'border-white/10 text-cyan-500 hover:text-cyan-200'}`}
          >
            <Waves size={12} /> {showOrbit ? 'ORBIT ON' : 'ORBIT OFF'}
          </button>
          <button
            onClick={() => setFocusMode(!focusMode)}
            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-mono border transition
              ${focusMode
                ? 'border-pulse bg-pulse/15 text-cyan-100 shadow-glow'
                : 'border-white/10 text-cyan-500 hover:text-cyan-200'}`}
          >
            <Zap size={12} /> {focusMode ? 'CAM LOCK' : 'FREE CAM'}
          </button>
        </div>
      </div>

      {orbitData && (
        <div className="hud-panel p-3">
          <div className="hud-label mb-1.5">Projected Track · +{orbitData.minutes} min</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-cyan-400">
            <span>samples</span><span className="text-right text-cyan-200">{orbitData.steps_returned}</span>
            <span>perigee est.</span>
            <span className="text-right text-cyan-200">
              {Math.min(...orbitData.points.map((p) => p.altitude_km)).toFixed(0)} km
            </span>
            <span>apogee est.</span>
            <span className="text-right text-cyan-200">
              {Math.max(...orbitData.points.map((p) => p.altitude_km)).toFixed(0)} km
            </span>
          </div>
          {!showOrbit && (
            <p className="mt-2 text-[10px] font-mono text-cyan-700 flex items-center gap-1">
              <Ruler size={10} /> track line hidden — enable above
            </p>
          )}
        </div>
      )}
    </div>
  )
}
