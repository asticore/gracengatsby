import { headers } from 'next/headers'

/**
 * The one place that decides the public origin used to build absolute links.
 *
 * Order: SITE_URL when it is set, else the host of the current request (https), else ''.
 * There is no hard-coded domain fallback: an install without SITE_URL links to its own host,
 * and code outside a request (cron, background jobs) gets '' and must omit the link or send a
 * relative URL instead.
 */

/** SITE_URL without surrounding space or a trailing slash, or '' when it is not set. */
export function configuredSiteOrigin(): string {
  return (process.env.SITE_URL || '').trim().replace(/\/+$/, '')
}

/** `https://<host>` for a plain host name (no scheme, path or spaces), otherwise ''. */
export function originForHost(host: string | null | undefined): string {
  const value = (host || '').trim().toLowerCase()
  if (!value || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(value)) return ''
  return `https://${value}`
}

/** SITE_URL when set, else the origin of the request's host header, else ''. Never throws. */
export async function requestSiteOrigin(): Promise<string> {
  const configured = configuredSiteOrigin()
  if (configured) return configured
  try {
    return originForHost((await headers()).get('host'))
  } catch {
    // Outside a request scope (builds, cron, tests) there is no host to read.
    return ''
  }
}
