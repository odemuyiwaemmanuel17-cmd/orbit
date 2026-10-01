import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sunDirection } from '../lib/coords.js'

const CDN = 'https://unpkg.com/three-globe/example/img'

/**
 * Textured globe + Fresnel atmosphere.
 *
 * - Day map (Blue Marble), night city-lights emission map, and a water mask
 *   used as the specular/roughness map, loaded from CDN with graceful
 *   procedural fallback when offline.
 * - A directional "sun" light whose direction is derived from the simulated
 *   UTC clock so the terminator roughly tracks real time.
 * - Atmosphere rendered as a slightly larger back-side shell with a Fresnel
 *   rim-scatter shader (plus a fainter front-side inner halo).
 */
export default function Earth({ simTime = new Date() }) {
  const sunRef = useRef()
  const texRef = useRef({ day: null, night: null, water: null, ready: false })
  const matRef = useRef(null)

  useEffect(() => {
    let alive = true
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const t = texRef.current
    let pending = 3
    const done = () => {
      pending -= 1
      if (pending === 0 && alive) {
        t.ready = true
        if (matRef.current) {
          matRef.current.map = t.day
          matRef.current.emissiveMap = t.night
          matRef.current.roughnessMap = t.water
          matRef.current.needsUpdate = true
        }
      }
    }
    const fail = () => { /* leave null → material keeps its procedural look */ done() }
    loader.load(`${CDN}/earth-blue-marble.jpg`, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; t.day = tx; done() }, undefined, fail)
    loader.load(`${CDN}/earth-night.jpg`, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; t.night = tx; done() }, undefined, fail)
    loader.load(`${CDN}/earth-water.png`, (tx) => { t.water = tx; done() }, undefined, fail)
    return () => { alive = false }
  }, [])

  useFrame(() => {
    if (!sunRef.current) return
    const dir = sunDirection(simTime)
    sunRef.current.position.copy(dir)
  })

  const atmosphere = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color('#3ec6ff') },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        // Fresnel rim: strongest at the limb, transparent at the centre.
        float fres = 1.0 - abs(dot(vNormal, vViewDir));
        float rim = pow(fres, 3.2);
        gl_FragColor = vec4(glowColor, rim * 0.85);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }), [])

  const innerHalo = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color('#1288d8') } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float fres = 1.0 - abs(dot(vNormal, vViewDir));
        float rim = pow(fres, 4.5);
        gl_FragColor = vec4(glowColor, rim * 0.5);
      }`,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }), [])

  useEffect(() => () => { atmosphere.dispose(); innerHalo.dispose() }, [atmosphere, innerHalo])

  return (
    <group>
      {/* Key light = the Sun */}
      <directionalLight ref={sunRef} intensity={2.2} color="#fff7e8" />
      <ambientLight intensity={0.12} color="#204060" />

      {/* Globe */}
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial
          ref={matRef}
          color="#1d4ed8"
          roughness={0.85}
          metalness={0.05}
          emissive="#ffdf9e"
          emissiveIntensity={0.55}
        />
      </mesh>

      {/* Atmosphere shells */}
      <mesh material={atmosphere}>
        <sphereGeometry args={[1.045, 64, 64]} />
      </mesh>
      <mesh material={innerHalo}>
        <sphereGeometry args={[1.012, 64, 64]} />
      </mesh>
    </group>
  )
}
