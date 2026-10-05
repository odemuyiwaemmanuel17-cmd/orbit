import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { REGIME_COLORS } from '../../lib/coords.js'

const COLOR = new THREE.Color()

/**
 * One InstancedMesh per constellation — thousands of satellites stay a single
 * draw call with zero React churn: positions are written straight from the
 * engine's Float32 position arrays into the instanceMatrix typed array inside
 * useFrame (translation + uniform scale only — three zero-initializes the
 * buffer, so only the diagonal and last column need writing).
 * The promoted (selected) member is scaled to zero here because the full
 * high-accuracy pipeline already renders its marker from the snapshot.
 */
export default function ConstellationField({ group }) {
  const ref = useRef()
  const n = group.n

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const arr = mesh.instanceMatrix.array
    const promoted = group.promotedIndex
    for (let i = 0; i < n; i += 1) {
      const o = i * 16
      const s = (i === promoted || !group.initialized[i]) ? 0 : 1
      arr[o] = s
      arr[o + 5] = s
      arr[o + 10] = s
      arr[o + 15] = 1
      arr[o + 12] = group.px[i]
      arr[o + 13] = group.py[i]
      arr[o + 14] = group.pz[i]
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < n; i += 1) {
      COLOR.set(REGIME_COLORS[group.meta[i].regime] ?? '#22c55e')
      mesh.setColorAt(i, COLOR)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [n, group])

  return (
    <instancedMesh key={`${group.key}-${n}`} ref={ref} args={[undefined, undefined, n]}
                   frustumCulled={false}>
      <sphereGeometry args={[0.012, 6, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
