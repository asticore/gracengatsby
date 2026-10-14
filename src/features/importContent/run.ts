/**
 * Server side of the import: loads the existing addresses, plans, then writes
 * each item through the engine as the signed-in user, so access rules, hooks,
 * trash and lock guards and authorship all apply. Items are never published
 * unless the user asked to keep published status. Per-item failures are
 * collected, not thrown.
 */

import { convertHtml, type HtmlConversion } from './htmlToBlocks'
import { itemSlug } from './items'
import { lexicalRoot, paragraph } from './lexical'
import { creationOrder, planItems, type ExistingIndex, type PlanOptions, type PlanRow } from './plan'
import type { ContentType, ImportItem } from './types'

export type EngineDoc = { id: number; [key: string]: unknown }
export type ImportEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: EngineDoc[] }>
  create: (args: Record<string, unknown>) => Promise<EngineDoc>
  update: (args: Record<string, unknown>) => Promise<unknown>
}

export type ImportError = { ref: string; title: string; message: string }
export type ImportResult = {
  created: number
  updated: number
  skipped: number
  failed: number
  imagesNotCopied: number
  embedsRemoved: number
  warnings: string[]
  errors: ImportError[]
}

const LOOKUP_CHUNK = 100
const COLLECTION: Record<ContentType, string> = { page: 'pages', post: 'posts' }

/** Looks up which addresses already exist, for both pages and posts, in chunks. */
export async function loadExisting(engine: ImportEngine, items: ImportItem[]): Promise<ExistingIndex> {
  const index: ExistingIndex = { page: new Map(), post: new Map() }
  const slugs = [...new Set(items.map((item) => itemSlug(item)))]
  for (const type of ['page', 'post'] as const) {
    for (let start = 0; start < slugs.length; start += LOOKUP_CHUNK) {
      const chunk = slugs.slice(start, start + LOOKUP_CHUNK)
      const { docs } = await engine.find({
        collection: COLLECTION[type],
        where: { slug: { in: chunk } },
        limit: LOOKUP_CHUNK,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of docs) {
        const slug = String(doc.slug ?? '')
        if (slug) index[type].set(slug, { id: doc.id, draft: doc._status !== 'published' })
      }
    }
  }
  return index
}

/** Counts what the conversion will leave out, for the preview. */
export function conversionTotals(items: ImportItem[]): { imagesNotCopied: number; embedsRemoved: number; emptyPosts: number } {
  let imagesNotCopied = 0
  let embedsRemoved = 0
  let emptyPosts = 0
  for (const item of items) {
    const converted = convertHtml(item.html)
    imagesNotCopied += converted.imagesNotCopied
    embedsRemoved += converted.embedsRemoved
    if (item.type === 'post' && converted.children.length === 0) emptyPosts++
  }
  return { imagesNotCopied, embedsRemoved, emptyPosts }
}

function errorText(error: unknown): string {
  const fields = (error as { errors?: Array<{ message?: string }> } | null)?.errors
  const text = Array.isArray(fields) && fields.length
    ? fields.map((field) => field.message ?? '').filter(Boolean).join(' ')
    : error instanceof Error
      ? error.message
      : 'Something went wrong.'
  return text.slice(0, 300)
}

function documentData(item: ImportItem, row: PlanRow, converted: HtmlConversion, pageIds: Map<string, number>, warnings: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = { title: item.title, slug: row.slug }
  if (item.excerpt) data.excerpt = item.excerpt
  if (item.type === 'post') {
    data.content = lexicalRoot(converted.children.length ? converted.children : [paragraph([])])
    data.categories = item.categories.map((name) => ({ name }))
    if (item.date) data.publishedDate = item.date
  } else {
    data.blocks = converted.children.length ? [{ blockType: 'richText', content: lexicalRoot(converted.children) }] : []
    if (item.parentSlug) {
      const parentId = pageIds.get(item.parentSlug)
      if (parentId) data.parent = parentId
      else warnings.push(`${item.ref} ("${item.title}"): the parent page "${item.parentSlug}" was not found, so it was imported at the top level.`)
    }
  }
  if (row.status === 'published') data._status = 'published'
  return data
}

export async function runImport(
  engine: ImportEngine,
  user: unknown,
  items: ImportItem[],
  options: PlanOptions,
): Promise<ImportResult> {
  const existing = await loadExisting(engine, items)
  const { rows } = planItems(items, existing, options)
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, imagesNotCopied: 0, embedsRemoved: 0, warnings: [], errors: [] }

  // Pages already on the site keep their ids, so children of existing parents can be linked too.
  const pageIds = new Map<string, number>()
  existing.page.forEach((doc, slug) => pageIds.set(slug, doc.id))

  for (const index of creationOrder(items)) {
    const item = items[index]
    const row = rows[index]
    if (row.action === 'skip') {
      result.skipped++
      continue
    }
    if (row.action === 'error') {
      result.failed++
      result.errors.push({ ref: item.ref, title: item.title, message: row.reason })
      continue
    }
    const converted = convertHtml(item.html)
    result.imagesNotCopied += converted.imagesNotCopied
    result.embedsRemoved += converted.embedsRemoved
    const data = documentData(item, row, converted, pageIds, result.warnings)
    const draft = row.status !== 'published'
    try {
      let id: number
      if (row.action === 'update' && row.existingId !== undefined) {
        await engine.update({ collection: COLLECTION[item.type], id: row.existingId, data, draft, user })
        id = row.existingId
        result.updated++
      } else {
        const doc = await engine.create({ collection: COLLECTION[item.type], data, draft, user })
        id = doc.id
        result.created++
      }
      if (item.type === 'page') pageIds.set(row.slug, id)
    } catch (error) {
      result.failed++
      result.errors.push({ ref: item.ref, title: item.title, message: errorText(error) })
    }
  }
  return result
}
