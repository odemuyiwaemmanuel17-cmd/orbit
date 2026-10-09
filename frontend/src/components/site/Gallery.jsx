/** Stylized SVG mock screens (image generation was unavailable in this
 *  environment, so the gallery renders vector stand-ins in the HUD style). */

function GlobeMock() {
  return (
    <svg viewBox="0 0 400 220" className="w-full h-full">
      <rect width="400" height="220" fill="#04140c" />
      {[...Array(26)].map((_, i) => (
        <circle key={i} cx={(i * 71) % 400} cy={(i * 43) % 220} r="0.8" fill="#274A77" />
      ))}
      <g transform="translate(200 110)">
        <circle r="62" fill="#0A1830" stroke="#38D9FF" strokeWidth="0.8" opacity="0.9" />
        <ellipse rx="62" ry="20" fill="none" stroke="#3B82F6" strokeWidth="0.5" opacity="0.5" />
        <ellipse rx="62" ry="40" fill="none" stroke="#3B82F6" strokeWidth="0.5" opacity="0.4" />
        <ellipse rx="20" ry="62" fill="none" stroke="#3B82F6" strokeWidth="0.5" opacity="0.4" />
        <ellipse rx="40" ry="62" fill="none" stroke="#3B82F6" strokeWidth="0.5" opacity="0.35" />
        <ellipse rx="105" ry="38" fill="none" stroke="#3B82F6" strokeWidth="1" opacity="0.8" transform="rotate(-24)" />
        <ellipse rx="88" ry="52" fill="none" stroke="#2dd4bf" strokeWidth="0.8" opacity="0.6" transform="rotate(38)" />
        <ellipse rx="120" ry="30" fill="none" stroke="#818CF8" strokeWidth="0.8" opacity="0.5" transform="rotate(8)" />
        <circle cx="96" cy="-34" r="3" fill="#3B82F6" />
        <circle cx="-70" cy="40" r="2.4" fill="#2dd4bf" />
      </g>
      <rect x="12" y="12" width="88" height="10" rx="5" fill="#3B82F6" opacity="0.75" />
      <text x="18" y="20" fontSize="7" fill="#0A1830" fontFamily="monospace">MISSION CONTROL</text>
    </svg>
  )
}

function HudMock() {
  return (
    <svg viewBox="0 0 400 220" className="w-full h-full">
      <rect width="400" height="220" fill="#04140c" />
      <text x="14" y="22" fontSize="8" fill="#38D9FF" fontFamily="monospace">SATELLITE TELEMETRY HUD · STATUS: NOMINAL</text>
      {[[20, 40], [120, 40], [220, 40]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <rect width="90" height="70" rx="6" fill="#0A1830" stroke="#1E3A5F" />
          <text x="8" y="14" fontSize="6" fill="#3B82F6" fontFamily="monospace">ALTITUDE</text>
          <path d={`M8 55 Q25 ${30 + i * 6} 45 42 T82 34`} fill="none" stroke="#3B82F6" strokeWidth="1.4" />
        </g>
      ))}
      {[[20, 120], [120, 120], [220, 120], [320, 40]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <rect width="70" height="80" rx="6" fill="#0A1830" stroke="#1E3A5F" />
          <circle cx="35" cy="38" r="20" fill="none" stroke="#0f3d22" strokeWidth="6" />
          <path d="M35 18 A20 20 0 0 1 52 46" fill="none" stroke="#38D9FF" strokeWidth="6" />
          <text x="35" y="70" fontSize="7" fill="#3B82F6" textAnchor="middle" fontFamily="monospace">7.66</text>
        </g>
      ))}
    </svg>
  )
}

function MeshMock() {
  const pts = [...Array(60)].map((_, i) => [
    200 + Math.cos(i * 2.4) * (60 + (i * 17) % 90),
    110 + Math.sin(i * 2.4) * (45 + (i * 13) % 60),
  ])
  return (
    <svg viewBox="0 0 400 220" className="w-full h-full">
      <rect width="400" height="220" fill="#04140c" />
      <circle cx="200" cy="110" r="52" fill="#0A1830" stroke="#3B82F6" strokeWidth="0.7" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          {i > 0 && <line x1={pts[i - 1][0]} y1={pts[i - 1][1]} x2={x} y2={y} stroke="#38D9FF44" strokeWidth="0.6" />}
          <circle cx={x} cy={y} r="1.8" fill="#3B82F6" />
        </g>
      ))}
      <text x="14" y="20" fontSize="7" fill="#38D9FF" fontFamily="monospace">CONSTELLATION MESH · LIVE FEED</text>
    </svg>
  )
}

function PassMock() {
  return (
    <svg viewBox="0 0 400 220" className="w-full h-full">
      <rect width="400" height="220" fill="#04140c" />
      <g transform="translate(110 115)">
        {[20, 40, 60, 80].map((r) => (
          <circle key={r} r={r} fill="none" stroke="#1E3A5F" strokeWidth="0.7" />
        ))}
        <line x1="-80" y1="0" x2="80" y2="0" stroke="#1E3A5F" />
        <line x1="0" y1="-80" x2="0" y2="80" stroke="#1E3A5F" />
        <path d="M-60 30 Q-10 -70 55 -20" fill="none" stroke="#3B82F6" strokeWidth="1.6" />
        <circle cx="55" cy="-20" r="3" fill="#3B82F6" />
        <text x="0" y="95" fontSize="6" fill="#3B82F6" textAnchor="middle" fontFamily="monospace">AZ / EL POLAR</text>
      </g>
      <g transform="translate(240 40)">
        <text fontSize="7" fill="#38D9FF" fontFamily="monospace">UPCOMING PASSES</text>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(0 ${16 + i * 26})`}>
            <rect width="140" height="20" rx="4" fill="#0A1830" stroke="#1E3A5F" />
            <rect x="6" y="6" width={60 + ((i * 23) % 50)} height="4" rx="2" fill="#38D9FF" opacity="0.8" />
            <rect x="6" y="13" width="40" height="3" rx="1.5" fill="#1E3A5F" />
          </g>
        ))}
      </g>
    </svg>
  )
}

const CARDS = [
  [GlobeMock, '3D Earth & Orbit View', 'Rotate, zoom, and explore live orbital paths rendered around a graticule Earth.'],
  [HudMock, 'Telemetry HUD', 'Altitude, velocity, ground track, and orbital elements at a glance for any tracked object.'],
  [MeshMock, 'Constellation Mesh', 'Visualize entire constellations and their coverage geometry from a high-orbit perspective.'],
  [PassMock, 'Pass Predictions', 'Upcoming ground station passes with elevation, azimuth, and signal windows.'],
]

export default function Gallery() {
  return (
    <section id="gallery" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-[11px] font-mono tracking-[0.3em] text-hi mb-2">GALLERY</div>
          <h2 className="text-3xl md:text-4xl font-black text-fg tracking-tight">
            See OrbitalPulse in action
          </h2>
          <p className="mt-3 text-sm text-fg/60 max-w-xl mx-auto">
            Screens from the 3D Earth visualization, the telemetry HUD, and the
            pass-prediction workspace.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {CARDS.map(([Mock, title, body]) => (
            <div key={title} className="glass rounded-xl overflow-hidden">
              <div className="aspect-[16/9] border-b border-hi/10">
                <Mock />
              </div>
              <div className="p-4">
                <h3 className="font-bold text-fg text-sm mb-1">{title}</h3>
                <p className="text-[12px] text-fg/60">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
