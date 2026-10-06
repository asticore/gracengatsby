/**
 * Pure helpers for quick edit functionality - build PATCH bodies, descendant exclusion
 */

export interface QuickEditData {
  title?: string
  slug?: string
  _status?: 'draft' | 'published'
  parent?: number | string | null
}

/**
 * Build PATCH request body from original and edited values.
 * Only includes fields that changed, plus _status (always).
 */
export function buildQuickEditPatch(
  original: Record<string, unknown>,
  edited: QuickEditData,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (edited.title !== undefined && edited.title !== original.title) {
    patch.title = edited.title
  }
  if (edited.slug !== undefined && edited.slug !== original.slug) {
    patch.slug = edited.slug
  }
  if (edited.parent !== undefined && edited.parent !== original.parent) {
    patch.parent = edited.parent
  }
  // Always include _status to prevent accidental draft flip
  if (edited._status !== undefined) {
    patch._status = edited._status
  }

  return patch
}

/**
 * Get descendant page IDs for a given page.
 * Used to exclude descendants when picking a new parent.
 */
export function getDescendantIds(
  pageId: number | string,
  pages: Array<{ id: number | string; parent?: number | string | null }>,
): Set<number | string> {
  const descendants = new Set<number | string>()

  const visit = (id: number | string) => {
    const children = pages.filter((p) => p.parent === id)
    children.forEach((child) => {
      descendants.add(child.id)
      visit(child.id)
    })
  }

  visit(pageId)
  return descendants
}

/**
 * Check if a collection should show row actions
 */
export function shouldShowRowActions(collectionSlug: string, hasDrafts: boolean): boolean {
  // Show for collections with drafts/versions (pages, posts, products, events, courses)
  // or for specific collections like products/events that we always want actions for
  const actionsCollections = ['pages', 'posts', 'products', 'events', 'courses']
  return hasDrafts || actionsCollections.includes(collectionSlug)
}