/**
 * Shared photoreal Earth material set — single source of truth for the
 * tracker scene (OrbitScene.jsx) and the cinematic landing. Extracted
 * verbatim from the validated OrbitScene implementation: same textures,
 * same pinned UV flip (tests/earthTexture.test.js), same terminator,
 * ocean glint, sunset band, cloud shadow and atmosphere shaders.
 */
import * as THREE from 'three'

export const TEX = {
  day: '/textures/earth_atmos_2048.jpg',
  night: '/textures/earth_lights_2048.png',
  ocean: '/textures/earth_specular_2048.jpg',
  clouds: '/textures/earth_clouds_1024.png',
}

let TEX_CACHE = null
export function loadEarthTextures() {
  if (TEX_CACHE) return TEX_CACHE
  const loader = new THREE.TextureLoader()
  TEX_CACHE = Promise.all([
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
  }).catch(() => { TEX_CACHE = null; return null }) // allow retry on failure
  return TEX_CACHE
}

// Narkowicz ACES filmic approximation + sRGB output, applied manually in
// the custom planet shaders so they match three's tone-mapped built-ins.
export const ACES = 'vec3 acesTonemap(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }'

export const EARTH_VERT = `
varying vec2 vUv; varying vec3 vPos;
void main() {
  vUv = uv; vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const EARTH_FRAG = `
uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uOcean;
uniform sampler2D uClouds;
uniform vec3 uSun; uniform vec3 uCam; uniform float uExposure;
varying vec2 vUv; varying vec3 vPos;
void main() {
  vec3 n = normalize(vPos);
  vec3 s = normalize(uSun);
  float ndl = dot(n, s);
  float t = smoothstep(-0.12, 0.06, ndl);              // natural-day terminator
  float twilight = exp(-pow((ndl + 0.02) * 7.5, 2.0)); // warm scattering band
  vec3 day = texture2D(uDay, vUv).rgb;
  float shadow = texture2D(uClouds, vUv).a;            // overhead cloud shadow (zero-offset approx)
  day *= mix(1.0, 0.70, shadow);
  vec3 dayCol = day * (0.05 + 1.12 * max(ndl, 0.0)) + vec3(0.015, 0.03, 0.06);
  vec3 night = texture2D(uNight, vUv).rgb;
  // city lights shine where there is no sun; faint residual under twilight
  vec3 nightCol = night * (0.30 + 0.95 * (1.0 - t)) + day * 0.012;
  vec3 col = mix(nightCol, dayCol, t);
  col += day * vec3(0.85, 0.42, 0.18) * twilight * 0.16; // copper sunset band
  float ocean = texture2D(uOcean, vUv).r;
  vec3 v = normalize(uCam - vPos);
  vec3 h = normalize(v + s);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float spec = pow(max(dot(n, h), 0.0), 120.0) * ocean * t;
  col += vec3(0.30, 0.45, 0.65) * spec * (0.55 + 0.9 * fres); // sun glint on water only
  col += vec3(0.05, 0.12, 0.25) * fres * (0.22 + 0.78 * t);   // limb airglow, subtle
  gl_FragColor = vec4(pow(acesTonemap(col * uExposure), vec3(1.0 / 2.2)), 1.0);
}`

export const CLOUD_FRAG = `
uniform sampler2D uClouds; uniform vec3 uSun; uniform float uOpacity;
uniform float uExposure;
varying vec2 vUv; varying vec3 vPos;
void main() {
  vec4 c = texture2D(uClouds, vUv);
  float ndl = dot(normalize(vPos), normalize(uSun));
  float t = smoothstep(-0.15, 0.28, ndl);
  float edge = exp(-pow(ndl * 5.5, 2.0));              // translucency glow at the terminator
  vec3 base = c.rgb * mix(0.08, 1.02, t) + vec3(0.9, 0.5, 0.25) * edge * 0.18;
  gl_FragColor = vec4(pow(acesTonemap(base * uExposure), vec3(1.0 / 2.2)),
                      c.a * uOpacity * mix(0.7, 1.0, t));
}`

const ATMO_VERT = 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); vP=normalize(position); gl_Position=projectionMatrix*mv; }'
const ATMO_FRAG = ACES + 'uniform float uStorm; uniform vec3 uSun; uniform float uExposure; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float d=dot(vP,normalize(uSun)); float f=1.0-abs(dot(vN,vV)); float dayGlow=smoothstep(-0.3,0.55,d); float tw=exp(-pow((d+0.04)*5.5,2.0)); vec3 calm=vec3(0.18,0.52,0.98); vec3 hot=vec3(1.0,0.45,0.25); vec3 c=mix(calm,hot,uStorm); c=c*mix(0.22,1.0,dayGlow)+vec3(1.0,0.52,0.22)*tw*0.55; gl_FragColor=vec4(pow(acesTonemap(c*uExposure),vec3(1.0/2.2)), pow(f,3.0)*(0.30+0.55*dayGlow+0.45*tw)*(0.55+0.35*uStorm)); }'

/** One uniform block shared by the three materials (tracker updates uSun
 *  once per frame and all layers follow). */
export function makeEarthMaterials(exposure) {
  const uniforms = {
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uCam: { value: new THREE.Vector3(0, 0, 5) },
    uExposure: { value: exposure },
  }
  const earthMat = new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT, fragmentShader: ACES + EARTH_FRAG,
    uniforms: {
      uDay: { value: null }, uNight: { value: null }, uOcean: { value: null },
      uClouds: { value: null }, ...uniforms,
    },
  })
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT, fragmentShader: ACES + CLOUD_FRAG, transparent: true,
    depthWrite: false,
    uniforms: { uClouds: { value: null }, uOpacity: { value: 0.85 }, ...uniforms },
  })
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uStorm: { value: 0 }, uSun: uniforms.uSun, uExposure: uniforms.uExposure },
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
  })
  return { uniforms, earthMat, cloudMat, atmoMat }
}

/** Assign loaded textures onto a material set (null-safe pre-load state). */
export function applyEarthTextures(mats, tex) {
  if (!tex) return
  mats.earthMat.uniforms.uDay.value = tex.day
  mats.earthMat.uniforms.uNight.value = tex.night
  mats.earthMat.uniforms.uOcean.value = tex.ocean
  mats.earthMat.uniforms.uClouds.value = tex.clouds
  mats.cloudMat.uniforms.uClouds.value = tex.clouds
}
