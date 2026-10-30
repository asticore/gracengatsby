import 'server-only'

import { requestHost } from '@/features/domains/request'
import { readDomainsFromD1 } from '@/features/domains/store'
import type { SiteDomain } from '@/features/domains/model'
import { getAdminRoot } from '@/features/security/settings'

import { pickPublicIds } from '@/features/integrations/publicIds'
import { getEngine } from '@/lib/engine'
import { getPublicTrackingEvents } from '@/features/tracking/server'

import type { TrackingDestination, TrackingPageContext } from './domains'

/** The shop's default currency, from payment settings. Null when it is not a three-letter code. */
async function siteCurrency(): Promise<string | null> {
  try {
    const engine = await getEngine()
    const row = (await engine.findGlobal({ slug: 'payment-settings', depth: 0, overrideAccess: true }).catch((): null => null)) as { currency?: unknown } | null
    return typeof row?.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null
  } catch {
    return null
  }
}

/**
 * Where the events go: each destination with an ID on Integrations is on, and receives every enabled event (each one
 * still waits for its visitor's consent). Never throws; an unreadable Integrations row shows all four as off.
 */
async function destinations(): Promise<TrackingDestination[]> {
  try {
    const engine = await getEngine()
    const integrations = (await engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true }).catch((): null => null)) as Record<string, unknown> | null
    const ids = pickPublicIds(integrations ?? {}, {})
    const events = (await getPublicTrackingEvents()).length
    const on = (connected: boolean) => ({ on: connected, events: connected ? events : 0 })
    return [
      { id: 'meta', ...on(Boolean(ids.metaPixelId)) },
      { id: 'ga4', ...on(Boolean(ids.ga4MeasurementId)) },
      { id: 'gtm', ...on(Boolean(ids.gtmContainerId)) },
      { id: 'tiktok', ...on(Boolean(ids.tiktokPixelId)) },
    ]
  } catch {
    return (['meta', 'ga4', 'gtm', 'tiktok'] as const).map((id) => ({ id, on: false, events: 0 }))
  }
}

/**
 * The domain facts the tag editor needs on Settings > Tracking: every domain (with its admin-access flag), the host
 * this admin is on, and the admin root. Never throws; a failed read gives a single-domain context.
 */
export async function trackingDomainContext(): Promise<TrackingPageContext> {
  const [domains, currentHost, adminRoot, currency, routes] = await Promise.all([
    readDomainsFromD1().catch((): SiteDomain[] => []),
    requestHost().catch((): null => null),
    getAdminRoot().catch((): string => '/admin'),
    siteCurrency(),
    destinations(),
  ])
  return {
    currentHost,
    adminRoot,
    siteCurrency: currency,
    destinations: routes,
    domains: domains.map((d) => ({ host: d.host, label: d.label, allowAdmin: d.allowAdmin, isPrimary: d.isPrimary, active: d.status === 'active' })),
  }
}
