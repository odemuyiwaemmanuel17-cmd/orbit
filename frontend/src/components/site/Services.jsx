import { Satellite, Orbit, Globe2, RadioTower, BellRing, Code2 } from 'lucide-react'

const CARDS = [
  [Satellite, 'Real-Time Satellite Tracking', 'Follow 14 curated spacecraft across LEO, MEO, and GEO with continuously propagated positions, ground tracks, and instant selection from a searchable catalog.'],
  [Orbit, 'Orbital Propagation', 'SGP4-derived propagation computes altitude, velocity, latitude, and longitude on the fly, with orbital elements — period, inclination, RAAN, eccentricity — always visible.'],
  [Globe2, 'Immersive 3D Visualization', 'A hardware-accelerated 3D Earth with graticule, landmass rendering, glowing orbit trails and a scroll-driven camera you can rotate, tilt, and zoom freely.'],
  [RadioTower, 'Ground Station Awareness', 'Understand which regimes host which missions — from crewed stations to navigation wheels and weather sentinels parked over the equator.'],
  [BellRing, 'Pass Predictions & Alerts', 'Time-warp the clock up to 300× to watch constellation geometry evolve and anticipate ground-track repeats ahead of time.'],
  [Code2, 'Developer API & Data Licensing', 'The FastAPI backend exposes catalog, positions, and 90-minute orbit-polyline endpoints so you can embed orbital intelligence in your own products.'],
]

export default function Services() {
  return (
    <section id="services" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-[11px] font-mono tracking-[0.3em] text-hi mb-2">SERVICES</div>
          <h2 className="text-3xl md:text-4xl font-black text-fg tracking-tight">
            Everything you need to understand<br className="hidden md:block" /> what&apos;s overhead
          </h2>
          <p className="mt-3 text-sm text-fg/60 max-w-2xl mx-auto">
            From casual stargazing to professional ground segment planning, OrbitalPulse gives
            you the tools to see, predict, and analyze satellite motion.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map(([Icon, title, body]) => (
            <div key={title} className="glass rounded-xl p-5 hover:border-hi/40 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-hi/15 border border-hi/30 grid place-items-center mb-4">
                <Icon size={16} className="text-hi" />
              </div>
              <h3 className="font-bold text-fg text-sm mb-2">{title}</h3>
              <p className="text-[12px] leading-relaxed text-fg/60">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
