const STEPS = [
  ['Ingest element sets', 'Two-Line Element sets are fetched from public tracking networks and normalized into a fast, queryable orbital catalog keyed by NORAD ID.'],
  ['Propagate with SGP4', 'Each element set is propagated with perturbation-aware SGP4 models, converting orbital elements into inertial position and velocity vectors for any time.'],
  ['Render the 3D scene', 'The frontend projects inertial coordinates into an interactive 3D Earth scene — graticule, landmasses, orbit trails, and satellite markers at up to 60 fps.'],
  ['Stream live telemetry', 'The telemetry HUD samples the propagated state ten times per second, translating vectors into altitude, velocity, and sub-satellite latitude/longitude.'],
  ['Predict ground station passes', 'A station network — real anchor sites or your own — screens the sky against each site\'s minimum-elevation mask, returns rise, closest-approach, and set times with max elevation and azimuth, and renders the live line-of-sight footprint, station beams, and one-orbit coverage growth in the 3D scene.'],
  ['Analyze & design missions', 'The Labs workspace runs the same validated pipeline analytically: orbital elements, maneuvers, transfers, ΔV budgets, plane changes, ground networks, link budgets, attitude/reaction-wheel dynamics, and eclipse umbra/penumbra geometry from a computed sun ephemeris — every number traced to a published reference.'],
]

export default function HowItWorks() {
  return (
    <section id="how" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-[11px] font-mono tracking-[0.3em] text-hi mb-2">HOW IT WORKS</div>
          <h2 className="text-3xl md:text-4xl font-black text-fg tracking-tight">
            From raw element sets to a living 3D sky
          </h2>
          <p className="mt-3 text-sm text-fg/60">
            OrbitalPulse bridges aerospace-grade math and modern web rendering in six stages.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="glass rounded-xl p-5 relative overflow-hidden">
              <span className="absolute -top-3 right-2 text-[72px] font-black text-hi/10 select-none">
                {i + 1}
              </span>
              <div className="w-9 h-9 rounded-lg bg-hi/15 border border-hi/30 mb-4" />
              <h3 className="font-bold text-fg text-sm mb-2">{title}</h3>
              <p className="text-[12px] leading-relaxed text-fg/60">{body}</p>
            </div>
          ))}
        </div>
        <div className="glass rounded-xl p-5 mt-6 max-w-3xl mx-auto text-center">
          <p className="text-[13px] leading-relaxed text-fg/70">
            <span className="font-bold text-fg">Frontend + backend, seamlessly:</span>{' '}
            a lightweight FastAPI service keeps the orbital catalog current and runs the
            analytics that belong server-side — pass scheduling, coverage, conjunction
            screening — while projection, rendering, and telemetry sampling run locally in
            your browser, so the globe stays fluid at 60 fps even while time-warped 300×.
          </p>
        </div>
      </div>
    </section>
  )
}
