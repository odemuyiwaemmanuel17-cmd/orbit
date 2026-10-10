/**
 * Static wiring guard (born from a real hotfix): the V3 preset work shipped
 * a runtime "PRESETS is not defined" crash because an import edit failed
 * silently and no test executed the component. Build tools don't flag
 * undefined identifiers. This test scans every src module, strips comments
 * and strings, and fails when an ALL-CAPS identifier is used via property
 * or index access (`NAME.` / `NAME[`) without a matching import or
 * declaration anywhere in that file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.jsx?$/.test(e)) out.push(p)
  }
  return out
}

function stripNoise(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ') // line comments (keep URLs)
    .replace(/`(?:\\.|[^`\\])*`/gs, '``') // template literals (GLSL etc.)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''") // string literals
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/>([^<>]*)<\//g, '></') // JSX children (up to a closing tag only)
}

const GLOBALS = new Set(['Math', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Promise', 'Date', 'RegExp', 'Error', 'RangeError', 'Symbol',
  'BigInt', 'URL', 'URLSearchParams', 'Map', 'Set', 'WeakMap', 'Proxy',
  'Reflect', 'Intl', 'NaN', 'Infinity', 'process'])

describe('module wiring: capitalized identifiers used via . or [] are defined', () => {
  it('every src module resolves its CAPS references (imports or declarations)', () => {
    const problems = []
    for (const file of walk(SRC)) {
      const raw = readFileSync(file, 'utf8')
      const code = stripNoise(raw)
      const defined = new Set()
      // imports parsed from the RAW source (module path strings intact)
      for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s*['"][^'"]+['"]/g)) {
        for (const name of m[1].replace(/[{}]/g, ' ').split(/[,\s]+/)) {
          if (/^[A-Za-z_$]/.test(name)) defined.add(name)
        }
      }
      for (const m of raw.matchAll(/\bimport\s*\(\s*['"][^'"]+['"]\s*\)/g)) void m // dynamic: paths only
      // declarations anywhere: const/let/var/function/class
      for (const m of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
        defined.add(m[1])
      }
      // usage scan on stripped code; root identifiers only (skip `.MEMBER`)
      for (const m of code.matchAll(/(^|[^.\w$])([A-Z][A-Za-z0-9_]{2,})\s*[.[]/g)) {
        const id = m[2]
        if (GLOBALS.has(id) || defined.has(id)) continue
        if (/^[A-Z]+$/.test(id) && new RegExp(`\\bconst\\s+${id}\\b|[,{[]\\s*${id}\\s*[,:}]`).test(code)) continue
        problems.push(`${relative(SRC, file)}: ${id} used but never imported/declared`)
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
})
