import { useMemo, useState } from 'react'
import { Search, Satellite } from 'lucide-react'
import { useEngine } from '../../hooks/useEngine.js'
import { catalogSatellites } from '../../lib/engine.js'
import { REGIME_COLORS } from '../../lib/coords.js'

const FILTERS = ['ALL', 'LEO', 'MEO', 'GEO']

/** Constellation / mission categories derived from the catalog slots. */
const CATEGORY = {
  iss: 'Stations',
  hubble: 'Science',
  sentinel2a: 'Earth Obs',
  landsat9: 'Earth Obs',
  noaa20: 'Weather',
  terra: 'Earth Obs',
  aqua: 'Earth Obs',
  starlink: 'Starlink',
  gps: 'Navigation',
  gps2: 'Navigation',
  galileo: 'Navigation',
  goes: 'Weather',
  himawari: 'Weather',
  meteosat: 'Weather',
}
const CATEGORIES = ['ALL', ...new Set(Object.values(CATEGORY))]

/** Left panel of the tracker: searchable, regime + category filtered catalog. */
export default function CatalogPanel() {
  const engine = useEngine()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [category, setCategory] = useState('ALL')

  const liveById = useMemo(() => {
    const m = {}
    for (const s of engine.snapshot ?? []) m[s.id] = s
    return m
  }, [engine.snapshot])

  const rows = catalogSatellites.filter((s) =>
    (filter === 'ALL' || s.regime === filter) &&
    (category === 'ALL' || CATEGORY[s.slot] === category) &&
    (!query.trim() ||
     s.name.toLowerCase().includes(query.trim().toLowerCase()) ||
     String(s.norad_id).includes(query.trim())))

  return (
    <div className="glass rounded-xl p-4 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Satellite size={15} className="text-emerald-400" />
          <span className="font-semibold text-emerald-50 text-sm">Satellite Catalog</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-400/30 text-emerald-300">
          {catalogSatellites.length} tracked
        </span>
      </div>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-2 text-emerald-700" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, NORAD, operator…"
          className="w-full bg-black/30 border border-emerald-400/15 rounded-md pl-8 pr-2 py-1.5
                     text-xs text-emerald-100 placeholder:text-emerald-800 focus:outline-none
                     focus:border-emerald-400/40"
        />
      </div>
      <div className="flex gap-1.5 mb-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono border transition
                    ${filter === f
                      ? 'bg-emerald-500 text-emerald-950 border-emerald-400 font-bold'
                      : 'border-emerald-400/20 text-emerald-400 hover:border-emerald-400/50'}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap mb-2">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border transition
                    ${category === c
                      ? 'border-cyan-400/70 bg-cyan-400/15 text-cyan-200'
                      : 'border-emerald-400/15 text-emerald-600 hover:text-emerald-300'}`}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <ul className="flex-1 overflow-y-auto thin-scroll -mx-1">
        {rows.map((s) => {
          const live = liveById[s.id]
          const sel = s.id === engine.selectedId
          return (
            <li key={s.id}>
              <button onClick={() => { engine.select(s.id); engine.focusOn(s.id) }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg mb-1 border transition
                        ${sel ? 'bg-emerald-400/10 border-emerald-400/50'
                              : 'border-transparent hover:bg-white/[0.04]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-50 truncate">{s.name}</span>
                  <span className="text-[9px] font-mono px-1.5 py-px rounded border shrink-0"
                        style={{ color: REGIME_COLORS[s.regime], borderColor: `${REGIME_COLORS[s.regime]}55` }}>
                    {s.regime}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-emerald-600 mt-0.5">
                  NORAD {s.norad_id} · {live ? `${Math.round(live.alt)} km` : `${s.altitude_km} km`} · {s.inclination_deg}°
                </div>
              </button>
            </li>
          )
        })}
        {rows.length === 0 && (
          <li className="p-3 text-center text-[11px] font-mono text-emerald-800">no matches</li>
        )}
      </ul>
    </div>
  )
}
