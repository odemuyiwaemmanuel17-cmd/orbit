import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import RouteErrorBoundary from './components/common/RouteErrorBoundary.jsx'
import SceneLoader from './components/common/SceneLoader.jsx'

const TrackerPage = lazy(() => import('./pages/Tracker/TrackerPage.jsx'))
const ElementsLabPage = lazy(() => import('./pages/Lab/ElementsLabPage.jsx'))
const ManeuverLabPage = lazy(() => import('./pages/Lab/ManeuverLabPage.jsx'))
const HohmannLabPage = lazy(() => import('./pages/Lab/HohmannLabPage.jsx'))

/**
 * OrbitalPulse route shell.
 *   /            -> approved landing experience (untouched visuals)
 *   /tracker     -> Mission Control (engineering interface)
 *   /lab/elements -> ANALYZE: Orbital Elements Lab (analytic two-body)
 *   /lab/maneuver -> DESIGN:  Maneuver Lab (impulsive burns on live states)
 *   /lab/hohmann  -> DESIGN:  Hohmann Transfer Planner (analytic two-impulse)
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
          <Route
            path="/lab/maneuver"
            element={
              <Suspense fallback={<SceneLoader label="LOADING MANEUVER LAB" />}>
                <ManeuverLabPage />
              </Suspense>
            }
          />
          <Route
            path="/lab/hohmann"
            element={
              <Suspense fallback={<SceneLoader label="LOADING TRANSFER PLANNER" />}>
                <HohmannLabPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouteErrorBoundary>
    </BrowserRouter>
  )
}
