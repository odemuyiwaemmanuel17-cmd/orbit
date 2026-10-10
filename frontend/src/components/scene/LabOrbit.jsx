import { useMemo } from 'react'
import * as THREE from 'three'
import * as sm from 'satellite.js'
import { Line } from '@react-three/drei'
import { elementsToStateKm, orbitPolylineKm, orbitMarkersKm, meanToTrueAnomalyRad, periodSec } from '../../lib/kepler.js'
import { geodeticToScene, eciToSceneKm, EARTH_RADIUS_KM } from '../../lib/coords.js'
import { RAD_PER_DEG } from '../../lib/constants.js'

const PERIGEE = '#F5B942'
const APOGEE = '#38bdf8'
const NODE_ASC = '#22d3ee'
const NODE_DESC = '#f472b6'
const ORBIT = '#3B82F6'

/** ECI km -> scene units through the SAME projection contract as real sats.
 *  Canonical implementation moved to lib/coords.js so the frame contract is
 *  testable headless (tests/coordinates.test.js); re-exported for consumers. */
export { eciToSceneKm }

/**
 * Orbital Elements Lab orbit — regenerated on every render (10 Hz engine
 * beat) strictly from the analytic two-body solution: ellipse polyline in
 * ECI, apsides and orbit-plane node crossings, apsidal/node construction
 * lines, optional equatorial reference ring, and a spacecraft marker whose
 * true anomaly comes from Kepler's equation on the shared sim clock
 * (so pause / warp / scrub all act on it honestly).
 */
export default function LabOrbit({ elements, options, simMs }) {
  const gmst = sm.gstime(new Date(simMs))
  const TMP = useMemo(() => new THREE.Vector3(), [])
  const toScene = (p) => {
    eciToSceneKm(p.x, p.y, p.z, gmst, TMP)
    return [TMP.x, TMP.y, TMP.z]
  }

  const { linePts, markers, apsidalLine, nodeLine, eqRing } = useMemo(() => {
    const flat = orbitPolylineKm(elements, 160)
    const pts = []
    for (let k = 0; k <= 160; k += 1) {
      eciToSceneKm(flat[k * 3], flat[k * 3 + 1], flat[k * 3 + 2], gmst, TMP)
      pts.push([TMP.x, TMP.y, TMP.z])
    }
    const mk = orbitMarkersKm(elements)
    return {
      linePts: pts,
      markers: {
        perigee: mk.perigeeKm ? toScene(mk.perigeeKm) : null,
        apogee: mk.apogeeKm ? toScene(mk.apogeeKm) : null,
        asc: mk.ascendingNodeKm ? toScene(mk.ascendingNodeKm) : null,
        desc: mk.descendingNodeKm ? toScene(mk.descendingNodeKm) : null,
      },
      apsidalLine: mk.perigeeKm && mk.apogeeKm
        ? [[0, 0, 0], toScene(mk.apogeeKm)]
        : null,
      nodeLine: mk.ascendingNodeKm
        ? [toScene({ x: -mk.ascendingNodeKm.x, y: -mk.ascendingNodeKm.y, z: -mk.ascendingNodeKm.z }),
           toScene(mk.ascendingNodeKm)]
        : null,
      eqRing: (() => {
        const rKm = EARTH_RADIUS_KM + elements.aKm * (1 + elements.e)
        const ring = []
        for (let k = 0; k <= 64; k += 1) {
          const th = (k / 64) * 2 * Math.PI
          eciToSceneKm(Math.cos(th) * rKm, Math.sin(th) * rKm, 0, gmst, TMP)
          ring.push([TMP.x, TMP.y, TMP.z])
        }
        return ring
      })(),
    }
  }, [elements, gmst]) // eslint-disable-line react-hooks/exhaustive-deps

  // Spacecraft phase: mean anomaly advances with the sim clock at
  // `speed` x real time; true anomaly via the Kepler solver — the
  // perigee-fast/apogee-slow behavior is emergent, not animated.
  const animNuDeg = options.animating
    ? (meanToTrueAnomalyRad(
        (simMs / 1000) * (options.speed ?? 60) * 2 * Math.PI / periodSec(elements.aKm)
        + elements.trueAnomalyDeg * RAD_PER_DEG,
        elements.e) / RAD_PER_DEG + 360) % 360
    : elements.trueAnomalyDeg
  const satScene = toScene(elementsToStateKm({
    ...elements, trueAnomalyDeg: animNuDeg,
  }).posKm)

  return (
    <group>
      <Line points={linePts} color={options.lineColor ?? ORBIT} lineWidth={1.6}
            dashed={!!options.dashed} dashSize={0.04} gapSize={0.03}
            transparent opacity={options.opacity ?? 0.9} toneMapped={false} />
      {options.showConstruction && apsidalLine && (
        <Line points={apsidalLine} color={PERIGEE} lineWidth={0.8} dashed dashSize={0.03} gapSize={0.02}
              transparent opacity={0.4} toneMapped={false} />
      )}
      {options.showConstruction && nodeLine && (
        <Line points={nodeLine} color={NODE_ASC} lineWidth={0.8} dashed dashSize={0.03} gapSize={0.02}
              transparent opacity={0.45} toneMapped={false} />
      )}
      {options.showEquatorial && (
        <Line points={eqRing} color="#2dd4bf" lineWidth={0.7} transparent opacity={0.25} toneMapped={false} />
      )}
      {options.showMarkers && Object.entries(markers).map(([k, p]) => p && (
        <mesh key={k} position={p}>
          <sphereGeometry args={[k === 'perigee' || k === 'apogee' ? 0.016 : 0.013, 10, 10]} />
          <meshBasicMaterial color={{ perigee: PERIGEE, apogee: APOGEE, asc: NODE_ASC, desc: NODE_DESC }[k]}
                             toneMapped={false} />
        </mesh>
      ))}
      {!options.hideSat && (
        <mesh position={satScene}>
          <sphereGeometry args={[0.022, 12, 12]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}
