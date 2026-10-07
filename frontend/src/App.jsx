import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import RouteErrorBoundary from './components/common/RouteErrorBoundary.jsx'
import SceneLoader from './components/common/SceneLoader.jsx'

const TrackerPage = lazy(() => import('./pages/Tracker/TrackerPage.jsx'))
const ElementsLabPage = lazy(() => import('./pages/Lab/ElementsLabPage.jsx'))
const ManeuverLabPage = lazy(() => import('./pages/Lab/ManeuverLabPage.jsx'))
const HohmannLabPage = lazy(() => import('./pages/Lab/HohmannLabPage.jsx'))
const DVBudgetLabPage = lazy(() => import('./pages/Lab/DVBudgetLabPage.jsx'))
const PlaneChangeLabPage = lazy(() => import('./pages/Lab/PlaneChangeLabPage.jsx'))
const GroundStationLabPage = lazy(() => import('./pages/Lab/GroundStationLabPage.jsx'))
const PassPredictionLabPage = lazy(() => import('./pages/Lab/PassPredictionLabPage.jsx'))
const LosLabPage = lazy(() => import('./pages/Lab/LosLabPage.jsx'))
const LabsIndexPage = lazy(() => import('./pages/Lab/LabsIndexPage.jsx'))

/**
 * OrbitalPulse route shell.
 *   /            -> approved landing experience (untouched visuals)
 *   /tracker     -> Mission Control (engineering interface)
 *   /lab/elements -> ANALYZE: Orbital Elements Lab (analytic two-body)
 *   /lab/maneuver -> DESIGN:  Maneuver Lab (impulsive burns on live states)
 *   /lab/hohmann  -> DESIGN:  Hohmann Transfer Planner (analytic two-impulse)
 *   /lab/dvbudget -> DESIGN:  Mission ΔV Budget (Tsiolkovsky feasibility)
 *   /lab/planec   -> DESIGN:  Plane Change Simulator (impulsive node-line burns)
 *   /lab/stations -> DESIGN:  Ground Network (stations, look angles, masks)
 *   /lab/passes   -> ANALYZE: Pass Prediction over the station network
 *   /lab/los      -> ANALYZE: Line-of-Sight footprints + live station beams
 *   /lab          -> ANALYZE/DESIGN index (all labs)
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
          <Route path="/lab" element={
            <Suspense fallback={<SceneLoader label="LOADING LABS" />}><LabsIndexPage /></Suspense>
          } />
          <Route
            path="/lab/dvbudget"
            element={
              <Suspense fallback={<SceneLoader label="LOADING DV BUDGET" />}>
                <DVBudgetLabPage />
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
          <Route
            path="/lab/planec"
            element={
              <Suspense fallback={<SceneLoader label="LOADING PLANE CHANGE" />}>
                <PlaneChangeLabPage />
              </Suspense>
            }
          />
          <Route
            path="/lab/stations"
            element={
              <Suspense fallback={<SceneLoader label="LOADING GROUND NETWORK" />}>
                <GroundStationLabPage />
              </Suspense>
            }
          />
          <Route
            path="/lab/passes"
            element={
              <Suspense fallback={<SceneLoader label="LOADING PASS SCHEDULE" />}>
                <PassPredictionLabPage />
              </Suspense>
            }
          />
          <Route
            path="/lab/los"
            element={
              <Suspense fallback={<SceneLoader label="LOADING LINE OF SIGHT" />}>
                <LosLabPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouteErrorBoundary>
    </BrowserRouter>
  )
}
