import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars, Line, Detailed } from '@react-three/drei'
import { engine } from '../../lib/engine.js'
import { footprintOf } from '../../lib/analysis.js'
import { geodeticToScene, sunDirection, REGIME_COLORS } from '../../lib/coords.js'
import ConstellationField from './ConstellationField.jsx'
import LabOrbit from './LabOrbit.jsx'

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
const TEX = {
  day: '/textures/earth_atmos_2048.jpg',
  night: '/textures/earth_lights_2048.png',
  ocean: '/textures/earth_specular_2048.jpg',
  clouds: '/textures/earth_clouds_1024.png',
}

function loadEarthTextures() {
  const loader = new THREE.TextureLoader()
  return Promise.all([
    loader.loadAsync(TEX.day), loader.loadAsync(TEX.night),
    loader.loadAsync(TEX.ocean), loader.loadAsync(TEX.clouds),
  ]).then(([day, night, ocean, clouds]) => {
    for (const t of [day, night, clouds]) {
      t.colorSpace = THREE.SRGBColorSpace
      t.wrapS = THREE.RepeatWrapping
      t.repeat.x = -1 // pinned lon-alignment flip (earthTexture.test.js)
      t.offset.x = 1
      t.anisotropy = 4
    }
    ocean.wrapS = THREE.RepeatWrapping // linear mask: same geometry mapping, no sRGB
    ocean.repeat.x = -1
    ocean.offset.x = 1
    return { day, night, ocean, clouds }
  }).catch(() => null)
}

const EARTH_VERT = `
varying vec2 vUv; varying vec3 vPos;
void main() {
  vUv = uv; vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const EARTH_FRAG = `
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uOcean;
uniform vec3 uSun; uniform vec3 uCam;
varying vec2 vUv; varying vec3 vPos;
void main() {
  vec3 n = normalize(vPos);
  vec3 s = normalize(uSun);
  float ndl = dot(n, s);
  float t = smoothstep(-0.12, 0.06, ndl);          // natural-day terminator
  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 dayCol = day * (0.05 + 1.10 * max(ndl, 0.0)) + vec3(0.015, 0.03, 0.06);
  vec3 nightCol = texture2D(uNight, vUv).rgb * 1.25 + day * 0.012;
  vec3 col = mix(nightCol, dayCol, t);
  float ocean = texture2D(uOcean, vUv).r;
  vec3 v = normalize(uCam - vPos);
  vec3 h = normalize(v + s);
  float spec = pow(max(dot(n, h), 0.0), 90.0) * ocean * t;
  col += vec3(0.30, 0.45, 0.65) * spec;            // sun glint on water only
  gl_FragColor = vec4(col, 1.0);
}`

const CLOUD_FRAG = `
uniform sampler2D uClouds; uniform vec3 uSun; uniform float uOpacity;
varying vec2 vUv; varying vec3 vPos;
void main() {
  vec4 c = texture2D(uClouds, vUv);
  float ndl = dot(normalize(vPos), normalize(uSun));
  float lit = smoothstep(-0.15, 0.25, ndl);
  gl_FragColor = vec4(c.rgb * mix(0.08, 1.0, lit), c.a * uOpacity);
}`

function Graticule() {
  const geo = useMemo(() => {
    const pts = []
    const seg = (a, b) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    const v = (lat, lon) => geodeticToScene(lat, lon, 0, new THREE.Vector3())
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 6) seg(v(lat, lon), v(lat, lon + 6))
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -90; lat < 90; lat += 6) seg(v(lat, lon), v(lat + 6, lon))
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={GREEN} transparent opacity={0.08} />
    </lineSegments>
  )
}

function Earth() {
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

  const uniforms = useMemo(() => ({
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uCam: { value: new THREE.Vector3(0, 0, 5) },
  }), [])

  const earthMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
    uniforms: {
      uDay: { value: null }, uNight: { value: null }, uOcean: { value: null },
      ...uniforms,
    },
  }), [uniforms])
  const cloudMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT, fragmentShader: CLOUD_FRAG, transparent: true,
    depthWrite: false,
    uniforms: { uClouds: { value: null }, uOpacity: { value: 0.85 }, ...uniforms },
  }), [uniforms])
  useEffect(() => {
    if (!tex) return
    earthMat.uniforms.uDay.value = tex.day
    earthMat.uniforms.uNight.value = tex.night
    earthMat.uniforms.uOcean.value = tex.ocean
    cloudMat.uniforms.uClouds.value = tex.clouds
  }, [tex, earthMat, cloudMat])

  // Fresnel atmosphere; uStorm tints the rim amber/red during geomagnetic storms.
  const atmoMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uStorm: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uStorm; varying vec3 vN; varying vec3 vV; void main(){ float f=1.0-abs(dot(vN,vV)); vec3 calm=vec3(0.18,0.52,0.98); vec3 hot=vec3(1.0,0.45,0.25); gl_FragColor=vec4(mix(calm,hot,uStorm), pow(f,3.0)*(0.55+0.35*uStorm)); }',
  }), [])

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
            <sphereGeometry args={[0.998, 96, 96]} />
          </mesh>
        ) : (
          // graceful degradation until (or if) textures resolve
          <mesh>
            <sphereGeometry args={[0.998, 64, 64]} />
            <meshBasicMaterial color="#0A1830" transparent opacity={0.95} />
          </mesh>
        )}
        {tex && (
          <mesh material={cloudMat}>
            <sphereGeometry args={[1.006, 72, 72]} />
          </mesh>
        )}
      </group>
      <Graticule />
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

function OrbitRings({ snapshot }) {
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
        return (
          <Line key={s.id} points={pts}
                color={isRisk ? CRIMSON : (REGIME_COLORS[s.meta.regime] ?? GREEN)}
                lineWidth={isSel || isRisk ? 1.5 : 0.55}
                transparent opacity={isRisk ? 0.9 : isSel ? 0.85 : 0.13}
                toneMapped={false} />
        )
      })}
    </group>
  )
}

/* ------------------------------------------------------- Lighting rig */

const SUN_TMP = new THREE.Vector3()
const UP_SCALE = new THREE.Vector3(1.35, 1.35, 1.35)
const ONE = new THREE.Vector3(1, 1, 1)
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
 * Generic 3-axis bus with solar wings — a category model (Earth-observation
 * imager vs comms/nav craft with dish), NOT a replica of any specific
 * spacecraft. Orientation is illustrative: boresight nadir-locked, which is
 * typical payload-pointing behavior but is not real attitude data.
 */
function CraftModel({ regime }) {
  const accent = REGIME_COLORS[regime] ?? '#38D9FF'
  const span = regime === 'GEO' ? 0.085 : 0.062
  const wing = (sign) => (
    <mesh position={[sign * span * 0.58, 0, 0]}>
      <boxGeometry args={[span, 0.0016, 0.026]} />
      <meshStandardMaterial color="#16296b" emissive={accent} emissiveIntensity={0.16}
                            metalness={0.35} roughness={0.55} />
    </mesh>
  )
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.02, 0.024, 0.036]} />
        <meshStandardMaterial color="#c8d6ea" metalness={0.55} roughness={0.4} />
      </mesh>
      {wing(1)}
      {wing(-1)}
      {regime === 'LEO' ? (
        <mesh position={[0, 0, -0.022]}>
          <boxGeometry args={[0.013, 0.013, 0.008]} />
          <meshStandardMaterial color="#0b1220" metalness={0.25} roughness={0.15} />
        </mesh>
      ) : (
        <mesh position={[0, 0, -0.026]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.016, 0.009, 16, 1, true]} />
          <meshStandardMaterial color="#dbe7f7" metalness={0.4} roughness={0.5}
                                side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

/** Distance-aware hybrid: instanced-style dot when far, full model when
 *  near or selected (drei Detailed = one THREE LOD, zero React churn on
 *  level switches). Selection grows with a smooth scale transition. */
function SatMarker({ s, sel }) {
  const inner = useRef()
  const pos = geodeticToScene(s.lat, s.lon, s.alt, new THREE.Vector3())
  const quat = useMemo(() => {
    const q = new THREE.Quaternion()
    const len = pos.length()
    if (len > 1e-6) q.setFromUnitVectors(NADIR0, pos.clone().multiplyScalar(-1 / len))
    return q
  }, [pos.x, pos.y, pos.z])
  useFrame((_, dt) => {
    if (inner.current) inner.current.scale.lerp(sel ? UP_SCALE : ONE, Math.min(1, dt * 8))
  })
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
            <CraftModel regime={s.meta.regime} />
            <mesh>
              <ringGeometry args={[0.045, 0.052, 32]} />
              <meshBasicMaterial color="#38D9FF" transparent opacity={0.9}
                                 side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.006, 8, 8]} />
              <meshBasicMaterial color="#F2F7FF" toneMapped={false} />
            </mesh>
          </>
        ) : (
          <Detailed distances={[1.6, 4.5]}>
            <CraftModel regime={s.meta.regime} />
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
  useFrame(({ clock }) => {
    const p = mission ? 0.16 : progress.current
    let i = 0
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i += 1
    const a = KEYS[i], b = KEYS[i + 1]
    const span = Math.max(1e-6, b.p - a.p)
    const t = smooth(Math.min(1, Math.max(0, (p - a.p) / span)))
    const base = mission ? 2.9 : THREE.MathUtils.lerp(a.d, b.d, t)
    const d = base * engine.zoom
    const lat = mission ? 0.3 : THREE.MathUtils.lerp(a.lat, b.lat, t)
    const lon = (mission ? 0.7 : THREE.MathUtils.lerp(a.lon, b.lon, t))
            + clock.elapsedTime * (mission ? 0.03 : 0.015) + engine.yaw * 0.25
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

export default function OrbitScene({ mission = false, lab = null, overlay = null }) {
  const [snapshot, setSnapshot] = useState(() => engine.propagateAll())
  useEffect(() => engine.subscribe((e) => {
    if (e.snapshot) setSnapshot(e.snapshot)
  }), [])

  return (
    <Canvas
      camera={{ fov: 45, near: 0.05, far: 60, position: [4, 2, 6] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.75]}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    >
      <color attach="background" args={['#050B17']} />
      <fog attach="fog" args={['#050B17', 9, 22]} />
      <Stars radius={28} count={2600} factor={2.4} saturation={0} fade speed={0.3} />
      <GlobeGroup>
        <SunLight />
        <Earth />
        {lab && <LabOrbit elements={lab.elements} options={lab.options} simMs={lab.simMs} />}
        {overlay}
        {engine.activeConstellationGroups().map((g) => (
          <ConstellationField key={g.key} group={g} />
        ))}
        <OrbitRings snapshot={snapshot} />
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
