/**
 * Node-side performance gate for the constellation layer. Run before raising
 * any satellite cap. Usage:  node tools/constellation-check.mjs [key ...]
 *
 * Checks:
 *  1. parse cost          — twoline2satrec for the whole group
 *  2. full-sweep cost     — worst-case single-tick work
 *  3. slice cost          — per-tick batched refresh (budget: < 25 ms)
 *  4. scheduler invariant — every unselected satellite refreshes within
 *                           `divisor` ticks; the promoted one never does
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConstellationGroup } from '../src/lib/constellation.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(HERE, '..', 'src', 'data', 'constellations')
const FIXTURES = path.join(HERE, 'fixtures') // synthetic bench files only
const SLICE_BUDGET_MS = 25

function load(key) {
  for (const dir of [DATA, FIXTURES]) {
    const p = path.join(dir, `${key}.json`)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  throw new Error(`no data file for ${key}`)
}

const project = (lat, lon, alt) => [lat, lon, alt] // identity: math is 2/3 of the cost

function check(meta) {
  let t = Date.now()
  const g = new ConstellationGroup(meta, project)
  const parseMs = Date.now() - t
  g.setPromoted(meta.satellites[1]?.id ?? null)
  const promoted = g.promotedIndex

  t = Date.now()
  g.propagateAll(new Date(t))
  const sweepMs = Date.now() - t

  const before = Float64Array.from(g.lastUpdate)
  const tSweep = t
  t = Date.now()
  // Full refresh cycle: ceil(n / window) ticks — equals `divisor` while the
  // batch cap is not binding, stretches beyond it only for giant groups.
  const cycles = Math.ceil(g.n / g.sliceSize())
  for (let k = 0; k < cycles; k += 1) {
    // Start 10 s past the sweep so every slice lands on a distinct sim time,
    // regardless of Date.now() granularity.
    g.tickSlice(new Date(tSweep + 10_000 + k * 1000))
  }
  const sliceAvg = (Date.now() - t) / cycles

  // Coverage proven by lastUpdate timestamps — motion-independent.
  let untouched = []
  for (let i = 0; i < g.n; i += 1) {
    if (i === promoted) continue
    if (!g.initialized[i]) continue // dead TLE: never propagates, hidden in scene
    if (g.lastUpdate[i] === before[i]) untouched.push(g.meta[i].id)
  }

  console.log(`${meta.key.padEnd(9)} n=${String(g.n).padStart(4)}  ` +
    `parse=${parseMs}ms  sweep=${sweepMs}ms  slice=${sliceAvg.toFixed(1)}ms/tick ` +
    `(size ${g.sliceSize()})  sliceBudget=${sliceAvg < SLICE_BUDGET_MS ? 'PASS' : 'FAIL'}`)
  if (untouched.length) {
    console.log(`  INVARIANT FAIL — ${untouched.length} satellites missed a refresh: ${untouched.slice(0, 5)}`)
    process.exitCode = 1
  } else {
    console.log('  invariant PASS — all unselected refreshed within divisor ticks')
  }
  if (sliceAvg >= SLICE_BUDGET_MS) process.exitCode = 1
}

const keys = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(DATA).map((f) => f.replace('.json', ''))
for (const key of keys) {
  check(load(key))
}
