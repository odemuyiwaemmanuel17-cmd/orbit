/**
 * OrbitalPulse — solar array power & battery sizing (M14).
 *
 * SIMPLIFIED MODEL, explicitly labeled in the UI:
 *  - Irradiance: SOLAR_CONSTANT_WM2 (ASTM E490) scaled by the REAL inverse
 *    square of the Meeus low-precision Earth-Sun distance (±3.44% annual) —
 *    not a blind 1 AU assumption.
 *  - Array output = S·A·η_cell·derate·cos(incidence). Ignored (disclosed):
 *    temperature spectrum and cover-degradation coupling, albedo/IR (minor
 *    for average-orbit power), partial self-shadowing, pointing losses
 *    beyond the single incidence angle.
 *  - Eclipse duty cycle comes from the VALIDATED M13 cone scan
 *    (eclipse.orbitEclipseKm): umbra -> 0 W; penumbra -> linear obscuration,
 *    whose band average is exactly 1/2 output (consistent with the M13
 *    labeled linear approximation, not an independent guess).
 *  - Battery sizing uses DESIGN-PRACTICE parameters (depth of discharge,
 *    round-trip efficiency, specific energy) with representative values;
 *    every default is labeled as representative, never claimed as a real
 *    mission's data sheet.
 */
import { SOLAR_CONSTANT_WM2, RAD_PER_DEG } from './constants.js'
import { sunDistanceAu } from './sun.js'
import { orbitEclipseKm } from './eclipse.js'
import { periodSec } from './kepler.js'

/**
 * Representative engineering defaults (labels, not per-mission truth):
 *  - Ga triple-junction III-V flight cells: 28-32% BOL in-orbit efficiency
 *  - ~5-yr LEO EOL/LOL array derate: 0.85-0.90 (radiation + micrometeoroid)
 *  - LEO Li-ion design practice: DOD 20-40% (30% typical), round trip ~95%
 *  - Orbital Li-ion cell-level specific energy: ~120-180 Wh/kg (150 typical)
 */
export const REPRESENTATIVE_DEFAULTS = {
  arrayAreaM2: 20,
  cellEfficiency: 0.30,
  degradationFactor: 0.88,
  incidenceDeg: 0,
  busLoadW: 500,
  depthOfDischarge: 0.30,
  batteryWhPerKg: 150,
  batteryRoundTripEff: 0.95,
}

/** Instantaneous array output factor (0..1) from an M13 shadow state. */
export function powerFactorForShadow(shadowState) {
  if (shadowState.region === 'UMBRA') return 0
  if (shadowState.region === 'PENUMBRA') return 1 - shadowState.obscurationPct / 100
  return 1
}

function requireFinite(name, v) {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite, got ${v}`)
}

/** Solar irradiance at Earth for a date: S = S_1AU / R_AU^2 [W/m^2]. */
export function solarFluxWm2(date = new Date()) {
  const rAu = sunDistanceAu(date)
  return SOLAR_CONSTANT_WM2 / (rAu * rAu)
}

/** Sunlit array power [W] at nominal (full-flux) illumination. */
export function sunlitArrayPowerW({
  fluxWm2, arrayAreaM2, cellEfficiency, degradationFactor, incidenceDeg = 0,
}) {
  requireFinite('fluxWm2', fluxWm2)
  requireFinite('arrayAreaM2', arrayAreaM2)
  requireFinite('cellEfficiency', cellEfficiency)
  requireFinite('degradationFactor', degradationFactor)
  requireFinite('incidenceDeg', incidenceDeg)
  if (arrayAreaM2 < 0) throw new RangeError('arrayAreaM2 must be >= 0')
  if (!(cellEfficiency > 0 && cellEfficiency <= 1)) {
    throw new RangeError('cellEfficiency must be in (0, 1] — physics bound, not a preference')
  }
  if (!(degradationFactor > 0 && degradationFactor <= 1)) {
    throw new RangeError('degradationFactor must be in (0, 1] (EOL/LOL derate <= 1)')
  }
  if (incidenceDeg < 0 || incidenceDeg > 90) {
    throw new RangeError('incidenceDeg must be within [0, 90] (past 90 the array faces away)')
  }
  return fluxWm2 * arrayAreaM2 * cellEfficiency * degradationFactor * Math.cos(incidenceDeg * RAD_PER_DEG)
}

/**
 * Per-orbit energy balance from eclipse fractions (fractions of the orbit
 * period in umbra/penumbra, from the M13 cone scan). All energies in Wh.
 *
 * Penumbra energy credit = fractionPenumbra/2: the linear obscuration ramp
 * averages to exactly half output across the band (matches M13's labeled
 * linear approximation; a quadratic exact-integral would give 1/3, and the
 * cone band is ~tens of km wide in LEO, so the choice barely matters —
 * disclosed here rather than hidden).
 */
export function orbitPowerBalanceKm({
  aKm, fractionUmbra, fractionPenumbra, busLoadW,
  sunlitPowerW, depthOfDischarge, batteryWhPerKg, batteryRoundTripEff,
}) {
  requireFinite('aKm', aKm)
  requireFinite('busLoadW', busLoadW)
  requireFinite('sunlitPowerW', sunlitPowerW)
  if (!(aKm > 0)) throw new RangeError('aKm must be positive')
  if (busLoadW < 0) throw new RangeError('busLoadW must be >= 0')
  for (const [name, f] of [['fractionUmbra', fractionUmbra], ['fractionPenumbra', fractionPenumbra]]) {
    requireFinite(name, f)
    if (f < 0 || f > 1) throw new RangeError(`${name} must be within [0, 1]`)
  }
  if (fractionUmbra + fractionPenumbra > 1) throw new RangeError('shadow fractions overlap (>1 total)')
  if (!(depthOfDischarge > 0 && depthOfDischarge <= 1)) throw new RangeError('depthOfDischarge must be in (0, 1]')
  if (!(batteryWhPerKg > 0)) throw new RangeError('batteryWhPerKg must be > 0')
  if (!(batteryRoundTripEff > 0 && batteryRoundTripEff <= 1)) throw new RangeError('batteryRoundTripEff must be in (0, 1]')

  const periodS = periodSec(aKm)
  const sunlitFraction = 1 - fractionUmbra - fractionPenumbra

  const genWh = (sunlitPowerW * (sunlitFraction + fractionPenumbra / 2) * periodS) / 3600
  const demandWh = (busLoadW * periodS) / 3600
  const margin = demandWh > 0 ? genWh / demandWh : Infinity

  // Worst single eclipse: full load through umbra; in penumbra the load is
  // short only by the half-output credit (never a negative contribution).
  const eclipseShortfallWh = (periodS / 3600)
    * (busLoadW * fractionUmbra + Math.max(busLoadW - 0.5 * sunlitPowerW, 0) * fractionPenumbra)
  const usableCapacityWh = eclipseShortfallWh / (depthOfDischarge * batteryRoundTripEff)
  const batteryMassKg = usableCapacityWh / batteryWhPerKg

  return {
    aKm, periodS, sunlitFraction,
    genWhPerOrbit: genWh,
    demandWhPerOrbit: demandWh,
    marginWhPerOrbit: margin,
    eclipseShortfallWh,
    batteryCapacityWh: usableCapacityWh,
    batteryMassKg,
  }
}

/**
 * One-call analysis: circular orbit (aKm, plane normal nU) vs frozen sun
 * direction sunU -> M13 eclipse fractions -> full power/battery balance for
 * the given array + load. Throws propagate from the validated scan
 * (sub-Earth radius, undefined plane).
 */
export function analyzeOrbitPowerKm({
  aKm, nU, sunU, date = new Date(), params = REPRESENTATIVE_DEFAULTS, steps = 360,
}) {
  const p = { ...REPRESENTATIVE_DEFAULTS, ...params }
  const eclipse = orbitEclipseKm(aKm, nU, sunU, { steps })
  const fluxWm2 = solarFluxWm2(date)
  const sunlitPowerW = sunlitArrayPowerW({
    fluxWm2, arrayAreaM2: p.arrayAreaM2, cellEfficiency: p.cellEfficiency,
    degradationFactor: p.degradationFactor, incidenceDeg: p.incidenceDeg,
  })
  const balance = orbitPowerBalanceKm({
    aKm, fractionUmbra: eclipse.fractionUmbra, fractionPenumbra: eclipse.fractionPenumbra,
    busLoadW: p.busLoadW, sunlitPowerW,
    depthOfDischarge: p.depthOfDischarge, batteryWhPerKg: p.batteryWhPerKg,
    batteryRoundTripEff: p.batteryRoundTripEff,
  })
  // Sizing law: output is linear in area, so the area that makes the
  // per-orbit energy balance exactly neutral (margin = 1) is
  // busLoad / (S·η·derate·cos(inc)·duty), duty = sunlit + penumbra/2.
  const duty = 1 - eclipse.fractionUmbra - eclipse.fractionPenumbra / 2
  const fluxPerArea = fluxWm2 * p.cellEfficiency * p.degradationFactor * Math.cos(p.incidenceDeg * RAD_PER_DEG)
  const areaForMargin1M2 = duty > 0 && fluxPerArea > 0
    ? p.busLoadW / (fluxPerArea * duty)
    : Infinity
  return {
    ...balance,
    dutyCycle: duty,
    fractionUmbra: eclipse.fractionUmbra,
    fractionPenumbra: eclipse.fractionPenumbra,
    points: eclipse.points,
    sunlitPowerW,
    fluxWm2,
    areaForMargin1M2,
    params: p,
  }
}
