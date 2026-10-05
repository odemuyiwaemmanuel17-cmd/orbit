import { Loader } from 'lucide-react'

/** Shared orbital-style loading state (used by route + scene mounts). */
export default function SceneLoader({ label = 'ESTABLISHING TELEMETRY LINK' }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#020a06] flex flex-col items-center justify-center gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border border-emerald-400/25" />
        <div className="absolute inset-0 rounded-full border-t-2 border-emerald-400 animate-spin" style={{ animationDuration: '1.4s' }} />
        <div className="absolute inset-[30%] rounded-full bg-emerald-400/15 border border-emerald-400/40" />
      </div>
      <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.3em] text-emerald-500/80">
        <Loader size={12} className="animate-spin" /> {label}
      </div>
    </div>
  )
}
