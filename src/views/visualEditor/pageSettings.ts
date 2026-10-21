
/**
 * Pure helpers for the editor's "Page" settings: reading the values off a document, writing them back
 * as a PATCH body, and the hints/validation shown next to each field. Field names are the real ones from
 * the collections: `title`, `slug`, `_status`, and the `seo` group (`metaTitle`, `metaDescription`,
 * `ogImage`, `noIndex`).
 */

export const SEO_TITLE_MAX = 60
export const SEO_DESCRIPTION_MAX = 160

export type PageSettings = {
  title: string
  slug: string
  status: 'draft' | 'published'
  metaTitle: string
  metaDescription: string
  /** Media id, or null for none. */
  ogImage: number | null
  noIndex: boolean
}

export type PageSettingsAvailability = { slug: boolean; status: boolean; seo: boolean }

const mediaId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') return (value as { id: number }).id
  return null
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

export function readPageSettings(doc: Record<string, unknown> | null | undefined): PageSettings {
  const d = doc || {}
  const seo = (d.seo && typeof d.seo === 'object' ? d.seo : {}) as Record<string, unknown>
  return {
    title: str(d.title),
    slug: str(d.slug),
    status: d._status === 'published' ? 'published' : 'draft',
    metaTitle: str(seo.metaTitle),
    metaDescription: str(seo.metaDescription),
    ogImage: mediaId(seo.ogImage),
    noIndex: seo.noIndex === true,
  }
}

export function pageAvailability(doc: Record<string, unknown> | null | undefined): PageSettingsAvailability {
  const d = doc || {}
  return { slug: 'slug' in d, status: '_status' in d, seo: 'seo' in d || 'slug' in d }
}

/** Lowercase, hyphen-separated, URL-safe. Leaves a trailing hyphen while typing is handled by `finalSlug`. */
export function sanitiseSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
}

export const finalSlug = (input: string): string => sanitiseSlug(input).replace(/-+$/, '')

export type LengthHint = { length: number; max: number; level: 'empty' | 'ok' | 'long'; text: string }

export function lengthHint(value: string, max: number, noun: string): LengthHint {
  const length = value.trim().length
  if (length === 0) return { length, max, level: 'empty', text: `No ${noun} set. Search engines will pick one for you.` }
  if (length > max) return { length, max, level: 'long', text: `${length}/${max} characters. May be cut off in search results.` }
  return { length, max, level: 'ok', text: `${length}/${max} characters.` }
}

export const titleHint = (v: string): LengthHint => lengthHint(v, SEO_TITLE_MAX, 'SEO title')
export const descriptionHint = (v: string): LengthHint => lengthHint(v, SEO_DESCRIPTION_MAX, 'meta description')

export function validatePageSettings(s: PageSettings, avail: PageSettingsAvailability): string[] {
  const errors: string[] = []
  if (!s.title.trim()) errors.push('Title is required.')
  if (avail.slug && s.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug)) errors.push('Slug can only contain lowercase letters, numbers and hyphens.')
  return errors
}

/** Fields that differ from the loaded values, as a PATCH body fragment. Empty when nothing changed. */
export function pageSettingsPatch(
  current: PageSettings,
  initial: PageSettings,
  avail: PageSettingsAvailability,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (current.title !== initial.title) body.title = current.title.trim()
  if (avail.slug && current.slug !== initial.slug) body.slug = finalSlug(current.slug)
  if (avail.status && current.status !== initial.status) body._status = current.status
  if (avail.seo) {
    const seo: Record<string, unknown> = {}
    if (current.metaTitle !== initial.metaTitle) seo.metaTitle = current.metaTitle.trim()
    if (current.metaDescription !== initial.metaDescription) seo.metaDescription = current.metaDescription.trim()
    if (current.ogImage !== initial.ogImage) seo.ogImage = current.ogImage
    if (current.noIndex !== initial.noIndex) seo.noIndex = current.noIndex
    if (Object.keys(seo).length) body.seo = seo
  }
  return body
}
