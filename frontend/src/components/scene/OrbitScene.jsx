import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars, Line, Detailed } from '@react-three/drei'
import { engine } from '../../lib/engine.js'
import { loadEarthTextures, makeEarthMaterials, applyEarthTextures } from '../../scene/earthMaterial.js'
import { footprintOf } from '../../lib/analysis.js'
import { geodeticToScene, sunDirection, REGIME_COLORS } from '../../lib/coords.js'
import ConstellationField from './ConstellationField.jsx'
import LabOrbit from './LabOrbit.jsx'
import { selectCraftModel, useGlbCraft, trueScaleFactor } from './SpacecraftModels.jsx'
import { PRESETS, loadPreset } from '../../lib/quality.js'

const GREEN = '#38D9FF'
const CRIMSON = '#FF647C'
const AMBER = '#F5B942'
const TMP = new THREE.Vector3()

/* ------------------------------------------------------------------ Earth */

/**
 * Photoreal Earth (phase C/D). Textures are vendored same-origin under
 * public/textures (NASA-derived, see ATTRIBUTION.md). Orientation contract:
 * the scene frame is Earth-fixed exactly like geodeticToScene, so the sphere
 * NEVER self-rotates; alignment comes from the pinned UV flip in
 * tests/earthTexture.test.js (s = 1 - u). Sunlight/terminator track
 * engine.simMs through the validated sunDirection ephemeris — day/night
 * lines land where the simulation epoch says they must.
 */
function Earth({ q }) {
  const [tex, setTex] = useState(null)
  const earthRef = useRef()
  const scratch = useMemo(() => ({
    sun: new THREE.Vector3(), cam: new THREE.Vector3(), q: new THREE.Quaternion(),
  }), [])
  useEffect(() => {
    let alive = true
    loadEarthTextures().then((t) => alive && setTex(t))
    return () => { alive = false }
  }, [])

  const mats = useMemo(() => makeEarthMaterials(q.exposure), [q.exposure])
  const { uniforms, earthMat, cloudMat, atmoMat } = mats
  useEffect(() => { applyEarthTextures(mats, tex) }, [mats, tex])

  // Fresnel atmosphere lives in makeEarthMaterials (shared module).
  useFrame(({ camera }, dt) => {
    const target = engine.weather?.storm
      ? Math.min(1, Math.max(0, (engine.weather.kp_index - 4) / 4))
      : 0
    atmoMat.uniforms.uStorm.value += (target - atmoMat.uniforms.uStorm.value) * Math.min(1, dt * 2)
    if (!earthRef.current) return
    // Sun direction for the CURRENT simulation epoch, expressed in the
    // globe group's local frame (group rotation is user viewpoint only —
    // Earth orientation itself stays locked to the coordinate math).
    sunDirection(new Date(engine.simMs), scratch.sun)
    earthRef.current.getWorldQuaternion(scratch.q).invert()
    uniforms.uSun.value.copy(scratch.sun).applyQuaternion(scratch.q).normalize()
    uniforms.uCam.value.copy(camera.position).applyQuaternion(scratch.q)
  })

  return (
    <group>
      <group ref={earthRef}>
        {tex ? (
          <mesh material={earthMat}>
            <sphereGeometry args={[0.998, q.earthSeg, q.earthSeg]} />
          </mesh>
        ) : (
          // graceful degradation until (or if) textures resolve
          <mesh>
            <sphereGeometry args={[0.998, 64, 64]} />
            <meshBasicMaterial color="#0A1830" transparent opacity={0.95} />
          </mesh>
        )}
        {tex && q.clouds && (
          <mesh material={cloudMat}>
            <sphereGeometry args={[1.006, Math.round(q.earthSeg * 0.75), Math.round(q.earthSeg * 0.75)]} />
          </mesh>
        )}
      </group>
      <mesh material={atmoMat}>
        <sphereGeometry args={[1.05, 48, 48]} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------- Mission layers */

/** Line-of-sight cone + ground footprint circle for the selected satellite. */
function FootprintCone({ snapshot }) {
  const groupRef = useRef()
  const meshRef = useRef()
  const sel = snapshot.find((s) => s.id === engine.selectedId)
  const altBucket = sel ? Math.round(sel.alt / 10) : -1

  const coneGeo = useMemo(() => {
    if (!sel || altBucket < 0) return null
    const satR = geodeticToScene(sel.lat, sel.lon, sel.alt, new THREE.Vector3()).length()
    const theta = Math.acos(1 / satR)          // scene Earth radius = 1
    const h = satR - Math.cos(theta)           // apex (sat) -> tangent circle plane
    const g = new THREE.ConeGeometry(Math.sin(theta), h, 48, 1, true)
    g.rotateX(Math.PI / 2)                     // axis along z, apex +z h/2
    g.translate(0, 0, -h / 2)                  // apex at origin, base toward -z
    return g
  }, [altBucket, sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }) => {
    if (!groupRef.current || !sel) return
    const p = geodeticToScene(sel.lat, sel.lon, sel.alt, TMP)
    groupRef.current.position.copy(p)
    groupRef.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1), p.clone().normalize())
    if (meshRef.current) {
      meshRef.current.material.opacity = 0.10 + 0.03 * Math.sin(clock.elapsedTime * 2.2)
    }
  })

  if (!sel || !coneGeo) return null
  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={coneGeo}>
        <meshBasicMaterial color={GREEN} transparent opacity={0.11}
                           side={THREE.DoubleSide} depthWrite={false}
                           blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Pulsing crimson markers at flagged close-approach midpoints. */
function AlertMarkers({ snapshot }) {
  const risks = (engine.conjunctions?.events ?? []).filter((e) => e.risk)
  const refs = useRef([])
  useFrame(({ clock }) => {
    const s = 1 + 0.35 * Math.sin(clock.elapsedTime * 5)
    refs.current.forEach((m) => m && m.scale.setScalar(s))
  })
  if (!risks.length) return null
  return (
    <group>
      {risks.map((e, i) => {
        const a = snapshot.find((s) => s.id === e.a)
        const b = snapshot.find((s) => s.id === e.b)
        if (!a || !b) return null
        const pa = geodeticToScene(a.lat, a.lon, a.alt, new THREE.Vector3())
        const pb = geodeticToScene(b.lat, b.lon, b.alt, new THREE.Vector3())
        return (
          <mesh key={i} ref={(m) => { refs.current[i] = m }}
                position={pa.add(pb).multiplyScalar(0.5)}>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshBasicMaterial color={CRIMSON} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Retrograde amber vectors on LEO sats — storm-driven orbital decay hint. */
function DragVectors({ snapshot }) {
  const boost = Math.min(1, Math.max(0.25, (engine.weather?.density_multiplier ?? 1) / 3))
  const items = snapshot.filter((s) => s.meta.regime === 'LEO' && s.velScene)
  return (
    <group>
      {items.map((s) => {
        const p = geodeticToScene(s.lat, s.lon, s.alt, new THREE.Vector3())
        const tip = p.clone().addScaledVector(s.velScene, -0.09 * boost)
        return (
          <Line key={s.id} points={[p.toArray(), tip.toArray()]}
                color={AMBER} lineWidth={1.2} transparent
                opacity={0.35 + 0.5 * boost} toneMapped={false} />
        )
      })}
    </group>
  )
}

/** Propagated sub-satellite ground track: solid past, dashed future. */
function GroundTrack() {
  const segs = engine.groundTrackSegments(engine.selectedId)
  return (
    <group>
      {segs.past.map((pts, i) => (
        <Line key={`p${i}`} points={pts} color="#3B82F6" lineWidth={1.2}
              transparent opacity={0.5} toneMapped={false} />
      ))}
      {segs.future.map((pts, i) => (
        <Line key={`f${i}`} points={pts} color="#38D9FF" lineWidth={1.4} dashed
              dashSize={0.035} gapSize={0.02} transparent opacity={0.85}
              toneMapped={false} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------- Orbits & markers */

function OrbitRings({ snapshot, glowPass }) {
  const selected = engine.selectedId
  const riskIds = engine.layers.alerts
    ? new Set((engine.conjunctions?.events ?? []).filter((e) => e.risk).flatMap((e) => [e.a, e.b]))
    : new Set()
  return (
    <group>
      {snapshot.map((s) => {
        const pts = engine.orbitPointsCached(s.id)
        if (pts.length < 4) return null
        const isSel = s.id === selected
        const isRisk = riskIds.has(s.id)
        const color = isRisk ? CRIMSON : (REGIME_COLORS[s.meta.regime] ?? GREEN)
        if (!isSel && !isRisk) {
          return (
            <Line key={s.id} points={pts} color={color} lineWidth={0.45}
                  transparent opacity={0.07} toneMapped={false} />
          )
        }
        // Sample window is -45 min .. +1 period: split at NOW for an
        // honest past(faint)/future(bright) distinction on real samples.
        const spanMin = s.meta.period_min + 45
        const cut = Math.max(2, Math.min(pts.length - 2,
          Math.round((45 / spanMin) * (pts.length - 1))))
        return (
          <group key={s.id}>
            {glowPass && (
              <Line points={pts.slice(cut)} color={color} lineWidth={4}
                    transparent opacity={0.12} toneMapped={false} />
            )}
            <Line points={pts.slice(0, cut + 1)} color={color} lineWidth={1.1}
                  transparent opacity={0.35} toneMapped={false} />
            <Line points={pts.slice(cut)} color={color} lineWidth={1.5}
                  transparent opacity={0.95} toneMapped={false} />
          </group>
        )
      })}
    </group>
  )
}

/* ------------------------------------------------------- Lighting rig */

const SUN_TMP = new THREE.Vector3()
const NADIR0 = new THREE.Vector3(0, 0, -1)

/** Sun-synced key light: direction comes from the SAME validated ephemeris
 *  as the Earth terminator, in the globe group's local (Earth-fixed) frame. */
function SunLight() {
  const ref = useRef()
  useFrame(() => {
    sunDirection(new Date(engine.simMs), SUN_TMP)
    ref.current.position.copy(SUN_TMP).multiplyScalar(14)
  })
  return (
    <>
      <directionalLight ref={ref} intensity={2.3} color="#fdf1dd" />
      <ambientLight intensity={0.3} color="#8fb3ff" />
    </>
  )
}

/* --------------------------------------------------- Spacecraft markers */

/**
 * Distance-aware hybrid: full representative spacecraft model (per-slot:
 * ISS truss station, Hubble-class telescope, GEO comsat, EO imager, nav
 * craft — see SpacecraftModels.jsx for licensing/illustrative notes, plus
 * an optional licensed-GLB drop-in) when near or selected; dots when far
 * (drei Detailed = one THREE LOD, zero React churn on level switches).
 * Selection grows with a smooth scale transition. Orientation is
 * ILLUSTRATIVE nadir-pointing — no real attitude data is claimed.
 */
/** V3 true-scale mode: positions are always true-scale; the toggle only
 *  swaps model SIZE from the ~10x visibility exaggeration to real physical
 *  size (trueScaleFactor lives in SpacecraftModels.jsx, unit-tested). */
const TS_TMP = new THREE.Vector3()

function SatMarker({ s, sel }) {
  const inner = useRef()
  const pos = geodeticToScene(s.lat, s.lon, s.alt, new THREE.Vector3())
  const quat = useMemo(() => {
    const q = new THREE.Quaternion()
    const len = pos.length()
    if (len > 1e-6) q.setFromUnitVectors(NADIR0, pos.clone().multiplyScalar(-1 / len))
    return q
  }, [pos.x, pos.y, pos.z])
  const glb = useGlbCraft(s.meta.modelGlb)
  const Model = selectCraftModel(s.meta)
  useFrame((_, dt) => {
    if (!inner.current) return
    const k = (engine.trueScale ? trueScaleFactor(s.meta) : 1) * (sel ? 1.35 : 1)
    inner.current.scale.lerp(TS_TMP.setScalar(k), Math.min(1, dt * 8))
  })
  const craft = glb ? <primitive object={glb} /> : <Model />
  const dot = (size, opacity) => (
    <mesh>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={REGIME_COLORS[s.meta.regime] ?? GREEN}
                         transparent opacity={opacity} toneMapped={false} />
    </mesh>
  )
  return (
    <group position={pos.toArray()} quaternion={quat}>
      <group ref={inner}>
        {sel ? (
          <>
            {craft}
            <mesh>
              <ringGeometry args={[0.052, 0.058, 32]} />
              <meshBasicMaterial color="#38D9FF" transparent opacity={0.9}
                                 side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.005, 8, 8]} />
              <meshBasicMaterial color="#F2F7FF" toneMapped={false} />
            </mesh>
          </>
        ) : (
          <Detailed distances={[1.6, 4.5]}>
            {craft}
            {dot(0.013, 0.95)}
            {dot(0.0085, 0.8)}
          </Detailed>
        )}
      </group>
    </group>
  )
}

function Satellites({ snapshot }) {
  const selected = engine.selectedId
  return (
    <group>
      {snapshot.map((s) => (
        <SatMarker key={s.id} s={s} sel={s.id === selected} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------ Camera rig */

const KEYS = [
  { p: 0.00, d: 7.6, lat: 0.35, lon: -0.9 },
  { p: 0.16, d: 2.7, lat: 0.28, lon: 0.7 },
  { p: 0.38, d: 3.5, lat: 0.55, lon: 2.3 },
  { p: 0.58, d: 4.8, lat: -0.55, lon: 4.1 },
  { p: 0.78, d: 3.1, lat: 0.18, lon: 5.4 },
  { p: 1.00, d: 8.2, lat: 0.45, lon: 6.5 },
]
const smooth = (t) => t * t * (3 - 2 * t)
const CAM_TMP = new THREE.Vector3()
const REDUCED_MOTION = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function CameraRig({ mission = false }) {
  const { camera } = useThree()
  const progress = useRef(0)
  useEffect(() => {
    if (mission) return undefined // fixed close orbit; no scroll keyframes
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      progress.current = max > 0 ? window.scrollY / max : 0
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [mission])
  useFrame(({ clock }, dt) => {
    if (mission && engine.follow && engine.followSat && engine._globeObj) {
      // Follow mode: aim at the satellite's TRUE world position —
      // geodeticToScene of the latest propagated state, rotated by the
      // globe group's actual quaternion. The camera lerps; the math does not.
      const p = geodeticToScene(engine.followSat.lat, engine.followSat.lon,
        engine.followSat.alt, CAM_TMP)
        .applyQuaternion(engine._globeObj.quaternion)
        .normalize()
        .multiplyScalar(2.72 * engine.zoom)
      camera.position.lerp(p, Math.min(1, dt * (REDUCED_MOTION ? 12 : 2.2)))
      camera.lookAt(0, 0, 0)
      return
    }
    const p = mission ? 0.16 : progress.current
    let i = 0
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i += 1
    const a = KEYS[i], b = KEYS[i + 1]
    const span = Math.max(1e-6, b.p - a.p)
    const t = smooth(Math.min(1, Math.max(0, (p - a.p) / span)))
    const base = mission ? 2.72 : THREE.MathUtils.lerp(a.d, b.d, t)
    const d = base * engine.zoom
    const lat = mission ? 0.32 : THREE.MathUtils.lerp(a.lat, b.lat, t)
    const lon = (mission ? 0.7 : THREE.MathUtils.lerp(a.lon, b.lon, t))
            + clock.elapsedTime * (mission ? (REDUCED_MOTION ? 0 : 0.03) : 0.015) + engine.yaw * 0.25
    camera.position.set(
      d * Math.cos(lat) * Math.cos(lon),
      d * Math.sin(lat),
      d * Math.cos(lat) * Math.sin(lon),
    )
    camera.lookAt(0, 0, 0)
  })
  return null
}

/** Globe + payload group; rotation follows drag input and focus easing. */
function GlobeGroup({ children }) {
  const ref = useRef()
  useEffect(() => { engine._globeObj = ref.current; return () => { engine._globeObj = null } }, [])
  useFrame((_, dt) => {
    if (engine.focusTarget) {
      const k = Math.min(1, dt * 2.2)
      engine.yaw += (engine.focusTarget.yaw - engine.yaw) * k
      engine.pitch += (engine.focusTarget.pitch - engine.pitch) * k
      if (Math.abs(engine.focusTarget.yaw - engine.yaw) < 0.01
          && Math.abs(engine.focusTarget.pitch - engine.pitch) < 0.01) {
        engine.focusTarget = null
      }
    }
    ref.current.rotation.set(engine.pitch, engine.yaw, 0)
  })
  return <group ref={ref}>{children}</group>
}

/* ------------------------------------------------------------------ Scene */

export default function OrbitScene({ mission = false, lab = null, overlay = null, preset: presetProp = null }) {
  const preset = PRESETS[presetProp ?? loadPreset()] ?? PRESETS.BALANCED
  const [snapshot, setSnapshot] = useState(() => engine.propagateAll())
  useEffect(() => {
    engine.syncFollowViewpoint(snapshot)
    return engine.subscribe((e) => {
      if (e.snapshot) {
        setSnapshot(e.snapshot)
        engine.syncFollowViewpoint(e.snapshot)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Canvas
      camera={{ fov: 45, near: 0.03, far: 60, position: [4, 2, 6] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, preset.dpr]}
      onCreated={({ gl }) => {
        // V3: survive GPU context loss instead of showing a dead canvas.
        const el = gl.domElement
        el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); engine.setGlLost(true) })
        el.addEventListener('webglcontextrestored', () => engine.setGlLost(false))
      }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    >
      <color attach="background" args={['#050B17']} />
      <fog attach="fog" args={['#050B17', 9, 22]} />
      <Stars radius={28} count={2600} factor={2.4} saturation={0} fade speed={0.3} />
      <GlobeGroup>
        <SunLight />
        <Earth q={preset} />
        {lab && <LabOrbit elements={lab.elements} options={lab.options} simMs={lab.simMs} />}
        {overlay}
        {engine.activeConstellationGroups().map((g) => (
          <ConstellationField key={g.key} group={g} />
        ))}
        <OrbitRings snapshot={snapshot} glowPass={preset.glowPass} />
        <Satellites snapshot={snapshot} />
        {engine.layers.footprint && <FootprintCone snapshot={snapshot} />}
        {engine.layers.groundtrack && <GroundTrack />}
        {engine.layers.alerts && <AlertMarkers snapshot={snapshot} />}
        {engine.layers.drag && <DragVectors snapshot={snapshot} />}
      </GlobeGroup>
      <CameraRig mission={mission} />
    </Canvas>
  )
}
