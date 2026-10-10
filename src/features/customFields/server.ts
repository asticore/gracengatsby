
import { getEngine } from '@/engine'
import type { FieldGroupDoc } from '@/fields/customFields/types'
import { buildMergeContext, resolveDocumentBlocks } from '@/lib/mergeTags'

import { matchesLocation, type LocationContext } from './location'
import { normalizeFieldGroup } from './normalize'
import { definitionsFor } from './validate'
import { buildCustomFieldContext, collectMediaIds, type MediaUrls } from './stringify'
import { getAllOptionValues } from './options'

/**
 * Server-side loading of Field Groups for the write hook, the admin route and
 * the front end's merge tags. Everything here reads with overrideAccess, since
 * the callers have already decided who may see what.
 */

/** All groups, normalised. Large limit so the list never truncates (the old panel stopped at 100). */
export async function loadFieldGroups(): Promise<FieldGroupDoc[]> {
  const engine = await getEngine()
  const result = await engine.find({
    collection: 'field-groups',
    overrideAccess: true,
    pagination: false,
    depth: 0,
  })
  return (result.docs as unknown as Record<string, unknown>[]).map(normalizeFieldGroup)
}

/** Location context for a saved or form document in a given collection. */
export function locationContextFor(collection: string, doc: Record<string, unknown>, userRoles?: string[] | null): LocationContext {
  const ctx: LocationContext = { collection, status: typeof doc._status === 'string' ? doc._status : null }
  if (userRoles !== undefined) ctx.userRoles = userRoles
  if (collection === 'pages') {
    ctx.pageTemplate = idOf(doc.template)
    ctx.pageParent = idOf(doc.parent)
  }
  if (collection === 'posts') {
    const categories = Array.isArray(doc.categories) ? doc.categories : []
    ctx.postCategories = categories
      .map((c) => (c && typeof c === 'object' ? (c as { name?: unknown }).name : undefined))
      .filter((n): n is string => typeof n === 'string')
    ctx.postTags = Array.isArray(doc.tags) ? doc.tags.filter((t): t is string => typeof t === 'string') : []
  }
  return ctx
}

function idOf(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in value) return (value as { id: number | string }).id
  return null
}

/** Media id -> url for every id in one batched query. */
export async function fetchMediaUrls(ids: number[]): Promise<MediaUrls> {
  const out: MediaUrls = new Map()
  if (ids.length === 0) return out
  const engine = await getEngine()
  const result = await engine.find({
    collection: 'media',
    where: { id: { in: ids } },
    limit: ids.length,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of result.docs as unknown as { id: number; url?: string | null }[]) {
    if (typeof doc.url === 'string') out.set(Number(doc.id), doc.url)
  }
  return out
}

/**
 * Merge-tag context for one document on the public site: its custom fields
 * (only groups whose location matches it), nested paths, media URLs, and option
 * values when the content refers to any. Fail-open: any load error returns the
 * empty map, so a page still renders.
 */
export async function buildDocumentTagContext(
  collection: string,
  doc: Record<string, unknown>,
  options: { needsOptions?: boolean } = {},
): Promise<Record<string, string>> {
  try {
    const groups = await loadFieldGroups()
    const defs = definitionsFor(groups, locationContextFor(collection, doc))
    const values = (doc.customFields && typeof doc.customFields === 'object' ? doc.customFields : {}) as Record<string, unknown>
    const mediaUrls = await fetchMediaUrls(collectMediaIds(defs, values))
    const tags = buildCustomFieldContext(defs, values, { mediaUrls })
    if (options.needsOptions) Object.assign(tags, await loadOptionContext(groups))
    return tags
  } catch (error) {
    console.error('custom field tag context failed; rendering without it', error)
    return {}
  }
}

/** Groups that could show on the editing screen for a collection, after the location check with the given context. */
export function groupsMatching(groups: FieldGroupDoc[], ctx: LocationContext): FieldGroupDoc[] {
  return groups.filter((group) => matchesLocation(group.location, ctx))
}

/**
 * Merge-tag map for every Options page: `option:<slug>.<name>`. Each page's
 * values are stringified with the definitions of the groups that apply to it.
 */
export async function loadOptionContext(groups?: FieldGroupDoc[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const all = await getAllOptionValues()
  const allGroups = groups ?? (await loadFieldGroups())
  const perPage = Object.entries(all).map(([slug, values]) => ({ slug, values, defs: definitionsFor(allGroups, { optionsPage: slug }) }))
  const mediaUrls = await fetchMediaUrls([...new Set(perPage.flatMap((p) => collectMediaIds(p.defs, p.values)))])
  for (const { slug, values, defs } of perPage) {
    for (const [key, tagValue] of Object.entries(buildCustomFieldContext(defs, values, { mediaUrls }))) {
      out[`option:${slug}.${key.slice('field:'.length)}`] = tagValue
    }
  }
  return out
}

/**
 * Merge-tag contexts for the items of a Loop, one per item, in the same order.
 * Groups are loaded once, media URLs fetched in one query. Fail-open: an empty
 * context per item, so the card still renders with its static parts.
 */
export async function buildItemTagContexts(
  collection: string,
  items: Record<string, unknown>[],
  options: { needsOptions?: boolean } = {},
): Promise<Record<string, string>[]> {
  try {
    const groups = await loadFieldGroups()
    const valuesOf = (item: Record<string, unknown>) =>
      (item.customFields && typeof item.customFields === 'object' ? item.customFields : {}) as Record<string, unknown>
    const defsPerItem = items.map((item) => definitionsFor(groups, locationContextFor(collection, item)))
    const mediaIds = defsPerItem.flatMap((defs, i) => collectMediaIds(defs, valuesOf(items[i])))
    const mediaUrls = await fetchMediaUrls([...new Set(mediaIds)])
    const optionTags = options.needsOptions ? await loadOptionContext(groups) : {}
    return items.map((item, i) => ({ ...buildCustomFieldContext(defsPerItem[i], valuesOf(item), { mediaUrls }), ...optionTags }))
  } catch (error) {
    console.error('loop tag contexts failed; rendering items without custom fields', error)
    return items.map(() => ({}))
  }
}

/**
 * A single page's or post's content with merge tags resolved: `blocks` (pages),
 * `layout` (posts) and `content` (rich text). Returns the original values when
 * nothing in them uses a tag, so the common case costs nothing.
 */
export async function resolveDocumentContent<T extends object>(collection: 'pages' | 'posts', doc: T): Promise<T> {
  const record = doc as Record<string, unknown>
  const raw = JSON.stringify({ blocks: record.blocks, layout: record.layout, content: record.content })
  if (!raw || !raw.includes('{{')) return doc
  const tags = await buildDocumentTagContext(collection, record, { needsOptions: raw.includes('{{option:') })
  const context = buildMergeContext(record, collection, undefined, tags)
  const out: Record<string, unknown> = { ...record }
  for (const key of ['blocks', 'layout', 'content']) {
    if (record[key] !== undefined) out[key] = resolveDocumentBlocks(record[key], context)
  }
  return out as T
}
