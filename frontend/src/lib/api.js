/** Thin API client for the OrbitalPulse FastAPI backend. */

const BASE = '/api'

async function request(path, params = {}, timeoutMs = 8000) {
  const url = new URL(BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}))
      throw new Error(`${resp.status}: ${detail.detail ?? resp.statusText}`)
    }
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}

export const fetchCatalog = (refresh = false) =>
  request('/satellites', refresh ? { refresh: 'true' } : {})

export const fetchPositions = (timestampIso) =>
  request('/satellites/positions', { timestamp: timestampIso })

export const fetchOrbit = (satId, minutes = 90, steps = 180, timestampIso) =>
  request(`/satellites/${encodeURIComponent(satId)}/orbit`,
          { minutes, steps, timestamp: timestampIso })

export const fetchHealth = () => request('/health', {}, 4000)
