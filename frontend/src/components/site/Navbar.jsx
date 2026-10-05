import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

const LINKS = [
  ['Live Tracker', '#tracker'],
  ['Services', '#services'],
  ['How It Works', '#how'],
  ['Gallery', '#gallery'],
  ['About', '#about'],
  ['FAQ', '#faq'],
]

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <circle cx="13" cy="13" r="5.5" stroke="#10b981" strokeWidth="1.6" />
        <ellipse cx="13" cy="13" rx="11.5" ry="5" transform="rotate(-28 13 13)" stroke="#34d399" strokeWidth="1.2" opacity="0.8" />
        <circle cx="21" cy="8" r="1.8" fill="#4ade80" />
      </svg>
      <span className="font-bold text-[17px] tracking-tight">
        <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
      </span>
    </Link>
  )
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  // On the landing page anchors scroll in place; from /tracker they must
  // route back to the landing hash (handled by Landing's scroll effect).
  const anchor = (h) => (pathname === '/' ? h : h === '#top' ? '/' : `/${h}`)
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="bg-[#04120b]/80 backdrop-blur-md border-b border-emerald-400/10">
        <nav className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <Logo />
          <div className="hidden lg:flex items-center gap-6">
            {LINKS.map(([label, href]) => (
              <a key={href} href={anchor(href)}
                 className="text-[13px] text-emerald-100/70 hover:text-emerald-300 transition">
                {label}
              </a>
            ))}
          </div>
          <div className="hidden lg:flex items-center gap-2.5">
            <a href={anchor('#contact')}
               className="px-4 py-1.5 rounded-lg text-[13px] font-medium border border-emerald-400/25 text-emerald-100 hover:border-emerald-400/60 transition">
              Contact
            </a>
            <Link to="/tracker"
               className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.35)] transition">
              Launch Tracker
            </Link>
          </div>
          <button className="lg:hidden text-emerald-300" onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>
        {open && (
          <div className="lg:hidden px-5 pb-4 flex flex-col gap-2 bg-[#04120b]/95">
            {LINKS.map(([label, href]) => (
              <a key={href} href={anchor(href)} onClick={() => setOpen(false)}
                 className="text-sm text-emerald-100/80 py-1">{label}</a>
            ))}
            <Link to="/tracker" onClick={() => setOpen(false)}
               className="mt-1 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-emerald-950 text-center">
              Launch Tracker
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
