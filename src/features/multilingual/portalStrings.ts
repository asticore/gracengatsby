/**
 * Fixed interface text for the logged-in portal.
 *
 * Deliberately separate from `interfaceStrings.ts`. Those strings are stored as
 * translation rows and go through review and machine drafts; the portal must
 * not use that workflow. Here a string is just a literal per language, edited
 * in code, with no database or review step.
 *
 * Only `en` is required. Any other language falls back to the base language
 * (`fr-CA` -> `fr`) and then to `en`, so a missing entry shows English rather
 * than a blank control.
 */

export const PORTAL_STRINGS = {
  'nav.overview': { en: 'Overview' },
  'nav.orders': { en: 'Orders' },
  'nav.storeCredit': { en: 'Store credit' },
  'nav.subscriptions': { en: 'Subscriptions' },
  'nav.addresses': { en: 'Addresses' },
  'nav.bookings': { en: 'Event bookings' },
  'nav.profile': { en: 'Profile' },
  'nav.organizations': { en: 'Organizations' },
  'profile.language': { en: 'Language' },
  'profile.languageAuto': { en: 'Automatic (match my browser)' },
  'profile.languageSave': { en: 'Save language' },
} as const

export type PortalStringKey = keyof typeof PORTAL_STRINGS

export function portalText(key: PortalStringKey, locale: string | null | undefined): string {
  const entry: Record<string, string | undefined> = PORTAL_STRINGS[key]
  if (locale) {
    const exact = entry[locale]
    if (exact) return exact
    const base = locale.split('-')[0]?.toLowerCase()
    const baseMatch = base ? entry[base] : undefined
    if (baseMatch) return baseMatch
  }
  return entry.en ?? key
}
