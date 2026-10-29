import { headers } from 'next/headers'

import { DOMAIN_HEADER, DOMAIN_LOCALE_HEADER, type SiteDomain } from './model'
import { availableOnHost } from './scope'
import { readDomainsFromD1 } from './store'

/**
 * Server-side reads of the matched domain for the current request (SEO, sitemap, robots).
 * The header is set only by the middleware, so a registered domain here is the one the visitor used.
 * Never throws: outside a request (builds, tests) every reader answers "no domain".
 */

/** The registered, active domain this request arrived on, or null for unknown hosts and workers.dev. */
export async function requestDomain(): Promise<SiteDomain | null> {
  try {
    const host = (await headers()).get(DOMAIN_HEADER)
    if (!host) return null
    const domains = await readDomainsFromD1()
    return domains.find((domain) => domain.host === host && domain.status === 'active') ?? null
  } catch {
    return null
  }
}

/** The language the domain serves unprefixed for this request, when it differs from the site default. */
export async function requestDomainLocale(): Promise<string | null> {
  try {
    return (await headers()).get(DOMAIN_LOCALE_HEADER) || null
  } catch {
    return null
  }
}

/**
 * The origin URLs are built on for this request: `https://<domain>` on a registered host, otherwise the
 * configured site origin (SITE_URL), which is the status quo for every other host.
 */
export function originFor(domain: SiteDomain | null, fallbackBaseUrl: string): string {
  return domain ? `https://${domain.host}` : fallbackBaseUrl
}

/**
 * True when a document with this stored `availableDomains` list is shown on the domain this request arrived on.
 * Used by the public loaders to answer not found on a domain the content is not available on.
 */
export async function contentAvailableHere(availableDomains: unknown): Promise<boolean> {
  const domain = await requestDomain()
  return availableOnHost(availableDomains, domain?.host ?? null)
}
