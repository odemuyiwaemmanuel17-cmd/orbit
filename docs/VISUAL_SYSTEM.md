# OrbitalPulse Visual System (cinematic revamp — phases A–E)

## Design tokens (tailwind.config.js `theme.extend.colors`)

| Token | Value | Role |
|---|---|---|
| bg / bg-alt | #050B17 / #0A1425 | deep-space backgrounds |
| panel | #0E1B2E | mission panel surfaces (.glass base) |
| pri | #3B82F6 | primary blue emphasis |
| hi | #38D9FF | cyan highlights / data accents |
| fg | #F2F7FF | main text |
| mut | #91A6C2 | secondary text |
| ok | #2DD4BF | SUCCESS states only (green reserved) |
| cau | #F5B942 | caution |
| crit | #FF647C | critical alerts |

Old `emerald-*` classes were remapped mechanically (735 tokens, 32 files);
raw green hexes were swept (script check: zero saturated-green hexes remain in
src/). Orbit regime palette: LEO #38D9FF, MEO #3B82F6, GEO #818CF8 —
blue-family, still perceptually distinct.

## Earth renderer (phases C+D)

- Textures vendored under `frontend/public/textures` — NASA Blue Marble day,
  Earth-at-Night city lights, ocean specular mask, cloud layer (see
  ATTRIBUTION.md). Same-origin, no CDN dependency (old dot mode fetched
  unpkg at runtime). sRGB color space set on color maps; mask kept linear.
- ORIENTATION CONTRACT: the scene frame is Earth-fixed exactly like
  geodeticToScene; the sphere NEVER self-rotates independently of the
  coordinate math. three SphereGeometry maps u to scene lon as
  λ = 180 − 360u (EMPIRICAL), mirrored vs equirectangular textures; the
  pinned fix is `repeat.x = -1, offset.x = 1`, enforced by
  `tests/earthTexture.test.js` (also pins north-up and the flip identity —
  a three.js upgrade that changes UV conventions fails the suite).
- Terminator = dot(N, sunDir) where sunDir comes from the SAME validated
  sunDirection/sun.js ephemeris as the eclipse lab, re-evaluated from
  engine.simMs every frame: day/night lines track the simulation epoch.
- Ocean-only specular glint (half-vector, masked by water texture),
  independent cloud shell lit by the same sun, Fresnel rim atmosphere in
  deep blue with the existing geomagnetic-storm amber tint preserved.
- Graceful degradation: navy base sphere + graticule until textures resolve.

## Lighting & spacecraft (phase E)

- directionalLight positioned from the same sun ephemeris each frame +
  low blue ambient fill, both inside the globe group (Earth-fixed frame).
- Hybrid spacecraft: THREE.LOD (drei Detailed) switches full 3-axis bus
  model -> dot -> small dot at 1.6/4.5 scene units; selected satellite
  always model + halo ring with smooth scale transition. Models are GENERIC
  category vehicles (EO imager vs dish craft) and orientation is
  ILLUSTRATIVE nadir-pointing — never claimed as real attitude or as a
  specific spacecraft replica. Thousands-strong constellations remain the
  existing single-draw-call InstancedMesh path.
- Orbit paths: unselected 0.55 px @ 13% opacity (no bright rings obscuring
  Earth), selected/risk 1.5 px @ ~0.9. Ground track keeps the honest
  split: solid past (pri blue), dashed future (cyan).

## Performance hooks

- Canvas dpr capped [1, 1.75], powerPreference high-performance.
- Per-frame shader work is 2 uniform copies; texture upload happens once.
- Single 2048-day/night tier (~1.6 MB total) chosen because it already
  satisfies mobile payloads; cloud tier is 1024.

## Remaining phases (F–J)

F tracker panel/HUD redesign · G lab visual polish · H cinematic homepage ·
I camera modes + responsive passes · J side-by-side visual QC vs reference,
full regression + deployment prep.
