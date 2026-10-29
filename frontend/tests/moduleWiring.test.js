/**
 * Static wiring guard (born from TWO real hotfixes):
 *  1. the V3 preset work shipped a runtime "PRESETS is not defined" crash
 *     (identifier used via `NAME.` — caught by rule 1 below);
 *  2. M18 shipped LabsIndexPage with `icon: SunMedium` while the lucide
 *     import line had lost SunMedium — a BARE value reference the first
 *     rule never looked at (rule 2 below closes that class).
 * Build tools (esbuild/vite) do not flag undefined module-scope
 * identifiers, and vitest-node never mounts these components, so this
 * static scan is the only net. It strips comments/strings/JSX children,
 * collects every import/declaration per file, and fails on capitalized
 * identifiers that resolve to nothing in their own module.
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

/**
 * Strip JSX TEXT CHILDREN (prose) while keeping tags, expressions and all
 * JS code intact — including JSX nested inside {expression} children
 * (the `{cond && <p>prose</p>}` case). A frame stack walks elements and
 * expressions; text inside elements becomes spaces, everything else is
 * copied verbatim. Comparisons are safe: a tag token must start with
 * `<Name`, `</Name`, `<>`, and end at the first `>`.
 */
function stripJsxText(code) {
  // brace-aware tag scanner: `>` only ends a tag OUTSIDE {} (attributes
  // like value={x > y ? 1 : 2} would otherwise truncate the tag token)
  const tagAt = (j) => {
    if (code[j] !== '<') return null
    let k = j + 1
    let closing = false
    if (code[k] === '/') { closing = true; k += 1 }
    const nm = /^[A-Za-z][\w.]*/.exec(code.slice(k))
    let end = k
    if (nm) end = k + nm[0].length
    else if (!closing || code[k] !== '>') return null // `<>` ok, `< x` not a tag
    let bal = 0
    let quote = null
    while (end < code.length) {
      const c = code[end]
      if (quote) { if (c === '\\') end += 1; else if (c === quote) quote = null; end += 1; continue }
      if (c === '"' || c === "'") { quote = c; end += 1; continue }
      if (c === '{') bal += 1
      else if (c === '}') bal -= 1
      else if (c === '>' && bal <= 0) {
        return { text: code.slice(j, end + 1), closing, selfClose: code[end - 1] === '/' }
      }
      end += 1
    }
    return null
  }
  let out = ''
  let i = 0
  const stack = [{ kind: 'code' }]
  const top = () => stack[stack.length - 1]
  const pop = () => { if (stack.length > 1) stack.pop() }
  while (i < code.length) {
    const f = top()
    const ch = code[i]
    if (f.kind === 'children') {
      // bal starts at 1: the opening `{` is consumed right here
      if (ch === '{') { stack.push({ kind: 'expr', bal: 1 }); out += ch; i += 1; continue }
      if (ch === '<') {
        const t = tagAt(i)
        if (t) {
          out += t.text; i += t.text.length
          if (t.closing) pop()
          else if (!t.selfClose) stack.push({ kind: 'children' })
          continue
        }
      }
      out += ' '; i += 1
      continue
    }
    if (f.kind === 'expr') {
      if (ch === '{') { f.bal += 1; out += ch; i += 1; continue }
      if (ch === '}') {
        f.bal -= 1; out += ch; i += 1
        if (f.bal <= 0) pop()
        continue
      }
      if (ch === '<') {
        const t = tagAt(i)
        if (t) {
          out += t.text; i += t.text.length
          if (t.closing) pop()
          else if (!t.selfClose) stack.push({ kind: 'children' })
          continue
        }
      }
      out += ch; i += 1
      continue
    }
    // code frame
    if (ch === '<') {
      const t = tagAt(i)
      if (t) {
        out += t.text; i += t.text.length
        if (!t.closing && !t.selfClose) stack.push({ kind: 'children' })
        continue
      }
    }
    out += ch; i += 1
  }
  return out
}

function stripNoise(code) {
  return stripJsxText(code
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ') // line comments (keep URLs)
    .replace(/`(?:\\.|[^`\\])*`/gs, '``') // template literals (GLSL etc.)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''") // string literals
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""'))
}

const GLOBALS = new Set(['Math', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Promise', 'Date', 'RegExp', 'Error', 'RangeError', 'TypeError',
  'SyntaxError', 'EvalError', 'URIError', 'Symbol', 'BigInt',
  'URL', 'URLSearchParams', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy',
  'Reflect', 'Intl', 'NaN', 'Infinity', 'process', 'globalThis',
  'Float64Array', 'Float32Array', 'Int8Array', 'Uint8Array',
  'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array',
  'Uint32Array', 'BigInt64Array', 'BigUint64Array', 'ArrayBuffer', 'DataView',
  'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal',
  'EventTarget', 'CustomEvent', 'Event', 'Blob', 'File', 'FileReader',
  'Headers', 'Request', 'Response', 'FormData', 'WebSocket', 'Worker',
  'XMLHttpRequest', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'Image', 'Audio', 'Performance', 'Crypto', 'structuredClone',
  'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'document', 'window',
  'navigator', 'localStorage', 'fetch'])

/** Imports (from RAW source, paths intact) + declarations + destructurings. */
function collectDefined(raw, code) {
  const defined = new Set()
  for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s*['"][^'"]+['"]/g)) {
    for (const name of m[1].replace(/[{}*]/g, ' ').split(/[,\s]+/)) {
      if (/^[A-Za-z_$]/.test(name) && name !== 'as') defined.add(name)
    }
  }
  for (const m of raw.matchAll(/export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    defined.add(m[1])
  }
  for (const m of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    defined.add(m[1])
  }
  // multi-declarator chains: const a = x, B = y — capture B (depth-aware,
  // stop at the first depth-0 `;` or newline)
  for (const m of code.matchAll(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*/g)) {
    let j = m.index + m[0].length
    let depth = 0
    while (j < code.length) {
      const c = code[j]
      if (c === '(' || c === '[' || c === '{') depth += 1
      else if (c === ')' || c === ']' || c === '}') depth -= 1
      else if (depth === 0 && (c === ';' || c === '\n')) break
      else if (depth === 0 && c === ',') {
        const nm = /^\s*([A-Za-z_$][\w$]*)\s*=/.exec(code.slice(j + 1))
        if (!nm) break
        defined.add(nm[1])
        j += nm[0].length
        continue
      }
      j += 1
    }
  }
  // destructured names: const { a, b: c } = ... / const [x, y] = ...
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = (part.includes(':') ? part.split(':')[1] : part).trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
    }
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
    }
  }
  // destructured and plain PARAMETER names: f(({ a, b: C }) => ...),
  // function f({ X }) {}, [Twitter, Github].map((Icon, i) => ...)
  const addPatternNames = (paramList) => {
    for (const b of paramList.matchAll(/[\{[]([^{}[\]]*)[\}\]]/g)) {
      for (const part of b[1].split(',')) {
        const seg = part.split(':')[1] ?? part
        const name = seg.split('=')[0].trim()
        if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
      }
    }
    for (const part of paramList.replace(/\{[^{}]*\}/g, ' ').replace(/\[[^[\]]*\]/g, ' ').split(',')) {
      const name = part.split('=')[0].trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
    }
  }
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) addPatternNames(m[1])
  for (const m of code.matchAll(/\bfunction\s*[\w$]*\s*\(([^()]*)\)/g)) addPatternNames(m[1])
  return defined
}

describe('module wiring: capitalized identifiers used via . or [] are defined', () => {
  it('every src module resolves its CAPS references (imports or declarations)', () => {
    const problems = []
    for (const file of walk(SRC)) {
      const raw = readFileSync(file, 'utf8')
      const code = stripNoise(raw)
      const defined = collectDefined(raw, code)
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

describe('module wiring: bare value references resolve (SunMedium class)', () => {
  it('every PascalCase/CONSTANT identifier used as a VALUE is imported or declared', () => {
    const problems = []
    for (const file of walk(SRC)) {
      const raw = readFileSync(file, 'utf8')
      const code = stripNoise(raw)
      const defined = collectDefined(raw, code)
      const seen = new Set()
      // bare identifier NOT in member-access or key position:
      //   icon: SunMedium,   [Aestus, X],   fn(NAME),   <Comp />,  { SHORTHAND }
      for (const m of code.matchAll(/(^|[^.\w$"'`])([A-Z][A-Za-z0-9_]{3,})(\s*:)?/g)) {
        const id = m[2]
        if (m[3]) continue // object key / label position, not a value
        if (GLOBALS.has(id) || defined.has(id)) continue
        if (seen.has(id)) continue
        seen.add(id)
        problems.push(`${relative(SRC, file)}: ${id} used as a value but never imported/declared`)
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
})
