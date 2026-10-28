import { Link } from 'react-router-dom'
import { ArrowLeft, Sigma, Rocket, Waypoints, Fuel, GitCompareArrows, RadioTower, CalendarClock, Radar, Globe2, Signal, Axis3d, Disc3, Sun, BatteryCharging, Wind, Hourglass, Orbit, Shield, ClipboardList, Layers, CheckCircle2 } from 'lucide-react'
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
  { to: '/lab/power', icon: BatteryCharging, tag: 'ANALYZE', title: 'Solar Power & Battery',
    note: 'Inverse-square flux x M13 duty cycle: energy margin, battery mass, array sizing' },
  { to: '/lab/drag', icon: Wind, tag: 'ANALYZE', title: 'Atmospheric Drag',
    note: 'US Standard Atmosphere 1976 density, corotating wind, vis-viva decay rate — live on SGP4' },
  { to: '/lab/decay', icon: Hourglass, tag: 'ANALYZE', title: 'Orbit Decay & Lifetime',
    note: 'RK4 on the averaged decay law: lifetime to the reentry band, perigee/apogee trajectory' },
  { to: '/lab/j2', icon: Orbit, tag: 'ANALYZE', title: 'J2 Secular Precession',
    note: 'Earth-oblateness node & apsidal drift with ghost orbits at +30/+90/+365 days' },
  { to: '/lab/sso', icon: SunMedium, tag: 'DESIGN', title: 'Sun-Sync Designer',
    note: 'Altitude ↔ inclination solution with LTAN targeting — the plane keeps pace with the sun' },
  { to: '/lab/conj', icon: Radar, tag: 'ANALYZE', title: 'Conjunction Pair View',
    note: 'Paired-grid miss distance, TCA and rel speed from TLEs — Pc honestly withheld' },
  { to: '/lab/avoid', icon: Shield, tag: 'ANALYZE', title: 'Avoidance Burn Planner',
    note: 'Exact Clohessy-Wiltshire response: lead time, Hill-frame Δv and the cheapest collision-avoidance burn' },
  { to: '/lab/mission', icon: ClipboardList, tag: 'DESIGN', title: 'Mission Builder',
    note: 'Chain coast + burn events on the live orbit with per-step propellant and a Hohmann-validated engine' },
  { to: '/lab/presets', icon: Layers, tag: 'DESIGN', title: 'Preset Missions',
    note: 'GTO→GEO, shell raise, SSO disposal, GEO reposition — flown on real engines with cited specs' },
]

export default function LabsIndexPage() {
  return (
    <div className="fixed inset-0 bg-[#050B17] overflow-hidden overflow-y-auto thin-scroll">
      <OrbitScene />
      <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 bg-[#0A1425]/85 backdrop-blur-md border-b border-hi/15">
        <Link to="/tracker" className="flex items-center gap-2 text-hi hover:text-fg text-[12px] font-mono">
          <ArrowLeft size={14} /> TRACKER
        </Link>
        <div className="w-px h-6 bg-hi/15" />
        <span className="font-bold text-[15px] tracking-tight">
          <span className="text-fg">Orbital</span><span className="text-hi">Pulse</span>
          <span className="ml-2 text-[9px] font-mono tracking-[0.25em] text-hi align-middle">LABS · ANALYZE / DESIGN</span>
        </span>
      </header>

      <main className="relative z-20 max-w-3xl mx-auto px-4 py-8 pointer-events-auto">
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {LABS.map(({ to, icon: Icon, tag, title, note }) => (
            <Link key={to} to={to}
                  className="glass rounded-xl p-4 flex gap-3 items-start hover:bg-hi/[0.06] transition border border-hi/15">
              <Icon size={20} className="text-hi mt-0.5 shrink-0" />
              <span>
                <span className="block text-[9px] font-mono tracking-widest text-cyan-500">{tag}</span>
                <span className="block text-[13px] font-semibold text-fg">{title}</span>
                <span className="block text-[10px] text-mut mt-1 leading-snug">{note}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="glass rounded-xl p-4 border border-ok/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} className="text-ok" />
            <span className="text-[11px] font-semibold text-fg">22/22 milestones delivered</span>
          </div>
          <div className="text-[10px] text-mut leading-snug">
            Every lab from the aerospace program is live: two-body analysis through
            conjunction screening, avoidance planning and preset missions on
            real engines. Each number ships with its equation, its source and
            its fidelity label.
          </div>
        </div>
      </main>
    </div>
  )
}
