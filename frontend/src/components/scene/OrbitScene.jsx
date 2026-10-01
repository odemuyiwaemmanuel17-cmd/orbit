import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars, Line } from '@react-three/drei'
import { engine } from '../../lib/engine.js'
import { geodeticToScene, REGIME_COLORS } from '../../lib/coords.js'

const GREEN = '#22c55e'
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
      <mesh>
        <sphereGeometry args={[1.05, 48, 48]} />
        <shaderMaterial
          transparent depthWrite={false} side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          vertexShader="varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }"
          fragmentShader="varying vec3 vN; varying vec3 vV; void main(){ float f=1.0-abs(dot(vN,vV)); gl_FragColor=vec4(0.13,0.78,0.42, pow(f,3.0)*0.55); }"
        />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------- Orbits & markers */

function OrbitRings({ snapshot }) {
  const selected = engine.selectedId
  return (
    <group>
      {snapshot.map((s) => {
        const pts = engine.orbitPointsCached(s.id)
        if (pts.length < 4) return null
        const isSel = s.id === selected
        return (
          <Line key={s.id} points={pts}
                color={REGIME_COLORS[s.meta.regime] ?? GREEN}
                lineWidth={isSel ? 1.6 : 0.7}
                transparent opacity={isSel ? 0.95 : 0.2}
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

function CameraRig() {
  const { camera } = useThree()
  const progress = useRef(0)
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      progress.current = max > 0 ? window.scrollY / max : 0
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useFrame(({ clock }) => {
    const p = progress.current
    let i = 0
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i += 1
    const a = KEYS[i], b = KEYS[i + 1]
    const span = Math.max(1e-6, b.p - a.p)
    const t = smooth(Math.min(1, Math.max(0, (p - a.p) / span)))
    const d = THREE.MathUtils.lerp(a.d, b.d, t) * engine.zoom
    const lat = THREE.MathUtils.lerp(a.lat, b.lat, t)
    const lon = THREE.MathUtils.lerp(a.lon, b.lon, t)
            + clock.elapsedTime * 0.015 + engine.yaw * 0.25
    camera.position.set(
      d * Math.cos(lat) * Math.cos(lon),
      d * Math.sin(lat),
      d * Math.cos(lat) * Math.sin(lon),
    )
    camera.lookAt(0, 0, 0)
  })
  return null
}

/** Globe + payload group whose rotation follows drag input every frame. */
function GlobeGroup({ children }) {
  const ref = useRef()
  useFrame(() => {
    ref.current.rotation.set(engine.pitch, engine.yaw, 0)
  })
  return <group ref={ref}>{children}</group>
}

/* ------------------------------------------------------------------ Scene */

export default function OrbitScene() {
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
        <OrbitRings snapshot={snapshot} />
        <Satellites snapshot={snapshot} />
      </GlobeGroup>
      <CameraRig />
    </Canvas>
  )
}
