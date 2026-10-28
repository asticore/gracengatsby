import { headers } from 'next/headers'

import { splitLocalePath } from '@/features/multilingual/detect'
import { isLocaleRoutable } from '@/features/multilingual/routing'
import { requestContentLocale } from '@/features/multilingual/portalLocaleServer'
import { readMultilingualSettingsFromD1, type MultilingualSettings } from '@/features/multilingual/settings'

export type PageLocale = {
  settings: MultilingualSettings
  /** The language this request is served in. */
  locale: string
  /** The request path with any locale prefix removed, e.g. `/about` for `/fr/about`. */
  pathname: string
}

/**
 * The language of the current request, for SEO output. Null when multilingual
 * is off or only one language is active, so callers keep their existing markup.
 * Never throws: outside a request (builds, tests) it simply answers null.
 */
export async function currentPageLocale(): Promise<PageLocale | null> {
  try {
    const settings = await readMultilingualSettingsFromD1()
    if (!isLocaleRoutable(settings)) return null
    const reader = await headers()
    const locale = await requestContentLocale(settings)
    if (!locale) return null
    const raw = reader.get('x-pathname') || reader.get('next-url') || ''
    const cut = raw.search(/[?#]/)
    const pathname = cut === -1 ? raw : raw.slice(0, cut)
    const { rest } = splitLocalePath(pathname || '/', settings.activeLocales)
    return { settings, locale, pathname: rest || '/' }
  } catch {
    return null
  }
}
