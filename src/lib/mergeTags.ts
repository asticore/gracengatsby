/**
 * Merge tags - the mechanism that turns a Page Template into a reusable card
 * design for the Loop block, and lets any text field pull in values from the
 * document being rendered.
 *
 * Syntax: {{title}}, {{price}}, {{url}}, {{field:my_custom_field}}
 *
 * A tag that resolves to nothing is replaced with an empty string rather than
 * left as literal braces, so a half-filled item never shows "{{excerpt}}" to a
 * visitor. Tags are resolved against a flat record built by buildMergeContext.
 */

export type MergeContext = Record<string, string>

const TAG_PATTERN = /\{\{\s*([a-zA-Z0-9_:.-]+)\s*\}\}/g

/** Replaces every merge tag in a string. Non-strings pass through untouched. */
export function resolveTags(input: unknown, context: MergeContext): unknown {
  if (typeof input !== 'string') return input
  if (!input.includes('{{')) return input
  return input.replace(TAG_PATTERN, (_match, key: string) => context[key] ?? '')
}

/**
 * Recursively resolves merge tags through an arbitrary block/value tree.
 * Rich text (Lexical) nodes are plain nested objects, so this reaches the text
 * inside them too.
 */
export function resolveTagsDeep<T>(value: T, context: MergeContext): T {
  if (typeof value === 'string') return resolveTags(value, context) as T
  if (Array.isArray(value)) return value.map((item) => resolveTagsDeep(item, context)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveTagsDeep(entry, context)
    }
    return out as T
  }
  return value
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
  formatPrice?: (cents: number) => string,
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
    const cents = typeof item.priceInAUD === 'number' ? item.priceInAUD : null
    context.price = cents !== null ? (formatPrice ? formatPrice(cents) : `$${(cents / 100).toFixed(2)}`) : ''
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
  const custom = item.customFields
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    for (const [key, value] of Object.entries(custom as Record<string, unknown>)) {
      context[`field:${key}`] = str(value) || imageUrl(value)
    }
  }

  return context
}
