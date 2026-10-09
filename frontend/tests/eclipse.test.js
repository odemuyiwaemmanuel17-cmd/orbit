/**
 * M13 eclipse validation: sun-ephemeris regression pins (refactor safety),
 * cone geometry identities, orbit-scan fraction vs independent analytic
 * cone root, day-side/normal cases, penumbra band behavior.
 */
import { describe, expect, it } from 'vitest'
import { sunDirection } from '../src/lib/coords.js'
import { sunEciUnit } from '../src/lib/sun.js'
import {
  shadowStateKm, umbraApexKm, orbitEclipseKm, cylindricalEclipseFraction,
} from '../src/lib/eclipse.js'
import { R_EARTH_MEAN_KM, SUN_RADIUS_KM, AU_KM } from '../src/lib/constants.js'

describe('sun ephemeris regression pins (extracted formula must be identical)', () => {
  it('scene sun direction matches pre-refactor reference vectors', () => {
    const pins = [
      ['2026-03-20T12:00:00Z', [9.99469644e-1, -7.58293770e-4, 3.25554139e-2]],
      ['2026-06-21T00:00:00Z', [-9.17488100e-1, 3.97703809e-1, -6.87502385e-3]],
      ['2026-12-21T18:00:00Z', [-7.26163477e-3, -3.97708475e-1, -9.17483099e-1]],
    ]
    for (const [d, v] of pins) {
      const s = sunDirection(new Date(d))
      for (let i = 0; i < 3; i++) expect(s.toArray()[i]).toBeCloseTo(v[i], 8)
    }
  })
  it('ECI z-component = sin(dec) invariant under the GMST rotation (Dec 21: -0.397708)', () => {
    const u = sunEciUnit(new Date('2026-12-21T18:00:00Z'))
    expect(u[2]).toBeCloseTo(-3.97708475e-1, 8)
    expect(Math.hypot(...u)).toBeCloseTo(1, 12)
  })
  it('June solstice: dec = +eps ~ +23.44 deg, so z = sin(dec) ~ 0.3977', () => {
    const u = sunEciUnit(new Date('2026-06-21T00:00:00Z'))
    expect(u[2]).toBeCloseTo(Math.sin(23.439 * Math.PI / 180), 3)
  })
})

describe('shadow cone geometry', () => {
  const SUN = [1, 0, 0]
  it('umbra apex = R*d/(Rs - R) ~ 1.383e6 km (well beyond any Earth orbit)', () => {
    const ref = R_EARTH_MEAN_KM * AU_KM / (SUN_RADIUS_KM - R_EARTH_MEAN_KM)
    expect(umbraApexKm()).toBeCloseTo(ref, 6)
    expect(ref).toBeGreaterThan(1.3e6)
    expect(ref).toBeLessThan(1.5e6)
  })
  it('axis point anti-sunward is UMBRA; day side is SUNLIT', () => {
    const inShadow = shadowStateKm({ x: -1000, y: 0, z: 0 }, SUN)
    expect(inShadow.region).toBe('UMBRA')
    expect(inShadow.obscurationPct).toBe(100)
    const day = shadowStateKm({ x: 7000, y: 0, z: 0 }, SUN)
    expect(day.region).toBe('SUNLIT')
    expect(day.rAntiKm).toBeLessThan(0)
  })
  it('cone radii match hand-computed similar-triangle values at r = 6771', () => {
    const r = 6771
    const rhoU = R_EARTH_MEAN_KM - r * (SUN_RADIUS_KM - R_EARTH_MEAN_KM) / AU_KM
    const rhoP = R_EARTH_MEAN_KM + r * (SUN_RADIUS_KM + R_EARTH_MEAN_KM) / AU_KM
    // the penumbral band is only ~63 km wide here — put the point mid-band
    const yMid = (rhoU + rhoP) / 2
    const st = shadowStateKm({ x: -r, y: yMid, z: 0 }, SUN)
    expect(st.umbraRadiusKm).toBeCloseTo(rhoU, 6)
    expect(st.penumbraRadiusKm).toBeCloseTo(rhoP, 6)
    expect(st.perpKm).toBeCloseTo(yMid, 6)
    expect(st.region).toBe('PENUMBRA')
    // midway through the band, linear obscuration is ~50%
    expect(st.obscurationPct).toBeCloseTo(50, 6)
    // a point at 0.5r is deep inside the umbra cone (perp < rhoU)
    expect(shadowStateKm({ x: -r, y: 0.5 * r, z: 0 }, SUN).region).toBe('UMBRA')
    // linear band approximation is monotone: closer to umbra edge = higher obscuration
    const a = shadowStateKm({ x: -r, y: rhoP - 1, z: 0 }, SUN)
    const b = shadowStateKm({ x: -r, y: rhoU + 1, z: 0 }, SUN)
    expect(b.obscurationPct).toBeGreaterThan(a.obscurationPct)
    expect(b.obscurationPct).toBeLessThan(100)
  })
})

describe('orbit eclipse fractions (cone vs independent analytic root)', () => {
  const SUN = [1, 0, 0]
  const k = (SUN_RADIUS_KM - R_EARTH_MEAN_KM) / AU_KM
  it('sun-plane equatorial orbit: scanned umbra fraction matches the analytic cone root', () => {
    const a = 6771
    const psiE = Math.asin(R_EARTH_MEAN_KM / (a * Math.hypot(1, k))) - Math.atan(k)
    const analytic = psiE / Math.PI
    const res = orbitEclipseKm(a, [0, 0, 1], SUN, { steps: 720 })
    // 0.5-deg grid: boundary placement limits us to ~5e-3 (2 edges x half step)
    expect(res.fractionUmbra).toBeCloseTo(analytic, 2)
    // the penumbral band is THIN (that is real physics): > 0 and < umbra
    expect(res.fractionPenumbra).toBeGreaterThan(0)
    expect(res.fractionPenumbra).toBeLessThan(res.fractionUmbra)
    // cylindrical textbook reference stays within half a percent
    expect(Math.abs(cylindricalEclipseFraction(a) - analytic)).toBeLessThan(0.005)
  })
  it('polar-at-equinox (plane normal along sun): NEVER eclipsed', () => {
    const res = orbitEclipseKm(7000, [1, 0, 0], SUN)
    expect(res.fractionUmbra).toBe(0)
    expect(res.fractionPenumbra).toBe(0)
    for (const p of res.points) expect(p.region).toBe('SUNLIT')
  })
  it('GEO at equinox: eclipsed band exists but is far shorter than LEO', () => {
    const leo = orbitEclipseKm(6771, [0, 0, 1], SUN).fractionUmbra
    const geo = orbitEclipseKm(42165, [0, 0, 1], SUN).fractionUmbra
    expect(geo).toBeLessThan(leo)
    expect(geo).toBeGreaterThan(0)
    expect(geo * 2 * Math.PI * 42165 / 3.0747 / 3600).toBeGreaterThan(0.3) // hours in umbra sanity
  })
  it('rejects impossible inputs', () => {
    expect(() => orbitEclipseKm(5000, [0, 0, 1], SUN)).toThrow(RangeError)
    expect(() => orbitEclipseKm(7000, [0, 0, 0], SUN)).toThrow(RangeError)
  })
})
