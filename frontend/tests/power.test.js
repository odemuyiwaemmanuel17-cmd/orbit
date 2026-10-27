import { describe, it, expect } from 'vitest'
import {
  REPRESENTATIVE_DEFAULTS, solarFluxWm2, sunlitArrayPowerW, powerFactorForShadow,
  orbitPowerBalanceKm, analyzeOrbitPowerKm,
} from '../src/lib/power.js'
import { sunDistanceAu } from '../src/lib/sun.js'
import { SOLAR_CONSTANT_WM2 } from '../src/lib/constants.js'
import { periodSec } from '../src/lib/kepler.js'
import { cylindricalEclipseFraction, umbraApexKm, orbitEclipseKm } from '../src/lib/eclipse.js'

const PERIOD_6921 = periodSec(6921) // ~500 km circular, seconds

describe('sunDistanceAu — Meeus low-precision Earth-Sun distance', () => {
  it('stays inside the real perihelion/aphelion envelope (0.983–1.017 AU)', () => {
    for (let d = 0; d < 365; d += 7) {
      const r = sunDistanceAu(new Date(Date.UTC(2026, 0, 4 + d)))
      expect(r).toBeGreaterThan(0.983)
      expect(r).toBeLessThan(1.017)
    }
  })
  it('is near perihelion in early January and near aphelion in early July', () => {
    const jan = sunDistanceAu(new Date(Date.UTC(2026, 0, 3)))
    const jul = sunDistanceAu(new Date(Date.UTC(2026, 6, 4)))
    expect(jan).toBeLessThan(0.985)  // textbook perihelion ~0.9833 AU
    expect(jul).toBeGreaterThan(1.015) // aphelion ~1.0167 AU
    // The ±3.4% flux modulation this drives must be visible in the array flux:
    expect(solarFluxWm2(new Date(Date.UTC(2026, 0, 3)))
      / solarFluxWm2(new Date(Date.UTC(2026, 6, 4)))).toBeGreaterThan(1.06)
  })
  it('scales the solar constant by the exact inverse square', () => {
    const date = new Date(Date.UTC(2026, 9, 27, 12, 0, 0))
    const r = sunDistanceAu(date)
    expect(solarFluxWm2(date)).toBeCloseTo(SOLAR_CONSTANT_WM2 / (r * r), 9)
  })
})

describe('sunlitArrayPowerW — S·A·η·derate·cos(incidence)', () => {
  const base = { fluxWm2: 1361, arrayAreaM2: 20, cellEfficiency: 0.30,
    degradationFactor: 0.88, incidenceDeg: 0 }
  it('matches the hand-computed product', () => {
    expect(sunlitArrayPowerW(base)).toBeCloseTo(1361 * 20 * 0.30 * 0.88, 6)
  })
  it('applies the cosine incidence loss exactly (60° halves output)', () => {
    expect(sunlitArrayPowerW({ ...base, incidenceDeg: 60 }))
      .toBeCloseTo(0.5 * sunlitArrayPowerW(base), 9)
  })
  it('rejects unphysical efficiency, derate, area and incidence', () => {
    expect(() => sunlitArrayPowerW({ ...base, cellEfficiency: 1.2 })).toThrow(RangeError)
    expect(() => sunlitArrayPowerW({ ...base, cellEfficiency: 0 })).toThrow(RangeError)
    expect(() => sunlitArrayPowerW({ ...base, degradationFactor: 1.5 })).toThrow(RangeError)
    expect(() => sunlitArrayPowerW({ ...base, arrayAreaM2: -1 })).toThrow(RangeError)
    expect(() => sunlitArrayPowerW({ ...base, incidenceDeg: 91 })).toThrow(RangeError)
    expect(() => sunlitArrayPowerW({ ...base, fluxWm2: NaN })).toThrow(TypeError)
  })
})

describe('powerFactorForShadow — instant output vs M13 shadow state', () => {
  it('maps SUNLIT -> 1, UMBRA -> 0, PENUMBRA -> 1 - obscuration', () => {
    expect(powerFactorForShadow({ region: 'SUNLIT', obscurationPct: 0 })).toBe(1)
    expect(powerFactorForShadow({ region: 'UMBRA', obscurationPct: 100 })).toBe(0)
    expect(powerFactorForShadow({ region: 'PENUMBRA', obscurationPct: 40 })).toBeCloseTo(0.6, 12)
  })
})

describe('orbitPowerBalanceKm — per-orbit energy accounting', () => {
  it('reduces to the pure sunlit case when there is no shadow', () => {
    const b = orbitPowerBalanceKm({
      aKm: 6921, fractionUmbra: 0, fractionPenumbra: 0, busLoadW: 500,
      sunlitPowerW: 1000, depthOfDischarge: 0.3, batteryWhPerKg: 150, batteryRoundTripEff: 0.95,
    })
    expect(b.genWhPerOrbit).toBeCloseTo(1000 * PERIOD_6921 / 3600, 6)
    expect(b.demandWhPerOrbit).toBeCloseTo(500 * PERIOD_6921 / 3600, 6)
    expect(b.marginWhPerOrbit).toBeCloseTo(2, 12)
    expect(b.eclipseShortfallWh).toBe(0)
    expect(b.batteryCapacityWh).toBe(0)
  })
  it('credits the penumbra at exactly half output (linear ramp average)', () => {
    // full-orbit penumbra: gen = P * 0.5 * T/3600; shortfall = (bus - 0.5P)+ * T/3600
    const b = orbitPowerBalanceKm({
      aKm: 6921, fractionUmbra: 0, fractionPenumbra: 1, busLoadW: 500,
      sunlitPowerW: 1000, depthOfDischarge: 0.3, batteryWhPerKg: 150, batteryRoundTripEff: 0.95,
    })
    expect(b.genWhPerOrbit).toBeCloseTo(1000 * 0.5 * PERIOD_6921 / 3600, 6)
    expect(b.eclipseShortfallWh).toBeCloseTo((500 - 500) * PERIOD_6921 / 3600, 9) // exactly zero at 0.5P = bus
    const c = orbitPowerBalanceKm({
      aKm: 6921, fractionUmbra: 0.34, fractionPenumbra: 0.02, busLoadW: 500,
      sunlitPowerW: 800, depthOfDischarge: 0.3, batteryWhPerKg: 150, batteryRoundTripEff: 0.95,
    })
    const T = PERIOD_6921
    expect(c.genWhPerOrbit).toBeCloseTo(800 * (1 - 0.34 - 0.01) * T / 3600, 6)
    expect(c.eclipseShortfallWh)
      .toBeCloseTo(T / 3600 * (500 * 0.34 + Math.max(500 - 0.5 * 800, 0) * 0.02), 9)
    expect(c.batteryCapacityWh).toBeCloseTo(c.eclipseShortfallWh / (0.3 * 0.95), 9)
    expect(c.batteryMassKg).toBeCloseTo(c.batteryCapacityWh / 150, 12)
  })
  it('rejects overlapping shadow fractions and unphysical battery params', () => {
    const ok = { aKm: 6921, busLoadW: 10, sunlitPowerW: 10,
      depthOfDischarge: 0.3, batteryWhPerKg: 150, batteryRoundTripEff: 0.95 }
    expect(() => orbitPowerBalanceKm({ ...ok, fractionUmbra: 0.7, fractionPenumbra: 0.5 }))
      .toThrow(/overlap/)
    expect(() => orbitPowerBalanceKm({ ...ok, fractionUmbra: 0, fractionPenumbra: -0.1 }))
      .toThrow(RangeError)
    expect(() => orbitPowerBalanceKm({ ...ok, fractionUmbra: 0, fractionPenumbra: 0, depthOfDischarge: 0 }))
      .toThrow(RangeError)
    expect(() => orbitPowerBalanceKm({ ...ok, fractionUmbra: 0, fractionPenumbra: 0, batteryWhPerKg: 0 }))
      .toThrow(RangeError)
  })
})

describe('analyzeOrbitPowerKm — end-to-end against the validated M13 scan', () => {
  const sunU = [1, 0, 0]
  const fixedDate = new Date(Date.UTC(2026, 0, 3)) // perihelion: known flux
  const p = { ...REPRESENTATIVE_DEFAULTS, arrayAreaM2: 20, busLoadW: 500 }

  it('β=90° (plane normal at the sun) never eclipses: full-duty generation', () => {
    const r = analyzeOrbitPowerKm({ aKm: 6921, nU: sunU, sunU, date: fixedDate, params: p })
    expect(r.fractionUmbra).toBe(0)
    expect(r.fractionPenumbra).toBe(0)
    expect(r.dutyCycle).toBe(1)
    expect(r.marginWhPerOrbit).toBeCloseTo(r.sunlitPowerW / 500, 9)
    expect(r.batteryMassKg).toBe(0)
  })

  it('β=0° LEO umbra fraction matches the analytic cone root within the 1° grid', () => {
    const r = analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 1], sunU, date: fixedDate, params: p })
    const k = (695700 - 6371) / 1.495978707e8
    const psiE = Math.asin(6371 / (6921 * Math.hypot(1, k))) - Math.atan(k)
    expect(Math.abs(r.fractionUmbra - psiE / Math.PI)).toBeLessThan(0.006) // 1° scan quantization
    expect(r.fractionUmbra).toBeGreaterThan(0.3)
    expect(r.fractionUmbra).toBeLessThan(0.4)
  })

  it('required array area is independent of installed area and equals the sizing law', () => {
    const a = analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 1], sunU, date: fixedDate, params: p })
    const b = analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 1], sunU, date: fixedDate,
      params: { ...p, arrayAreaM2: 40 } })
    expect(a.areaForMargin1M2).toBeCloseTo(b.areaForMargin1M2, 9)
    // margin-neutral by construction: put the sized area back into the model
    const sized = analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 1], sunU, date: fixedDate,
      params: { ...p, arrayAreaM2: a.areaForMargin1M2 } })
    expect(sized.marginWhPerOrbit).toBeCloseTo(1, 6)
  })

  it('battery mass shrinks monotonically as beta opens (real high-beta power hygiene)', () => {
    const massAt = (betaDeg) => {
      const b = betaDeg * Math.PI / 180
      // normal rotating from in-sun-plane (β=0) to facing the sun (β=90)
      const nU = [Math.sin(b), 0, Math.cos(b)]
      return analyzeOrbitPowerKm({ aKm: 6921, nU, sunU, date: fixedDate, params: p }).batteryMassKg
    }
    // Steps chosen >= 30° apart: the 1° scan grid (2/360 quantization)
    // cannot resolve the sub-0.5pp umbra change between β=0 and β=10.
    expect(massAt(30)).toBeLessThan(massAt(0))
    expect(massAt(60)).toBeLessThan(massAt(30))
    expect(massAt(80)).toBeCloseTo(0, 6) // beyond the cone half-angle: fully sunlit
  })

  it('generation is exactly linear in installed area (model self-consistency)', () => {
    const half = analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 1], sunU, date: fixedDate, params: p })
    const dbl = analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 1], sunU, date: fixedDate,
      params: { ...p, arrayAreaM2: 40 } })
    expect(dbl.sunlitPowerW).toBeCloseTo(2 * half.sunlitPowerW, 9)
    expect(dbl.genWhPerOrbit).toBeCloseTo(2 * half.genWhPerOrbit, 6)
  })

  it('uses the same scan as the eclipse lab (no shadow model duplication)', () => {
    const scan = orbitEclipseKm(6921, [0, 0, 1], sunU, { steps: 360 })
    const r = analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 1], sunU, date: fixedDate, params: p })
    expect(r.fractionUmbra).toBe(scan.fractionUmbra)
    expect(r.fractionPenumbra).toBe(scan.fractionPenumbra)
  })

  it('propagates M13 guards on degenerate orbits', () => {
    expect(() => analyzeOrbitPowerKm({ aKm: 5000, nU: [0, 0, 1], sunU, date: fixedDate, params: p }))
      .toThrow(/exceed Earth radius/)
    expect(() => analyzeOrbitPowerKm({ aKm: 6921, nU: [0, 0, 0], sunU, date: fixedDate, params: p }))
      .toThrow(/plane normal/)
  })

  it('cone-vs-cylindrical cross-check still holds through the power path (GEO duty)', () => {
    // GEO β=0: cone umbra fraction is essentially the cylindrical limit;
    // power margin at defaults must therefore be sane, not NaN.
    const aG = 42164
    const r = analyzeOrbitPowerKm({ aKm: aG, nU: [0, 0, 1], sunU, date: fixedDate,
      params: { ...p, busLoadW: 1200 } })
    const cyl = cylindricalEclipseFraction(aG)
    expect(Math.abs(r.fractionUmbra - cyl)).toBeLessThan(0.01)
    expect(r.genWhPerOrbit).toBeGreaterThan(0)
    expect(Number.isFinite(r.batteryCapacityWh)).toBe(true)
    expect(umbraApexKm()).toBeGreaterThan(aG) // still deep inside the cone
  })
})
