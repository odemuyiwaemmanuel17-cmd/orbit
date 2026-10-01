import SatelliteScene from './components/SatelliteScene.jsx'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import TelemetryHUD from './components/TelemetryHUD.jsx'
import Toasts from './components/Toasts.jsx'
import { useTracker } from './hooks/useTracker.js'
import { SatelliteDish } from 'lucide-react'

/**
 * OrbitalPulse — interactive orbital mechanics & satellite tracker.
 * Full-bleed R3F scene with glassmorphic HUD overlays driven by the
 * FastAPI + SGP4 telemetry backend.
 */
export default function App() {
  const tracker = useTracker()

  if (tracker.loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-space-950">
        <SatelliteDish size={34} className="text-pulse live-dot" />
        <p className="font-mono text-xs tracking-[0.3em] text-cyan-500/80">
          ESTABLISHING TELEMETRY LINK…
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full select-none">
      <SatelliteScene
        satellites={tracker.satellites}
        selectedId={tracker.selectedId}
        onSelect={tracker.setSelectedId}
        orbitData={tracker.orbitData}
        showOrbit={tracker.showOrbit}
        focusMode={tracker.focusMode}
        simTime={tracker.simTime}
      />

      <TopBar
        simTime={tracker.simTime}
        source={tracker.source}
        satelliteCount={tracker.satellites.length}
        fps={tracker.fps}
        warp={tracker.warp}
        setWarp={tracker.setWarp}
      />

      <Sidebar
        satellites={tracker.satellites}
        selectedId={tracker.selectedId}
        onSelect={tracker.setSelectedId}
      />

      <TelemetryHUD
        selected={tracker.selected}
        state={tracker.selected?.state}
        orbitData={tracker.orbitData}
        showOrbit={tracker.showOrbit}
        setShowOrbit={tracker.setShowOrbit}
        focusMode={tracker.focusMode}
        setFocusMode={tracker.setFocusMode}
      />

      <Toasts toasts={tracker.toasts} />

      {/* Corner chrome */}
      <div className="absolute bottom-3 left-3 z-10 font-mono text-[10px] text-cyan-800 tracking-widest">
        ORBITALPULSE v1.0 · SGP4 · {tracker.source.toUpperCase()}
      </div>
      <div className="pointer-events-none absolute inset-0 z-40 rounded-none"
           style={{ boxShadow: 'inset 0 0 140px rgba(3,7,18,0.9)' }} />
    </div>
  )
}
