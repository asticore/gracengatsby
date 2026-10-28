import type { UiStringKey } from '@/features/uiStrings'

/**
 * Sidebar group label (as declared in navStructure.ts) to its reference-table key.
 * The English label stays the identity for open/closed state, so a user's saved
 * nav preference survives a language change. Only the displayed text changes.
 */
export const NAV_GROUP_KEYS: Record<string, UiStringKey> = {
  Content: 'nav.group.content',
  Shop: 'nav.group.shop',
  Members: 'nav.group.members',
  Courses: 'nav.group.courses',
  Ads: 'nav.group.ads',
  SEO: 'nav.group.seo',
  Settings: 'nav.group.settings',
  Other: 'nav.group.other',
}
