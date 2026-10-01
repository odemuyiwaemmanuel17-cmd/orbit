const STACK = [
  'SGP4 / SDP4 Propagation', 'WebGL · React Three Fiber', 'React 18', 'FastAPI Backend',
  'TLE Ingest Pipelines', 'CelesTrak Data', 'Tailwind CSS', 'satellite.js',
]

export default function About() {
  return (
    <section id="about" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12">
        <div>
          <div className="text-[11px] font-mono tracking-[0.3em] text-emerald-400 mb-3">ABOUT</div>
          <h2 className="text-3xl md:text-4xl font-black text-emerald-50 tracking-tight leading-tight">
            Our mission: make orbital mechanics feel tangible
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-emerald-100/65">
            More than ten thousand objects circle the Earth right now, and most of them are
            invisible to the people who depend on them. OrbitalPulse exists to change that.
            We believe orbital mechanics shouldn&apos;t be locked behind proprietary
            mission-control software — it should be as approachable as a weather app and as
            beautiful as the sky itself.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-emerald-100/65">
            We built OrbitalPulse for satellite enthusiasts, students, researchers, and
            aerospace professionals alike: one platform where you can watch the ISS cross your
            hemisphere, study a Starlink shell&apos;s geometry, or verify a ground station pass
            window — all in real time, all in the browser.
          </p>
          <div className="mt-7">
            <div className="text-[10px] font-mono tracking-[0.25em] text-emerald-500 mb-3">TECHNOLOGY STACK</div>
            <div className="flex flex-wrap gap-2">
              {STACK.map((t) => (
                <span key={t} className="px-3 py-1 rounded-full text-[11px] border border-emerald-400/25 bg-emerald-400/5 text-emerald-200">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono tracking-[0.25em] text-emerald-500 mb-4">
            THE TEAM BEHIND THE PROJECT
          </div>
          <div className="glass rounded-xl p-5 flex gap-4">
            <div className="w-14 h-14 rounded-full bg-emerald-400/10 border border-emerald-400/30 grid place-items-center shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" fill="#34d399" opacity="0.85" />
                <path d="M4 20c1.5-4 5-5.5 8-5.5S18.5 16 20 20" fill="#34d399" opacity="0.85" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-emerald-50">Odemuyiwa Emmanuel</div>
              <div className="text-[11px] text-emerald-400 font-mono mb-1.5">Founder</div>
              <p className="text-[13px] text-emerald-100/65 leading-relaxed">
                Building OrbitalPulse to make orbital mechanics accessible and engaging for
                everyone.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
