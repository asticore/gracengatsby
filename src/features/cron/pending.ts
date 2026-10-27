import { adminCollectionPath } from '@/admin/adminPaths'
/**
 * The scheduled publishes and unpublishes still waiting to run, as rows the
 * Scheduled tasks screen can show. Pure: the rows and titles are passed in.
 */

/** Collections that can be scheduled (the same five the scheduled publish runner accepts). */
export const SCHEDULED_COLLECTIONS = ['pages', 'posts', 'events', 'courses', 'products'] as const

export type ScheduleRow = {
  collection: string
  doc_id: number
  publish_at: string | null
  unpublish_at: string | null
  publish_done: number | null
  unpublish_done: number | null
}

export type PendingAction = {
  collection: string
  docId: number
  title: string | null
  action: 'Publish' | 'Unpublish'
  when: string
  href: string
}

export const titleKey = (collection: string, docId: number): string => `${collection}:${docId}`

/** Expands each schedule row into the actions still to do, soonest first. Rows for unknown collections are dropped. */
export function pendingActions(rows: ScheduleRow[], titles: Map<string, string | null>): PendingAction[] {
  const allowed = new Set<string>(SCHEDULED_COLLECTIONS)
  const actions: PendingAction[] = []
  for (const row of rows) {
    if (!allowed.has(row.collection)) continue
    const title = titles.get(titleKey(row.collection, row.doc_id)) ?? null
    const href = `${adminCollectionPath(row.collection)}/${row.doc_id}`
    if (row.publish_at && !row.publish_done) {
      actions.push({ collection: row.collection, docId: row.doc_id, title, action: 'Publish', when: row.publish_at, href })
    }
    if (row.unpublish_at && !row.unpublish_done) {
      actions.push({ collection: row.collection, docId: row.doc_id, title, action: 'Unpublish', when: row.unpublish_at, href })
    }
  }
  return actions.sort((a, b) => a.when.localeCompare(b.when))
}
