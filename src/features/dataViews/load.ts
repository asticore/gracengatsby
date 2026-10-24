import { sql } from 'drizzle-orm'

import { getEngine } from '@/engine'
import { getDb } from '@/cms/db/connect'
import { loadFieldGroups } from '@/features/customFields/server'

import { readCachedView, writeCachedView } from './cache'
import { normalizeDataView } from './config'
import { resolveTableData, type ResolveDeps } from './resolve'
import { DATA_VIEWS_SLUG } from './slugs'
import type { DataViewDef, DataViewModel } from './types'

/**
 * Server-side loading: reads a saved view, resolves its data with caching, and applies the
 * public/private rule used by the embed page and the data endpoints.
 */

/** Collections where a password can protect a single document. */
const PASSWORD_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])

export const defaultDeps: ResolveDeps = {
  async findDocs(collection, { versioned, sort, limit }) {
    const engine = await getEngine()
    const result = await engine.find({
      collection: collection as never,
      where: versioned ? { _status: { equals: 'published' } } : undefined,
      sort,
      limit,
      depth: 0,
      overrideAccess: true,
    } as never)
    return (result.docs ?? []) as unknown as Record<string, unknown>[]
  },
  loadGroups: loadFieldGroups,
  async protectedIds(collection) {
    if (!PASSWORD_COLLECTIONS.has(collection)) return new Set()
    // Not caught here: if the password table cannot be read, the view fails rather than listing protected documents.
    const db = await getDb()
    const rows = (await db.all(sql`SELECT doc_id FROM \`eg_content_passwords\` WHERE collection = ${collection} UNION SELECT doc_id FROM \`eg_content_access\` WHERE collection = ${collection}`)) as { doc_id: number }[]
    return new Set(rows.map((row) => Number(row.doc_id)))
  },
}

/** A reference is a numeric id or a slug. */
export function parseRef(ref: string): { id: number } | { slug: string } | null {
  const text = decodeURIComponent(ref).trim()
  if (/^\d{1,12}$/.test(text)) return { id: Number(text) }
  if (/^[a-z0-9][a-z0-9-]{0,59}$/.test(text)) return { slug: text }
  return null
}

export async function findViewDoc(ref: string): Promise<Record<string, unknown> | null> {
  let parsed: ReturnType<typeof parseRef>
  try {
    parsed = parseRef(ref)
  } catch {
    return null
  }
  if (!parsed) return null
  const engine = await getEngine()
  if ('id' in parsed) {
    const doc = await engine.findByID({ collection: DATA_VIEWS_SLUG as never, id: parsed.id, depth: 0, overrideAccess: true } as never).catch((): null => null)
    return (doc as unknown as Record<string, unknown> | null) ?? null
  }
  const result = await engine.find({ collection: DATA_VIEWS_SLUG as never, where: { slug: { equals: parsed.slug } }, limit: 1, depth: 0, overrideAccess: true } as never)
  return ((result.docs?.[0] as unknown as Record<string, unknown> | undefined) ?? null)
}

/** Resolves a definition to its model, using the cache. `deps` is replaceable for tests. */
export async function modelFor(def: DataViewDef, deps: ResolveDeps = defaultDeps): Promise<DataViewModel> {
  const collection = def.source === 'custom-fields' ? def.data.collection : null
  const key = `${def.id}:${def.updatedAt ?? ''}`
  const cached = def.id ? readCachedView<DataViewModel>(key, collection) : undefined
  if (cached) return cached
  const data = await resolveTableData(def, deps)
  const model: DataViewModel = { view: { id: def.id, title: def.title, slug: def.slug, kind: def.kind, display: def.display, chart: def.chart }, data }
  if (def.id) writeCachedView(key, collection, model)
  return model
}

export type LoadResult = { status: 'ok'; def: DataViewDef; model: DataViewModel } | { status: 'not-found' } | { status: 'private' } | { status: 'error' }

/**
 * Loads a view by id or slug. With `requirePublic`, a view that is not marked public answers
 * 'private' (the callers send the same 404 as for a missing view, so existence is not revealed).
 */
export async function loadDataView(ref: string, options: { requirePublic: boolean }, deps: ResolveDeps = defaultDeps): Promise<LoadResult> {
  try {
    const doc = await findViewDoc(ref)
    if (!doc) return { status: 'not-found' }
    const def = normalizeDataView(doc)
    if (options.requirePublic && !def.isPublic) return { status: 'private' }
    return { status: 'ok', def, model: await modelFor(def, deps) }
  } catch (error) {
    console.error('data view could not be loaded', error)
    return { status: 'error' }
  }
}
