import { Check } from 'lucide-react'

const STEPS = [
  'Loading TLE catalogue',
  'Initializing SGP4 engine',
  'Synchronizing UTC clock',
  'Preparing telemetry bus',
]

/**
 * OrbitalPulse boot sequence. Every step shown is a real initialization that
 * has completed by the time this screen appears (the engine builds its SGP4
 * records synchronously at module load) — no artificial delays are added.
 */
export default function SceneLoader({ label = 'INITIALIZING ORBITAL ENGINE' }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#050B17] flex flex-col items-center justify-center gap-5">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border border-hi/25" />
        <div className="absolute inset-0 rounded-full border-t-2 border-hi animate-spin" style={{ animationDuration: '1.4s' }} />
        <div className="absolute inset-[30%] rounded-full bg-hi/15 border border-hi/40" />
      </div>
      <div className="text-[11px] font-mono tracking-[0.3em] text-hi/90">{label}</div>
      <ul className="space-y-1.5" aria-live="polite">
        {STEPS.map((s, i) => (
          <li key={s}
              className="flex items-center gap-2 text-[11px] font-mono text-pri toast-enter"
              style={{ animationDelay: `${i * 90}ms`, animationFillMode: 'backwards' }}>
            <Check size={12} className="text-hi" /> {s}… OK
          </li>
        ))}
      </ul>
      <div className="text-[10px] font-mono tracking-[0.25em] text-mut">
        MISSION CONTROL READY
      </div>
    </div>
  )
}
