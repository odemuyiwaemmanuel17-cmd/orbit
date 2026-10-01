import { useEffect, useReducer } from 'react'
import { engine } from '../lib/engine.js'

/** Re-renders a component whenever the engine ticks (10 Hz) or state changes. */
export function useEngine() {
  const [, force] = useReducer((c) => c + 1, 0)
  useEffect(() => engine.subscribe(force), [])
  return engine
}
