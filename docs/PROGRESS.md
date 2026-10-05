# Mission Control Build Progress

Living log — one entry per milestone delivery.

---

## 2026-10-05 · Milestone 1 (+ M3–M5, M7–M8, M11–M12 closures)

**Goal:** route the approved landing UI into a real engineering application
without touching its visual identity.

**Files created**
- `frontend/src/App.jsx` — router shell (`/`, `/tracker`, catch-all redirect)
- `frontend/src/pages/Tracker/TrackerPage.jsx` — Mission Control layout
- `frontend/src/components/tracker/SimulationControls.jsx` — LIVE / play /
  pause / step ±5 min / reset / 0.25×–100×
- `frontend/src/components/tracker/LayerToggles.jsx` — shared layer checkboxes
- `frontend/src/components/common/SceneLoader.jsx` — orbital loading state
- `frontend/src/components/common/RouteErrorBoundary.jsx` — crash containment
- `frontend/src/lib/analysis.js` — `tleDetails()` (apogee/perigee/argP/MA/epoch)
- `docs/ARCHITECTURE.md`, `docs/ORBITAL_MATH.md`, `docs/ROADMAP.md`, this file
- `vercel.json` — SPA rewrites for `/tracker` deep links

**Files changed (functional only, visuals preserved)**
- `pages/Landing.jsx` — moved from `App.jsx` (content identical) + hash-scroll
- `lib/engine.js` — single simulation clock: `isLive`, `setLive`, `stepBy`,
  `setSimTime`, warp exits live; orbit polylines now −45 min → +1 period
- `scene/OrbitScene.jsx` — `mission` camera mode (fixed close orbit)
- `site/Navbar.jsx`, `site/Hero.jsx` — Launch Tracker CTAs → `/tracker`;
  anchors resolve cross-route
- `site/TrackerSection.jsx` — uses shared `LayerToggles` (markup unchanged)
- `tracker/TelemetryPanel.jsx` — full element set incl. apogee/perigee/TLE epoch

**Verified**
- Baseline before changes: 39/39 backend tests, clean `vite build`
- After changes: production build green (TrackerPage code-split 8.4 kB);
  dev instance: `/` 200, `/tracker` SPA fallback 200, all new modules 200
- Landing composition, hero, colors, typography, animations: untouched

**Unresolved / next**
- Browser pixel verification not possible in this environment (no headless
  browser) — user should eyeball `/tracker` at desktop + 390px
- M6 ground track with antimeridian handling: next milestone
- M2 photoreal texture/cloud/sun pass on the Earth, M9 categories/instancing,
  M10 camera fly-to
