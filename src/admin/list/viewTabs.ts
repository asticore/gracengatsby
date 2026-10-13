/**
 * View tab definitions and resolution for different collections.
 * Media: gallery and list
 * Events: calendar and list
 * Pages: list (tree arrives later)
 * Others: list only
 */

export type ViewTab = {
  view: 'list' | 'gallery' | 'calendar' | 'tree'
  label: string
}

export const VIEW_TABS: Record<string, ViewTab[]> = {
  media: [
    { view: 'gallery', label: 'Gallery' },
    { view: 'list', label: 'List' },
  ],
  events: [
    { view: 'calendar', label: 'Calendar' },
    { view: 'list', label: 'List' },
  ],
  pages: [
    { view: 'list', label: 'List' },
    { view: 'tree', label: 'Tree' },
  ],
}

/**
 * Resolve the active tab for a collection.
 * Returns the first tab by default if view is not found.
 */
export function resolveActiveTab(
  tabs: ViewTab[],
  requestedView?: string,
): ViewTab {
  if (requestedView) {
    const found = tabs.find((t) => t.view === requestedView)
    if (found) return found
  }
  return tabs[0]
}

/* -------------------------------------------------------------------------- */
/* Section tabs: a second screen on the same list page                         */
/* -------------------------------------------------------------------------- */

/**
 * Events, Forms and A/B tests each have a second screen beside their normal
 * list: all RSVPs, all submissions, all results. They are shown as a real tab
 * bar at the top of the list page (see ListSectionTabs). The selected tab is
 * `?tab=<key>`; the first tab is the default and leaves the URL clean.
 *
 * Kept free of React and of server-only imports so the list view, the client
 * tab bar and the tests share one definition.
 */
export type SectionTab = {
  key: string
  label: string
  /** The collection whose read permission opens the tab. Omit for the list itself. */
  collection?: string
  /** The tab also needs admin or update permission on this collection (the RSVPs list is every event's RSVPs). */
  updateOf?: string
  /** Shown instead of the panel (and as the tab's tooltip) when the signed-in user may not open it. */
  deniedReason: string
}

export const SECTION_TABS: Record<string, SectionTab[]> = {
  forms: [
    { key: 'forms', label: 'Forms', deniedReason: '' },
    {
      key: 'submissions',
      label: 'Submissions',
      collection: 'form-submissions',
      deniedReason: 'Your role cannot read form submissions. Ask an administrator to give your role Read on Form Submissions.',
    },
  ],
  events: [
    { key: 'events', label: 'Events', deniedReason: '' },
    {
      key: 'rsvps',
      label: 'RSVPs',
      collection: 'event-rsvps',
      updateOf: 'events',
      deniedReason: 'Seeing every RSVP needs an administrator, or a role that can read RSVPs and edit events.',
    },
  ],
  'ab-tests': [
    { key: 'tests', label: 'Tests', deniedReason: '' },
    {
      key: 'results',
      label: 'Results',
      collection: 'ab-tests',
      deniedReason: 'Your role cannot read A/B tests.',
    },
  ],
}

/** What the signed-in user may do, as the list page knows it. */
export type SectionAccess = {
  isAdmin: boolean
  canRead: (collection: string) => boolean
  canUpdate: (collection: string) => boolean
}

export type ResolvedSectionTab = SectionTab & {
  /** False when the user may not open the tab. The tab still shows, disabled, with `deniedReason`. */
  allowed: boolean
  /** The collection's default tab (the first one): the list itself. */
  primary: boolean
}

/** The section tabs for a collection, each marked allowed or not. Empty for a collection without any. */
export function resolveSectionTabs(slug: string, access: SectionAccess): ResolvedSectionTab[] {
  const tabs = Object.prototype.hasOwnProperty.call(SECTION_TABS, slug) ? SECTION_TABS[slug] : undefined
  if (!tabs) return []
  return tabs.map((tab, index) => {
    let allowed = true
    if (!access.isAdmin) {
      if (tab.collection && !access.canRead(tab.collection)) allowed = false
      if (tab.updateOf && !access.canUpdate(tab.updateOf)) allowed = false
    }
    return { ...tab, allowed, primary: index === 0 }
  })
}

/** The tab named by `?tab=`, or the first one when it is missing or unknown. */
export function resolveSectionTab(tabs: ResolvedSectionTab[], requested?: string | null): ResolvedSectionTab {
  const found = requested ? tabs.find((tab) => tab.key === requested) : undefined
  return found ?? tabs[0]
}

/** The query string value for a tab: nothing for the first tab, so the plain list URL stays clean. */
export function sectionTabParam(tab: Pick<ResolvedSectionTab, 'key' | 'primary'>): string | null {
  return tab.primary ? null : tab.key
}

/** Element ids shared by the tab bar (client) and the list page (server). Kept here: a server component cannot call functions exported from a 'use client' file. */
export const sectionTabId = (key: string): string => `lst-tab-${key}`
export const SECTION_PANEL_ID = 'lst-panel'

// Rebuild marker: the earlier deploy was built before the section tab id fix landed.
