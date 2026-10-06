import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars, Line } from '@react-three/drei'
import { engine } from '../../lib/engine.js'
import { footprintOf } from '../../lib/analysis.js'
import { geodeticToScene, REGIME_COLORS } from '../../lib/coords.js'
import ConstellationField from './ConstellationField.jsx'
import LabOrbit from './LabOrbit.jsx'

const GREEN = '#22c55e'
const CRIMSON = '#ef4444'
const AMBER = '#f59e0b'
const TMP = new THREE.Vector3()

/* ------------------------------------------------------------------ Earth */

function landDotsGeometry() {
  /** Sample a Blue Marble texture into a green point-cloud of landmasses.
   *  Resolves to null when the texture is unavailable — graticule still renders. */
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => resolve(null)
    img.onload = () => {
      const W = 512, H = 256
      const cv = document.createElement('canvas')
      cv.width = W; cv.height = H
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0, W, H)
      let data
      try { data = ctx.getImageData(0, 0, W, H).data } catch { resolve(null); return }
      const verts = []
      for (let y = 0; y < H; y += 2) {
        for (let x = 0; x < W; x += 2) {
          const i = (y * W + x) * 4
          const r = data[i], g = data[i + 1], b = data[i + 2]
          // crude land mask: green/brown terrain is red-dominant vs ocean blue
          if (r > 60 && r > b * 0.85 && !(b > 120 && b > r)) {
            const lon = (x / W) * 360 - 180
            const lat = 90 - (y / H) * 180
            geodeticToScene(lat, lon, 0, TMP)
            verts.push(TMP.x * 1.002, TMP.y * 1.002, TMP.z * 1.002)
          }
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      resolve(verts.length ? geo : null)
    }
    img.src = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
  })
}

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
      <lineBasicMaterial color={GREEN} transparent opacity={0.22} />
    </lineSegments>
  )
}

function Earth() {
  const [landGeo, setLandGeo] = useState(null)
  useEffect(() => {
    let alive = true
    landDotsGeometry().then((g) => alive && setLandGeo(g))
    return () => { alive = false }
  }, [])

  // Fresnel atmosphere; uStorm tints the rim amber/red during geomagnetic storms.
  const atmoMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uStorm: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uStorm; varying vec3 vN; varying vec3 vV; void main(){ float f=1.0-abs(dot(vN,vV)); vec3 calm=vec3(0.13,0.78,0.42); vec3 hot=vec3(1.0,0.42,0.12); gl_FragColor=vec4(mix(calm,hot,uStorm), pow(f,3.0)*(0.55+0.35*uStorm)); }',
  }), [])
  useFrame((_, dt) => {
    const target = engine.weather?.storm
      ? Math.min(1, Math.max(0, (engine.weather.kp_index - 4) / 4))
      : 0
    atmoMat.uniforms.uStorm.value += (target - atmoMat.uniforms.uStorm.value) * Math.min(1, dt * 2)
  })

  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.995, 64, 64]} />
        <meshBasicMaterial color="#03140b" transparent opacity={0.92} />
      </mesh>
      <Graticule />
      {landGeo && (
        <points geometry={landGeo}>
          <pointsMaterial color="#34d399" size={0.013} transparent opacity={0.75} sizeAttenuation />
        </points>
      )}
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
        <Line key={`p${i}`} points={pts} color="#34d399" lineWidth={1.4}
              transparent opacity={0.55} toneMapped={false} />
      ))}
      {segs.future.map((pts, i) => (
        <Line key={`f${i}`} points={pts} color="#22d3ee" lineWidth={1.4} dashed
              dashSize={0.035} gapSize={0.02} transparent opacity={0.8}
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
                lineWidth={isSel || isRisk ? 1.6 : 0.7}
                transparent opacity={isRisk ? 0.95 : isSel ? 0.95 : 0.2}
                toneMapped={false} />
        )
      })}
    </group>
  )
}

function Satellites({ snapshot }) {
  const selected = engine.selectedId
  return (
    <group>
      {snapshot.map((s) => {
        const sel = s.id === selected
        return (
          <group key={s.id} position={geodeticToScene(s.lat, s.lon, s.alt, new THREE.Vector3())}>
            <mesh>
              <sphereGeometry args={[sel ? 0.024 : 0.013, 12, 12]} />
              <meshBasicMaterial color={sel ? '#ffffff' : REGIME_COLORS[s.meta.regime]} toneMapped={false} />
            </mesh>
            {sel && (
              <mesh>
                <ringGeometry args={[0.034, 0.04, 32]} />
                <meshBasicMaterial color="#4ade80" transparent opacity={0.9}
                                   side={THREE.DoubleSide} toneMapped={false} />
              </mesh>
            )}
          </group>
        )
      })}
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

export default function OrbitScene({ mission = false, lab = null }) {
  const [snapshot, setSnapshot] = useState(() => engine.propagateAll())
  useEffect(() => engine.subscribe((e) => {
    if (e.snapshot) setSnapshot(e.snapshot)
  }), [])

  return (
    <Canvas
      camera={{ fov: 45, near: 0.05, far: 60, position: [4, 2, 6] }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    >
      <color attach="background" args={['#020a06']} />
      <fog attach="fog" args={['#020a06', 9, 22]} />
      <Stars radius={28} count={2600} factor={2.4} saturation={0} fade speed={0.3} />
      <GlobeGroup>
        <Earth />
        {lab && <LabOrbit elements={lab.elements} options={lab.options} simMs={lab.simMs} />}
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
