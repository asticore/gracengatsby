/**
 * Content-type title and description templates (SEO settings > Templates).
 *
 * Pure string work, no I/O, so it can be unit tested without a database.
 * A template only fills in when a document has no SEO title or description of
 * its own; see resolveSeo in ./resolve.ts for the order of fallbacks.
 */

export type ContentType = 'page' | 'post' | 'product' | 'event' | 'course'

/** Values the tokens read. Anything not supplied becomes an empty string. */
export type TemplateTokens = {
  /** The document name: `%title%`. */
  title?: string | null
  /** The site name: `%site%`. */
  site?: string | null
  /** Short summary text: `%excerpt%`. */
  excerpt?: string | null
  /** First category name: `%category%`. */
  category?: string | null
  /** Price, already formatted by the caller: `%price%`. */
  price?: string | number | null
  /** Date, already formatted by the caller: `%date%`. */
  date?: string | null
}

/** Longest description a template may produce, in characters. */
export const TEMPLATE_DESCRIPTION_LIMIT = 160

const SEPARATOR = '|'

const KNOWN_TOKENS = ['title', 'site', 'sep', 'excerpt', 'category', 'price', 'date'] as const

const tokenValue = (name: string, tokens: TemplateTokens): string => {
  switch (name) {
    case 'title':
      return tokens.title ?? ''
    case 'site':
      return tokens.site ?? ''
    case 'sep':
      return SEPARATOR
    case 'excerpt':
      return tokens.excerpt ?? ''
    case 'category':
      return tokens.category ?? ''
    case 'price':
      return tokens.price === null || tokens.price === undefined ? '' : String(tokens.price)
    case 'date':
      return tokens.date ?? ''
    default:
      return ''
  }
}

/** Collapses runs of whitespace (including newlines inside a value) to one space. */
const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * Removes a separator that has nothing on one side of it, which happens when an
 * optional token such as `%category%` is empty: "Title | | Site" becomes
 * "Title | Site", and a leading or trailing separator is dropped.
 */
const dropDanglingSeparators = (text: string): string => {
  const escaped = SEPARATOR.replace(/[|\\^$.*+?()[\]{}]/g, '\\$&')
  return text
    .replace(new RegExp(`(\\s*${escaped}\\s*){2,}`, 'g'), ` ${SEPARATOR} `)
    .replace(new RegExp(`^\\s*${escaped}\\s*|\\s*${escaped}\\s*$`, 'g'), '')
    .trim()
}

/**
 * Fills a template's tokens from the document and the site.
 *
 * Unknown tokens (anything shaped like `%word%` that is not in the list above)
 * are removed rather than shown. Double spaces are collapsed, and separators
 * left with nothing beside them are dropped. Returns an empty string when the
 * template is blank, so callers can fall back to their defaults.
 */
export const renderTemplate = (template: string | null | undefined, tokens: TemplateTokens): string => {
  const source = (template ?? '').trim()
  if (!source) return ''

  const filled = source.replace(/%([a-z]+)%/gi, (match, name: string) => {
    const key = name.toLowerCase()
    return (KNOWN_TOKENS as readonly string[]).includes(key) ? tokenValue(key, tokens) : ''
  })

  return dropDanglingSeparators(tidy(filled))
}

/**
 * Trims a description to the limit without cutting a word in half. A text
 * with no space inside the limit is cut at the limit instead.
 */
export const clampDescription = (text: string, limit: number = TEMPLATE_DESCRIPTION_LIMIT): string => {
  const clean = tidy(text)
  if (clean.length <= limit) return clean

  const cut = clean.slice(0, limit + 1)
  const lastSpace = cut.lastIndexOf(' ')
  const kept = lastSpace > 0 ? cut.slice(0, lastSpace) : clean.slice(0, limit)
  return kept.replace(/[\s,;:.\-|]+$/, '').trim()
}

/** The title and description templates configured for one content type. */
export type ContentTemplates = { title: string; description: string }

/**
 * Reads `<type>TitleTemplate` and `<type>DescriptionTemplate` from the
 * `templates` group of the SEO settings. Typed loosely on purpose: the
 * generated settings type does not know about this group yet, and the
 * settings object may be null or missing the group on an older install.
 */
export const contentTemplatesFor = (settings: unknown, type: ContentType): ContentTemplates => {
  const group = (settings as { templates?: Record<string, unknown> | null } | null)?.templates
  const title = group?.[`${type}TitleTemplate`]
  const description = group?.[`${type}DescriptionTemplate`]
  return {
    title: typeof title === 'string' ? title : '',
    description: typeof description === 'string' ? description : '',
  }
}
