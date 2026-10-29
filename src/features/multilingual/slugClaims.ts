import { slugClaimsConflict } from '@/features/domains/scope'

import { docIdOf, isTranslatableSlugCollection, isValidTranslatedSlug, SLUG_FIELD } from './localizedSlugs'

/**
 * Uniqueness of translated slugs, per language. Checked on every write to a
 * translated slug (the translations collection hook, the machine drafts), so the
 * rule holds on the Translations screen, the REST and local APIs, and the
 * machine path alike.
 *
 * A translated slug clashes when, in the same language:
 *   - another document's translated slug is the same, and the two answer on an
 *     overlapping domain (scope rules as in domains/scope.ts); or
 *   - another document's SOURCE slug is the same, that document has no translated
 *     slug in this language (so its source slug still answers here), and the two
 *     answer on an overlapping domain.
 * Pages are compared only with siblings under the same parent, as their own
 * source slugs are.
 */

type Doc = { id?: string | number; slug?: unknown; availableDomains?: unknown; parent?: unknown }

export type SlugEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  findByID: (args: Record<string, unknown>) => Promise<unknown>
}

export type SlugClaimResult = { ok: true } | { ok: false; message: string }

const TAKEN = 'Another document already uses this slug in this language on one of these domains. Choose a different slug.'

/** Pages sit under a parent, so only siblings can share a slug. Other collections are compared across the table. */
const scopeOf = (collection: string, doc: Doc | null): string => {
  if (collection !== 'pages' || !doc) return ''
  const parent = doc.parent
  if (parent && typeof parent === 'object') return String((parent as { id?: unknown }).id ?? '')
  return parent === null || parent === undefined ? '' : String(parent)
}

export async function checkTranslatedSlug(args: {
  engine: SlugEngine
  collection: string
  documentId: string | number
  locale: string
  slug: string
}): Promise<SlugClaimResult> {
  const { engine, collection, documentId, locale, slug } = args
  if (!isTranslatableSlugCollection(collection)) {
    return { ok: false, message: 'Only pages, posts and products have translated slugs.' }
  }
  if (!isValidTranslatedSlug(slug)) {
    return { ok: false, message: 'A slug may use letters, digits and single hyphens only.' }
  }

  const self = (await engine.findByID({ collection, id: documentId, depth: 0, overrideAccess: true }).catch((): null => null)) as Doc | null
  const selfId = docIdOf(collection, documentId)
  const selfScope = scopeOf(collection, self)
  const selfDomains = self?.availableDomains ?? null
  const sharesAddress = (doc: Doc | null): boolean =>
    doc !== null && scopeOf(collection, doc) === selfScope && slugClaimsConflict(doc.availableDomains, selfDomains)

  // 1. Another document's translated slug, in this language.
  const claims = await engine.find({
    collection: 'translations',
    where: {
      and: [
        { locale: { equals: locale } },
        { sourceKind: { equals: 'collection' } },
        { fieldPath: { equals: SLUG_FIELD } },
        { value: { equals: slug } },
      ],
    },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  for (const row of claims.docs as Array<{ sourceId?: unknown }>) {
    const otherId = String(row.sourceId ?? '')
    if (otherId === selfId || !otherId.startsWith(`${collection}:`)) continue
    const other = (await engine
      .findByID({ collection, id: otherId.slice(collection.length + 1), depth: 0, overrideAccess: true })
      .catch((): null => null)) as Doc | null
    if (sharesAddress(other)) return { ok: false, message: TAKEN }
  }

  // 2. Another document's source slug, where that document has no translated slug in this language.
  const sources = await engine.find({
    collection,
    where: { and: [{ slug: { equals: slug } }, { id: { not_equals: documentId } }] },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of sources.docs as Doc[]) {
    if (!sharesAddress(doc) || doc.id === undefined) continue
    const translated = await engine.find({
      collection: 'translations',
      where: {
        and: [
          { locale: { equals: locale } },
          { sourceKind: { equals: 'collection' } },
          { sourceId: { equals: docIdOf(collection, doc.id) } },
          { fieldPath: { equals: SLUG_FIELD } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const value = (translated.docs[0] as { value?: unknown } | undefined)?.value
    // That document already answers at a translated slug here, so its source slug redirects and no longer clashes.
    if (typeof value === 'string' && value.trim().length > 0) continue
    return { ok: false, message: TAKEN }
  }

  return { ok: true }
}
