import { publishableText, type PublishIndex } from './availability'
import { SLUG_FIELD } from './translatableFields'
import type { MultilingualSettings } from './settings'

/**
 * Translated slugs: the URL segment a page, post or product answers to in a
 * non-default language (`/fr/a-propos` for the page whose source slug is
 * `about`). Pure: no engine, no request, so the overlay, the SEO builders, the
 * sitemap and the tests share one rule set. `slugIndex.ts` does the loading.
 *
 * A translated slug is stored like any other translated field, in
 * `eg_translations` with field path `slug`, so it gets the same review
 * workflow, staleness check and machine drafts as the text around it. Only a
 * publishable translation counts here (see `publishableText`), so a slug that
 * is waiting for review keeps the public URL on the source slug.
 *
 * Only pages, posts and products have translated slugs. A post or product
 * keeps its `blog/` or `shop/` prefix; the translated part is the last segment.
 */

export { SLUG_FIELD }

/** Collections whose slug can be translated. */
export const TRANSLATABLE_SLUG_COLLECTIONS = ['pages', 'posts', 'products'] as const

export const isTranslatableSlugCollection = (collection: string): boolean =>
  (TRANSLATABLE_SLUG_COLLECTIONS as readonly string[]).includes(collection)

/** The URL prefix a collection's documents answer under. Pages have none: they sit at the root of their parent chain. */
export const SLUG_PREFIX: Record<string, string> = { posts: 'blog', products: 'shop' }

/** A translated slug that can sit in a URL: letters and digits of any script, joined by single hyphens. */
const SLUG_SHAPE = /^[\p{L}\p{N}\p{M}]+(?:-[\p{L}\p{N}\p{M}]+)*$/u
const SLUG_MAX = 120

/**
 * Turns typed or machine-suggested text into a slug: lower case, with each run
 * of spaces, punctuation or symbols replaced by one hyphen. Letters of any
 * script are kept, so Japanese or Arabic slugs survive (a slugify that keeps
 * only ASCII would empty them). Returns '' when nothing usable is left.
 */
export function slugSuggestion(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[\s\p{P}\p{S}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isValidTranslatedSlug(value: string): boolean {
  return value.length > 0 && value.length <= SLUG_MAX && SLUG_SHAPE.test(value)
}

/** Source id of a document, `<collection>:<id>`, as `eg_translations.source_id` stores it. */
export const docIdOf = (collection: string, id: string | number): string => `${collection}:${id}`

/**
 * The publishable translated slug of each document, by source id, for one
 * locale. `docs` carries each document's CURRENT source slug, so a translation
 * approved against an older slug is not used (publishableText compares them).
 */
export function slugMapFor(args: {
  locale: string
  index: PublishIndex
  settings: Pick<MultilingualSettings, 'requireReview'>
  docs: ReadonlyArray<{ sourceId: string; slug: string }>
}): Map<string, string> {
  const out = new Map<string, string>()
  for (const doc of args.docs) {
    if (!doc.slug) continue
    const text = publishableText(args.index, args.settings, args.locale, doc.sourceId, SLUG_FIELD, doc.slug)
    const slug = text?.trim() ?? ''
    if (slug && isValidTranslatedSlug(slug)) out.set(doc.sourceId, slug)
  }
  return out
}

/**
 * Rewrites each segment of a source path that belongs to a document with a
 * translated slug. `docIdByPath` maps the source path of each document to its
 * source id, so a nested page's ancestors translate too: `/services/consulting`
 * becomes `/prestations/conseil` when both `services` and `consulting` have
 * French slugs. A segment with no translation is kept as it is.
 */
export function localizedPath(
  sourcePath: string,
  docIdByPath: ReadonlyMap<string, string>,
  slugs: ReadonlyMap<string, string>,
): string {
  const segments = sourcePath.split('/').filter(Boolean)
  let prefix = ''
  const out = segments.map((segment) => {
    prefix += `/${segment}`
    const id = docIdByPath.get(prefix)
    return (id !== undefined ? slugs.get(id) : undefined) ?? segment
  })
  return out.length > 0 ? `/${out.join('/')}` : '/'
}

/** Source path <-> translated path for one locale. Only paths that actually change are listed. */
export type LocaleSlugIndex = {
  /** Source path to the translated path it is served at in this locale. */
  toTranslated: ReadonlyMap<string, string>
  /** Translated path to the source path that answers it. */
  toSource: ReadonlyMap<string, string>
}

export const EMPTY_SLUG_INDEX: LocaleSlugIndex = { toTranslated: new Map(), toSource: new Map() }

export function buildSlugIndex(docIdByPath: ReadonlyMap<string, string>, slugs: ReadonlyMap<string, string>): LocaleSlugIndex {
  if (slugs.size === 0) return EMPTY_SLUG_INDEX
  const toTranslated = new Map<string, string>()
  const toSource = new Map<string, string>()
  for (const sourcePath of docIdByPath.keys()) {
    const translated = localizedPath(sourcePath, docIdByPath, slugs)
    if (translated === sourcePath) continue
    toTranslated.set(sourcePath, translated)
    toSource.set(translated, sourcePath)
  }
  return { toTranslated, toSource }
}

/**
 * How a request path in a non-default locale is served. `translated`: the
 * request is for a translated path, so render `sourcePath`. `redirect`: the
 * request is for the source path of a document that has a translated slug, so
 * send it to the translated URL (permanently). Null: nothing to do.
 */
export type LocalizedRoute = { kind: 'translated'; sourcePath: string } | { kind: 'redirect'; translatedPath: string } | null

export function routeLocalizedPath(path: string, index: LocaleSlugIndex): LocalizedRoute {
  const sourcePath = index.toSource.get(path)
  if (sourcePath !== undefined) return { kind: 'translated', sourcePath }
  const translatedPath = index.toTranslated.get(path)
  if (translatedPath !== undefined) return { kind: 'redirect', translatedPath }
  return null
}

/** A request or document path as the index keys it: leading slash, no query, no trailing slash. */
export function normaliseRoutePath(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? ''
  const segments = bare.split('/').filter(Boolean)
  return segments.length > 0 ? `/${segments.join('/')}` : '/'
}
