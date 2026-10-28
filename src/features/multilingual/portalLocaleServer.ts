import { cache } from 'react'
import { cookies, headers } from 'next/headers'

import { accountContext } from '@/features/accounts/session'
import { readPreferences } from '@/features/accounts/preferences'

import { LOCALE_COOKIE } from './detect'
import { resolvePortalLocale } from './portal'
import { readMultilingualSettingsFromD1 } from './settings'

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

  return resolvePortalLocale({ settings, preferred, cookie: cookieValue, acceptLanguage })?.locale ?? null
})
