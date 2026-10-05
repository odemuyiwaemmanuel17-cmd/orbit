import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import RouteErrorBoundary from './components/common/RouteErrorBoundary.jsx'
import SceneLoader from './components/common/SceneLoader.jsx'

const TrackerPage = lazy(() => import('./pages/Tracker/TrackerPage.jsx'))

/**
 * OrbitalPulse route shell.
 *   /         -> approved landing experience (untouched visuals)
 *   /tracker  -> Mission Control (engineering interface)
 */
export default function App() {
  return (
    <BrowserRouter>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/tracker"
            element={
              <Suspense fallback={<SceneLoader label="INITIALIZING MISSION CONTROL" />}>
                <TrackerPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouteErrorBoundary>
    </BrowserRouter>
  )
}
