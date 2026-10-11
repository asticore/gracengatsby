/**
 * Which edit pages get a results tab, and what it is called.
 *
 * Kept free of React and of server-only imports: EditView (a server component)
 * uses it to decide whether to wrap the form, and the tests use it directly.
 * The panel for each slug is chosen in EditView itself, because the A/B panel
 * is a server component and cannot live in a client module map.
 */

export type ResultsTab = {
  label: string
  /** The collection whose read permission gates the tab. */
  collection: string
  /**
   * When set, the tab also needs admin or update permission on this collection. The RSVPs list is
   * the event's full list, so an owner of one RSVP (who can read it but not the event) must not see it.
   */
  updateOf?: string
}

const RESULTS_TABS: Record<string, ResultsTab> = {
  events: { label: 'RSVPs', collection: 'event-rsvps', updateOf: 'events' },
  forms: { label: 'Submissions', collection: 'form-submissions' },
  'ab-tests': { label: 'Results', collection: 'ab-tests' },
}

/** What the signed-in user may do, as the edit page knows it. */
export type ResultsAccess = {
  isAdmin: boolean
  canRead: (collection: string) => boolean
  canUpdate: (collection: string) => boolean
}

export const RESULTS_HASH = 'results'

/**
 * The results tab for an existing document, or null. Never on the create page
 * (there is nothing to report yet), never for a slug without one, and never
 * when the signed-in user cannot read the collection the tab shows.
 */
export function resultsTabFor(slug: string, id: number | undefined, access: ResultsAccess): ResultsTab | null {
  if (id === undefined) return null
  const tab = Object.prototype.hasOwnProperty.call(RESULTS_TABS, slug) ? RESULTS_TABS[slug] : undefined
  if (!tab) return null
  if (!access.canRead(tab.collection)) return null
  if (tab.updateOf && !access.isAdmin && !access.canUpdate(tab.updateOf)) return null
  return tab
}

/** `#results` selects the results tab; anything else is the edit tab. */
export function tabFromHash(hash: string): 'edit' | 'results' {
  return hash.replace(/^#/, '') === RESULTS_HASH ? 'results' : 'edit'
}
