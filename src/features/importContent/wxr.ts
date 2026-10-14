/**
 * Reads a WordPress WXR export (.xml). Keeps items of type post and page.
 * Attachments, menu items, revisions, trashed and auto-draft entries are
 * left out and counted. Pages are linked to their parents by WordPress id,
 * which is turned into a slug in a second pass.
 */

import { itemSlug, parseDate, statusFromWordPress } from './items'
import { childNamed, childrenNamed, findFirst, parseMarkup, textOf, type MarkupNode } from './markup'
import type { ImportItem, ParseResult } from './types'

const SKIP_STATUSES = new Set(['trash', 'auto-draft'])

function uniqueCategories(item: MarkupNode): string[] {
  const names = childrenNamed(item, 'category')
    .filter((node) => (node.attrs.domain ?? '') === 'category')
    .map((node) => textOf(node).trim())
    .filter((name) => name.length > 0)
  return [...new Set(names)]
}

/** One WXR item as an import item, or null for types and statuses this import leaves out. */
function readItem(entry: MarkupNode, ordinal: number): ImportItem | null {
  const type = textOf(childNamed(entry, 'wp:post_type')).toLowerCase()
  const status = textOf(childNamed(entry, 'wp:status')).toLowerCase()
  if ((type !== 'post' && type !== 'page') || SKIP_STATUSES.has(status)) return null
  const postId = textOf(childNamed(entry, 'wp:post_id'))
  const parentId = textOf(childNamed(entry, 'wp:post_parent'))
  return {
    ref: `${type} ${postId || ordinal}`,
    type: type === 'page' ? 'page' : 'post',
    title: textOf(childNamed(entry, 'title')),
    slug: textOf(childNamed(entry, 'wp:post_name')),
    html: textOf(childNamed(entry, 'content:encoded')),
    excerpt: textOf(childNamed(entry, 'excerpt:encoded')),
    status: statusFromWordPress(status),
    date: parseDate(textOf(childNamed(entry, 'wp:post_date_gmt'))),
    parentSlug: null,
    categories: type === 'page' ? [] : uniqueCategories(entry),
    sourceId: postId || undefined,
    parentRef: parentId && parentId !== '0' ? parentId : undefined,
  }
}

export function parseWxr(text: string): ParseResult {
  const doc = parseMarkup(text)
  const channel = findFirst(doc, 'channel')
  if (!channel) {
    return { format: 'wxr', items: [], errors: ['This does not look like a WordPress export: no channel was found in the file.'], warnings: [], skipped: 0 }
  }

  const items: ImportItem[] = []
  let skipped = 0
  let ordinal = 0
  for (const entry of childrenNamed(channel, 'item')) {
    ordinal++
    const item = readItem(entry, ordinal)
    if (item) items.push(item)
    else skipped++
  }

  // Second pass: WordPress parent ids become parent slugs for pages.
  const slugById = new Map<string, string>()
  for (const item of items) if (item.sourceId) slugById.set(item.sourceId, itemSlug(item))
  let orphans = 0
  for (const item of items) {
    if (item.type !== 'page' || !item.parentRef) continue
    const slug = slugById.get(item.parentRef)
    if (slug) item.parentSlug = slug
    else orphans++
  }
  const warnings: string[] = []
  if (orphans) warnings.push(`${orphans} page(s) had a parent that is not in this file, so they will be imported at the top level.`)

  const errors = items.length === 0 ? ['No pages or posts were found in this file.'] : []
  return { format: 'wxr', items, errors, warnings, skipped }
}
