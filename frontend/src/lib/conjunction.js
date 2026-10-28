/**
 * OrbitalPulse — conjunction screening & pair analysis (M19).
 *
 * Position-sampler contract: a sampler is (tMs) => {posKm, velKmS} — the
 * app wires SGP4 (sm.propagate) into it; tests wire the analytic Kepler
 * solution. The screening math itself is propagation-agnostic, so the
 * SAME code path is validated analytically.
 *
 * Honest limits (displayed in the UI, enforced in code):
 *  - TLEs carry NO covariance. A real collision probability (Pc) requires
 *    a covariance-including message (CDM) from the 18th SDS; from TLEs we
 *    can only report miss distance, time of closest approach and relative
 *    speed. Nothing here pretends otherwise.
 *  - TCA resolution = the grid step (min on grid, ±step/2 disclosed).
 *  - Screening is a 3-D ECI distance — no velocity-frame radially/
 *    in-track decomposition beyond what we can actually resolve.
 */

const v3sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const v3len = (v) => Math.hypot(v.x, v.y, v.z)

/**
 * Closest approach between two samplers over [tStartMs, tEndMs] on a
 * fixed grid. Both samplers are called at identical times (paired —
 * the only correct way to compare positions).
 */
export function screenPairKm({ samplerA, samplerB, tStartMs, tEndMs, stepS }) {
  if (!(stepS > 0)) throw new RangeError('stepS must be > 0')
  if (!(tEndMs > tStartMs)) throw new RangeError('empty screening window')
  const stepMs = stepS * 1000
  const n = Math.floor((tEndMs - tStartMs) / stepMs) + 1
  if (n > 200000) throw new RangeError(`grid too fine: ${n} samples > 200000 cap (documented limit)`)
  let miss = Infinity, tca = tStartMs, relV = 0, samples = 0, bad = 0
  for (let k = 0; k < n; k++) {
    const t = tStartMs + k * stepMs
    const a = samplerA(t), b = samplerB(t)
    samples++
    if (!a || !b || !Number.isFinite(a.posKm.x) || !Number.isFinite(b.posKm.x)
      || !Number.isFinite(a.posKm.y) || !Number.isFinite(a.posKm.z)
      || !Number.isFinite(b.posKm.y) || !Number.isFinite(b.posKm.z)) { bad++; continue }
    const d = v3len(v3sub(a.posKm, b.posKm))
    if (d < miss) {
      miss = d; tca = t
      relV = v3len({ x: a.velKmS.x - b.velKmS.x, y: a.velKmS.y - b.velKmS.y, z: a.velKmS.z - b.velKmS.z })
    }
  }
  if (miss === Infinity) {
    return { missKm: null, tcaMs: null, relVelKmS: null, samples, bad, reason: 'no valid ephemeris in window' }
  }
  return { missKm: miss, tcaMs: tca, relVelKmS: relV, samples, bad, stepS }
}

/**
 * Screen one primary against many candidates; returns pairs sorted by
 * miss distance, capped at limitPairs. candidateMeta pairs 1:1 with the
 * samplers array and is echoed into results for display.
 */
export function screenCatalogKm({ samplerPrimary, candidates, tStartMs, tEndMs, stepS, limitPairs = 25 }) {
  const out = []
  candidates.forEach((c, idx) => {
    const r = screenPairKm({ samplerA: samplerPrimary, samplerB: c.sampler, tStartMs, tEndMs, stepS })
    if (r.missKm === null) return
    out.push({ ...r, name: c.name, id: c.id ?? idx, meta: c.meta })
  })
  out.sort((p, q) => p.missKm - q.missKm)
  return out.slice(0, limitPairs)
}

/**
 * Screening severity ladder (labeled heuristic, NOT Pc): operational CDM
 * alerts use radial/in-track uncertainty; with distance-only data we use
 * miss distance banded by RELATIVE SPEED because a 1 km miss at 15 km/s
 * matters differently than at 0.1 km/s. Kept simple and disclosed.
 */
export function severityBandKm({ missKm, relVelKmS }) {
  if (missKm == null) return 'UNKNOWN'
  if (missKm < 1 && relVelKmS > 1) return 'CRITICAL'
  if (missKm < 10) return 'DANGER'
  if (missKm < 50) return 'WATCH'
  if (missKm < 200) return 'INTERESTING'
  return 'BACKGROUND'
}

/** Human-readable TCA offset from the screening start. */
export function tcaOffsetMin({ tStartMs, tcaMs }) {
  return (tcaMs - tStartMs) / 60000
}
