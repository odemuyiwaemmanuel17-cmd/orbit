import { Link } from 'react-router-dom'
import { ArrowLeft, Sigma, Rocket, Waypoints, Fuel, GitCompareArrows, RadioTower, CalendarClock, Radar, Globe2, Signal, Axis3d, Disc3, Sun, Construction } from 'lucide-react'
import OrbitScene from '../../components/scene/OrbitScene.jsx'

const LABS = [
  { to: '/lab/elements', icon: Sigma, tag: 'ANALYZE', title: 'Orbital Elements Lab',
    note: 'Six classical elements, orbit generated from Kepler geometry' },
  { to: '/lab/maneuver', icon: Rocket, tag: 'DESIGN', title: 'Maneuver Simulator',
    note: 'Impulsive RSW burns on live spacecraft states — before/after orbits' },
  { to: '/lab/hohmann', icon: Waypoints, tag: 'DESIGN', title: 'Hohmann Transfer Planner',
    note: 'Two-impulse transfers with animated coast and real ΔV accounting' },
  { to: '/lab/dvbudget', icon: Fuel, tag: 'DESIGN', title: 'Mission ΔV Budget',
    note: 'Tsiolkovsky feasibility: events, propellant, margin, GO/NO-GO' },
  { to: '/lab/planec', icon: GitCompareArrows, tag: 'DESIGN', title: 'Plane Change Simulator',
    note: 'ΔV = 2v·sin(Δi/2) node-line burns, altitude ladder, combined-burn savings' },
  { to: '/lab/stations', icon: RadioTower, tag: 'DESIGN', title: 'Ground Station Network',
    note: 'Anchor stations + your own, live elevation/slant range, min-elevation masks' },
  { to: '/lab/passes', icon: CalendarClock, tag: 'ANALYZE', title: 'Pass Prediction',
    note: 'AOS/TCA/LOS over your station masks, elevation curves, SGP4 pipeline' },
  { to: '/lab/los', icon: Radar, tag: 'ANALYZE', title: 'Line of Sight',
    note: 'Live visibility footprint + station beams: LINK / LOS / BLOCKED' },
  { to: '/lab/coverage', icon: Globe2, tag: 'ANALYZE', title: 'Orbit Coverage',
    note: 'One-orbit coverage growth vs masks — analytic model, honest grid' },
  { to: '/lab/link', icon: Signal, tag: 'DESIGN', title: 'Link Budget',
    note: 'EIRP → FSPL → C/N₀ → Eb/N₀ margin with live worst-case slant' },
  { to: '/lab/attitude', icon: Axis3d, tag: 'ANALYZE', title: 'Attitude Frames',
    note: 'LVLH/RWFS vs body: yaw-pitch-roll, nadir pointing, inertial hold' },
  { to: '/lab/wheels', icon: Disc3, tag: 'ANALYZE', title: 'Reaction Wheels',
    note: 'RK4 slew bench: momentum exchange, saturation limits, exact closed form' },
  { to: '/lab/eclipse', icon: Sun, tag: 'ANALYZE', title: 'Eclipse Analysis',
    note: 'Umbra/penumbra cones on the Meeus sun ephemeris — live shadow state + fraction scan' },
]

const NEXT_UP = [
  'Solar Power', 'Drag, Decay & J2',
  'Conjunction & Avoidance', 'Mission Builder',
]

export default function LabsIndexPage() {
  return (
    <div className="fixed inset-0 bg-[#020a06] overflow-hidden overflow-y-auto thin-scroll">
      <OrbitScene />
      <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#04120b]/85 backdrop-blur-md border-b border-emerald-400/15">
        <Link to="/tracker" className="flex items-center gap-2 text-emerald-300 hover:text-emerald-200 text-[12px] font-mono">
          <ArrowLeft size={14} /> TRACKER
        </Link>
        <div className="w-px h-6 bg-emerald-400/15" />
        <span className="font-bold text-[15px] tracking-tight">
          <span className="text-emerald-50">Orbital</span><span className="text-emerald-400">Pulse</span>
          <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-emerald-300 align-middle">LABS · ANALYZE / DESIGN</span>
        </span>
      </header>

      <main className="relative z-20 max-w-3xl mx-auto px-4 py-8 pointer-events-auto">
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {LABS.map(({ to, icon: Icon, tag, title, note }) => (
            <Link key={to} to={to}
                  className="glass rounded-xl p-4 flex gap-3 items-start hover:bg-emerald-400/[0.06] transition border border-emerald-400/15">
              <Icon size={20} className="text-emerald-400 mt-0.5 shrink-0" />
              <span>
                <span className="block text-[9px] font-mono tracking-widest text-cyan-500">{tag}</span>
                <span className="block text-[13px] font-semibold text-emerald-50">{title}</span>
                <span className="block text-[10px] text-emerald-600 mt-1 leading-snug">{note}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="glass rounded-xl p-4 border border-emerald-400/10">
          <div className="flex items-center gap-2 mb-2">
            <Construction size={14} className="text-amber-400" />
            <span className="text-[11px] font-semibold text-emerald-100">On the roadmap</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NEXT_UP.map((n) => (
              <span key={n} className="px-2 py-0.5 rounded-full text-[9px] font-mono border border-emerald-400/15 text-emerald-600">
                {n.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
