import { normaliseHost } from './host'

/**
 * Which registered domains a piece of content is shown on. Pure: the field hook, the public loaders,
 * the sitemap and the SEO builders share these rules.
 *
 * Stored as a comma-separated list of hosts. An empty list means every domain. A request that is not on a
 * registered domain (workers.dev, preview, unknown hosts) is never narrowed, so scoping cannot break them.
 */

/** Parses a stored or typed list into normalised, unique hosts. Invalid entries are dropped here; the field hook refuses them on save. */
export function parseHostList(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const hosts = value
    .split(/[\s,;]+/)
    .map((part) => normaliseHost(part))
    .flatMap((result) => (result.ok ? [result.host] : []))
  return Array.from(new Set(hosts))
}

/** True when content with this stored list is shown on `host`. Null host (not a registered domain) is never narrowed. */
export function availableOnHost(value: unknown, host: string | null | undefined): boolean {
  const hosts = parseHostList(value)
  if (hosts.length === 0 || !host) return true
  return hosts.includes(host)
}
