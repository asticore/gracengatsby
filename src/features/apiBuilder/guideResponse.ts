import type { ApiEndpoint } from './core'
import { buildHtmlGuide, buildMarkdownGuide, buildOpenApi, buildPostman, toYaml, type GuideOptions } from './devguide'

/**
 * The developer guide as an HTTP response. One place maps a format name to a body and headers, so the
 * admin download and the public docs link cannot drift. Downloads are attachments; the public HTML page
 * is marked noindex, and so is every /api response (src/features/security/noindex.ts).
 */

export const GUIDE_FORMATS = ['openapi.json', 'openapi.yaml', 'guide.md', 'guide.html', 'postman.json'] as const
export type GuideFormat = (typeof GUIDE_FORMATS)[number]

export const isGuideFormat = (value: string | null): value is GuideFormat => value !== null && (GUIDE_FORMATS as readonly string[]).includes(value)

const TYPES: Record<GuideFormat, string> = {
  'openapi.json': 'application/json; charset=utf-8',
  'openapi.yaml': 'application/yaml; charset=utf-8',
  'guide.md': 'text/markdown; charset=utf-8',
  'guide.html': 'text/html; charset=utf-8',
  'postman.json': 'application/json; charset=utf-8',
}

const FILE_NAMES: Record<GuideFormat, string> = {
  'openapi.json': 'openapi.json',
  'openapi.yaml': 'openapi.yaml',
  'guide.md': 'api-guide.md',
  'guide.html': 'api-guide.html',
  'postman.json': 'postman-collection.json',
}

export function renderGuide(format: GuideFormat, endpoints: readonly ApiEndpoint[], options: GuideOptions, mode: 'download' | 'page'): Response {
  let body: string
  if (format === 'openapi.json') body = JSON.stringify(buildOpenApi(endpoints, options), null, 2)
  else if (format === 'openapi.yaml') body = toYaml(buildOpenApi(endpoints, options)) + '\n'
  else if (format === 'guide.md') body = buildMarkdownGuide(endpoints, options)
  else if (format === 'guide.html') body = buildHtmlGuide(endpoints, options)
  else body = JSON.stringify(buildPostman(endpoints, options), null, 2)

  const headers: Record<string, string> = {
    'Content-Type': TYPES[format],
    'Cache-Control': mode === 'download' ? 'no-store' : 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  }
  if (mode === 'download') headers['Content-Disposition'] = `attachment; filename="${FILE_NAMES[format]}"`
  if (format === 'guide.html') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  return new Response(body, { status: 200, headers })
}

/** Constant-time comparison for the public docs token. */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

type GlobalReader = { findGlobal?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null> }

/** The site name for the guide title, from the site settings global. Falls back to "Site". */
export async function siteNameFor(engine: unknown): Promise<string> {
  const reader = engine as GlobalReader
  const row = await reader.findGlobal?.({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch((): null => null)
  const name = row && typeof row.siteName === 'string' ? row.siteName.trim() : ''
  return name || 'Site'
}
