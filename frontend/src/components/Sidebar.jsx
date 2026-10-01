import { useMemo, useState } from 'react'
import { Search, Crosshair, Layers } from 'lucide-react'
import { GROUP_COLORS, GROUP_LABELS } from '../lib/coords.js'

const ALL = 'all'

/** Filterable satellite catalog; clicking a row locks the target. */
export default function Sidebar({ satellites, selectedId, onSelect }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState(ALL)

  const groups = useMemo(() => {
    const seen = new Set(satellites.map((s) => s.group))
    return [...seen].sort()
  }, [satellites])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return satellites.filter((s) =>
      (group === ALL || s.group === group) &&
      (!q || s.name.toLowerCase().includes(q) || String(s.norad_id).includes(q)))
  }, [satellites, query, group])

  return (
    <aside className="absolute left-3 top-24 bottom-3 z-10 w-72 flex flex-col gap-3">
      <div className="hud-panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <Layers size={14} className="text-pulse" />
          <span className="hud-label">Catalog Filter</span>
        </div>
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2.5 top-2.5 text-cyan-500/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search name / NORAD id…"
            className="w-full bg-space-800/80 border border-white/10 rounded pl-8 pr-2 py-1.5
                       font-mono text-xs text-cyan-100 placeholder:text-cyan-700
                       focus:outline-none focus:border-pulse-line"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {[ALL, ...groups].map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition
                ${group === g
                  ? 'border-pulse text-cyan-100 bg-pulse/15'
                  : 'border-white/10 text-cyan-500/70 hover:text-cyan-200'}`}
            >
              {g === ALL ? 'ALL' : (GROUP_LABELS[g] ?? g).toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="hud-panel flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-pulse-line">
          <span className="hud-label">Tracked Objects</span>
          <span className="hud-value text-xs">{filtered.length}</span>
        </div>
        <ul className="flex-1 overflow-y-auto thin-scroll">
          {filtered.map((sat) => {
            const active = sat.id === selectedId
            return (
              <li key={sat.id}>
                <button
                  onClick={() => onSelect(sat.id)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 border-b border-white/5 transition
                    ${active ? 'bg-pulse-soft' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: GROUP_COLORS[sat.group] ?? '#22d3ee',
                                 boxShadow: `0 0 6px ${GROUP_COLORS[sat.group] ?? '#22d3ee'}` }} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-mono text-xs text-cyan-100 truncate">{sat.name}</span>
                    <span className="block font-mono text-[10px] text-cyan-600">
                      #{sat.norad_id} · {GROUP_LABELS[sat.group] ?? sat.group}
                      {sat.state ? ` · ${Math.round(sat.state.altitude_km)} km` : ''}
                    </span>
                  </span>
                  {active && <Crosshair size={13} className="text-pulse shrink-0" />}
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="p-4 text-center font-mono text-xs text-cyan-700">no matches</li>
          )}
        </ul>
      </div>
    </aside>
  )
}
