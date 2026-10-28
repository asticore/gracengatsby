import { cache } from 'react'
import { cookies, headers } from 'next/headers'

import { accountContext } from '@/features/accounts/session'
import { readPreferences } from '@/features/accounts/preferences'

import { LOCALE_COOKIE } from './detect'
import { isPortalPath, resolvePortalLocale } from './portal'
import { readMultilingualSettingsFromD1, type MultilingualSettings } from './settings'
import { LOCALE_HEADER, requestLocale } from './routing'
import { loadStrings } from '@/features/uiStrings'

/**
 * The portal language for the current request, or null when multilingual is
 * off. Memoised per request so the layout and the account shell share one read.
 */
export const currentPortalLocale = cache(async (): Promise<string | null> => {
  const settings = await readMultilingualSettingsFromD1()
  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value ?? null
  const acceptLanguage = (await headers()).get('accept-language')

  let preferred: string | null = null
  try {
    const { engine, user } = await accountContext()
    if (user) preferred = (await readPreferences(engine, user)).locale
  } catch {
    // A failed profile read falls through to the cookie and the browser.
  }

  const locale = resolvePortalLocale({ settings, preferred, cookie: cookieValue, acceptLanguage })?.locale ?? null
  // Load the language now, so the synchronous portal lookups in this request (portalText, portalTextFor) read it.
  await loadStrings(locale)
  return locale
})

/**
 * True when this request is for a logged-in portal page. The path comes from the
 * middleware's x-pathname (or next-url), the same source the layout reads.
 */
export async function isPortalRequest(settings: MultilingualSettings): Promise<boolean> {
  const reader = await headers()
  const raw = reader.get('x-pathname') || reader.get('next-url') || ''
  const cut = raw.search(/[?#]/)
  const pathname = cut === -1 ? raw : raw.slice(0, cut)
  return isPortalPath(pathname || '/', settings.activeLocales)
}

/**
 * The language a request's content and chrome should use. Portal pages take the
 * visitor's portal language (profile, cookie, browser). Every other page reads the
 * locale the middleware routed to, from the request header. Never a URL prefix:
 * the portal has none, and its translations are only the published ones.
 */
export async function requestContentLocale(settings: MultilingualSettings): Promise<string | null> {
  if (await isPortalRequest(settings)) return currentPortalLocale()
  return requestLocale((await headers()).get(LOCALE_HEADER), settings)
}
