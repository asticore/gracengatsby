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

/**
 * Slug uniqueness across domains. A slug is taken on a domain when a document with that slug (and parent) answers there.
 * - Two shared documents (empty list, every domain) always clash: the slug is taken everywhere.
 * - A shared document and a scoped one do not clash: the scoped one is the domain's own version and wins on its domains,
 *   and the shared one still answers on the others. This is the "fall back to shared content" rule.
 * - Two scoped documents clash only where their host lists overlap.
 */
export function slugClaimsConflict(a: unknown, b: unknown): boolean {
  const first = parseHostList(a)
  const second = parseHostList(b)
  if (first.length === 0 && second.length === 0) return true
  if (first.length === 0 || second.length === 0) return false
  return first.some((host) => second.includes(host))
}

/**
 * The one document of several answering the same address that `host` is served: the one scoped to the host first,
 * then the shared one. A document scoped only to other domains is never returned for a registered host. With no
 * registered host (workers.dev, preview, unknown hosts) nothing is narrowed: the shared document, else the first.
 */
export function pickForHost<T>(docs: readonly T[], host: string | null | undefined, listOf: (doc: T) => unknown): T | null {
  let shared: T | null = null
  for (const doc of docs) {
    const hosts = parseHostList(listOf(doc))
    if (host && hosts.includes(host)) return doc
    if (hosts.length === 0 && shared === null) shared = doc
  }
  if (shared !== null) return shared
  return host ? null : (docs[0] ?? null)
}
