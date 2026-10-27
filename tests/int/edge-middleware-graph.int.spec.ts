import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the edge (middleware) bundle. Next compiles every module
 * reachable from `src/middleware.ts` for the edge runtime, including dynamic
 * `import()` targets, so one node-only import anywhere on that graph breaks the
 * Cloudflare build ("Reading from node:crypto is not handled by plugins").
 *
 * This walks the static and dynamic import graph of the middleware and fails if
 * it reaches the Drizzle schema or the D1 connect module, which pull in the
 * node-only engine. Type-only imports are erased and are not followed.
 */

const SRC = resolve(__dirname, '../../src')
const FORBIDDEN = [resolve(SRC, 'cms/db/connect.ts'), resolve(SRC, 'cms/db/schema/index.ts')]
// Value imports, re-exports and dynamic imports. `import type` / `export type` are erased at compile time, so they are skipped.
const SPEC = /\b(?:import|export)\s+(?!type\b)[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null // packages are not part of the app graph

  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
  return candidates.find(isFile) ?? null
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const found: string[] = []
  for (const match of source.matchAll(SPEC)) {
    const spec = match[1] ?? match[2] ?? match[3]
    if (spec) found.push(spec)
  }
  return found
}

function reachableFrom(entry: string): Set<string> {
  if (!isFile(entry)) throw new Error(`missing entry ${entry}`)
  const seen = new Set<string>([entry])
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift() as string
    for (const spec of importsOf(file)) {
      const next = resolveSpecifier(file, spec)
      if (next && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

describe('edge middleware import graph', () => {
  it('does not reach the D1 connect module or the schema', () => {
    const graph = reachableFrom(resolve(SRC, 'middleware.ts'))
    expect(graph.size).toBeGreaterThan(1)
    for (const forbidden of FORBIDDEN) {
      expect(graph.has(forbidden), `middleware reaches ${forbidden}`).toBe(false)
    }
  })
})
