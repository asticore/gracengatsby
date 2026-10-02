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
    // { view: 'tree', label: 'Tree' }, // Coming later in task D
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
