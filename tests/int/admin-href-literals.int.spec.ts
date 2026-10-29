// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Guards the configurable admin URL. A component must not hard-code the admin prefix in
 * an href, because a site that moved its admin to another path would get dead links.
 * Use <AdminLink path="/..."> (src/admin/adminRoute/AdminLink.tsx), useAdminHref() or
 * getAdminRoot() instead.
 *
 * Scope: .tsx files under src/. Route handlers (src/app/**\/api) return JSON or redirects and
 * are not UI, and are excluded. Add a file to ALLOWLIST only with a reason.
 */

const SRC = resolve(__dirname, '../../src')

/** File paths (relative to src/) that may keep a literal admin href. Empty on purpose. */
const ALLOWLIST: Record<string, string> = {}

// href="/admin", href='/admin/x', href={`/admin/x`}, href={'/admin/x'}
const LITERAL_HREF = /\bhref\s*=\s*\{?\s*(["'`])\/admin(?:[/?#"'`{}$)\s]|$)/g

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'api' ? [] : walk(full)
    return name.endsWith('.tsx') ? [full] : []
  })

const offenders = (): string[] => {
  const found: string[] = []
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/')
    if (rel in ALLOWLIST) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(LITERAL_HREF)) {
      const line = text.slice(0, match.index ?? 0).split('\n').length
      found.push(`${rel}:${line}`)
    }
  }
  return found
}

describe('admin hrefs follow the configured admin URL', () => {
  it('no .tsx under src/ hard-codes an /admin href outside the allowlist', () => {
    expect(offenders()).toEqual([])
  })

  it('the detector catches the forms it is meant to catch', () => {
    const forms = [`<a href="/admin/x">`, `<Link href='/admin'>`, 'href={`/admin/x/${id}`}', "href={'/admin/x'}"]
    for (const sample of forms) {
      LITERAL_HREF.lastIndex = 0
      expect(LITERAL_HREF.test(sample), sample).toBe(true)
      LITERAL_HREF.lastIndex = 0
    }
    LITERAL_HREF.lastIndex = 0
    expect(LITERAL_HREF.test('href="/administrators"')).toBe(false)
    LITERAL_HREF.lastIndex = 0
    expect(LITERAL_HREF.test('href={adminHref("/x")}')).toBe(false)
  })
})
