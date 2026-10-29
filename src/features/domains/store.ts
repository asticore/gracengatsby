import { readMultilingualSettingsFromD1 } from '@/features/multilingual/settings'

import { normaliseDomains, type SiteDomain } from './model'

/**
 * Reads the domain registry for the edge middleware and the SEO builders.
 *
 * Edge-safe: one SELECT on the global's child table through the D1 binding, cached in isolate memory,
 * with no import of the engine or the Drizzle schema (tests/int/edge-middleware-graph.int.spec.ts).
 * Any failure, or a table that is not there yet, reads as "no registered domains", so an unknown host
 * behaves exactly as it did before this feature existed.
 */

const TABLE = 'eg_domain_settings_domains'
const CACHE_TTL_MS = 60_000

let cached: { at: number; value: SiteDomain[] } | null = null

async function getD1(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return context?.env?.D1 ?? null
  } catch {
    return null
  }
}

export async function readDomainsFromD1(): Promise<SiteDomain[]> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value

  let value: SiteDomain[] = []
  try {
    const db = await getD1()
    if (db) {
      const result = await db
        .prepare(
          `SELECT host, label, default_locale AS defaultLocale, currency_hint AS currencyHint, is_primary AS isPrimary, status, redirect_to_primary AS redirectToPrimary, allow_admin AS allowAdmin, site_name AS siteName, tagline, logo_url AS logoUrl, contact_email AS contactEmail, contact_phone AS contactPhone, instagram_url AS instagramUrl, facebook_url AS facebookUrl, linkedin_url AS linkedinUrl, x_url AS xUrl FROM \`${TABLE}\` ORDER BY \`_order\``,
        )
        .all()
      const multilingual = await readMultilingualSettingsFromD1()
      value = normaliseDomains(result.results ?? [], multilingual.activeLocales).domains
    }
  } catch {
    value = []
  }

  cached = { at: now, value }
  return value
}

/** Drops the isolate's copy so the next request reads the registry again. Called after the registry is saved. */
export function invalidateDomainsCache(): void {
  cached = null
}
