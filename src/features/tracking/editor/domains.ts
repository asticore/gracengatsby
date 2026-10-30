/*
 * Multi-domain rules for the tag editor. The editor reads the framed site same-origin, so it can only load the host
 * the admin is on. Other domains get their own editor, reached through their admin, and only when that domain allows
 * admin access (the middleware sends admin requests on a domain without it to the primary domain). Pure.
 */

export type TrackingDomainInfo = {
  host: string
  label: string
  allowAdmin: boolean
  isPrimary: boolean
  active: boolean
}

/** The active domains other than the one this admin is on, primary first. */
export function otherDomains(domains: readonly TrackingDomainInfo[], currentHost: string | null): TrackingDomainInfo[] {
  const here = (currentHost ?? '').toLowerCase()
  return domains
    .filter((d) => d.active && d.host && d.host.toLowerCase() !== here)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
}

/** True when the site has more than one active domain, so the editor needs the domain note. */
export function isMultiDomain(domains: readonly TrackingDomainInfo[]): boolean {
  return domains.filter((d) => d.active).length > 1
}

/** The admin root as a path with no trailing slash: "/admin", or "" for the site root. */
export function normaliseAdminRoot(root: string | null | undefined): string {
  const trimmed = (root ?? '').trim().replace(/\/+$/, '')
  if (!trimmed || trimmed === '/') return '/admin'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/** Where the tag editor opens on another domain: its own admin, Settings > Tracking, with the editor already open. */
export function domainEditorUrl(domain: Pick<TrackingDomainInfo, 'host'>, adminRoot: string, protocol: string): string {
  return `${protocol.replace(/:?$/, ':')}//${domain.host}${normaliseAdminRoot(adminRoot)}/settings/tracking?tags=open`
}

/** What the Settings > Tracking page passes the editor: the domains, the host this admin is on, and the admin root. */
export type TrackingPageContext = {
  domains: TrackingDomainInfo[]
  currentHost: string | null
  adminRoot: string
}
