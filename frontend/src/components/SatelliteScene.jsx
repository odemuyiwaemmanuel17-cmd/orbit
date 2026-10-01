import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Line } from '@react-three/drei'
import Earth from './Earth.jsx'
import { geodeticToScene, kmToScene, GROUP_COLORS } from '../lib/coords.js'

const DUMMY = new THREE.Object3D()
const TMP = new THREE.Vector3()
const SELECTED_COLOR = new THREE.Color('#ffffff')
// Reusable per-group color cache — avoids allocating in the frame loop.
const GROUP_THREE_COLORS = new Map()
const groupColor = (hex) => {
  if (!GROUP_THREE_COLORS.has(hex)) GROUP_THREE_COLORS.set(hex, new THREE.Color(hex))
  return GROUP_THREE_COLORS.get(hex)
}

/** Instanced satellite markers, colored per orbital group. */
function Satellites({ satellites, selectedId, onSelect }) {
  const meshRef = useRef()
  const withState = useMemo(() => satellites.filter((s) => s.state), [satellites])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    withState.forEach((sat, i) => {
      geodeticToScene(sat.state.latitude, sat.state.longitude, sat.state.altitude_km, TMP)
      DUMMY.position.copy(TMP)
      const sel = sat.id === selectedId
      DUMMY.scale.setScalar(sel ? 2.4 : 1.2)
      DUMMY.updateMatrix()
      mesh.setMatrixAt(i, DUMMY.matrix)
      mesh.setColorAt(i, sel ? SELECTED_COLOR : groupColor(GROUP_COLORS[sat.group] ?? '#22d3ee'))
    })
    mesh.count = withState.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.visible = withState.length > 0
  })

  return (
    <instancedMesh
      key={withState.length}
      ref={meshRef}
      args={[undefined, undefined, Math.max(withState.length, 1)]}
      onPointerDown={(e) => {
        e.stopPropagation()
        const sat = withState[e.instanceId]
        if (sat) onSelect(sat.id)
      }}
    >
      <octahedronGeometry args={[0.012, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

/** Selection reticle ring that rides the locked satellite. */
function TargetRing({ satellites, selectedId }) {
  const ref = useRef()
  const sat = satellites.find((s) => s.id === selectedId)
  useFrame(({ clock }) => {
    if (!ref.current || !sat?.state) return
    geodeticToScene(sat.state.latitude, sat.state.longitude, sat.state.altitude_km, ref.current.position)
    ref.current.lookAt(0, 0, 0)
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.15
    ref.current.scale.setScalar(pulse)
  })
  if (!sat?.state) return null
  return (
    <mesh ref={ref}>
      <ringGeometry args={[0.028, 0.032, 32]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.9}
                         side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  )
}

/** Glowing 90-minute trajectory of the selected satellite. */
function OrbitTrack({ orbitData, visible }) {
  const points = useMemo(() => {
    if (!visible || !orbitData?.points) return null
    return orbitData.points.map((p) => [kmToScene(p.eci_km[0]), kmToScene(p.eci_km[1]), kmToScene(p.eci_km[2])])
  }, [orbitData, visible])
  if (!points) return null
  return (
    <Line points={points} color="#67e8f9" lineWidth={1.6} transparent
          opacity={0.85} toneMapped={false} />
  )
}

/** Smoothly lerps camera + controls target onto the locked satellite. */
function FocusRig({ satellites, selectedId, focusMode }) {
  const controls = useThree((s) => s.controls)
  const { camera } = useThree()
  useFrame((_, dt) => {
    if (!focusMode || !controls) return
    const sat = satellites.find((s) => s.id === selectedId)
    if (!sat?.state) return
    geodeticToScene(sat.state.latitude, sat.state.longitude, sat.state.altitude_km, TMP)
    const k = Math.min(1, dt * 3.2)
    controls.target.lerp(TMP, k)
    // Hold station-keeping offset: sunward-ish quarter behind, 0.55 units out.
    const desired = TMP.clone().multiplyScalar(1 + 0.55 / Math.max(TMP.length(), 0.001))
    camera.position.lerp(desired, k * 0.6)
    controls.update()
  })
  return null
}

export default function SatelliteScene({
  satellites, selectedId, onSelect, orbitData, showOrbit, focusMode, simTime,
}) {
  const [dpr, setDpr] = useState(1.5)
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [-1.9, 1.4, 2.6], fov: 45, near: 0.01, far: 60 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => setDpr(Math.min(window.devicePixelRatio, 2))}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#030712']} />
      <Stars radius={30} count={3200} factor={2.2} saturation={0} fade speed={0.4} />

      <Earth simTime={simTime} />
      <Satellites satellites={satellites} selectedId={selectedId} onSelect={onSelect} />
      <TargetRing satellites={satellites} selectedId={selectedId} />
      <OrbitTrack orbitData={orbitData} visible={showOrbit} />
      <FocusRig satellites={satellites} selectedId={selectedId} focusMode={focusMode} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        zoomSpeed={0.7}
        minDistance={1.25}
        maxDistance={14}
        enablePan={false}
      />
    </Canvas>
  )
}
