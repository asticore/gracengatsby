import type { ArchiveItem } from '@/lib/blockContext'
import { formatTagDate, formatTagPrice } from '@/lib/dynamicTags'

/**
 * Per-item merge tags for loop item templates. Inside a Loop grid card, text-like elements (heading, button,
 * rich text) replace {{title}}, {{excerpt}}, {{date}}, {{author}}, {{price}}, {{url}}, {{image}} and {{category}}
 * with the current item's values. Any other {{...}} stays exactly as typed. Pure: no React, no server imports.
 *
 * Values are plain text. React escapes them when the element draws text; the text-like elements that accept
 * inline markup draw it through their own sanitiser.
 */

export const LOOP_MERGE_TAG_NAMES = ['title', 'excerpt', 'date', 'author', 'price', 'url', 'image', 'category'] as const
export type LoopMergeTagName = (typeof LOOP_MERGE_TAG_NAMES)[number]

const TAG = /\{\{\s*([a-z]+)\s*\}\}/gi

/** The value a tag shows for one item. Missing fields give ''. */
export function loopMergeValue(name: LoopMergeTagName, item: ArchiveItem): string {
  switch (name) {
    case 'title':
      return item.title ?? ''
    case 'excerpt':
      return item.excerpt ?? ''
    case 'date':
      return formatTagDate(item.date, 'short')
    case 'author':
      return item.author ?? ''
    case 'price':
      return formatTagPrice(item.price)
    case 'url':
      return item.href ?? ''
    case 'image':
      return item.image?.url ?? ''
    case 'category':
      return item.categories?.[0] ?? ''
  }
}

/** Replaces the known loop merge tags in a string. Tag names are case-insensitive. Unknown tags are left untouched. */
export function resolveLoopMergeTags(text: string, item: ArchiveItem): string {
  if (!text.includes('{{')) return text
  return text.replace(TAG, (match, raw: string) => {
    const name = raw.toLowerCase()
    return (LOOP_MERGE_TAG_NAMES as readonly string[]).includes(name) ? loopMergeValue(name as LoopMergeTagName, item) : match
  })
}

/**
 * Rich text (a Lexical JSON tree): resolves every text node's `text` field, at any depth. Other fields and the
 * structure are copied unchanged. Non-tree input passes through.
 */
export function resolveLoopMergeTagsInRichText(node: unknown, item: ArchiveItem): unknown {
  if (typeof node === 'string') return resolveLoopMergeTags(node, item)
  if (Array.isArray(node)) return node.map((child) => resolveLoopMergeTagsInRichText(child, item))
  if (!node || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = key === 'text' && typeof value === 'string' ? resolveLoopMergeTags(value, item) : resolveLoopMergeTagsInRichText(value, item)
  }
  return out
}

/** A link target after merge tags: root-relative paths, in-page anchors, http(s), mailto and tel only. Else ''. */
export function safeLoopLink(value: string): string {
  const v = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  return /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(v) ? v : ''
}

const nameOf = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const named = value as { displayName?: unknown; name?: unknown; title?: unknown }
    for (const candidate of [named.displayName, named.name, named.title]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  }
  return ''
}

/**
 * The loop tags the old page-template Loop (LoopBlock) also gets, for the item types that have no value for them in
 * its base merge context: {{date}}, {{author}} and {{category}} (the first category or taxonomy name). Only empty
 * values are filled, so a value the base context already has is never replaced. Pure.
 */
export function fillLoopItemTagFallbacks(context: Record<string, string>, item: Record<string, unknown>): Record<string, string> {
  const categories = Array.isArray(item.categories) ? item.categories : []
  const fallbacks: Record<string, string> = {
    date: formatTagDate(item.publishedDate ?? item.startDate ?? item.createdAt, 'short'),
    author: nameOf(item.author),
    category: nameOf(item.category) || nameOf(categories[0]),
  }
  const out = { ...context }
  for (const [key, value] of Object.entries(fallbacks)) {
    if (!out[key] && value) out[key] = value
  }
  return out
}
