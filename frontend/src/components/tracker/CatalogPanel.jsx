import { useMemo, useState } from 'react'
import { Search, Satellite } from 'lucide-react'
import { useEngine } from '../../hooks/useEngine.js'
import { catalogSatellites } from '../../lib/engine.js'
import { tleStale } from '../../lib/constellation.js'
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
  // Constellation layer slots (data/constellations/<key>.json use slot=key).
  test: 'Test',
  weather: 'Weather',
}
const CATEGORIES = ['ALL', ...new Set(Object.values(CATEGORY))]

/** DOM rows rendered when a huge constellation is active — honest cap. */
const MAX_ROWS = 120

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

  // Featured catalog + every enabled constellation layer (deduped in engine).
  const merged = useMemo(
    () => [...catalogSatellites, ...engine.activeSatelliteMetas()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine.constellationVersion],
  )
  const chips = [...engine.constellations.values()]

  const rows = merged.filter((s) =>
    (filter === 'ALL' || s.regime === filter) &&
    (category === 'ALL' || CATEGORY[s.slot] === category) &&
    (!query.trim() ||
     s.name.toLowerCase().includes(query.trim().toLowerCase()) ||
     String(s.norad_id).includes(query.trim())))
  const visibleRows = rows.slice(0, MAX_ROWS)

  return (
    <div className="glass rounded-xl p-4 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Satellite size={15} className="text-hi" />
          <span className="font-semibold text-fg text-sm">Satellite Catalog</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-hi/30 text-hi">
          {merged.length} tracked
        </span>
      </div>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-2 text-mut" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, NORAD, operator…"
          className="w-full bg-black/30 border border-hi/15 rounded-md pl-8 pr-2 py-1.5
                     text-xs text-fg placeholder:text-mut focus:outline-none
                     focus:border-hi/40"
        />
      </div>
      <div className="flex gap-1.5 mb-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono border transition
                    ${filter === f
                      ? 'bg-pri text-bg border-hi font-bold'
                      : 'border-hi/20 text-hi hover:border-hi/50'}`}>
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
                      : 'border-hi/15 text-mut hover:text-hi'}`}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap mb-2" role="group" aria-label="Constellation layers">
        {chips.map((c) => (
          <button key={c.key} onClick={() => engine.toggleConstellation(c.key)}
                  aria-pressed={c.active}
                  title={`Toggle ${c.label} constellation layer`}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono border transition
                    ${c.active
                      ? 'border-hi/70 bg-hi/15 text-fg'
                      : 'border-hi/15 text-mut hover:text-hi'}`}>
            {c.label.toUpperCase()}
            {c.loading ? ' …' : c.active && c.count ? ` ${c.count}` : ''}
          </button>
        ))}
      </div>
      <ul className="flex-1 overflow-y-auto thin-scroll -mx-1">
        {visibleRows.map((s) => {
          const live = liveById[s.id]
          const sel = s.id === engine.selectedId
          return (
            <li key={s.id}>
              <button onClick={() => { engine.select(s.id); engine.focusOn(s.id) }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg mb-1 border transition
                        ${sel ? 'bg-hi/10 border-hi/50'
                              : 'border-transparent hover:bg-white/[0.04]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg truncate">{s.name}</span>
                  <span className="text-[9px] font-mono px-1.5 py-px rounded border shrink-0"
                        style={{ color: REGIME_COLORS[s.regime], borderColor: `${REGIME_COLORS[s.regime]}55` }}>
                    {s.regime}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-mut mt-0.5">
                  NORAD {s.norad_id} · {live ? `${Math.round(live.alt)} km` : `${s.altitude_km} km`} · {s.inclination_deg}°
                  {!live && tleStale(s.line1, s.line2, engine.date()) && (
                    <span className="text-amber-400" title="TLE epoch beyond half the check period — propagated position is unreliable">
                      {' '}· TLE AGED
                    </span>
                  )}
                </div>
              </button>
            </li>
          )
        })}
        {rows.length > MAX_ROWS && (
          <li className="p-2 text-center text-[10px] font-mono text-mut">
            showing {MAX_ROWS} of {rows.length} — narrow the search
          </li>
        )}
        {rows.length === 0 && (
          <li className="p-3 text-center text-[11px] font-mono text-mut">no matches</li>
        )}
      </ul>
    </div>
  )
}
