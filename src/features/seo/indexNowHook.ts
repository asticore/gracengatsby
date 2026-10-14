import { getCloudflareContext } from '@opennextjs/cloudflare'

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from '@/engine'

/**
 * Collection hooks that tell IndexNow about a URL when its document is saved,
 * unpublished or deleted. Never blocks or fails the save: the work runs after
 * the response when the platform allows it.
 *
 * The engine and settings modules are loaded inside the work functions, not at
 * the top of this file. The collection files import this module, so a static
 * import would put them in a cycle with the engine.
 */

type HookCollection = 'pages' | 'posts' | 'products' | 'events'
type HookDoc = {
  id?: unknown
  slug?: unknown
  parent?: unknown
  isHomepage?: unknown
  _status?: unknown
  seo?: { noIndex?: boolean | null } | null
}

/** The public address prefix each non-page collection is served under, as the sitemap uses it. */
const PREFIXES: Record<Exclude<HookCollection, 'pages'>, string> = {
  posts: '/blog',
  products: '/shop',
  events: '/events',
}

/** Same ceiling as the page-parent walk in pagePaths.ts. */
const MAX_PARENT_DEPTH = 8

/** Runs work after the response is sent where the platform allows it. Never rejects. */
const after = (work: Promise<unknown>): void => {
  void getCloudflareContext({ async: true })
    .then(({ ctx }) => {
      const waitUntil = (ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined)?.waitUntil
      if (waitUntil) waitUntil(work)
      else void work
    })
    .catch(() => {
      void work
    })
}

/**
 * The path of a page built from its own slug and its parent chain. This works
 * for drafts and for deleted pages, which the published-only page list does not
 * include.
 */
const pagePath = async (doc: HookDoc): Promise<string | null> => {
  if (doc.isHomepage === true) return '/'
  const { getEngine } = await import('@/lib/engine')
  const { normalisePath } = await import('./settings')
  const engine = await getEngine()

  const segments: string[] = []
  let current: HookDoc | null = doc
  for (let depth = 0; current && depth < MAX_PARENT_DEPTH; depth += 1) {
    if (typeof current.slug !== 'string' || current.slug === '') return null
    segments.unshift(current.slug)
    const parentRef = current.parent
    const parentId = parentRef && typeof parentRef === 'object' ? (parentRef as { id?: unknown }).id : parentRef
    if (!parentId) break
    current = (await engine
      .findByID({ collection: 'pages', id: parentId as number, depth: 0 })
      .catch((): null => null)) as HookDoc | null
  }
  return normalisePath(`/${segments.join('/')}`)
}

const docPath = async (collection: HookCollection, doc: HookDoc): Promise<string | null> => {
  if (collection === 'pages') return pagePath(doc)
  if (typeof doc.slug !== 'string' || doc.slug === '') return null
  const { normalisePath } = await import('./settings')
  return normalisePath(`${PREFIXES[collection]}/${doc.slug}`)
}

/**
 * Sends one document's URL. A published document that is hidden from search
 * (noindex, or behind a password) is left out, as the sitemap leaves it out.
 * An unpublished or deleted one is sent so search engines drop it.
 */
const notify = async (collection: HookCollection, doc: HookDoc, published: boolean): Promise<void> => {
  const id = Number(doc.id)
  if (!Number.isInteger(id) || id <= 0) return

  const { getSeoContext, absoluteUrl } = await import('./settings')
  const { submitIndexNow } = await import('./indexNow')
  const context = await getSeoContext()
  if (!context.enabled) return

  if (published) {
    if (doc.seo?.noIndex) return
    if (collection === 'pages' || collection === 'posts') {
      const { readPasswordGate } = await import('./indexable')
      // A failed check counts as protected, so a gated URL is never sent by mistake.
      const gated = await readPasswordGate(collection, id).catch(() => true)
      if (gated) return
    }
  }

  const path = await docPath(collection, doc)
  if (!path) return
  const url = absoluteUrl(path, context.baseUrl)
  if (url) await submitIndexNow([url])
}

/** afterChange: a save of a published document, or of one that has just been unpublished. */
export const indexNowAfterChange =
  (collection: HookCollection): CollectionAfterChangeHook =>
  async ({ doc, previousDoc }) => {
    try {
      const record = doc as HookDoc | null
      if (!record) return doc
      const isPublished = record._status === 'published'
      const wasPublished = (previousDoc as HookDoc | null)?._status === 'published'
      if (!isPublished && !wasPublished) return doc
      const snapshot = { ...record }
      after(notify(collection, snapshot, isPublished).catch((): undefined => undefined))
    } catch {
      // Best effort only.
    }
    return doc
  }

/** afterDelete: tell IndexNow the URL is gone. */
export const indexNowAfterDelete =
  (collection: HookCollection): CollectionAfterDeleteHook =>
  async ({ doc, id }) => {
    try {
      const record = doc as HookDoc | null
      const snapshot: HookDoc = { ...(record ?? {}), id: record?.id ?? id }
      after(notify(collection, snapshot, false).catch((): undefined => undefined))
    } catch {
      // Best effort only.
    }
    return doc
  }
