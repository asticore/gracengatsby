import { NextRequest, NextResponse } from 'next/server'

import { LOCALE_COOKIE } from '@/features/multilingual/detect'

import { DOMAIN_HEADER, DOMAIN_LOCALE_HEADER, isAdminPath, matchDomain, primaryOf, type SiteDomain } from './model'
import { hostFromHeader } from './host'
import { readDomainsFromD1 } from './store'
import { readMultilingualSettingsFromD1 } from '@/features/multilingual/settings'

type Handler = (request: NextRequest) => Promise<NextResponse>

/** Never redirected to the primary: webhooks and the app's own assets must answer on the host they were sent to. */
const isRedirectExempt = (pathname: string): boolean =>
  pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/_next/') || /\.[a-z0-9]+$/i.test(pathname)

/**
 * Host routing, the first step of the middleware chain.
 *
 * - Unknown, disabled and workers.dev/preview hosts pass through untouched (no header is set).
 * - A registered active host gets `x-eg-domain`. A non-primary host with "redirect to primary" on is
 *   answered with a permanent redirect to the same path on the primary domain. Admin on a host with
 *   "allow admin" off also goes to the primary; the primary always allows admin, so it cannot be locked out.
 * - When the visitor has no locale cookie, the domain's own language (if it differs from the site's) is
 *   passed on as `x-eg-domain-locale`; multilingual routing reads it when the URL has no prefix.
 *
 * Headers the client sent with these names are removed first, so only this layer can set them.
 */
export async function domainMiddleware(request: NextRequest, handle: Handler): Promise<NextResponse> {
  const headers = new Headers(request.headers)
  headers.delete(DOMAIN_HEADER)
  headers.delete(DOMAIN_LOCALE_HEADER)

  const domains = await readDomainsFromD1()
  const host = hostFromHeader(request.headers.get('host'))
  const current = matchDomain(host, domains)

  if (!current) {
    // Nothing matched: the request goes on as it arrived, minus any spoofed domain headers.
    if (!request.headers.has(DOMAIN_HEADER) && !request.headers.has(DOMAIN_LOCALE_HEADER)) return handle(request)
    return handle(new NextRequest(request.url, { headers, method: request.method }))
  }

  const pathname = request.nextUrl.pathname
  const primary = primaryOf(domains)

  if (primary && primary.host !== current.host && !isRedirectExempt(pathname)) {
    const adminBlocked = isAdminPath(pathname) && !current.allowAdmin
    if (adminBlocked || current.redirectToPrimary) return redirectToPrimary(request, primary)
  }

  headers.set(DOMAIN_HEADER, current.host)

  if (!request.cookies.get(LOCALE_COOKIE)?.value) {
    const locale = await domainLocaleFor(current)
    if (locale) headers.set(DOMAIN_LOCALE_HEADER, locale)
  }

  return handle(new NextRequest(request.url, { headers, method: request.method }))
}

function redirectToPrimary(request: NextRequest, primary: SiteDomain): NextResponse {
  const url = new URL(request.url)
  url.protocol = 'https:'
  url.host = primary.host
  url.port = ''
  return NextResponse.redirect(url, 308)
}

/** The domain's language when it differs from the site's own. Null means "use the site default", which is the status quo. */
async function domainLocaleFor(domain: SiteDomain): Promise<string | null> {
  if (!domain.defaultLocale) return null
  const settings = await readMultilingualSettingsFromD1()
  if (domain.defaultLocale === settings.defaultLocale) return null
  return settings.activeLocales.includes(domain.defaultLocale) ? domain.defaultLocale : null
}
