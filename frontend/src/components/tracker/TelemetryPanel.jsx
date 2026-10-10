import { useEffect, useMemo, useState } from 'react'
import { Activity, Satellite, Telescope, TriangleAlert, CloudSun, Loader } from 'lucide-react'
import { useEngine } from '../../hooks/useEngine.js'
import { catalogSatellites, catalogGeneratedAt } from '../../lib/engine.js'
import { footprintOf, tleDetails } from '../../lib/analysis.js'
import { tleStale } from '../../lib/constellation.js'
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

function Tile({ label, value, unit, title }) {
  return (
    <div title={title} className="bg-black/25 border border-hi/10 rounded-lg px-3 py-2.5">
      <div className="text-[8px] uppercase tracking-[0.18em] text-mut">{label}</div>
      <div className="font-mono text-fg text-[15px] font-semibold tabular-nums mt-1 leading-tight">
        {value}<span className="text-[10px] font-normal text-mut ml-1">{unit}</span>
      </div>
    </div>
  )
}

const fmtTime = (ms) => new Date(ms).toISOString().slice(11, 19)
const fmtDay = (ms) => new Date(ms).toISOString().slice(5, 10)
const fmtDayLong = (ms) => new Date(ms).toISOString().slice(0, 10)

function countdown(ms) {
  if (ms <= 0) return 'NOW'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`
}

/* ------------------------------------------------------------------ tabs */

function TelemetryTab({ meta, live }) {
  const engine = useEngine()
  const fp = live ? footprintOf(live.alt) : null
  const det = useMemo(() => tleDetails(meta.line1, meta.line2), [meta])
  const ageDays = det.epochMs ? (engine.simMs - det.epochMs) / 86400000 : null
  const aged = tleStale(meta.line1, meta.line2, engine.date())
  return (
    <>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[9px] font-mono tracking-[0.14em] text-mut">
          SIM EPOCH <span className="text-hi tabular-nums">{fmtTime(engine.simMs)}{` `}
            {fmtDayLong(engine.simMs)}</span>
        </span>
        <span className={`text-[9px] font-mono px-1.5 py-px rounded-full border
          ${engine.isLive ? 'border-ok/50 text-ok' : 'border-cau/50 text-cau'}`}>
          {engine.isLive ? 'REAL-TIME' : `SIM ×${engine.warp}`}
        </span>
      </div>
      <div className="bg-hi/[0.06] border border-hi/25 rounded-lg p-3 mb-3">
        <div className="font-bold text-fg text-sm">{meta.name}</div>
        <div className="text-[11px] text-hi/90 mt-0.5">{meta.description}</div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] font-mono px-1.5 py-px rounded border"
                style={{ color: REGIME_COLORS[meta.regime], borderColor: `${REGIME_COLORS[meta.regime]}66` }}>
            {meta.regime}
          </span>
          <span className="text-[10px] font-mono text-mut">
            {live ? 'Signal lock · nominal' : 'acquiring…'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-black/25 border border-hi/10 rounded-lg px-3 py-2">
          <div className="text-[8px] uppercase tracking-[0.18em] text-mut">Element source</div>
          <div className="font-mono text-[11px] text-fg mt-0.5">CelesTrak · {String(meta.norad_id)}</div>
          <div className="font-mono text-[9px] text-mut mt-0.5">
            bundle {fmtDayLong(Date.parse(catalogGeneratedAt))} UTC
          </div>
        </div>
        <div className="bg-black/25 border border-hi/10 rounded-lg px-3 py-2">
          <div className="text-[8px] uppercase tracking-[0.18em] text-mut">Propagation</div>
          <div className={`font-mono text-[11px] mt-0.5 ${!live ? 'text-crit' : aged ? 'text-cau' : 'text-ok'}`}>
            {!live ? 'NO SOLUTION' : aged ? 'SGP4 · TLE AGED' : 'SGP4 · NOMINAL'}
          </div>
          <div className="font-mono text-[9px] text-mut mt-0.5">
            TLE age {ageDays != null ? `${ageDays.toFixed(1)} d` : '—'} vs sim
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Tile label="Altitude" value={live ? live.alt.toFixed(1) : '——'} unit="km"
              title="Height above the spherical mean-Earth radius (6371 km) — satellite.js eciToGeodetic convention" />
        <Tile label="Velocity · TEME" value={live ? live.speed.toFixed(2) : '——'} unit="km/s"
              title="TEME ECI velocity magnitude from SGP4 (inertial, not ground-relative)" />
        <Tile label="Latitude · geod" value={live ? `${Math.abs(live.lat).toFixed(2)}° ${live.lat >= 0 ? 'N' : 'S'}` : '——'}
              title="Geodetic latitude, spherical-Earth approximation (satellite.js), at the SIM epoch" />
        <Tile label="Longitude · geod" value={live ? `${Math.abs(live.lon).toFixed(2)}° ${live.lon >= 0 ? 'E' : 'W'}` : '——'}
              title="Geodetic longitude via GMST at the SIM epoch — Earth-fixed, tracks the simulation clock" />
      </div>
      {fp && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Tile label="Horizon ∠" value={fp.horizonDeg.toFixed(1)} unit="deg" />
          <Tile label="Footprint r" value={fp.radiusKm.toFixed(0)} unit="km" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-black/25 border border-hi/10 rounded-lg px-3 py-2.5"
             title="Umbra/penumbra CONE model (M13) on the Meeus sun ephemeris at the SIM epoch; LIT = outside both cones (penumbra counts as not fully lit).">
          <div className="text-[9px] uppercase tracking-[0.15em] text-mut">Sunlight</div>
          <div className={`font-mono text-sm mt-0.5 ${live?.sunlit ? 'text-cau' : 'text-hi'}`}>
            {live ? (live.sunlit ? '☀ LIT' : '☾ ECLIPSE') : '——'}
          </div>
        </div>
        <Tile label="NORAD ID" value={String(meta.norad_id)} />
      </div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-mut mb-1.5">Orbital Elements</div>
      <div className="bg-black/20 border border-hi/10 rounded-lg px-3 py-1.5">
        {[
          ['Period', `${meta.period_min.toFixed(1)} min`, 'Time for one full revolution (from mean motion).'],
          ['Inclination', `${meta.inclination_deg.toFixed(2)}°`, 'Tilt of the orbital plane vs the equator.'],
          ['RAAN', `${meta.raan_deg.toFixed(1)}°`, 'Right ascension of the ascending node — where the orbit crosses the equator heading north.'],
          ['Arg of perigee', `${det.argPerigeeDeg.toFixed(2)}°`, 'Angle from the ascending node to the lowest point of the orbit.'],
          ['Mean anomaly', `${det.meanAnomalyDeg.toFixed(2)}°`, 'Fractional position along the orbit at epoch (not a geometric angle).'],
          ['Eccentricity', meta.eccentricity.toFixed(4), '0 = circle; values here are near-circular LEO orbits.'],
          ['Semi-major axis', `${meta.sma_km.toLocaleString()} km`, 'Half the long axis of the ellipse; sets the orbital energy.'],
          ['Apogee', `${det.apogeeKm.toFixed(0)} km`, 'Highest point above the spherical-Earth surface.'],
          ['Perigee', `${det.perigeeKm.toFixed(0)} km`, 'Lowest point above the spherical-Earth surface.'],
          ['TLE epoch', `${det.epochMs ? new Date(det.epochMs).toISOString().slice(0, 16).replace('T', ' ') : 'unavailable'} UTC`, 'Reference time of the element set; accuracy degrades with age.'],
          ['Launched', String(meta.launched), 'Year the spacecraft reached orbit.'],
        ].map(([k, v, tip]) => (
          <div key={k} title={tip} className="flex justify-between text-[11px] py-[3px] border-b border-hi/[0.07] last:border-0 cursor-help">
            <span className="text-pri">{k}</span>
            <span className="font-mono text-fg tabular-nums">{v}</span>
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
      <div className="text-[11px] text-hi mb-2">
        Sky-watcher passes for <span className="font-bold">{meta.name}</span> · next 24 h
      </div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {CITIES.map(([n]) => (
          <button key={n} onClick={() => { setCity(n); setCustom(null) }}
                  className={`px-2 py-0.5 rounded-full text-[10px] border transition
                    ${!custom && city === n ? 'bg-pri text-bg border-hi font-bold'
                                             : 'border-hi/20 text-hi'}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-3 text-[10px] font-mono text-pri">
        <span>observer {obs[0].toFixed(2)}°, {obs[1].toFixed(2)}°</span>
        <span className="text-mut">|</span>
        <label className="flex items-center gap-1">min elev
          <select value={minElev} onChange={(e) => setMinElev(Number(e.target.value))}
                  className="bg-black/30 border border-hi/20 rounded px-1 py-0.5 text-fg">
            {[0, 10, 20, 30].map((v) => <option key={v} value={v}>{v}°</option>)}
          </select>
        </label>
        <button onClick={() => navigator.geolocation?.getCurrentPosition(
              (p) => setCustom([p.coords.latitude, p.coords.longitude]))}
              className="ml-auto px-2 py-0.5 rounded border border-hi/30 text-hi hover:bg-hi/10">
          📍 my location
        </button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll space-y-1.5">
        {busy && <div className="text-center py-6"><Loader size={16} className="animate-spin inline text-hi" /></div>}
        {!busy && list.length === 0 && (
          <div className="text-[11px] font-mono text-mut text-center py-6">
            no passes above {minElev}° in the next 24 h — try another site or lower the mask angle
          </div>
        )}
        {!busy && list.map((p) => (
          <div key={p.rise} className="bg-black/25 border border-hi/10 rounded-lg px-3 py-2">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-fg">{fmtTime(p.rise)} → {fmtTime(p.set)}</span>
              <span className="text-pri">{fmtDay(p.rise)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-mut mt-1">
              <span>max el {p.maxElev.toFixed(1)}°</span>
              <span>az {p.azMax.toFixed(0)}°</span>
              <span>{p.durationS.toFixed(0)} s</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-mut mt-2">
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
        <span className="text-[11px] text-hi">Space traffic · screening next</span>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
                className="bg-black/30 border border-hi/20 rounded px-1 py-0.5 text-[11px] text-fg">
          {[2, 6, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}
        </select>
        <button onClick={() => engine.runConjunctionScan(hours)}
                disabled={engine.scanning}
                className="ml-auto px-3 py-1 rounded-md text-[11px] font-semibold bg-pri text-bg hover:bg-hi disabled:opacity-50">
          {engine.scanning ? 'scanning…' : 'SCAN'}
        </button>
      </div>
      <div className="text-[10px] font-mono mb-2">
        {res
          ? <>threshold {res.thresholdKm} km · {res.events.length} approaches · <span className={riskCount ? 'text-red-400' : 'text-pri'}>{riskCount} RISK</span> · screened {res.scanned}{res.capped ? ' (cap)' : ''} objects</>
          : <span className="text-mut">no scan yet — press SCAN</span>}
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll space-y-1.5">
        {(res?.events ?? []).map((e, i) => {
          const dt = e.tCa - engine.simMs
          return (
            <div key={i}
                 className={`rounded-lg px-3 py-2 border ${e.risk ? 'border-red-500/60 bg-red-500/10' : 'border-hi/10 bg-black/25'}`}>
              <div className={`text-[11px] font-bold ${e.risk ? 'text-red-300' : 'text-fg'}`}>
                {e.aName} ⟷ {e.bName}
              </div>
              <div className="flex justify-between text-[10px] font-mono mt-1 text-pri">
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
      <p className="text-[9px] text-mut mt-2">
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
        <span className="text-[11px] text-hi">Space weather &amp; drag</span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-hi/25 text-pri">
          {w.source}
        </span>
      </div>
      <div className="bg-black/25 border border-hi/10 rounded-lg p-3 mb-3">
        <div className="flex justify-between text-[11px] font-mono mb-1">
          <span className="text-pri">Kp INDEX</span>
          <span className={w.storm ? 'text-red-400 font-bold' : 'text-fg'}>
            {w.kp_index.toFixed(1)} / 9
          </span>
        </div>
        <div className="h-2 rounded-full bg-black/50 overflow-hidden">
          <div className="h-full rounded-full transition-all"
               style={{ width: `${kpPct}%`,
                        background: w.kp_index >= 5
                          ? 'linear-gradient(90deg,#F5B942,#FF647C)'
                          : 'linear-gradient(90deg,#38D9FF,#818CF8)' }} />
        </div>
        <div className={`text-[10px] font-mono mt-1.5 ${w.storm ? 'text-red-400' : 'text-pri'}`}>
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
              className="w-full py-1.5 rounded-md text-[11px] font-mono border border-hi/25 text-hi hover:bg-hi/10">
        ↻ refresh feed
      </button>
      <p className="text-[9px] text-mut mt-3">
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
        <Satellite size={15} className="text-hi" />
        <span className="font-semibold text-fg text-sm">Mission HUD</span>
      </div>
      <div className="grid grid-cols-4 gap-1 mb-3 p-1 rounded-lg bg-black/30 border border-hi/10">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
                  className={`relative flex items-center justify-center gap-1 py-1.5 rounded-md text-[9px] font-mono tracking-wide transition
                    ${tab === key ? 'bg-hi/15 text-fg' : 'text-mut hover:text-hi'}`}>
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
        <p className="text-[9px] leading-relaxed text-mut mt-3 pt-2 border-t border-hi/10">
          {REGIME_LABELS[meta.regime]} · propagated in-browser from CelesTrak elements;
          backend mirrors every computation. Spacecraft models are representative
          vehicles at ~10× size exaggeration (TRUE SCALE toggle) with illustrative
          nadir-pointing orientation — positions and timing are exact, attitude is not.
        </p>
      )}
    </div>
  )
}
