import { INTERFACE_SOURCE_ID, interfaceSourceText } from './interfaceStrings'
import { sourceIdFor } from './translatableFields'

/**
 * Reading and writing `eg_translations`.
 *
 * Everything is keyed by the same four parts - locale, kind, source id, field
 * path - so there is exactly one place that decides what a translation is
 * identified by, and no caller composes keys itself.
 *
 * Reads for the front end are per-locale bulk loads rather than per-string
 * lookups. A page renders dozens of strings and a query each would be dozens
 * of round trips on a worker; one query and a Map is the shape that survives
 * contact with a request.
 */

export type TranslationKind = 'interface' | 'collection' | 'global'

export type TranslationRow = {
  id: string | number
  locale: string
  sourceKind: TranslationKind
  sourceId: string
  fieldPath: string
  value: string | null
  sourceText: string | null
  updatedAt?: string
}

export type TranslationKey = {
  locale: string
  sourceKind: TranslationKind
  sourceId: string
  fieldPath: string
}

export const translationKey = (key: TranslationKey): string =>
  `${key.locale}|${key.sourceKind}|${key.sourceId}|${key.fieldPath}`

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
}

const TRANSLATIONS = 'translations'

/** One page big enough that no realistic site pages through it mid-render. */
const BULK_LIMIT = 5000

function toRow(doc: unknown): TranslationRow {
  const record = doc as Record<string, unknown>
  return {
    id: record.id as string | number,
    locale: String(record.locale ?? ''),
    sourceKind: (record.sourceKind as TranslationKind) ?? 'collection',
    sourceId: String(record.sourceId ?? ''),
    fieldPath: String(record.fieldPath ?? ''),
    value: (record.value as string | null) ?? null,
    sourceText: (record.sourceText as string | null) ?? null,
    updatedAt: record.updatedAt as string | undefined,
  }
}

/** Every row for one locale, optionally narrowed to one source. */
export async function findTranslations(
  engine: EngineLike,
  args: { locale?: string; locales?: string[]; sourceKind?: TranslationKind; sourceId?: string },
): Promise<TranslationRow[]> {
  const where: Record<string, unknown> = {}
  if (args.locale) where.locale = { equals: args.locale }
  if (args.locales) where.locale = { in: args.locales }
  if (args.sourceKind) where.sourceKind = { equals: args.sourceKind }
  if (args.sourceId) where.sourceId = { equals: args.sourceId }

  try {
    const result = await engine.find({
      collection: TRANSLATIONS,
      where,
      limit: BULK_LIMIT,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    return result.docs.map(toRow)
  } catch {
    // A site whose multilingual migration has not run yet must still render.
    return []
  }
}

/**
 * Writes one translation, creating the row if it is the first time this
 * string has been translated into this language.
 *
 * Find-then-write rather than a real upsert because the engine's query layer
 * has no upsert; the composite unique index in the migration is what actually
 * guarantees there is only ever one row, and this is the path that keeps to it.
 */
export async function saveTranslation(
  engine: EngineLike,
  key: TranslationKey,
  value: string,
  sourceText: string,
): Promise<void> {
  const existing = await engine.find({
    collection: TRANSLATIONS,
    where: {
      locale: { equals: key.locale },
      sourceKind: { equals: key.sourceKind },
      sourceId: { equals: key.sourceId },
      fieldPath: { equals: key.fieldPath },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const current = existing.docs[0] as { id?: string | number } | undefined

  if (current?.id !== undefined) {
    await engine.update({
      collection: TRANSLATIONS,
      id: current.id,
      data: { value, sourceText },
      depth: 0,
      overrideAccess: true,
    })
    return
  }

  await engine.create({
    collection: TRANSLATIONS,
    data: { ...key, value, sourceText },
    depth: 0,
    overrideAccess: true,
  })
}

// --- Front-end lookup -------------------------------------------------------

export type TranslationLookup = {
  locale: string
  /** Interface strings and content fields, keyed by `translationKey` parts. */
  get: (kind: TranslationKind, sourceId: string, fieldPath: string) => string | null
  /** Interface string with source-language fallback. Never returns empty. */
  t: (key: string) => string
  /** Content field, falling back to the value passed in. */
  field: (slug: string, documentId: string | number, path: string, sourceValue: string) => string
}

/**
 * Builds the lookup a rendered page uses.
 *
 * Fallback is unconditional here, not a setting: `fallbackToDefault` decides
 * whether an untranslated PAGE is served at all, which is a routing decision.
 * Once we have decided to render, showing a blank button because one string
 * was missed helps nobody, so a missing string always falls back to source.
 */
export function buildLookup(locale: string, rows: TranslationRow[]): TranslationLookup {
  const map = new Map<string, string>()
  for (const row of rows) {
    if (row.value && row.value.trim().length > 0) {
      map.set(translationKey(row), row.value)
    }
  }

  const get = (kind: TranslationKind, sourceId: string, fieldPath: string): string | null =>
    map.get(translationKey({ locale, sourceKind: kind, sourceId, fieldPath })) ?? null

  return {
    locale,
    get,
    t: (key: string) => get('interface', INTERFACE_SOURCE_ID, key) ?? interfaceSourceText(key),
    field: (slug, documentId, path, sourceValue) =>
      get('collection', sourceIdFor(slug, documentId), path) ?? sourceValue,
  }
}

/** An always-source lookup, for when multilingual is off or the locale is the default. */
export const sourceLookup = (locale: string): TranslationLookup => buildLookup(locale, [])

// --- Value extraction -------------------------------------------------------

/** Walks a dot path, returning undefined rather than throwing on a gap. */
export function valueAtPath(document: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (current === null || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[part]
  }, document)
}

/**
 * Renders a source value as the plain text a translator types against.
 *
 * Rich text arrives as a Lexical tree; the translator sees its text content,
 * one paragraph per line. Round-tripping the full tree through a table cell
 * would mean either a second editor per cell or asking somebody to translate
 * JSON, and neither is the easy thing Matt asked for.
 */
export function sourceTextOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  const lines: string[] = []

  const walk = (node: unknown, depth: number): void => {
    if (depth > 12 || node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>

    if (typeof record.text === 'string') {
      lines.push(record.text)
      return
    }

    const children = (record.children ?? (record.root as Record<string, unknown> | undefined)?.children) as
      | unknown[]
      | undefined

    if (Array.isArray(children)) {
      const before = lines.length
      for (const child of children) walk(child, depth + 1)
      // Block-level nodes end a line so paragraphs stay separate in the cell.
      if (typeof record.type === 'string' && record.type !== 'root' && lines.length > before) {
        lines.push('\n')
      }
    }
  }

  walk(value, 0)

  return lines
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}
