/**
 * Adaptive rendering quality presets (V3 phase 7).
 *
 * Chosen honestly: the scene's expensive surfaces are the Earth shader
 * fill-rate, the cloud shell, atmosphere shell, orbit glow passes and the
 * device pixel ratio. Presets scale those WITHOUT touching any physics —
 * propagation, coordinate transforms and simulation clock are identical in
 * every preset. Persisted in localStorage; low-power devices default to
 * BALANCED via a cheap heuristic (hardwareConcurrency / deviceMemory).
 */
export const PRESETS = {
  HIGH: { label: 'HIGH', dpr: 1.75, clouds: true, glowPass: true, earthSeg: 96, exposure: 1.05 },
  BALANCED: { label: 'BALANCED', dpr: 1.25, clouds: true, glowPass: false, earthSeg: 64, exposure: 1.05 },
  LOW: { label: 'LOW', dpr: 1, clouds: false, glowPass: false, earthSeg: 48, exposure: 1.1 },
}

const KEY = 'orbitalpulse.render-quality'

export function suggestedPreset() {
  if (typeof window === 'undefined') return 'HIGH'
  const cores = window.navigator?.hardwareConcurrency ?? 8
  const mem = window.navigator?.deviceMemory ?? 4
  if (cores <= 4 || mem <= 3) return 'LOW'
  if (cores <= 8) return 'BALANCED'
  return 'HIGH'
}

export function loadPreset() {
  if (typeof window === 'undefined') return 'HIGH'
  const v = window.localStorage?.getItem(KEY)
  return PRESETS[v] ? v : suggestedPreset()
}

export function savePreset(name) {
  if (PRESETS[name]) window.localStorage?.setItem(KEY, name)
}
