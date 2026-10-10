/**
 * Content editing guards to enforce role-based restrictions on block editing and publishing.
 * Handles both layout changes (add/remove/reorder blocks) and styling changes.
 */

import type { CollectionBeforeChangeHook } from '@/engine'
import { can } from './permissions'
import { loadApprovalSettings, publishBlockMessage } from '@/features/approval/settings'
import {
  hashReviewedContent,
  parseStatus,
  parseStoredReview,
  resetOnEdit,
  serializeStoredReview,
} from '@/features/approval/stateMachine'

/**
 * Pure function to apply content-only edit restrictions.
 * Validates incoming data against original and restores protected fields.
 *
 * @param options - {
 *   original: the original blocks data
 *   incoming: the new blocks data
 *   canStyle: boolean, whether the user can edit styles
 *   canLayout: boolean, whether the user can edit layout
 *   blocksField: string, the name of the blocks field ('fields', 'layout', 'content')
 * }
 * @returns { data: modified incoming data, error?: string }
 */
export function applyContentOnlyEdit({
  original,
  incoming,
  canStyle,
  canLayout,
  blocksField,
}: {
  original: unknown
  incoming: Record<string, any>
  canStyle: boolean
  canLayout: boolean
  blocksField: string
}): { data: Record<string, any>; error?: string } {
  // Ensure original is an array
  if (!Array.isArray(original)) {
    return { data: incoming }
  }

  // Get incoming blocks (should also be an array)
  const incomingBlocks = incoming[blocksField]
  if (!Array.isArray(incomingBlocks)) {
    return { data: incoming }
  }

  const result = { ...incoming }

  // Layout restriction: blocks must have same ids, order, and blockType (only if !canLayout)
  if (!canLayout) {
    const originalIds = original.map((b: any) => b.id)
    const incomingIds = incomingBlocks.map((b: any) => b.id)

    if (originalIds.length !== incomingIds.length || !originalIds.every((id, i) => id === incomingIds[i])) {
      return { data: incoming, error: 'Your role can edit the text in sections but cannot add, remove or reorder them.' }
    }

    // Check blockType matches
    for (let i = 0; i < original.length; i++) {
      if (original[i].blockType !== incomingBlocks[i].blockType) {
        return { data: incoming, error: 'Your role can edit the text in sections but cannot add, remove or reorder them.' }
      }
    }
  }

  // Style restriction: restore protected style fields (only if !canStyle)
  if (!canStyle) {
    result[blocksField] = incomingBlocks.map((incomingBlock, i) => {
      const originalBlock = original[i]
      const restored = { ...incomingBlock }

      // Always restore design for all blocks
      if (originalBlock.design !== undefined) {
        restored.design = originalBlock.design
      }

      // Restore styling fields based on block type
      if (incomingBlock.blockType === 'imageText' && originalBlock.imageSide !== undefined) {
        restored.imageSide = originalBlock.imageSide
      }
      if (incomingBlock.blockType === 'ctaBanner' && originalBlock.style !== undefined) {
        restored.style = originalBlock.style
      }
      if (incomingBlock.blockType === 'loop' && originalBlock.columns !== undefined) {
        restored.columns = originalBlock.columns
      }
      if (incomingBlock.blockType === 'section' && originalBlock.columns !== undefined) {
        // Restore the section's columns structure (layout)
        restored.columns = originalBlock.columns
      }

      // For element block, only restore design
      if (incomingBlock.blockType === 'element' && originalBlock.design !== undefined) {
        restored.design = originalBlock.design
      }

      return restored
    })
  }

  return { data: result }
}

/** Throws the engine's ValidationError so REST answers 400 with the message. */
async function throwValidation(path: string, message: string): Promise<never> {
  const { ValidationError } = await import('@/localapi/operations')
  throw new ValidationError([{ path, message }])
}

/**
 * Before-change hook for enforcing content-edit-only restrictions (layout + style).
 * Applied to collections with blocks: Pages, Posts, Products, Lessons.
 *
 * Skips:
 * - Admin users
 * - Create operations
 * - Operations with no blocks field
 *
 * Enforces:
 * - Layout changes (add/remove/reorder) when !canLayout
 * - Style changes (design, imageSide, etc.) when !canStyle
 */
export const contentEditGuard: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, operation, collection } = args as any

  // System writes (cron, scheduled publish, scripts) have no user: never guard them.
  if (!req?.user) return
  // Skip for admins
  if (req.user.roles?.includes('admin')) return

  // Skip for create operations (no original to compare)
  if (operation === 'create') return

  // Get the blocks field name based on collection
  let blocksField: string | null = null
  const slug = collection?.slug
  if (slug === 'pages' || slug === 'page-templates') {
    blocksField = 'blocks'
  } else if (slug === 'posts') {
    blocksField = 'layout'
  } else if (slug === 'products') {
    blocksField = 'layout'
  } else if (slug === 'lessons') {
    blocksField = 'content'
  }

  // Skip if no blocks field or no incoming blocks
  if (!blocksField || !data[blocksField]) {
    return
  }

  // Check permissions
  const canEditStyle = can(req.user, 'content.editStyle', 'update')
  const canEditLayout = can(req.user, 'content.editLayout', 'update')

  // If user can edit both, allow
  if (canEditStyle && canEditLayout) {
    return
  }

  // Apply the content-only edit restrictions
  const result = applyContentOnlyEdit({
    original: originalDoc?.[blocksField] || [],
    incoming: data,
    canStyle: canEditStyle,
    canLayout: canEditLayout,
    blocksField,
  })

  if (result.error) {
    await throwValidation(blocksField, result.error)
  }

  // Update data with restricted version
  Object.assign(data, result.data)
}

/** A relationship value may arrive as an id or as a populated object. Stored form is the id. */
const relationId = (value: unknown): number | null => {
  const raw = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Keeps the review fields server-owned. On create they start empty. On update they come from the
 * stored document, whatever the client sent. An approved document that is edited goes back to
 * review with its approvals cleared (the approval was for the old content). A document in review
 * whose content changed keeps its place in review but loses its approvals, for the same reason.
 * "Changed" is judged by a hash of the reviewed content, stored with the approvals.
 */
function applyReviewFieldRules(data: Record<string, any>, originalDoc: Record<string, any> | undefined, operation: string): void {
  if (operation === 'create' || !originalDoc) {
    data.reviewStatus = 'none'
    data.reviewRequestedBy = null
    data.reviewRequestedAt = null
    data.reviewApprovals = []
    return
  }

  const stored = parseStoredReview(originalDoc.reviewApprovals)
  const status = parseStatus(originalDoc.reviewStatus)
  // The document as it will be after this save. Fields the client did not send keep their stored value.
  const merged = { ...originalDoc, ...data }
  const contentHash = hashReviewedContent(merged)
  // Without a stored hash (rows from before hashes were kept) the approvals cannot be matched to the content, so they are dropped.
  const contentChanged = stored.hash === null || stored.hash !== contentHash

  const next = resetOnEdit(
    { status, requestedBy: relationId(originalDoc.reviewRequestedBy), approvals: stored.approvals },
    contentChanged,
  )
  data.reviewStatus = next.status
  data.reviewRequestedBy = next.requestedBy
  data.reviewRequestedAt = originalDoc.reviewRequestedAt ?? null
  data.reviewApprovals = serializeStoredReview({
    hash: next.status === 'in_review' ? contentHash : null,
    approvals: next.approvals,
  })
}

/**
 * Before-change hook for enforcing publish permissions and content approval.
 * Applied to collections with drafts: Pages, Posts, Products, Events, Courses.
 *
 * Non-publishers can only save drafts. If a document is already published,
 * non-publishers cannot modify it.
 *
 * Behavior:
 * - On create: force _status = 'draft' for non-publishers
 * - On update: if !can(publish) and original is published, throw error (cannot edit published)
 * - On update: if !can(publish) and would become published, force 'draft'
 * - Review (when the approval rules require it for this collection): a non-admin cannot leave a
 *   document published from an ordinary save. Publishing a reviewed document goes through the
 *   approval routes, which write without a user and so are not guarded here.
 * - Review fields are server-owned on every user write (see applyReviewFieldRules).
 * - Admins skip the publish checks but not the review field rules.
 */
export const publishGuard: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, operation, collection } = args as any

  // System writes (cron, scheduled publish, scripts) have no user: never guard them.
  if (!req?.user) return

  const isAdmin = Boolean(req.user.roles?.includes('admin'))
  const slug = String(collection?.slug ?? '')

  applyReviewFieldRules(data, originalDoc, operation)

  if (!isAdmin) {
    // Check if user has publish permission
    const canPublish = can(req.user, slug as any, 'publish')

    if (operation === 'create') {
      // Always draft on create for non-publishers
      if (!canPublish) {
        data._status = 'draft'
      }
    } else if (operation === 'update') {
      // If original was published and user can't publish, block the update
      if (originalDoc?._status === 'published' && !canPublish) {
        await throwValidation('_status', 'Your role can save drafts but not change a published document. Ask an editor to publish.')
      }

      // If trying to publish and user can't, force to draft
      if (data._status === 'published' && !canPublish) {
        data._status = 'draft'
      }
    }

    const effectiveStatus = data._status ?? (operation === 'update' ? originalDoc?._status : undefined)
    if (effectiveStatus === 'published') {
      const settings = await loadApprovalSettings(req.engine)
      const reason = publishBlockMessage({ settings, collection: slug, reviewStatus: data.reviewStatus, isAdmin: false })
      if (reason) {
        await throwValidation('_status', reason)
      }
    }
  }

  // Publishing ends any review: the document is no longer waiting on anyone.
  const effectiveStatus = data._status ?? (operation === 'update' ? originalDoc?._status : undefined)
  if (effectiveStatus === 'published') {
    data.reviewStatus = 'none'
    data.reviewRequestedBy = null
    data.reviewRequestedAt = null
    data.reviewApprovals = []
  }
}
