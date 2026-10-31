/**
 * Turns model replies into checked values. Pure. Every parser returns { ok, ... }
 * so the route can retry once with the error fed back, like the page builder does.
 */

import type { BlogMeta, BlogOutlineItem } from './request'
import type { ParseResult } from './request'

/** The first JSON object in a reply (models sometimes add a sentence or a code fence). */
export function extractJsonObject(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(reply.slice(start, end + 1)) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const clean = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** Lowercase ASCII words joined by hyphens. Empty when nothing usable is left. */
export function slugify(value: string, max = 80): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

export function parseTitles(reply: string): ParseResult<string[]> {
  const json = extractJsonObject(reply)
  const list = json?.titles
  if (!Array.isArray(list))
    return { ok: false, error: 'Reply with a JSON object holding a "titles" list.' }
  const titles = [...new Set(list.map((t) => clean(t, 120)).filter(Boolean))].slice(0, 8)
  if (titles.length === 0)
    return { ok: false, error: 'No titles came back. Reply with at least one title.' }
  return { ok: true, value: titles }
}

export function parseOutline(reply: string): ParseResult<BlogOutlineItem[]> {
  const json = extractJsonObject(reply)
  const list = json?.sections
  if (!Array.isArray(list))
    return { ok: false, error: 'Reply with a JSON object holding a "sections" list.' }
  const items: BlogOutlineItem[] = []
  for (const row of list) {
    const r = (row ?? {}) as Record<string, unknown>
    const heading = clean(r.heading, 120)
    if (heading) items.push({ heading, notes: clean(r.notes, 300) })
    if (items.length === 8) break
  }
  if (items.length < 2)
    return { ok: false, error: 'The outline needs at least two sections with headings.' }
  return { ok: true, value: items }
}

/** A section's body. Headings and emphasis markers are removed; "- " lines stay as bullets. */
export function parseSectionText(reply: string): ParseResult<string> {
  const body = reply
    .replace(/```[a-z]*\n?/gi, '')
    .split('\n')
    .filter((line) => !/^\s{0,3}#{1,6}\s/.test(line))
    .map((line) => line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!body) return { ok: false, error: 'The section came back empty. Write the section text.' }
  return { ok: true, value: body }
}

export function parseDetails(reply: string, fallbackTitle: string): ParseResult<BlogMeta> {
  const json = extractJsonObject(reply)
  if (!json)
    return {
      ok: false,
      error: 'Reply with a JSON object with metaTitle, metaDescription, slug, tags and category.',
    }
  const metaTitle = clean(json.metaTitle, 70) || clean(fallbackTitle, 70)
  const metaDescription = clean(json.metaDescription, 160)
  if (!metaDescription) return { ok: false, error: 'The meta description is missing.' }
  const tags = Array.isArray(json.tags)
    ? [...new Set(json.tags.map((t) => clean(t, 40)).filter(Boolean))].slice(0, 6)
    : []
  const slug =
    slugify(clean(json.slug, 100)) || slugify(fallbackTitle) || `post-${Date.now().toString(36)}`
  return {
    ok: true,
    value: { metaTitle, metaDescription, slug, tags, category: clean(json.category, 60) },
  }
}
