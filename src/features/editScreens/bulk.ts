/**
 * Bulk actions on the Pages, Posts and Events lists: publish, switch to draft,
 * move to trash, restore, delete for good, change author, change category.
 *
 * The request is validated here and each row is handled on its own: a row the
 * user may not touch fails with its own message and the rest still go ahead.
 * Writes go through the engine with the signed-in user and access rules ON, so
 * the collection's own access (including "own items only" roles) and its
 * before-change hooks (publish guard, lock guard, trash guard) apply per row.
 * This module only adds the checks the hooks cannot make: the action's own
 * permission up front, and who may be made the author.
 */

export const BULK_COLLECTIONS = ['pages', 'posts', 'events'] as const
export type BulkCollection = (typeof BULK_COLLECTIONS)[number]

export const BULK_ACTIONS = ['publish', 'unpublish', 'trash', 'restore', 'delete', 'changeAuthor', 'changeCategory'] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]

export const MAX_BULK_IDS = 100

export type CategoryMode = 'add' | 'replace' | 'remove'

export type BulkRequest = {
  collection: BulkCollection
  ids: number[]
  action: BulkAction
  /** changeAuthor: the user id. */
  author?: number
  /** changeCategory: what to do with which category. */
  category?: { name: string; mode: CategoryMode }
}

export type BulkRowResult = { id: number; ok: boolean; error?: string }

const isCollection = (value: unknown): value is BulkCollection => typeof value === 'string' && (BULK_COLLECTIONS as readonly string[]).includes(value)
const isAction = (value: unknown): value is BulkAction => typeof value === 'string' && (BULK_ACTIONS as readonly string[]).includes(value)

/** Validates an untrusted request body. Nothing else in this module trusts the client. */
export function parseBulkRequest(body: unknown): { ok: true; request: BulkRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a JSON body.' }
  const b = body as Record<string, unknown>
  if (!isCollection(b.collection)) return { ok: false, error: 'Bulk actions work on pages, posts and events.' }
  if (!isAction(b.action)) return { ok: false, error: 'Unknown action.' }
  if (!Array.isArray(b.ids) || b.ids.length === 0) return { ok: false, error: 'Choose at least one item.' }
  if (b.ids.length > MAX_BULK_IDS) return { ok: false, error: `Choose at most ${MAX_BULK_IDS} items at a time.` }
  const ids: number[] = []
  for (const raw of b.ids) {
    const id = Number(raw)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'An item id is not valid.' }
    if (!ids.includes(id)) ids.push(id)
  }

  const request: BulkRequest = { collection: b.collection, ids, action: b.action }

  if (b.action === 'changeAuthor') {
    const author = Number(b.author)
    if (!Number.isInteger(author) || author <= 0) return { ok: false, error: 'Choose who the new author is.' }
    request.author = author
  }

  if (b.action === 'changeCategory') {
    if (b.collection !== 'posts') return { ok: false, error: 'Only posts have categories.' }
    const raw = b.category as { name?: unknown; mode?: unknown } | undefined
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 80) : ''
    const mode = raw?.mode
    if (!name) return { ok: false, error: 'Type the category name.' }
    if (mode !== 'add' && mode !== 'replace' && mode !== 'remove') return { ok: false, error: 'Choose add, replace or remove.' }
    request.category = { name, mode }
  }

  return { ok: true, request }
}

/** What the signed-in user may do on the collection, worked out by the route from the permission table. */
export type BulkPermissions = {
  isAdmin: boolean
  update: boolean
  publish: boolean
  delete: boolean
  /** Update rights that reach other people's documents (not limited to "own items only"). */
  editOthers: boolean
}

/** The refusal for the whole action, or null when the user may attempt it. */
export function actionRefusal(action: BulkAction, permissions: BulkPermissions): string | null {
  switch (action) {
    case 'publish':
    case 'unpublish':
      return permissions.publish ? null : 'Your role cannot publish or unpublish. Ask an editor.'
    case 'trash':
    case 'restore':
    case 'delete':
      return permissions.delete ? null : 'Your role cannot delete or restore. Ask an administrator.'
    case 'changeAuthor':
      return permissions.isAdmin || (permissions.update && permissions.editOthers)
        ? null
        : 'Changing the author needs an administrator, or a role that can edit other people\'s work.'
    case 'changeCategory':
      return permissions.update ? null : 'Your role cannot edit this.'
  }
}

/** The new category list for a post, given its current one. */
export function applyCategory(current: unknown, change: { name: string; mode: CategoryMode }): Array<{ name: string }> {
  const names: string[] = []
  if (Array.isArray(current)) {
    for (const entry of current) {
      const name = entry && typeof entry === 'object' ? (entry as { name?: unknown }).name : undefined
      if (typeof name === 'string' && name.trim()) names.push(name.trim())
    }
  }
  const lower = change.name.toLowerCase()
  let next: string[]
  if (change.mode === 'replace') next = [change.name]
  else if (change.mode === 'remove') next = names.filter((name) => name.toLowerCase() !== lower)
  else next = names.some((name) => name.toLowerCase() === lower) ? names : [...names, change.name]
  return next.map((name) => ({ name }))
}

/** The update data for a simple status or trash action. Null for actions that need more than a patch. */
export function patchFor(action: BulkAction, now = new Date()): Record<string, unknown> | null {
  switch (action) {
    case 'publish':
      return { _status: 'published' }
    case 'unpublish':
      return { _status: 'draft' }
    case 'trash':
      return { trashedAt: now.toISOString(), _status: 'draft' }
    case 'restore':
      return { trashedAt: null }
    default:
      return null
  }
}

/** The fields a change of author writes. Posts also carry a public byline. */
export function authorPatch(collection: BulkCollection, author: number): Record<string, unknown> {
  return collection === 'posts' ? { createdBy: author, author } : { createdBy: author }
}

/** The slice of the engine this module uses, so tests can pass a stand-in. */
export type BulkEngine = {
  findByID: (args: { collection: string; id: number; depth?: number; overrideAccess?: boolean; user?: unknown }) => Promise<unknown>
  update: (args: { collection: string; id: number; data: Record<string, unknown>; user?: unknown; overrideAccess?: boolean }) => Promise<unknown>
  delete: (args: { collection: string; id: number; user?: unknown; overrideAccess?: boolean }) => Promise<unknown>
}

const messageOf = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; data?: { errors?: Array<{ message?: string }> } }
    const first = e.data?.errors?.[0]?.message
    if (typeof first === 'string' && first) return first
    if (typeof e.message === 'string' && e.message) return e.message
  }
  return 'Could not change this one.'
}

/**
 * Applies the request one row at a time as `user`. Never throws for a single
 * row: a refusal or failure becomes that row's result. The caller has already
 * run actionRefusal and checked that `author` may be made an author.
 */
export async function runBulk(engine: BulkEngine, user: unknown, request: BulkRequest, now = new Date()): Promise<BulkRowResult[]> {
  const results: BulkRowResult[] = []
  for (const id of request.ids) {
    try {
      if (request.action === 'delete' || request.action === 'publish') {
        const current = (await engine.findByID({ collection: request.collection, id, depth: 0, user, overrideAccess: false })) as Record<string, unknown> | null
        if (!current) {
          results.push({ id, ok: false, error: 'Not found or not yours to change.' })
          continue
        }
        if (request.action === 'publish') {
          if (current.trashedAt) {
            results.push({ id, ok: false, error: 'Restore this from the trash before publishing it.' })
            continue
          }
          await engine.update({ collection: request.collection, id, data: { _status: 'published' }, user, overrideAccess: false })
          results.push({ id, ok: true })
          continue
        }
        if (!current.trashedAt || current.isHomepage) {
          results.push({ id, ok: false, error: current.isHomepage ? 'The homepage cannot be deleted.' : 'Move this to the trash before deleting it.' })
          continue
        }
        await engine.delete({ collection: request.collection, id, user, overrideAccess: false })
      } else if (request.action === 'changeCategory' && request.category) {
        const doc = (await engine.findByID({ collection: request.collection, id, depth: 0, user, overrideAccess: false })) as Record<string, unknown> | null
        if (!doc) {
          results.push({ id, ok: false, error: 'Not found or not yours to change.' })
          continue
        }
        await engine.update({
          collection: request.collection,
          id,
          data: { categories: applyCategory(doc.categories, request.category) },
          user,
          overrideAccess: false,
        })
      } else if (request.action === 'changeAuthor' && request.author !== undefined) {
        await engine.update({ collection: request.collection, id, data: authorPatch(request.collection, request.author), user, overrideAccess: false })
      } else {
        const patch = patchFor(request.action, now)
        if (!patch) {
          results.push({ id, ok: false, error: 'Unknown action.' })
          continue
        }
        await engine.update({ collection: request.collection, id, data: patch, user, overrideAccess: false })
      }
      results.push({ id, ok: true })
    } catch (error) {
      results.push({ id, ok: false, error: messageOf(error) })
    }
  }
  return results
}

/** One sentence for the result: how many changed and how many were refused. */
export function summariseResults(results: BulkRowResult[]): string {
  const done = results.filter((r) => r.ok).length
  const failed = results.length - done
  if (failed === 0) return `${done} ${done === 1 ? 'item' : 'items'} updated.`
  if (done === 0) return `Nothing was changed. ${failed} ${failed === 1 ? 'item was' : 'items were'} refused.`
  return `${done} updated, ${failed} refused.`
}
