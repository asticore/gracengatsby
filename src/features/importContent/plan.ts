/**
 * Pure planning: decides what each item will do (create, replace a draft,
 * skip, or fail) before anything is written. The preview and the real import
 * both use this, so the preview always matches what the import does.
 */

import { itemSlug } from './items'
import type { ConflictMode, ContentType, ImportItem, ItemStatus } from './types'

export type ExistingDoc = { id: number; draft: boolean }
/** Existing documents by slug, for each content type. */
export type ExistingIndex = Record<ContentType, Map<string, ExistingDoc>>

export type PlanAction = 'create' | 'update' | 'skip' | 'error'
export type PlanRow = {
  ref: string
  title: string
  type: ContentType
  /** Address the item will be saved under. */
  slug: string
  status: ItemStatus
  action: PlanAction
  reason: string
  /** True when the address was already taken (in the site or earlier in the file). */
  conflict: boolean
  existingId?: number
}

export type PlanOptions = {
  conflicts: ConflictMode
  keepPublished: boolean
  allowed: Record<ContentType, boolean>
}

export type PlanCounts = { create: number; update: number; skip: number; error: number; pages: number; posts: number }

/** One row per item, in the same order as the items. */
export function planItems(items: ImportItem[], existing: ExistingIndex, options: PlanOptions): { rows: PlanRow[]; counts: PlanCounts } {
  const rows: PlanRow[] = []
  const planned = new Set<string>()
  const keyOf = (type: ContentType, slug: string) => `${type}:${slug}`

  for (const item of items) {
    const base = itemSlug(item)
    const status: ItemStatus = options.keepPublished && item.status === 'published' ? 'published' : 'draft'
    const row = { ref: item.ref, title: item.title, type: item.type, status }
    const taken = existing[item.type].get(base)
    const takenInFile = planned.has(keyOf(item.type, base))

    if (!options.allowed[item.type]) {
      rows.push({ ...row, slug: base, action: 'error', reason: `You do not have permission to create ${item.type === 'page' ? 'pages' : 'posts'}.`, conflict: false })
      continue
    }
    if (!taken && !takenInFile) {
      planned.add(keyOf(item.type, base))
      rows.push({ ...row, slug: base, action: 'create', reason: 'New item.', conflict: false })
      continue
    }

    if (options.conflicts === 'create-with-suffix') {
      let slug = base
      for (let n = 2; n < 100000; n++) {
        if (!existing[item.type].has(`${base}-${n}`) && !planned.has(keyOf(item.type, `${base}-${n}`))) {
          slug = `${base}-${n}`
          break
        }
      }
      planned.add(keyOf(item.type, slug))
      rows.push({ ...row, slug, action: 'create', reason: `The address "${base}" is taken, so it will be saved as "${slug}".`, conflict: true })
      continue
    }

    if (options.conflicts === 'overwrite-drafts-only' && taken && !takenInFile && taken.draft) {
      planned.add(keyOf(item.type, base))
      rows.push({ ...row, slug: base, action: 'update', reason: 'Replaces the existing draft with this address.', conflict: true, existingId: taken.id })
      continue
    }

    const reason = takenInFile && !taken
      ? 'The same address appears earlier in this file, so this copy was skipped.'
      : taken && !taken.draft && options.conflicts === 'overwrite-drafts-only'
        ? 'The existing item with this address is published, so it was left alone.'
        : 'The address is already in use, so this item was skipped.'
    rows.push({ ...row, slug: base, action: 'skip', reason, conflict: true })
  }

  const counts: PlanCounts = { create: 0, update: 0, skip: 0, error: 0, pages: 0, posts: 0 }
  for (const row of rows) {
    counts[row.action]++
    if (row.type === 'page') counts.pages++
    else counts.posts++
  }
  return { rows, counts }
}

/** Parents are created before their children: posts first, then pages by depth in the file. */
export function creationOrder(items: ImportItem[]): number[] {
  const pageIndexBySlug = new Map<string, number>()
  items.forEach((item, index) => {
    if (item.type === 'page') pageIndexBySlug.set(itemSlug(item), index)
  })
  const depthOf = (index: number): number => {
    let depth = 0
    let parent = items[index].parentSlug
    const seen = new Set<string>()
    while (parent && depth < 50 && !seen.has(parent)) {
      seen.add(parent)
      depth++
      const next = pageIndexBySlug.get(parent)
      parent = next === undefined ? null : items[next].parentSlug
    }
    return depth
  }
  const posts = items.map((item, index) => (item.type === 'post' ? index : -1)).filter((index) => index >= 0)
  const pages = items.map((item, index) => (item.type === 'page' ? index : -1)).filter((index) => index >= 0)
  pages.sort((a, b) => depthOf(a) - depthOf(b) || a - b)
  return [...posts, ...pages]
}
