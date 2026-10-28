/**
 * The reference table's keys and English source text.
 *
 * Every admin string that is translated has one key here. The English value is
 * the source and the last-resort fallback. The other twelve languages live in
 * `dictionaries/<locale>.ts` and must have every key (see the coverage test).
 *
 * Keys are stable identifiers. Renaming one orphans its translations, so add
 * new keys rather than renaming old ones.
 *
 * Portal keys (`portal.*`) are the customer account area's strings, moved here
 * from the old `portalStrings.ts`. They are held in English in every
 * dictionary until the portal is translated, so the customer's screens read
 * exactly as they did before this table existed.
 */

export const UI_STRING_SOURCE = {
  // Navigation groups
  'nav.group.content': 'Content',
  'nav.group.shop': 'Shop',
  'nav.group.members': 'Members',
  'nav.group.courses': 'Courses',
  'nav.group.ads': 'Ads',
  'nav.group.seo': 'SEO',
  'nav.group.settings': 'Settings',
  'nav.group.other': 'Other',
  'nav.dashboard': 'Dashboard',
  'nav.logOut': 'Log out',
  'nav.loggingOut': 'Logging out…',

  // The user's own admin language (profile menu, and the Users edit screen)
  'profile.interfaceLanguage': 'Interface language',
  'profile.interfaceLanguageAuto': 'Automatic (match my browser)',
  'profile.interfaceLanguageHelp':
    'Changes the admin screens for this account only. Website languages are not affected.',
  'profile.interfaceLanguageSave': 'Save',
  'profile.interfaceLanguageSaved': 'Saved',
  'profile.interfaceLanguageError': 'Could not save your language. Try again.',

  // Common buttons
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.publish': 'Publish',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.columns': 'Columns',
  'common.bulkActions': 'Bulk actions',
  'common.addNew': 'Add new',
  'common.edit': 'Edit',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.loading': 'Loading…',

  // List screens
  'list.empty': 'No documents yet.',
  'list.noResults': 'No results match your search.',
  'list.previous': 'Prev',
  'list.next': 'Next',

  // Status labels
  'status.draft': 'Draft',
  'status.published': 'Published',
  'status.scheduled': 'Scheduled',

  // Sign-in
  'login.heading': 'Admin Login',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',

  // Settings and reference pages
  'settings.heading': 'Settings',
  'interfaceLanguages.title': 'Interface languages',
  'interfaceLanguages.description':
    'The admin screens are translated from the reference table in code. Strings are read-only here. To change one, edit src/features/uiStrings.',
  'interfaceLanguages.search': 'Search keys or text',
  'interfaceLanguages.keyColumn': 'Key',
  'interfaceLanguages.englishColumn': 'English',
  'interfaceLanguages.coverage': 'Coverage',
  'interfaceLanguages.missingOnly': 'Show missing only',
  'interfaceLanguages.noMatches': 'No strings match.',

  // Customer account area (was src/features/multilingual/portalStrings.ts)
  'portal.nav.overview': 'Overview',
  'portal.nav.orders': 'Orders',
  'portal.nav.storeCredit': 'Store credit',
  'portal.nav.subscriptions': 'Subscriptions',
  'portal.nav.addresses': 'Addresses',
  'portal.nav.bookings': 'Event bookings',
  'portal.nav.profile': 'Profile',
  'portal.nav.organizations': 'Organizations',
  'portal.profile.language': 'Language',
  'portal.profile.languageAuto': 'Automatic (match my browser)',
  'portal.profile.languageSave': 'Save language',
} as const

export type UiStringKey = keyof typeof UI_STRING_SOURCE

export type UiDictionary = Record<UiStringKey, string>

/** Keys that belong to the customer portal rather than the admin. */
export function isPortalKey(key: string): boolean {
  return key.startsWith('portal.')
}
