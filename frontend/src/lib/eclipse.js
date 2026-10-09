/**
 * OrbitalPulse — eclipse geometry (M13).
 *
 * Similar-triangles umbra/penumbra cones behind the spherical Earth against
 * the validated low-precision sun ephemeris (lib/sun.js). Model (labeled
 * SIMPLIFIED CONE): circular shadow cones from R_earth, R_sun, 1 AU — the
 * small-angle cone slopes (Rs∓R)/d; penumbral "obscuration" is a LINEAR
 * approximation across the penumbra band, not the exact circle-overlap
 * integral; orbits are circular for the fraction analysis.
 *
 * Umbra apex distance Lu = R·d/(Rs − R) ≈ 1.384e6 km, so every Earth orbit
 * (r < 220,000 km) sits well inside the cone length — no apex edge cases.
 */
import { R_EARTH_MEAN_KM, SUN_RADIUS_KM, AU_KM, RAD_PER_DEG, DEG_PER_RAD } from './constants.js'
import { sunEciUnit } from './sun.js'

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export function umbraApexKm(opts = {}) {
  const R = opts.rEarthKm ?? R_EARTH_MEAN_KM
  const Rs = opts.sunRadiusKm ?? SUN_RADIUS_KM
  const d = opts.sunDistKm ?? AU_KM
  return R * d / (Rs - R)
}

/**
 * Shadow region for a point (ECI km, from Earth CENTER), given sun unit
 * vector. Returns along-axis distance into anti-sun shadow (rAnti) and the
 * perpendicular offset perp from the shadow axis, plus radii there.
 */
export function shadowStateKm(posKm, sunU, opts = {}) {
  const R = opts.rEarthKm ?? R_EARTH_MEAN_KM
  const Rs = opts.sunRadiusKm ?? SUN_RADIUS_KM
  const d = opts.sunDistKm ?? AU_KM
  const p = [posKm.x ?? posKm[0], posKm.y ?? posKm[1], posKm.z ?? posKm[2]]
  const anti = [-sunU[0], -sunU[1], -sunU[2]]
  const rAnti = dot3(p, anti)
  if (rAnti <= 0) {
    return { region: 'SUNLIT', rAntiKm: rAnti, perpKm: Math.sqrt(Math.max(dot3(p, p) - rAnti * rAnti, 0)),
      umbraRadiusKm: null, penumbraRadiusKm: null, obscurationPct: 0 }
  }
  const perpSq = Math.max(dot3(p, p) - rAnti * rAnti, 0)
  const perp = Math.sqrt(perpSq)
  const rhoU = Math.max(R - rAnti * (Rs - R) / d, 0)
  const rhoP = R + rAnti * (Rs + R) / d
  if (perp <= rhoU) return { region: 'UMBRA', rAntiKm: rAnti, perpKm: perp, umbraRadiusKm: rhoU, penumbraRadiusKm: rhoP, obscurationPct: 100 }
  if (perp <= rhoP) {
    const lin = (rhoP - perp) / (rhoP - rhoU)
    return { region: 'PENUMBRA', rAntiKm: rAnti, perpKm: perp, umbraRadiusKm: rhoU, penumbraRadiusKm: rhoP,
      obscurationPct: 100 * Math.min(1, Math.max(0, lin)) } // linear band approx, labeled
  }
  return { region: 'SUNLIT', rAntiKm: rAnti, perpKm: perp, umbraRadiusKm: rhoU, penumbraRadiusKm: rhoP, obscurationPct: 0 }
}

/**
 * Circular orbit eclipse scan: plane given by unit normal nU, sun sunU,
 * radius aKm, uniform true-angle samples. Returns umbra+penumbra fractions
 * and per-point states for the ring drawing. ±(360/steps)° grid disclosed.
 */
export function orbitEclipseKm(aKm, nU, sunU, { steps = 360 } = {}) {
  if (!(aKm > R_EARTH_MEAN_KM)) throw new RangeError('orbit radius must exceed Earth radius')
  const nLen = Math.hypot(...nU)
  if (nLen < 1e-12) throw new RangeError('plane normal undefined')
  const n = nU.map((c) => c / nLen)
  // in-plane basis: pick axis least parallel to n
  const ax = n.map(Math.abs).indexOf(Math.min(...n.map(Math.abs)))
  const e = [0, 0, 0]; e[ax] = 1
  const u1 = [e[1] * n[2] - e[2] * n[1], e[2] * n[0] - e[0] * n[2], e[0] * n[1] - e[1] * n[0]]
  const u1Len = Math.hypot(...u1)
  const x = u1.map((c) => c / u1Len)
  const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]]
  const pts = []
  let inUmbra = 0, inPen = 0
  for (let k = 0; k < steps; k++) {
    const th = (k / steps) * 2 * Math.PI
    const pos = [0, 1, 2].map((i) => aKm * (Math.cos(th) * x[i] + Math.sin(th) * y[i]))
    const st = shadowStateKm(pos, sunU)
    if (st.region === 'UMBRA') inUmbra += 1
    else if (st.region === 'PENUMBRA') inPen += 1
    pts.push({ angleDeg: th * DEG_PER_RAD, ...st, posKm: pos })
  }
  return { fractionUmbra: inUmbra / steps, fractionPenumbra: inPen / steps, points: pts, steps, aKm }
}

/**
 * Cylindrical-shadow analytic reference (textbook limit): eclipse fraction =
 * asin(R/a)/pi for an orbit lying in the sun plane. The cone model must
 * approach it as (Rs−R)/d·a -> 0; used as the cross-check, NOT the shipped
 * number (cone is more accurate).
 */
export function cylindricalEclipseFraction(aKm) {
  return Math.asin(R_EARTH_MEAN_KM / aKm) / Math.PI
}

export { sunEciUnit }
