import { AlertTriangle, CheckCircle2, Crosshair } from 'lucide-react'

const KIND = {
  ok: { icon: CheckCircle2, cls: 'border-emerald-400/40 text-emerald-200' },
  warn: { icon: AlertTriangle, cls: 'border-amber-400/40 text-amber-200' },
  target: { icon: Crosshair, cls: 'border-pulse text-cyan-100' },
  info: { icon: CheckCircle2, cls: 'border-cyan-400/40 text-cyan-200' },
}

/** Minimal bottom-center status toasts (target lock, link state, TLE refresh). */
export default function Toasts({ toasts }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5">
      {toasts.map((t) => {
        const { icon: Icon, cls } = KIND[t.kind] ?? KIND.info
        return (
          <div key={t.id}
               className={`toast-enter hud-panel flex items-center gap-2 px-3 py-1.5 border ${cls}`}>
            <Icon size={13} />
            <span className="font-mono text-[11px]">{t.text}</span>
          </div>
        )
      })}
    </div>
  )
}
