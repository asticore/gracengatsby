import 'server-only'

import { requestHost } from '@/features/domains/request'
import { readDomainsFromD1 } from '@/features/domains/store'
import type { SiteDomain } from '@/features/domains/model'
import { getAdminRoot } from '@/features/security/settings'

import type { TrackingPageContext } from './domains'

/**
 * The domain facts the tag editor needs on Settings > Tracking: every domain (with its admin-access flag), the host
 * this admin is on, and the admin root. Never throws; a failed read gives a single-domain context.
 */
export async function trackingDomainContext(): Promise<TrackingPageContext> {
  const [domains, currentHost, adminRoot] = await Promise.all([
    readDomainsFromD1().catch((): SiteDomain[] => []),
    requestHost().catch((): null => null),
    getAdminRoot().catch((): string => '/admin'),
  ])
  return {
    currentHost,
    adminRoot,
    domains: domains.map((d) => ({ host: d.host, label: d.label, allowAdmin: d.allowAdmin, isPrimary: d.isPrimary, active: d.status === 'active' })),
  }
}
