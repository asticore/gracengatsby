import { DEFAULT_ADMIN_ROOT } from '@/features/security/noindex'
import { getSeoContext, parsePathList } from './settings'

/** Never useful in search results, whatever the settings say. */
const ALWAYS_DISALLOWED = ['/admin', '/api', '/cart', '/checkout', '/preview']

/** Paths a custom robots file must still disallow; any missing from it are appended. */
const REQUIRED_DISALLOWED = ['/admin', '/api']

const hasDisallow = (text: string, path: string): boolean => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*disallow\\s*:\\s*${escaped}\\/?\\s*$`, 'im').test(text)
}

/**
 * Produces the robots.txt body as text rather than as a structured object,
 * because the settings allow a hand-written file that "replaces it completely"
 * - and a structured form cannot round-trip directives like Crawl-delay or an
 * editor's own comments.
 *
 * Returns null when the SEO feature is off; the route turns that into a 404 so
 * a disabled feature serves nothing rather than an empty file that crawlers
 * would read as "everything is allowed".
 */
export const buildRobotsTxt = async (adminRoot: string = DEFAULT_ADMIN_ROOT): Promise<string | null> => {
  const context = await getSeoContext()
  if (!context.enabled) return null

  const indexing = context.settings?.indexing
  const sitemapEnabled = context.settings?.sitemap?.enabled !== false
  const sitemapLine = sitemapEnabled ? `Sitemap: ${context.baseUrl}/sitemap.xml` : null

  const custom = indexing?.customRobotsTxt?.trim()
  if (custom) {
    // The override is verbatim, but a missing Sitemap line is almost always an
    // oversight rather than a decision, so it is appended if absent.
    // The admin and the API are never left open by a custom file either: any
    // required Disallow line it lacks is added in its own group.
    const required = [...new Set([adminRoot, ...REQUIRED_DISALLOWED])]
    const missing = required.filter((path) => !hasDisallow(custom, path))
    const parts = [custom]
    if (missing.length > 0) parts.push(['User-agent: *', ...missing.map((path) => `Disallow: ${path}`)].join('\n'))
    if (sitemapLine && !/^\s*sitemap\s*:/im.test(custom)) parts.push(sitemapLine)
    return `${parts.join('\n\n')}\n`
  }

  const lines: string[] = ['User-agent: *']

  if (indexing?.allowIndexing === false) {
    lines.push('Disallow: /')
  } else {
    lines.push('Allow: /')
    const disallowed = [...new Set([...ALWAYS_DISALLOWED, adminRoot]), ...parsePathList(indexing?.noindexPaths)]
    const seen = new Set<string>()
    disallowed.forEach((path) => {
      if (seen.has(path)) return
      seen.add(path)
      lines.push(`Disallow: ${path}`)
    })
  }

  if (sitemapLine) lines.push('', sitemapLine)

  return `${lines.join('\n')}\n`
}
