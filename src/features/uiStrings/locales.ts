/**
 * The languages the ADMIN interface is available in.
 *
 * Deliberately separate from the website's languages (Settings > Languages).
 * Those are for public content. The admin is chosen per user: each account
 * picks its own language, and the admin never asks anyone to translate it.
 *
 * Edge-safe: no node or db imports. Middleware and client code may import it.
 */

export const ADMIN_UI_LOCALES = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'nl',
  'ja',
  'zh-Hans',
  'ko',
  'ar',
  'hi',
  'ru',
] as const

export type AdminUiLocale = (typeof ADMIN_UI_LOCALES)[number]

export const DEFAULT_ADMIN_UI_LOCALE: AdminUiLocale = 'en'

/** Right-to-left scripts. Drives `dir` on the admin's <html>. */
export const RTL_ADMIN_UI_LOCALES: ReadonlySet<AdminUiLocale> = new Set<AdminUiLocale>(['ar'])

export const ADMIN_UI_LOCALE_LABELS: Record<AdminUiLocale, { label: string; native: string }> = {
  en: { label: 'English', native: 'English' },
  es: { label: 'Spanish', native: 'Español' },
  fr: { label: 'French', native: 'Français' },
  de: { label: 'German', native: 'Deutsch' },
  pt: { label: 'Portuguese', native: 'Português' },
  it: { label: 'Italian', native: 'Italiano' },
  nl: { label: 'Dutch', native: 'Nederlands' },
  ja: { label: 'Japanese', native: '日本語' },
  'zh-Hans': { label: 'Chinese (Simplified)', native: '简体中文' },
  ko: { label: 'Korean', native: '한국어' },
  ar: { label: 'Arabic', native: 'العربية' },
  hi: { label: 'Hindi', native: 'हिन्दी' },
  ru: { label: 'Russian', native: 'Русский' },
}

/** Case-insensitive match onto a supported admin locale. */
export function findAdminUiLocale(candidate: string | null | undefined): AdminUiLocale | null {
  if (!candidate) return null
  const wanted = candidate.trim().toLowerCase()
  if (!wanted) return null
  return ADMIN_UI_LOCALES.find((code) => code.toLowerCase() === wanted) ?? null
}

export function isRtlAdminUiLocale(locale: AdminUiLocale): boolean {
  return RTL_ADMIN_UI_LOCALES.has(locale)
}

export function directionFor(locale: AdminUiLocale): 'ltr' | 'rtl' {
  return isRtlAdminUiLocale(locale) ? 'rtl' : 'ltr'
}

/**
 * Best supported admin locale for an `Accept-Language` header, honouring
 * q-weights. `fr-CA` falls to `fr`, `zh`/`zh-CN`/`zh-SG` fall to `zh-Hans`,
 * and a tag with no supported match returns null.
 */
export function matchAcceptLanguage(header: string | null | undefined): AdminUiLocale | null {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.split(';').map((piece) => piece.trim())
      const q = params.find((piece) => piece.startsWith('q='))
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1 }
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q)

  for (const entry of ranked) {
    const exact = findAdminUiLocale(entry.tag)
    if (exact) return exact

    const [base = '', ...rest] = entry.tag.toLowerCase().split('-')
    // Chinese written in Simplified script or from the mainland / Singapore. Traditional-script tags are not supported.
    if (base === 'zh') {
      const script = rest.find((part) => part.length === 4)?.toLowerCase()
      const region = rest.find((part) => part.length === 2)?.toUpperCase()
      if (script === 'hans' || (!script && region !== 'TW' && region !== 'HK' && region !== 'MO'))
        return 'zh-Hans'
      continue
    }
    const byBase = ADMIN_UI_LOCALES.find((code) => code.toLowerCase() === base)
    if (byBase) return byBase
  }
  return null
}

export type AdminUiLocaleResolution = {
  locale: AdminUiLocale
  /** Where the answer came from: the user's saved choice, their browser, or the fallback. */
  source: 'user' | 'browser' | 'default'
}

/**
 * The admin language for one request.
 *
 *   saved user choice -> Accept-Language -> English
 *
 * A saved value that is no longer supported (a locale dropped from the list
 * later) is ignored, so it falls through to the browser rather than to a
 * blank interface. `null`, `''` and `'auto'` all mean "Automatic".
 */
export function resolveAdminUiLocale(args: {
  stored?: string | null
  acceptLanguage?: string | null
}): AdminUiLocaleResolution {
  const stored = args.stored?.trim()
  if (stored && stored !== 'auto') {
    const saved = findAdminUiLocale(stored)
    if (saved) return { locale: saved, source: 'user' }
  }
  const browser = matchAcceptLanguage(args.acceptLanguage)
  if (browser) return { locale: browser, source: 'browser' }
  return { locale: DEFAULT_ADMIN_UI_LOCALE, source: 'default' }
}
