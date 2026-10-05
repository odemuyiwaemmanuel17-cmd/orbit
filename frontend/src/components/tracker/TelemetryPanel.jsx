import { useEffect, useMemo, useState } from 'react'
import { Activity, Satellite, Telescope, TriangleAlert, CloudSun, Loader } from 'lucide-react'
import { useEngine } from '../../hooks/useEngine.js'
import { catalogSatellites } from '../../lib/engine.js'
import { footprintOf, tleDetails } from '../../lib/analysis.js'
import { REGIME_COLORS, REGIME_LABELS } from '../../lib/coords.js'

const TABS = [
  ['telemetry', 'TELEMETRY', Activity],
  ['passes', 'PASSES', Telescope],
  ['alerts', 'ALERTS', TriangleAlert],
  ['wx', 'WX', CloudSun],
]

const CITIES = [
  ['Nairobi', -1.29, 36.82], ['Lagos', 6.52, 3.38], ['London', 51.51, -0.13],
  ['New York', 40.71, -74.0], ['Tokyo', 35.68, 139.69], ['Delhi', 28.61, 77.21],
  ['São Paulo', -23.55, -46.63], ['Sydney', -33.87, 151.21],
]

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

const fmtTime = (ms) => new Date(ms).toISOString().slice(11, 19)
const fmtDay = (ms) => new Date(ms).toISOString().slice(5, 10)

function countdown(ms) {
  if (ms <= 0) return 'NOW'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`
}

/* ------------------------------------------------------------------ tabs */

function TelemetryTab({ meta, live }) {
  const fp = live ? footprintOf(live.alt) : null
  const det = useMemo(() => tleDetails(meta.line1, meta.line2), [meta])
  return (
    <>
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
      {fp && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Tile label="Horizon ∠" value={fp.horizonDeg.toFixed(1)} unit="deg" />
          <Tile label="Footprint r" value={fp.radiusKm.toFixed(0)} unit="km" />
        </div>
      )}
      <div className="text-[9px] uppercase tracking-[0.18em] text-emerald-600 mb-1.5">Orbital Elements</div>
      <div className="bg-black/20 border border-emerald-400/10 rounded-lg px-3 py-1.5">
        {[
          ['Period', `${meta.period_min.toFixed(1)} min`],
          ['Inclination', `${meta.inclination_deg.toFixed(2)}°`],
          ['RAAN', `${meta.raan_deg.toFixed(1)}°`],
          ['Arg of perigee', `${det.argPerigeeDeg.toFixed(2)}°`],
          ['Mean anomaly', `${det.meanAnomalyDeg.toFixed(2)}°`],
          ['Eccentricity', meta.eccentricity.toFixed(4)],
          ['Semi-major axis', `${meta.sma_km.toLocaleString()} km`],
          ['Apogee', `${det.apogeeKm.toFixed(0)} km`],
          ['Perigee', `${det.perigeeKm.toFixed(0)} km`],
          ['TLE epoch', `${det.epochMs ? new Date(det.epochMs).toISOString().slice(0, 16).replace('T', ' ') : 'unavailable'} UTC`],
          ['Launched', String(meta.launched)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between text-[11px] py-[3px] border-b border-emerald-400/[0.07] last:border-0">
            <span className="text-emerald-500">{k}</span>
            <span className="font-mono text-emerald-100 tabular-nums">{v}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function PassesTab({ meta }) {
  const engine = useEngine()
  const [city, setCity] = useState('Nairobi')
  const [custom, setCustom] = useState(null)
  const [minElev, setMinElev] = useState(10)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const obs = custom ?? CITIES.find((c) => c[0] === city)?.slice(1) ?? [0, 0]

  useEffect(() => {
    let alive = true
    setBusy(true)
    engine.computePasses(meta.id, obs[0], obs[1], 24, minElev).then((r) => {
      if (alive) { setResult(r); setBusy(false) }
    })
    return () => { alive = false }
  }, [meta.id, city, custom, minElev]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = result?.id === meta.id ? result.list : []

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="text-[11px] text-emerald-300 mb-2">
        Sky-watcher passes for <span className="font-bold">{meta.name}</span> · next 24 h
      </div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {CITIES.map(([n]) => (
          <button key={n} onClick={() => { setCity(n); setCustom(null) }}
                  className={`px-2 py-0.5 rounded-full text-[10px] border transition
                    ${!custom && city === n ? 'bg-emerald-500 text-emerald-950 border-emerald-400 font-bold'
                                             : 'border-emerald-400/20 text-emerald-400'}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-3 text-[10px] font-mono text-emerald-500">
        <span>observer {obs[0].toFixed(2)}°, {obs[1].toFixed(2)}°</span>
        <span className="text-emerald-700">|</span>
        <label className="flex items-center gap-1">min elev
          <select value={minElev} onChange={(e) => setMinElev(Number(e.target.value))}
                  className="bg-black/30 border border-emerald-400/20 rounded px-1 py-0.5 text-emerald-200">
            {[0, 10, 20, 30].map((v) => <option key={v} value={v}>{v}°</option>)}
          </select>
        </label>
        <button onClick={() => navigator.geolocation?.getCurrentPosition(
              (p) => setCustom([p.coords.latitude, p.coords.longitude]))}
              className="ml-auto px-2 py-0.5 rounded border border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10">
          📍 my location
        </button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll space-y-1.5">
        {busy && <div className="text-center py-6"><Loader size={16} className="animate-spin inline text-emerald-400" /></div>}
        {!busy && list.length === 0 && (
          <div className="text-[11px] font-mono text-emerald-700 text-center py-6">
            no passes above {minElev}° in the next 24 h — try another site or lower the mask angle
          </div>
        )}
        {!busy && list.map((p) => (
          <div key={p.rise} className="bg-black/25 border border-emerald-400/10 rounded-lg px-3 py-2">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-emerald-200">{fmtTime(p.rise)} → {fmtTime(p.set)}</span>
              <span className="text-emerald-500">{fmtDay(p.rise)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-emerald-600 mt-1">
              <span>max el {p.maxElev.toFixed(1)}°</span>
              <span>az {p.azMax.toFixed(0)}°</span>
              <span>{p.durationS.toFixed(0)} s</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-emerald-800 mt-2">
        Computed in-browser (SGP4 + local horizon). Identical math on GET /api/satellites/:id/passes.
      </p>
    </div>
  )
}

function AlertsTab() {
  const engine = useEngine()
  const [hours, setHours] = useState(6)
  const res = engine.conjunctions
  const riskCount = res?.events.filter((e) => e.risk).length ?? 0

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-emerald-300">Space traffic · screening next</span>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
                className="bg-black/30 border border-emerald-400/20 rounded px-1 py-0.5 text-[11px] text-emerald-200">
          {[2, 6, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}
        </select>
        <button onClick={() => engine.runConjunctionScan(hours)}
                disabled={engine.scanning}
                className="ml-auto px-3 py-1 rounded-md text-[11px] font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-50">
          {engine.scanning ? 'scanning…' : 'SCAN'}
        </button>
      </div>
      <div className="text-[10px] font-mono mb-2">
        {res
          ? <>threshold {res.thresholdKm} km · {res.events.length} approaches · <span className={riskCount ? 'text-red-400' : 'text-emerald-500'}>{riskCount} RISK</span></>
          : <span className="text-emerald-700">no scan yet — press SCAN</span>}
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll space-y-1.5">
        {(res?.events ?? []).map((e, i) => {
          const dt = e.tCa - engine.simMs
          return (
            <div key={i}
                 className={`rounded-lg px-3 py-2 border ${e.risk ? 'border-red-500/60 bg-red-500/10' : 'border-emerald-400/10 bg-black/25'}`}>
              <div className={`text-[11px] font-bold ${e.risk ? 'text-red-300' : 'text-emerald-100'}`}>
                {e.aName} ⟷ {e.bName}
              </div>
              <div className="flex justify-between text-[10px] font-mono mt-1 text-emerald-500">
                <span className={e.risk ? 'text-red-400' : ''}>{e.distanceKm.toFixed(1)} km</span>
                <span>T-{countdown(dt)}</span>
              </div>
              {e.risk && (
                <div className="text-[9px] font-mono text-red-400 mt-1 live-dot">
                  ⚠ CONJUNCTION RISK — orbit pair flagged crimson in scene
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[9px] text-emerald-800 mt-2">
        Coarse 5-min scan + ternary refinement, mirrored server-side at GET /api/conjunctions.
      </p>
    </div>
  )
}

function WeatherTab() {
  const engine = useEngine()
  const w = engine.weather
  const kpPct = (w.kp_index / 9) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-emerald-300">Space weather &amp; drag</span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-400/25 text-emerald-500">
          {w.source}
        </span>
      </div>
      <div className="bg-black/25 border border-emerald-400/10 rounded-lg p-3 mb-3">
        <div className="flex justify-between text-[11px] font-mono mb-1">
          <span className="text-emerald-500">Kp INDEX</span>
          <span className={w.storm ? 'text-red-400 font-bold' : 'text-emerald-100'}>
            {w.kp_index.toFixed(1)} / 9
          </span>
        </div>
        <div className="h-2 rounded-full bg-black/50 overflow-hidden">
          <div className="h-full rounded-full transition-all"
               style={{ width: `${kpPct}%`,
                        background: w.kp_index >= 5
                          ? 'linear-gradient(90deg,#f59e0b,#ef4444)'
                          : 'linear-gradient(90deg,#34d399,#a3e635)' }} />
        </div>
        <div className={`text-[10px] font-mono mt-1.5 ${w.storm ? 'text-red-400' : 'text-emerald-500'}`}>
          {w.condition}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Tile label="F10.7 flux" value={w.flux_107cm.toFixed(0)} unit="sfu" />
        <Tile label="Density ×" value={w.density_multiplier.toFixed(2)} unit="baseline" />
      </div>
      {w.storm && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200 mb-3">
          Geomagnetic storm — thermosphere inflation raises LEO drag. Enable the
          <span className="font-mono"> decay </span>layer to see accelerated orbital decay vectors.
        </div>
      )}
      <button onClick={() => engine.refreshWeather()}
              className="w-full py-1.5 rounded-md text-[11px] font-mono border border-emerald-400/25 text-emerald-300 hover:bg-emerald-400/10">
        ↻ refresh feed
      </button>
      <p className="text-[9px] text-emerald-800 mt-3">
        NOAA SWPC via GET /api/space-weather when linked; deterministic synthetic model offline.
      </p>
    </div>
  )
}

/* ----------------------------------------------------------------- panel */

/** Right HUD: tabbed so new capabilities never add permanent panels. */
export default function TelemetryPanel() {
  const engine = useEngine()
  const [tab, setTab] = useState('telemetry')
  const meta = catalogSatellites.find((s) => s.id === engine.selectedId) ?? catalogSatellites[0]
  const live = (engine.snapshot ?? []).find((s) => s.id === meta.id)
  const risks = engine.conjunctions?.events.filter((e) => e.risk).length ?? 0

  return (
    <div className="glass rounded-xl p-4 flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-2">
        <Satellite size={15} className="text-emerald-400" />
        <span className="font-semibold text-emerald-50 text-sm">Mission HUD</span>
      </div>
      <div className="grid grid-cols-4 gap-1 mb-3 p-1 rounded-lg bg-black/30 border border-emerald-400/10">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
                  className={`relative flex items-center justify-center gap-1 py-1.5 rounded-md text-[9px] font-mono tracking-wide transition
                    ${tab === key ? 'bg-emerald-400/15 text-emerald-200' : 'text-emerald-600 hover:text-emerald-300'}`}>
            <Icon size={11} /> {label}
            {key === 'alerts' && risks > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] grid place-items-center live-dot">
                {risks}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll">
        {tab === 'telemetry' && <TelemetryTab meta={meta} live={live} />}
        {tab === 'passes' && <PassesTab meta={meta} />}
        {tab === 'alerts' && <AlertsTab />}
        {tab === 'wx' && <WeatherTab />}
      </div>
      {tab === 'telemetry' && (
        <p className="text-[9px] leading-relaxed text-emerald-800 mt-3 pt-2 border-t border-emerald-400/10">
          {REGIME_LABELS[meta.regime]} · propagated in-browser from CelesTrak elements;
          backend mirrors every computation.
        </p>
      )}
    </div>
  )
}
