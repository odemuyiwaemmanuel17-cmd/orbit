/**
 * Phase-2 spacecraft models.
 *
 * Every model here is an ORIGINAL, representative geometry built from
 * published configuration knowledge (module counts, truss layout, array
 * shapes). They are NOT exact replicas and are labeled illustrative in the
 * UI; orientation is nadir-locked, not real attitude data.
 *
 * GLB hook: if a catalog entry carries `modelGlb` (a URL to an
 * appropriately licensed glTF binary with attribution noted in
 * public/models/ATTRIBUTION.md), SatMarker swaps in the loaded scene via
 * GLTFLoader instead of the procedural stand-in. No third-party GLB ships
 * in this repo yet — the loader path exists for a clean drop-in.
 */
import { useEffect, useState } from 'react'
import * as THREE from 'three'

const ALU = { color: '#cbd8ec', metalness: 0.55, roughness: 0.38 }
const MLI = { color: '#c9a24d', metalness: 0.72, roughness: 0.3 }
const DARK = { color: '#0b1220', metalness: 0.25, roughness: 0.2 }
const wing = (tint) => ({ color: '#16296b', emissive: tint, emissiveIntensity: 0.14,
  metalness: 0.35, roughness: 0.55 })

/** Representative ISS: integrated truss, four dual solar wings, pressurized
 *  module cluster along the fore-aft axis, radiator pair. */
export function IssModel() {
  const panel = (x, w) => (
    <mesh position={[x, 0, 0]}>
      <boxGeometry args={[w, 0.0012, 0.03]} />
      <meshStandardMaterial {...wing('#38D9FF')} side={THREE.DoubleSide} />
    </mesh>
  )
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.17, 0.006, 0.006]} />
        <meshStandardMaterial {...ALU} />
      </mesh>
      {panel(0.072, 0.048)}{panel(-0.072, 0.048)}
      {panel(0.088, 0.02)}{panel(-0.088, 0.02)}
      {[0, 0.014, -0.014, 0.026].map((z, i) => (
        <mesh key={i} position={[0, i === 3 ? 0.008 : 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[i === 0 ? 0.0085 : 0.007, i === 0 ? 0.0085 : 0.007,
                                  i === 0 ? 0.02 : 0.013, 14]} />
          <meshStandardMaterial {...(i === 0 ? ALU : MLI)} />
        </mesh>
      ))}
      {[0.01, -0.01].map((x, i) => (
        <mesh key={i} position={[x, 0.006, 0]} rotation={[0, 0, x > 0 ? 0.4 : -0.4]}>
          <boxGeometry args={[0.03, 0.001, 0.018]} />
          <meshStandardMaterial color="#e6eefb" metalness={0.2} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/** Representative Hubble: optical tube with aperture ring, two wings,
 *  high-gain antennas. */
export function HubbleModel() {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.046, 20]} />
        <meshStandardMaterial {...MLI} />
      </mesh>
      <mesh position={[0, 0, -0.024]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0165, 0.0165, 0.004, 20]} />
        <meshStandardMaterial {...DARK} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.044, 0, 0]}>
          <boxGeometry args={[0.052, 0.001, 0.02]} />
          <meshStandardMaterial {...wing('#38D9FF')} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {[0.02, -0.02].map((z) => (
        <mesh key={z} position={[0.018, 0.008, z]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.007, 0.004, 12, 1, true]} />
          <meshStandardMaterial color="#e6eefb" metalness={0.4} roughness={0.5}
                                side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/** Generic geostationary comms satellite: bus, two big wings, nadir dish. */
export function GeoCommsModel() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.024, 0.03, 0.034]} />
        <meshStandardMaterial {...MLI} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.075, 0, 0]}>
          <boxGeometry args={[0.11, 0.0012, 0.034]} />
          <meshStandardMaterial {...wing('#818CF8')} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 0, -0.024]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.019, 0.01, 20, 1, true]} />
        <meshStandardMaterial color="#e6eefb" metalness={0.45} roughness={0.45}
                              side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Generic Earth-observation imager: nadir aperture + single wing + dish. */
export function EarthObsModel() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.022, 0.024, 0.036]} />
        <meshStandardMaterial {...ALU} />
      </mesh>
      <mesh position={[0, 0, -0.022]}>
        <cylinderGeometry args={[0.008, 0.011, 0.01, 16]} />
        <meshStandardMaterial {...DARK} />
      </mesh>
      <mesh position={[0.055, 0, 0]}>
        <boxGeometry args={[0.06, 0.0014, 0.028]} />
        <meshStandardMaterial {...wing('#38D9FF')} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.03, 0.012, 0]} rotation={[0, 0, -0.5]}>
        <coneGeometry args={[0.009, 0.005, 14, 1, true]} />
        <meshStandardMaterial color="#dbe7f7" metalness={0.4} roughness={0.5}
                              side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Generic navigation craft (GPS/Galileo class). */
export function NavCraftModel() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.02, 0.028, 0.02]} />
        <meshStandardMaterial {...ALU} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.052, 0, 0]}>
          <boxGeometry args={[0.06, 0.0012, 0.024]} />
          <meshStandardMaterial {...wing('#3B82F6')} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 0, -0.016]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.012, 0.007, 16, 1, true]} />
        <meshStandardMaterial color="#dbe7f7" metalness={0.4} roughness={0.5}
                              side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

const BY_SLOT = { iss: IssModel, hubble: HubbleModel }

export function selectCraftModel(meta) {
  if (!meta) return EarthObsModel
  if (BY_SLOT[meta.slot]) return BY_SLOT[meta.slot]
  if (meta.regime === 'GEO') return GeoCommsModel
  if (meta.regime === 'MEO') return NavCraftModel
  return EarthObsModel
}

/** V3 true-scale mode: spacecraft POSITION is always true-scale; this
 *  factor only converts the model's drawn SIZE from the ~10x visibility
 *  exaggeration to real physical size (factor = real wingspan km /
 *  (Earth radius km x nominal model wingspan in scene units)). */
export function trueScaleFactor(meta) {
  const realKm = meta.slot === 'iss' ? 109 : meta.slot === 'hubble' ? 13.2
    : meta.regime === 'GEO' ? 12 : meta.regime === 'MEO' ? 5.3 : 6.5
  const modelWingspan = meta.slot === 'iss' ? 0.176 : meta.slot === 'hubble' ? 0.14
    : meta.regime === 'GEO' ? 0.26 : meta.regime === 'MEO' ? 0.124 : 0.085
  return realKm / (6371.0 * modelWingspan)
}

/** Optional licensed-GLB path (see file header). Returns null when the
 *  entry carries no modelGlb or loading fails — caller falls back. */
export function useGlbCraft(url) {
  const [scene, setScene] = useState(null)
  useEffect(() => {
    if (!url) { setScene(null); return undefined }
    let alive = true
    import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new Promise((res, rej) =>
        new GLTFLoader().load(url, res, undefined, rej)))
      .then((g) => alive && setScene(g.scene))
      .catch(() => alive && setScene(null))
    return () => { alive = false }
  }, [url])
  return scene
}
