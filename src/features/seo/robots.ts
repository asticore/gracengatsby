import { getSeoContext, parsePathList } from './settings'

/** Never useful in search results, whatever the settings say. */
const ALWAYS_DISALLOWED = ['/admin', '/api', '/cart', '/checkout']

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
export const buildRobotsTxt = async (): Promise<string | null> => {
  const context = await getSeoContext()
  if (!context.enabled) return null

  const indexing = context.settings?.indexing
  const sitemapEnabled = context.settings?.sitemap?.enabled !== false
  const sitemapLine = sitemapEnabled ? `Sitemap: ${context.baseUrl}/sitemap.xml` : null

  const custom = indexing?.customRobotsTxt?.trim()
  if (custom) {
    // The override is verbatim, but a missing Sitemap line is almost always an
    // oversight rather than a decision, so it is appended if absent.
    if (sitemapLine && !/^\s*sitemap\s*:/im.test(custom)) {
      return `${custom}\n\n${sitemapLine}\n`
    }
    return `${custom}\n`
  }

  const lines: string[] = ['User-agent: *']

  if (indexing?.allowIndexing === false) {
    lines.push('Disallow: /')
  } else {
    lines.push('Allow: /')
    const disallowed = [...ALWAYS_DISALLOWED, ...parsePathList(indexing?.noindexPaths)]
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
