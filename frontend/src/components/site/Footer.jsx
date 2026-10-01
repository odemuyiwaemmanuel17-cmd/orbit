import { Twitter, Github, Linkedin } from 'lucide-react'

const EXPLORE = [['Live Tracker', '#tracker'], ['Services', '#services'], ['How It Works', '#how'], ['Gallery', '#gallery']]
const COMPANY = [['About', '#about'], ['FAQ', '#faq'], ['Contact', '#contact'], ['odemuyiwaemmanuel17@gmail.com', 'mailto:odemuyiwaemmanuel17@gmail.com']]

export default function Footer() {
  return (
    <footer className="relative border-t border-emerald-400/10 bg-black/40 backdrop-blur px-5 py-14">
      <div className="max-w-6xl mx-auto grid md:grid-cols-[2fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 26 26" fill="none">
              <circle cx="13" cy="13" r="5.5" stroke="#10b981" strokeWidth="1.6" />
              <ellipse cx="13" cy="13" rx="11.5" ry="5" transform="rotate(-28 13 13)" stroke="#34d399" strokeWidth="1.2" opacity="0.8" />
              <circle cx="21" cy="8" r="1.8" fill="#4ade80" />
            </svg>
            <span className="font-bold text-emerald-50">
              Orbital<span className="text-emerald-400">Pulse</span>
            </span>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-emerald-100/55 max-w-sm">
            An interactive orbital mechanics and satellite tracking platform. Explore live
            positions, propagate orbits, and visualize spacecraft motion around Earth in
            immersive 3D.
          </p>
          <div className="flex gap-2.5 mt-5">
            {[Twitter, Github, Linkedin].map((Icon, i) => (
              <a key={i} href="#top"
                 className="w-8 h-8 rounded-lg border border-emerald-400/20 grid place-items-center text-emerald-300 hover:border-emerald-400/60 transition">
                <Icon size={14} />
              </a>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-emerald-500 mb-4">EXPLORE</div>
          <ul className="space-y-2.5">
            {EXPLORE.map(([l, h]) => (
              <li key={l}><a href={h} className="text-[13px] text-emerald-100/60 hover:text-emerald-300">{l}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-emerald-500 mb-4">COMPANY</div>
          <ul className="space-y-2.5">
            {COMPANY.map(([l, h]) => (
              <li key={l}><a href={h} className="text-[13px] text-emerald-100/60 hover:text-emerald-300">{l}</a></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-emerald-400/10 text-center">
        <p className="text-[12px] text-emerald-100/40">© 2026 OrbitalPulse. All rights reserved.</p>
      </div>
    </footer>
  )
}
