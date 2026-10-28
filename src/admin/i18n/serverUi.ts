import 'server-only'

import { headers } from 'next/headers'
import { cache } from 'react'

import { getAdminContext } from '@/admin/auth'
import {
  directionFor,
  loadStrings,
  resolveAdminUiLocale,
  translateWith,
  type AdminUiLocale,
  type UiDictionary,
  type UiStringKey,
  type UiStringVars,
} from '@/features/uiStrings'

export type AdminUiServer = {
  locale: AdminUiLocale
  dir: 'ltr' | 'rtl'
  source: 'user' | 'browser' | 'default'
  dict: UiDictionary
  t: (key: UiStringKey, vars?: UiStringVars) => string
}

/**
 * The admin language for this request: the signed-in user's own choice, else
 * their browser's Accept-Language, else English. Cached per request so layout,
 * nav and each view share one resolution.
 */
export const getAdminUi = cache(async (): Promise<AdminUiServer> => {
  const context = await getAdminContext()
  const stored = (context.user as { adminLanguage?: string | null } | null)?.adminLanguage ?? null
  const requestHeaders = await headers()
  const resolved = resolveAdminUiLocale({
    stored,
    acceptLanguage: requestHeaders.get('accept-language'),
  })
  const dict = await loadStrings(resolved.locale)
  return {
    locale: resolved.locale,
    dir: directionFor(resolved.locale),
    source: resolved.source,
    dict,
    t: (key, vars) => translateWith(dict, key, vars),
  }
})
