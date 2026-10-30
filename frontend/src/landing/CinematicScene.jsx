/**
 * Cinematic landing scene — one continuous 3D world (Earth, real SGP4
 * orbits, hero satellite, downlink beams, transfer demo) flown by a
 * scroll-driven camera. Reuses the validated Earth material (shared with
 * the tracker), coords contract (eciToSceneKm/geodeticToScene), sun
 * ephemeris and hohmann math. All positions are model estimates from
 * TLE snapshots — the overlay labels them as such.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { useFrame, useThree } from '@react-three/fiber'
import { Stars, Line } from '@react-three/drei'
import catalog from '../data/satellites.json'
import { sunDirection } from '../lib/coords.js'
import { DEFAULT_STATIONS } from '../lib/stations.js'
import {
  cameraAt, orbitScenePoints, satStateAt, beamCurve, visibleStations,
  transferViz, windowOpacity, sceneById,
} from '../lib/cinematic.js'
import { loadEarthTextures, makeEarthMaterials, applyEarthTextures } from '../scene/earthMaterial.js'

const CYAN = '#38D9FF'
const HERO_ID = 'norad-25544'
const RECS = catalog.satellites.map((meta) => ({ meta, rec: sm.twoline2satrec(meta.line1, meta.line2) }))

function glowSpriteTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(160,240,255,1)')
  grad.addColorStop(0.35, 'rgba(56,217,255,0.45)')
  grad.addColorStop(1, 'rgba(56,217,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ------------------------------------------------------------------ Earth */

function EarthLayer({ exposure = 1.15 }) {
  const [tex, setTex] = useState(null)
  useEffect(() => {
    let alive = true
    loadEarthTextures().then((t) => alive && setTex(t))
    return () => { alive = false }
  }, [])
  const mats = useMemo(() => makeEarthMaterials(exposure), [exposure])
  useEffect(() => { applyEarthTextures(mats, tex) }, [mats, tex])
  const scratch = useMemo(() => ({ sun: new THREE.Vector3() }), [])
  useFrame(({ camera }) => {
    sunDirection(new Date(), scratch.sun)
    mats.uniforms.uSun.value.copy(scratch.sun).normalize()
    mats.uniforms.uCam.value.copy(camera.position)
  })
  return (
    <group>
      {tex ? (
        <mesh material={mats.earthMat}>
          <sphereGeometry args={[0.998, 128, 128]} />
        </mesh>
      ) : (
        <mesh>
          <sphereGeometry args={[0.998, 64, 64]} />
          <meshBasicMaterial color="#0A1830" transparent opacity={0.95} />
        </mesh>
      )}
      {tex && (
        <mesh material={mats.cloudMat}>
          <sphereGeometry args={[1.006, 96, 96]} />
        </mesh>
      )}
      <mesh material={mats.atmoMat}>
        <sphereGeometry args={[1.05, 48, 48]} />
      </mesh>
    </group>
  )
}

/* ----------------------------------------------------------- orbit rings */

function OrbitRings({ tier, selectedId }) {
  // Rebuild rings every 2 s: rings are inertial shapes seen in the
  // Earth-fixed frame, so they must creep with GMST like the tracker's.
  const [epochBucket, setEpochBucket] = useState(() => Math.floor(Date.now() / 2000))
  useEffect(() => {
    const id = setInterval(() => setEpochBucket(Math.floor(Date.now() / 2000)), 2000)
    return () => clearInterval(id)
  }, [])
  const rings = useMemo(() => {
    const tMs = epochBucket * 2000
    return RECS.slice(0, tier.maxSats).map(({ meta, rec }) => ({
      id: meta.id,
      pts: orbitScenePoints(rec, tMs, tier.orbitSamples),
    })).filter((r) => r.pts)
  }, [epochBucket, tier])
  return (
    <group>
      {rings.map((r) => (
        <Line key={r.id} points={r.pts}
              color={r.id === selectedId ? '#7DEBFF' : CYAN}
              lineWidth={r.id === selectedId ? 1.6 : 0.8}
              transparent opacity={r.id === selectedId ? 0.95 : 0.38}
              toneMapped={false} />
      ))}
    </group>
  )
}

/* ---------------------------------------------------------- sat markers */

function SatMarkers({ tier, selectedId, onSelect, glow }) {
  const group = useRef()
  const items = useMemo(() => RECS.slice(0, tier.maxSats), [tier])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!group.current) return
    const tMs = Date.now()
    group.current.children.forEach((child, i) => {
      const st = satStateAt(items[i].rec, tMs)
      if (!st) return
      tmp.set(st.scene[0], st.scene[1], st.scene[2])
      child.position.copy(tmp)
    })
  })
  return (
    <group ref={group}>
      {items.map((it) => (
        <group key={it.meta.id}
               onClick={(e) => { e.stopPropagation(); onSelect(it.meta.id) }}
               onPointerOver={() => { document.body.style.cursor = 'pointer' }}
               onPointerOut={() => { document.body.style.cursor = '' }}>
          <mesh>
            <sphereGeometry args={[it.meta.id === selectedId ? 0.016 : 0.009, 10, 10]} />
            <meshBasicMaterial color={it.meta.id === selectedId ? '#BDF3FF' : '#6FD9F5'}
                               toneMapped={false} />
          </mesh>
          <sprite scale={[0.09, 0.09, 1]}>
            <spriteMaterial map={glow} transparent opacity={0.75} depthWrite={false}
                            blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  )
}

/* -------------------------------------------------------- hero satellite */

function HeroSatellite() {
  const grp = useRef()
  const hero = useMemo(() => RECS.find((r) => r.meta.id === HERO_ID), [])
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), up: new THREE.Vector3(0, 1, 0) }), [])
  useFrame(({ camera }) => {
    const tMs = Date.now()
    const st = satStateAt(hero.rec, tMs)
    const st2 = satStateAt(hero.rec, tMs + 4000)
    if (!st || !grp.current) return
    grp.current.position.set(st.scene[0], st.scene[1], st.scene[2])
    // orient +Z along velocity (prograde), +Y radial-out — LVLH attitude
    tmp.a.set(st.scene[0], st.scene[1], st.scene[2])
    tmp.b.set(st2.scene[0], st2.scene[1], st2.scene[2])
    const fwd = tmp.b.clone().sub(tmp.a).normalize()
    const rad = tmp.a.clone().normalize()
    const rgt = fwd.clone().cross(rad).normalize()
    const up = rad.clone()
    tmp.m.makeBasis(rgt, up, fwd)
    tmp.q.setFromRotationMatrix(tmp.m)
    grp.current.quaternion.slerp(tmp.q, 0.1)
    // billboard-free: keep readable size against camera distance
    const d = camera.position.distanceTo(grp.current.position)
    const k = THREE.MathUtils.clamp(d * 0.16, 0.05, 0.34)
    grp.current.scale.setScalar(k)
  })
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: '#C9A227', metalness: 0.85, roughness: 0.35 }), [])
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0E1E3A', metalness: 0.4, roughness: 0.6, emissive: '#0a1a33', emissiveIntensity: 0.4 }), [])
  const foil = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8A7330', metalness: 0.9, roughness: 0.45 }), [])
  return (
    <group ref={grp}>
      {/* bus (MLI gold) */}
      <mesh material={gold}>
        <cylinderGeometry args={[0.42, 0.42, 0.9, 14]} />
      </mesh>
      <mesh material={foil} position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.30, 0.42, 0.22, 14]} />
      </mesh>
      {/* antenna mast + dish */}
      <mesh material={dark} position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.7, 6]} />
      </mesh>
      <mesh material={gold} position={[0, 1.25, 0.06]} rotation={[0.5, 0, 0]}>
        <sphereGeometry args={[0.28, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
      </mesh>
      {/* solar wings */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.45, 0, -0.05]} rotation={[0, 0, s * 0.06]}>
          <mesh material={dark} scale={[1.9, 0.03, 0.78]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
          <mesh material={foil} position={[-s * 1.02, 0, 0]} scale={[0.16, 0.05, 0.1]}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------- beams */

function Beams({ progressRef }) {
  const grp = useRef()
  const hero = useMemo(() => RECS.find((r) => r.meta.id === HERO_ID), [])
  const fadeWin = useMemo(() => ({ from: sceneById('track').from + 0.04, to: sceneById('design').to }), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!grp.current) return
    const tMs = Date.now()
    const st = satStateAt(hero.rec, tMs)
    if (!st) return
    const opacity = windowOpacity(progressRef.current, fadeWin, 0.06)
    grp.current.visible = opacity > 0.01
    if (!grp.current.visible) return
    const near = visibleStations(DEFAULT_STATIONS, st).slice(0, 3)
    grp.current.children.forEach((child, i) => {
      const station = near[i]
      if (!station) { child.visible = false; return }
      child.visible = true
      const pts = beamCurve(station, st.scene)
      const line = child.children[0]
      // LineGeometry.setPositions wants a FLAT xyz array — nested arrays
      // produce NaN instance data (caught by the headless console audit)
      if (line?.geometry?.setPositions) line.geometry.setPositions(pts.flat())
      tmp.set(pts[0][0], pts[0][1], pts[0][2])
      child.children[1].position.copy(tmp)
      const pulse = (Math.sin(tMs / 420 + i * 2.1) + 1) / 2
      child.children[1].scale.setScalar(0.02 + 0.035 * pulse)
      child.children[1].material.opacity = opacity * (0.9 - 0.5 * pulse)
      if (line?.material) line.material.opacity = opacity * 0.85
    })
  })
  const stations = useMemo(() => DEFAULT_STATIONS.slice(0, 3), [])
  return (
    <group ref={grp}>
      {stations.map((s, i) => (
        <group key={s.name ?? i}>
          <Line points={[[0, 0, 0], [0, 0.001, 0]]} color="#5FE7FF" lineWidth={1.6}
                transparent opacity={0.8} toneMapped={false} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.7, 1, 28]} />
            <meshBasicMaterial color="#5FE7FF" transparent opacity={0.8} side={THREE.DoubleSide}
                               depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------- transfer (S4) */

function TransferLayer({ progressRef }) {
  const grp = useRef()
  const win = useMemo(() => sceneById('design'), [])
  const data = useMemo(() => transferViz({ altFromKm: 428, altToKm: 1200, incDeg: 51.6, samples: 72 }), [])
  const base = useMemo(() => {
    const pts = []
    for (let k = 0; k <= 96; k++) {
      const ang = (k / 96) * Math.PI * 2
      pts.push([Math.cos(ang) * 1.12, 0, Math.sin(ang) * 1.12])
    }
    return pts
  }, [])
  const [cut, setCut] = useState(0)
  useFrame(() => {
    if (!grp.current) return
    const p = progressRef.current
    const o = windowOpacity(p, win, 0.05)
    grp.current.visible = o > 0.01
    if (!grp.current.visible) return
    const local = Math.min(1, Math.max(0, (p - win.from) / (win.to - win.from)))
    setCut(Math.floor(local * (data.pts.length - 1)))
    grp.current.rotation.y = (p * 3.1) % (Math.PI * 2)
  })
  return (
    <group ref={grp} rotation={[0.35, 0, -0.12]}>
      <Line points={base} color={CYAN} lineWidth={0.8} transparent opacity={0.5} toneMapped={false} />
      <Line points={base.map(([x, y, z]) => [x * 1.34, y, z * 1.34])} color="#818CF8"
            lineWidth={0.8} transparent opacity={0.55} toneMapped={false} dashed dashSize={0.05} gapSize={0.03} />
      {cut > 1 && (
        <Line points={data.pts.slice(0, cut + 1)} color="#5FE7FF" lineWidth={2.2}
              transparent opacity={0.95} toneMapped={false} />
      )}
    </group>
  )
}

/* ----------------------------------------------------------- camera rig */

function CameraRig({ progressRef, damping }) {
  const { camera } = useThree()
  const smooth = useMemo(() => ({ pos: new THREE.Vector3(0.4, 0.9, 9.2), look: new THREE.Vector3(0, 0.15, 3) }), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const { pos, look } = cameraAt(progressRef.current)
    tmp.set(pos[0], pos[1], pos[2])
    smooth.pos.lerp(tmp, Math.min(1, dt * damping))
    camera.position.copy(smooth.pos)
    tmp.set(look[0], look[1], look[2])
    smooth.look.lerp(tmp, Math.min(1, dt * damping * 0.9))
    camera.lookAt(smooth.look)
  })
  return null
}

/* -------------------------------------------------------------- sun flare */

function SunFlare({ glow }) {
  const ref = useRef()
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!ref.current) return
    sunDirection(new Date(), tmp)
    ref.current.position.copy(tmp).multiplyScalar(2.6)
  })
  return (
    <sprite ref={ref} scale={[1.6, 1.6, 1]}>
      <spriteMaterial map={glow} color="#FFD9A0" transparent opacity={0.55}
                      depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>
  )
}

/* ------------------------------------------------------------------ root */

export default function CinematicScene({ progressRef, tier, selectedId, onSelect }) {
  const glow = useMemo(() => glowSpriteTexture(), [])
  return (
    <>
      <color attach="background" args={['#020409']} />
      <ambientLight intensity={0.12} />
      <Stars radius={60} depth={30} count={tier.stars} factor={2.4} saturation={0} fade speed={0.4} />
      <SunFlare glow={glow} />
      <EarthLayer />
      <OrbitRings tier={tier} selectedId={selectedId} />
      <SatMarkers tier={tier} selectedId={selectedId} onSelect={onSelect} glow={glow} />
      <HeroSatellite />
      <Beams progressRef={progressRef} />
      <TransferLayer progressRef={progressRef} />
      <CameraRig progressRef={progressRef} damping={tier.cameraDamping} />
    </>
  )
}

export { HERO_ID, RECS }
