/**
 * Merge tags - the mechanism that turns a Page Template into a reusable card
 * design for the Loop block, and lets any text field pull in values from the
 * document being rendered.
 *
 * Syntax: {{title}}, {{price}}, {{url}}, {{field:my_custom_field}},
 * {{field:repeater.0.sub}}, {{field:gallery.0}}, {{option:site.phone}}
 *
 * A tag that resolves to nothing is replaced with an empty string rather than
 * left as literal braces, so a half-filled item never shows "{{excerpt}}" to a
 * visitor. Tags are resolved against a flat record built by buildMergeContext.
 */

import { buildGuessedCustomContext } from '@/features/customFields/stringify'

export type MergeContext = Record<string, string>

export type ResolveOptions = {
  /**
   * Leave tags with no matching key untouched. Single pages use this so text
   * that happens to contain braces is not mangled. Loops keep the default
   * (replace with ''), so a half-filled card never shows a literal tag.
   * `field:` and `option:` tags always resolve, to '' when empty.
   */
  keepUnknown?: boolean
}

const TAG_PATTERN = /\{\{\s*([a-zA-Z0-9_:.-]+)\s*\}\}/g

const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key)

/**
 * Replaces every merge tag in a string. Non-strings pass through untouched. Only the context's own
 * keys count: a tag such as {{constructor}} or {{toString}} must not reach Object.prototype.
 * Resolved values are plain text; React escapes them, so nothing is escaped here. URL attributes
 * are the exception and go through safeUrl().
 */
export function resolveTags(input: unknown, context: MergeContext, options: ResolveOptions = {}): unknown {
  if (typeof input !== 'string') return input
  if (!input.includes('{{')) return input
  return input.replace(TAG_PATTERN, (match, key: string) => {
    if (hasOwn(context, key)) return context[key] ?? ''
    if (key.startsWith('field:') || key.startsWith('option:')) return ''
    return options.keepUnknown ? match : ''
  })
}

/** Schemes a link or image may use. Anything else (javascript:, data:, vbscript:, ...) is refused. */
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Returns the URL when it is safe to put in an href or src, otherwise null. Allowed: http, https,
 * mailto and tel links, root-relative paths ("/shop") and in-page anchors ("#top"). Control
 * characters are stripped first, as browsers ignore them inside a scheme ("java\tscript:").
 */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (!cleaned) return null
  if (cleaned.startsWith('#')) return cleaned
  // Root-relative only: "//host/path" is a protocol-relative link to another site, and "/\\" is read as one by some browsers.
  if (cleaned.startsWith('/')) return cleaned.startsWith('//') || cleaned.startsWith('/\\') ? null : cleaned
  try {
    const url = new URL(cleaned)
    return SAFE_URL_PROTOCOLS.has(url.protocol) ? cleaned : null
  } catch {
    return null
  }
}

/**
 * Recursively resolves merge tags through an arbitrary block/value tree.
 * Rich text (Lexical) nodes are plain nested objects, so this reaches the text
 * inside them too.
 */
export function resolveTagsDeep<T>(value: T, context: MergeContext, options: ResolveOptions = {}): T {
  if (typeof value === 'string') return resolveTags(value, context, options) as T
  if (Array.isArray(value)) return value.map((item) => resolveTagsDeep(item, context, options)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveTagsDeep(entry, context, options)
    }
    return out as T
  }
  return value
}

/**
 * Resolves tags in a single page's or post's blocks. A Loop block's `template`
 * is left alone: its tags belong to each loop item, and are resolved there.
 */
export function resolveDocumentBlocks<T>(blocks: T, context: MergeContext): T {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return resolveTags(value, context, { keepUnknown: true })
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const node = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(node)) {
        out[key] = node.blockType === 'loop' && key === 'template' ? entry : walk(entry)
      }
      return out
    }
    return value
  }
  return walk(blocks) as T
}

/** The tags offered in the editor's autocomplete, by source collection. */
export const MERGE_TAG_LIBRARY: Record<string, { tag: string; label: string }[]> = {
  common: [
    { tag: '{{title}}', label: 'Title' },
    { tag: '{{slug}}', label: 'Slug' },
    { tag: '{{url}}', label: 'Link to the item' },
    { tag: '{{image}}', label: 'Main image URL' },
    { tag: '{{excerpt}}', label: 'Short description' },
    { tag: '{{id}}', label: 'Item ID' },
  ],
  products: [
    { tag: '{{price}}', label: 'Price (formatted)' },
    { tag: '{{category}}', label: 'Category' },
    { tag: '{{inventory}}', label: 'Stock on hand' },
  ],
  posts: [
    { tag: '{{publishedDate}}', label: 'Published date' },
    { tag: '{{author}}', label: 'Author' },
  ],
  events: [
    { tag: '{{startDate}}', label: 'Start date' },
    { tag: '{{location}}', label: 'Location' },
  ],
  faqs: [
    { tag: '{{question}}', label: 'Question' },
    { tag: '{{answer}}', label: 'Answer' },
  ],
}

type LoopSource = 'products' | 'posts' | 'events' | 'faqs' | 'pages'

/** The URL an item of each collection lives at on the public site. */
const ITEM_PATHS: Record<LoopSource, (slug: string) => string> = {
  products: (slug) => `/shop/${slug}`,
  posts: (slug) => `/blog/${slug}`,
  events: (slug) => `/events/${slug}`,
  faqs: () => `/faq`,
  pages: (slug) => `/${slug}`,
}

const str = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** Pulls a usable image URL out of an upload field at any populate depth. */
function imageUrl(value: unknown): string {
  if (!value) return ''
  if (Array.isArray(value)) return imageUrl(value[0])
  if (typeof value === 'object') {
    const doc = value as { url?: string | null }
    return typeof doc.url === 'string' ? doc.url : ''
  }
  return ''
}

function formatDate(value: unknown): string {
  const raw = str(value)
  if (!raw) return ''
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Flattens one collection item into the tag -> value map used by resolveTags.
 * Custom fields defined via Field Groups are exposed as {{field:<name>}}.
 */
export function buildMergeContext(
  item: Record<string, unknown>,
  source: LoopSource,
  formatPrice?: (amount: number) => string,
  customContext?: MergeContext,
): MergeContext {
  const slug = str(item.slug)
  const context: MergeContext = {
    id: str(item.id),
    title: str(item.title) || str(item.name) || str(item.question),
    slug,
    url: slug ? ITEM_PATHS[source](slug) : '',
    image: imageUrl(item.images) || imageUrl(item.image) || imageUrl(item.heroImage) || imageUrl(item.featuredImage),
    excerpt: str(item.excerpt) || str(item.shortDescription) || str(item.summary),
  }

  if (source === 'products') {
    // `priceInAUD` is stored in WHOLE currency units (e.g. `29.99` meaning
    // $29.99), NOT cents - fixed 2026-09-26, see the plan doc's What's-left
    // item #12. The fallback below must NOT divide by 100.
    const amount = typeof item.priceInAUD === 'number' ? item.priceInAUD : null
    context.price = amount !== null ? (formatPrice ? formatPrice(amount) : `$${amount.toFixed(2)}`) : ''
    context.category = str(item.category)
    context.inventory = str(item.inventory)
  }

  if (source === 'posts') {
    context.publishedDate = formatDate(item.publishedDate)
    context.author = str(item.author)
  }

  if (source === 'events') {
    context.startDate = formatDate(item.startDate)
    context.location = str(item.location)
  }

  if (source === 'faqs') {
    context.question = str(item.question)
    context.answer = str(item.answer)
  }

  // Custom fields (see the Field Groups collection) live in one JSON column.
  // Callers with the group definitions pass a precise map; otherwise the values
  // are stringified by their shape so a template still prints something sensible.
  if (customContext) {
    Object.assign(context, customContext)
  } else {
    const custom = item.customFields
    if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
      Object.assign(context, buildGuessedCustomContext(custom as Record<string, unknown>))
    }
  }

  return context
}
