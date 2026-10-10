import type { Engine } from '@/engine'
import type { Drizzle } from '@/localapi/migrate'
import { listDue, markDone } from '@/cms/db/scheduledPublishes'
import { purgeCache } from '@/features/speed/purge'
import { loadApprovalSettings, publishBlockMessage } from '@/features/approval/settings'

/**
 * Summary of scheduled publish/unpublish actions executed.
 */
export interface RunDueResult {
  published: Array<{ collection: string; docId: number }>
  unpublished: Array<{ collection: string; docId: number }>
  failed: Array<{ collection: string; docId: number; action: 'publish' | 'unpublish'; error: string }>
  /**
   * Publishes held back because the document still needs approval. The schedule is left in place,
   * so the next run publishes it once it is approved.
   */
  skipped: Array<{ collection: string; docId: number; action: 'publish' | 'unpublish'; reason: string }>
}

/**
 * List all documents with schedules due by the given time, execute the
 * publish/unpublish actions, mark them done, and purge affected page caches.
 *
 * Per-item try/catch ensures one failure never blocks the rest.
 * Only works for the five drafts collections: pages, posts, events, courses, products.
 */
export async function runDueSchedules(engine: Engine, db: Drizzle, nowIso: string): Promise<RunDueResult> {
  const result: RunDueResult = {
    published: [],
    unpublished: [],
    failed: [],
    skipped: [],
  }

  try {
    const due = await listDue(db, nowIso)
    const approvalSettings = await loadApprovalSettings(engine)

    for (const { collection, docId, action } of due) {
      // Validate collection is one of the five drafts collections
      const validCollections = ['pages', 'posts', 'events', 'courses', 'products']
      if (!validCollections.includes(collection)) {
        result.failed.push({
          collection,
          docId,
          action,
          error: 'Invalid collection for scheduling',
        })
        continue
      }

      try {
        // Fetch the current document
        const doc = await engine.findByID({
          collection,
          id: docId,
          overrideAccess: true,
        })

        if (!doc) {
          result.failed.push({
            collection,
            docId,
            action,
            error: 'Document not found',
          })
          continue
        }

        // Prepare update data
        const updateData: Record<string, unknown> = {
          _status: action === 'publish' ? 'published' : 'draft',
        }

        // Content approval: a scheduled publish waits until the document is approved. Nothing
        // is marked done, so the next run picks it up after approval.
        if (action === 'publish') {
          const reason = publishBlockMessage({
            settings: approvalSettings,
            collection,
            reviewStatus: (doc as { reviewStatus?: unknown }).reviewStatus,
            isAdmin: false,
          })
          if (reason) {
            result.skipped.push({ collection, docId, action, reason })
            continue
          }
          if (approvalSettings.enabled) {
            // Publishing ends the review.
            updateData.reviewStatus = 'none'
            updateData.reviewApprovals = []
            updateData.reviewRequestedBy = null
            updateData.reviewRequestedAt = null
          }
        }

        // Execute the update through the engine with overrideAccess to bypass permission checks
        await engine.update({
          collection,
          id: docId,
          data: updateData,
          overrideAccess: true,
        })

        // Mark this action as done
        await markDone(db, collection, docId, action)

        // Purge cache for pages collection (other collections don't have public URLs)
        if (collection === 'pages') {
          try {
            // Purge the page path - we'll use a simple heuristic
            // Pages have a slug field that determines their path
            await purgeCache(`/pages/${docId}`)
          } catch (cacheError) {
            // Log but don't fail the action for cache errors
            console.warn(`Failed to purge cache for page ${docId}:`, cacheError)
          }
        }

        // Track success
        if (action === 'publish') {
          result.published.push({ collection, docId })
        } else {
          result.unpublished.push({ collection, docId })
        }
      } catch (itemError) {
        result.failed.push({
          collection,
          docId,
          action,
          error: itemError instanceof Error ? itemError.message : String(itemError),
        })
      }
    }
  } catch (listError) {
    console.error('Failed to list due schedules:', listError)
  }

  return result
}
