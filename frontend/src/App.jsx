import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import RouteErrorBoundary from './components/common/RouteErrorBoundary.jsx'
import SceneLoader from './components/common/SceneLoader.jsx'

const TrackerPage = lazy(() => import('./pages/Tracker/TrackerPage.jsx'))
const ElementsLabPage = lazy(() => import('./pages/Lab/ElementsLabPage.jsx'))

/**
 * OrbitalPulse route shell.
 *   /            -> approved landing experience (untouched visuals)
 *   /tracker     -> Mission Control (engineering interface)
 *   /lab/elements -> ANALYZE: Orbital Elements Lab (analytic two-body)
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
          <Route
            path="/lab/elements"
            element={
              <Suspense fallback={<SceneLoader label="LOADING ELEMENTS LAB" />}>
                <ElementsLabPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouteErrorBoundary>
    </BrowserRouter>
  )
}
