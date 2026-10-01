import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  ['Is OrbitalPulse free to use?',
   'Yes. The tracker, telemetry HUD, and visualization are fully open in your browser — no account, no install, no license key. The source runs on standard open web technologies and a self-hostable FastAPI backend.'],
  ['Where does the satellite data come from?',
   'Two-Line Element sets are ingested from CelesTrak public feeds. The demo catalog ships as a curated 14-object snapshot fetched at build time; the backend can refresh it on demand via GET /api/satellites?refresh=true.'],
  ['What are the technical requirements to run the 3D tracker?',
   'Any modern desktop or laptop browser with WebGL 2 (Chrome, Edge, Firefox, Safari 15+). Propagation runs on the CPU with satellite.js, so no GPU-heavy dependencies are required beyond the renderer.'],
  ['How accurate are the predicted positions?',
   'SGP4 with real TLEs is typically accurate to a few kilometers for LEO objects within days of the element-set epoch. Positions in the demo drift as the bundled elements age — refresh the catalog from the backend for tight accuracy.'],
  ['Can I track a specific satellite or constellation?',
   'The demo covers eight LEO, three MEO, and three GEO reference missions. Add NORAD catalog numbers to frontend/src/data/satellites.json (regenerate with backend/tools/fetch_demo_catalog.py) or query the backend API for the full CelesTrak groups.'],
  ['Does OrbitalPulse offer an API or data licensing?',
   'The FastAPI backend already exposes catalog, positions, and 90-minute orbit-polyline endpoints documented in the repository README. For licensing or hosted data feeds, reach out through the contact form below.'],
]

export default function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" className="relative py-24 px-5">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-[11px] font-mono tracking-[0.3em] text-emerald-400 mb-2">FAQ</div>
          <h2 className="text-3xl md:text-4xl font-black text-emerald-50 tracking-tight">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-sm text-emerald-100/60">
            Quick answers about features, data sources, and technical requirements.
          </p>
        </div>
        <div className="space-y-2.5">
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i
            return (
              <div key={q} className={`glass rounded-xl overflow-hidden transition-colors ${isOpen ? 'border-emerald-400/45' : ''}`}>
                <button onClick={() => setOpen(isOpen ? -1 : i)}
                        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="text-sm font-semibold text-emerald-50">{q}</span>
                  <ChevronDown size={16}
                               className={`shrink-0 text-emerald-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 text-[13px] leading-relaxed text-emerald-100/65">{a}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
