import { Activity } from 'lucide-react'
import { useEngine } from '../../hooks/useEngine.js'
import { catalogSatellites, catalogGeneratedAt } from '../../lib/engine.js'
import { REGIME_COLORS, REGIME_LABELS } from '../../lib/coords.js'

function Tile({ label, value, unit }) {
  return (
    <div className="bg-black/25 border border-emerald-400/10 rounded-lg px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.15em] text-emerald-600">{label}</div>
      <div className="font-mono text-emerald-200 text-sm tabular-nums mt-0.5">
        {value}<span className="text-[10px] text-emerald-600 ml-1">{unit}</span>
      </div>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between text-[11px] py-[3px] border-b border-emerald-400/[0.07] last:border-0">
      <span className="text-emerald-500">{k}</span>
      <span className="font-mono text-emerald-100 tabular-nums">{v}</span>
    </div>
  )
}

/** Right panel of the tracker: live telemetry HUD for the locked target. */
export default function TelemetryPanel() {
  const engine = useEngine()
  const meta = catalogSatellites.find((s) => s.id === engine.selectedId) ?? catalogSatellites[0]
  const live = (engine.snapshot ?? []).find((s) => s.id === meta.id)

  return (
    <div className="glass rounded-xl p-4 flex flex-col h-full min-h-0 overflow-y-auto thin-scroll">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={15} className="text-emerald-400" />
        <span className="font-semibold text-emerald-50 text-sm">Telemetry HUD</span>
      </div>

      <div className="bg-emerald-400/[0.06] border border-emerald-400/25 rounded-lg p-3 mb-3">
        <div className="font-bold text-emerald-50 text-sm">{meta.name}</div>
        <div className="text-[11px] text-emerald-400/90 mt-0.5">{meta.description}</div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] font-mono px-1.5 py-px rounded border"
                style={{ color: REGIME_COLORS[meta.regime], borderColor: `${REGIME_COLORS[meta.regime]}66` }}>
            {meta.regime}
          </span>
          <span className="text-[10px] font-mono text-emerald-600">
            {live ? 'Signal lock · nominal' : 'acquiring…'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Tile label="Altitude" value={live ? live.alt.toFixed(1) : '——'} unit="km" />
        <Tile label="Velocity" value={live ? live.speed.toFixed(2) : '——'} unit="km/s" />
        <Tile label="Latitude" value={live ? `${Math.abs(live.lat).toFixed(2)}° ${live.lat >= 0 ? 'N' : 'S'}` : '——'} />
        <Tile label="Longitude" value={live ? `${Math.abs(live.lon).toFixed(2)}° ${live.lon >= 0 ? 'E' : 'W'}` : '——'} />
      </div>

      <div className="text-[9px] uppercase tracking-[0.18em] text-emerald-600 mb-1.5">
        Orbital Elements
      </div>
      <div className="bg-black/20 border border-emerald-400/10 rounded-lg px-3 py-1.5 mb-3">
        <Row k="Period" v={`${meta.period_min.toFixed(1)} min`} />
        <Row k="Inclination" v={`${meta.inclination_deg.toFixed(2)}°`} />
        <Row k="RAAN" v={`${meta.raan_deg.toFixed(1)}°`} />
        <Row k="Eccentricity" v={meta.eccentricity.toFixed(4)} />
        <Row k="Semi-major axis" v={`${meta.sma_km.toLocaleString()} km`} />
        <Row k="Launched" v={String(meta.launched)} />
      </div>

      <p className="text-[10px] leading-relaxed text-emerald-700 mt-auto pt-2">
        Positions propagated from the bundled SGP4 element sets (CelesTrak,
        fetched {catalogGeneratedAt.slice(0, 10)}). The FastAPI backend can
        stream live refreshes for custom tracking sources.
      </p>
    </div>
  )
}
