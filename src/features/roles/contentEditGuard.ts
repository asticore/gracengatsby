/**
 * Content editing guards to enforce role-based restrictions on block editing and publishing.
 * Handles both layout changes (add/remove/reorder blocks) and styling changes.
 */

import type { CollectionBeforeChangeHook } from '@/engine'
import { can } from './permissions'

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

/**
 * Before-change hook for enforcing publish permissions.
 * Applied to collections with drafts: Pages, Posts, Products, Events, Courses.
 *
 * Non-publishers can only save drafts. If a document is already published,
 * non-publishers cannot modify it.
 *
 * Behavior:
 * - On create: force _status = 'draft'
 * - On update: if !can(publish) and would become published, force 'draft'
 * - On update: if !can(publish) and original is published, throw error (cannot edit published)
 */
export const publishGuard: CollectionBeforeChangeHook = async (args: unknown): Promise<void> => {
  const { data, originalDoc, req, operation, collection } = args as any

  // System writes (cron, scheduled publish, scripts) have no user: never guard them.
  if (!req?.user) return
  // Skip for admins
  if (req.user.roles?.includes('admin')) return

  // Check if user has publish permission
  const canPublish = can(req.user, collection?.slug as any, 'publish')

  if (operation === 'create') {
    // Always draft on create for non-publishers
    if (!canPublish) {
      data._status = 'draft'
    }
    return
  }

  if (operation === 'update') {
    // If original was published and user can't publish, block the update
    if (originalDoc?._status === 'published' && !canPublish) {
      await throwValidation('_status', 'Your role can save drafts but not change a published document. Ask an editor to publish.')
    }

    // If trying to publish and user can't, force to draft
    if (data._status === 'published' && !canPublish) {
      data._status = 'draft'
    }
  }
}
