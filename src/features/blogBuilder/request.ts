/**
 * Request shapes for the blog builder (Write with AI on the Blog list). Pure: no I/O.
 * Every field is checked here, so the route and the prompts only see clean values.
 */

export const BLOG_TONES = [
  'friendly',
  'professional',
  'warm',
  'playful',
  'authoritative',
  'inspirational',
] as const
export type BlogTone = (typeof BLOG_TONES)[number]

/** Target length of the whole post, in words. */
export const BLOG_LENGTH_WORDS = { short: 600, medium: 900, long: 1400 } as const
export type BlogLength = keyof typeof BLOG_LENGTH_WORDS

export const BLOG_ACTIONS = ['titles', 'outline', 'section', 'details', 'create'] as const
export type BlogAction = (typeof BLOG_ACTIONS)[number]

export type BlogBrief = {
  topic: string
  audience: string
  tone: BlogTone
  length: BlogLength
  keywords: string[]
  callToAction: string
}

export type BlogOutlineItem = { heading: string; notes: string }

export type BlogMeta = {
  metaTitle: string
  metaDescription: string
  slug: string
  tags: string[]
  category: string
}

export type BlogRequest = {
  action: BlogAction
  brief?: BlogBrief
  title?: string
  outline?: BlogOutlineItem[]
  /** For `section`: which outline item to write. */
  index?: number
  /** For `section`: the text already written for earlier sections (context only). For `details` and `create`: one text per outline item. */
  sections?: string[]
  /** For `create`: the reviewed meta suggestions. */
  meta?: BlogMeta
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

const MAX_TOPIC = 300
const MAX_AUDIENCE = 200
const MAX_KEYWORDS_TEXT = 300
const MAX_CTA = 200
const MAX_TITLE = 200
const MAX_HEADING = 120
const MAX_NOTES = 300
const MAX_SECTION_TEXT = 20_000
const MAX_CONTEXT_SECTIONS = 12
const MAX_OUTLINE = 10
const MAX_TAGS = 10

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : null
}

/** Splits a comma-separated list, trims, drops empties and duplicates (case-insensitive), keeps the first 12. */
export function parseKeywords(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of value.split(',')) {
    const item = part.replace(/\s+/g, ' ').trim()
    if (!item || seen.has(item.toLowerCase())) continue
    seen.add(item.toLowerCase())
    out.push(item.slice(0, 60))
    if (out.length === 12) break
  }
  return out
}

export function parseBrief(value: unknown): ParseResult<BlogBrief> {
  if (!value || typeof value !== 'object')
    return { ok: false, error: 'Answer the questions first.' }
  const b = value as Record<string, unknown>
  const topic = text(b.topic, MAX_TOPIC)
  if (!topic) return { ok: false, error: 'Add a topic (up to 300 characters).' }
  const audience = text(b.audience ?? '', MAX_AUDIENCE)
  const callToAction = text(b.callToAction ?? '', MAX_CTA)
  // Keywords come as a comma-separated string from the form, or as a list the browser already split.
  const keywordsText = Array.isArray(b.keywords)
    ? text(b.keywords.filter((k) => typeof k === 'string').join(', '), MAX_KEYWORDS_TEXT)
    : text(b.keywords ?? '', MAX_KEYWORDS_TEXT)
  if (audience === null || callToAction === null || keywordsText === null)
    return { ok: false, error: 'One of the answers is too long.' }
  const tone = (BLOG_TONES as readonly string[]).includes(b.tone as string)
    ? (b.tone as BlogTone)
    : 'friendly'
  const length = (Object.keys(BLOG_LENGTH_WORDS) as BlogLength[]).includes(b.length as BlogLength)
    ? (b.length as BlogLength)
    : 'medium'
  return {
    ok: true,
    value: { topic, audience, tone, length, keywords: parseKeywords(keywordsText), callToAction },
  }
}

export function parseOutline(value: unknown): ParseResult<BlogOutlineItem[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_OUTLINE) {
    return { ok: false, error: `The outline needs 1 to ${MAX_OUTLINE} sections.` }
  }
  const items: BlogOutlineItem[] = []
  for (const item of value) {
    const row = (item ?? {}) as Record<string, unknown>
    const heading = text(row.heading, MAX_HEADING)
    const notes = text(row.notes ?? '', MAX_NOTES)
    if (!heading)
      return { ok: false, error: 'Every section needs a heading (up to 120 characters).' }
    if (notes === null)
      return { ok: false, error: 'A section note is too long (up to 300 characters).' }
    items.push({ heading, notes })
  }
  return { ok: true, value: items }
}

export function parseMeta(value: unknown): ParseResult<BlogMeta> {
  const m = (value ?? {}) as Record<string, unknown>
  const metaTitle = text(m.metaTitle ?? '', 70)
  const metaDescription = text(m.metaDescription ?? '', 200)
  const slug = text(m.slug ?? '', 100)
  const category = text(m.category ?? '', 60)
  if (metaTitle === null || metaDescription === null || slug === null || category === null) {
    return { ok: false, error: 'One of the search details is too long.' }
  }
  if (
    !Array.isArray(m.tags) ||
    m.tags.length > MAX_TAGS ||
    m.tags.some((t) => typeof t !== 'string')
  ) {
    return { ok: false, error: `Tags must be a list of up to ${MAX_TAGS} names.` }
  }
  const tags = [
    ...new Set((m.tags as string[]).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)),
  ].map((t) => t.slice(0, 40))
  return { ok: true, value: { metaTitle, metaDescription, slug, tags, category } }
}

/** Parses the body of a request for the blog builder. Errors are safe to show. */
export function parseBlogRequest(body: unknown): ParseResult<BlogRequest> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a JSON body.' }
  const b = body as Record<string, unknown>
  const action = (BLOG_ACTIONS as readonly string[]).includes(b.action as string)
    ? (b.action as BlogAction)
    : null
  if (!action) return { ok: false, error: 'Unknown step for the blog builder.' }

  const req: BlogRequest = { action }
  if (action !== 'create') {
    const brief = parseBrief(b.brief)
    if (brief.ok === false) return brief
    req.brief = brief.value
  }
  if (action === 'titles') return { ok: true, value: req }

  const title = text(b.title ?? '', MAX_TITLE)
  if (!title) return { ok: false, error: 'Pick a title first.' }
  req.title = title

  const outline = parseOutline(b.outline)
  if (outline.ok === false) return outline
  req.outline = outline.value
  if (action === 'outline') return { ok: true, value: { action, brief: req.brief, title } }

  if (Array.isArray(b.sections)) {
    if (b.sections.some((s) => typeof s !== 'string'))
      return { ok: false, error: 'Section text must be text.' }
    const sections = b.sections as string[]
    if (action === 'section') {
      req.sections = sections.slice(-MAX_CONTEXT_SECTIONS).map((s) => s.slice(0, 2000))
    } else {
      if (sections.length !== req.outline.length)
        return { ok: false, error: 'Write every section before continuing.' }
      if (sections.some((s) => s.length > MAX_SECTION_TEXT))
        return { ok: false, error: 'A section is too long to save.' }
      req.sections = sections
    }
  } else if (action !== 'section') {
    return { ok: false, error: 'Write every section before continuing.' }
  }

  if (action === 'section') {
    const index = b.index
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= req.outline.length
    ) {
      return { ok: false, error: 'Pick a section to write.' }
    }
    req.index = index
    return { ok: true, value: req }
  }

  if (action === 'create') {
    const meta = parseMeta(b.meta)
    if (meta.ok === false) return meta
    req.meta = meta.value
  }
  return { ok: true, value: req }
}
