import { cleanRelativePath, parseManifest, SLUG_RE } from '@/features/templateRepos/manifest'
import { LIMITS, type Result, type TemplateKind } from '@/features/templateRepos/types'

import { LIBRARY_LIMITS, type LibraryItem, type LibraryManifest } from './types'

/**
 * The library manifest (`library.json`). Strict: a malformed file is refused with a plain reason, and
 * nothing is repaired. Pure functions, no network. See docs/template-libraries.md for the format.
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: string): Result<T> => ({ ok: false, error })

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
  return trimmed
}

const IMAGE_PATH_RE = /\.(png|jpe?g|webp)$/i

/** Validates a parsed `library.json` object. */
export function validateLibraryManifest(data: unknown): Result<LibraryManifest> {
  if (!isPlainObject(data)) return fail('The library file must be a JSON object.')
  if (data.format !== 'engage-library') return fail('The library file needs "format": "engage-library".')
  if (data.schemaVersion !== 1) return fail('The library file "schemaVersion" must be 1.')
  const name = cleanText(data.name, 120)
  if (!name) return fail('The library file needs a "name" of up to 120 characters.')
  if (!Array.isArray(data.items)) return fail('The library file needs an "items" list.')
  if (data.items.length > LIBRARY_LIMITS.maxItems) return fail(`The library lists more than ${LIBRARY_LIMITS.maxItems} items.`)

  const items: LibraryItem[] = []
  const slugs = new Set<string>()
  for (const entry of data.items) {
    if (!isPlainObject(entry)) return fail('Every item must be an object.')
    const slug = typeof entry.slug === 'string' ? entry.slug : ''
    if (!SLUG_RE.test(slug)) return fail(`The item name "${String(entry.slug).slice(0, 40)}" is not valid. Use lower case letters, numbers and dashes.`)
    if (slugs.has(slug)) return fail(`The item "${slug}" appears twice.`)
    slugs.add(slug)

    const title = cleanText(entry.title, 120)
    if (!title) return fail(`The item "${slug}" needs a title of up to 120 characters.`)
    const kind = entry.kind
    if (kind !== 'page' && kind !== 'section') return fail(`The item "${slug}" must have "kind": "page" or "section".`)

    const category = entry.category === undefined ? 'General' : cleanText(entry.category, 60)
    if (!category) return fail(`The category of "${slug}" must be text of up to 60 characters.`)

    let tags: string[] = []
    if (entry.tags !== undefined) {
      if (!Array.isArray(entry.tags) || entry.tags.length > 10) return fail(`The tags of "${slug}" must be a list of up to 10 words.`)
      for (const tag of entry.tags) {
        const clean = cleanText(tag, 40)
        if (!clean) return fail(`A tag on "${slug}" is not valid.`)
        tags.push(clean)
      }
      tags = Array.from(new Set(tags))
    }

    const preview = cleanRelativePath(entry.preview, { strict: true })
    if (!preview || !IMAGE_PATH_RE.test(preview)) return fail(`The preview of "${slug}" must be a PNG, JPEG or WebP picture path inside the library folder.`)
    const file = cleanRelativePath(entry.file, { strict: true })
    if (!file || !file.endsWith('.json')) return fail(`The file of "${slug}" must be a .json path inside the library folder.`)

    items.push({ slug, title, kind: kind as TemplateKind, category, tags, preview, file })
  }
  return ok({ format: 'library', name, items })
}

/** Parses the text of a `library.json` file under the byte cap. */
export function parseLibraryText(text: unknown): Result<LibraryManifest> {
  if (typeof text !== 'string') return fail('The library file is not text.')
  if (new TextEncoder().encode(text).length > LIMITS.manifestBytes) return fail(`The library file is too large (the limit is ${Math.round(LIMITS.manifestBytes / 1024)} KB).`)
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('The library file is not valid JSON.')
  }
  return validateLibraryManifest(data)
}

/**
 * Reads an older template repository (`manifest.json` with `templates`, see src/features/templateRepos)
 * as a library. Its categories become item categories, so the lists look the same.
 */
export function parseLegacyManifestText(text: unknown): Result<LibraryManifest> {
  const parsed = parseManifest(text)
  if (!parsed.ok) return fail(parsed.error)
  const labels = new Map(parsed.value.categories.map((category) => [category.key, category.label]))
  return ok({
    format: 'legacy',
    name: parsed.value.name,
    items: parsed.value.templates.map((entry) => ({ ...entry, category: labels.get(entry.category) ?? entry.category })),
  })
}
