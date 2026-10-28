import { adminCollectionPath } from '@/admin/adminPaths'

import { INTERFACE_SOURCE_ID, INTERFACE_STRINGS } from '../interfaceStrings'
import type { MultilingualSettings } from '../settings'
import { findTranslations, sourceTextOf, valueAtPath, type TranslationRow } from '../store'
import { sourceIdFor, TRANSLATABLE_COLLECTIONS } from '../translatableFields'
import { buildOverviewRows, type OverviewItemInput } from '../translationOverview'

/**
 * Loads every translatable item and its stored translations for the overview.
 *
 * Read as the signed-in user for content (so a document they cannot see is not
 * listed) and with overrideAccess for the translation rows themselves, which
 * the Translations screen owns. A collection that is switched off, or not yet
 * migrated, contributes no items rather than an error.
 *
 * Capped per collection: the overview is a working list, and a site with more
 * than this many documents in one collection should filter by type first.
 */

export const ITEMS_PER_COLLECTION = 500

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  findByID?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
}

export type OverviewUser = { id: number; label: string; email: string }

export type OverviewData = {
  items: OverviewItemInput[]
  stored: TranslationRow[]
}

const interfaceItems = (): OverviewItemInput[] =>
  INTERFACE_STRINGS.map((entry): OverviewItemInput => ({
    sourceKind: 'interface',
    sourceId: INTERFACE_SOURCE_ID,
    type: 'interface',
    typeLabel: 'Interface string',
    title: entry.key,
    updatedAt: null,
    editHref: null,
    fields: [{ fieldPath: entry.key, label: entry.key, sourceText: entry.en }],
  }))

async function contentItems(engine: EngineLike, user: unknown): Promise<OverviewItemInput[]> {
  const items: OverviewItemInput[] = []

  for (const source of TRANSLATABLE_COLLECTIONS) {
    let docs: Record<string, unknown>[] = []
    try {
      const result = await engine.find({
        collection: source.slug,
        limit: ITEMS_PER_COLLECTION,
        depth: 0,
        sort: '-updatedAt',
        overrideAccess: false,
        user,
      })
      docs = result.docs as Record<string, unknown>[]
    } catch {
      continue
    }

    for (const doc of docs) {
      const id = String(doc.id)
      const fields = source.fields
        .map((field) => ({
          fieldPath: field.path,
          label: field.label,
          sourceText: sourceTextOf(valueAtPath(doc, field.path)),
        }))
        // An empty field has nothing to translate, and an empty source cell teaches a translator nothing.
        .filter((field) => field.sourceText.length > 0)

      items.push({
        sourceKind: 'collection' as const,
        sourceId: sourceIdFor(source.slug, id),
        type: source.slug,
        typeLabel: source.label,
        title: String(valueAtPath(doc, source.titleField) ?? `Untitled ${id}`),
        updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
        editHref: `${adminCollectionPath(source.slug)}/${id}`,
        fields,
      })
    }
  }

  return items
}

/** Every item the overview can list, with its translatable fields and their current source text. */
export async function loadOverviewData(args: {
  engine: EngineLike
  user: unknown
  settings: MultilingualSettings
}): Promise<OverviewData> {
  const targetLocales = args.settings.activeLocales.filter((code) => code !== args.settings.defaultLocale)
  if (targetLocales.length === 0) return { items: [], stored: [] }

  const [content, stored] = await Promise.all([
    contentItems(args.engine, args.user),
    findTranslations(args.engine, { locales: targetLocales }),
  ])

  // Interface strings sit first in the list only because they are the first
  // thing a new site needs translated; the table sorts them like everything else.
  return { items: [...interfaceItems(), ...content].filter((item) => item.fields.length > 0), stored }
}

const BACKLOG_TTL_MS = 60_000
const backlogCache = new Map<number, { at: number; value: number }>()

/**
 * How many items still have a language that is not approved - the number on the
 * admin nav badge. The full load behind it is not free, so the answer is kept for
 * a minute per signed-in user; a badge a minute stale is fine, a page that reads
 * every document on every navigation is not.
 */
export async function countItemsNeedingTranslation(args: {
  engine: EngineLike
  user: unknown
  settings: MultilingualSettings
}): Promise<number> {
  const id = Number((args.user as { id?: unknown } | null)?.id)
  if (!args.settings.enabled || !Number.isInteger(id)) return 0

  const cached = backlogCache.get(id)
  if (cached && Date.now() - cached.at < BACKLOG_TTL_MS) return cached.value

  let value = 0
  try {
    const targets = args.settings.activeLocales.filter((code) => code !== args.settings.defaultLocale)
    const data = await loadOverviewData(args)
    const rows = buildOverviewRows({ items: data.items, stored: data.stored, targetLocales: targets, rules: args.settings.translationRules })
    value = rows.filter((row) => row.cells.some((cell) => cell.status !== 'approved')).length
  } catch {
    value = 0
  }
  backlogCache.set(id, { at: Date.now(), value })
  return value
}

/** Signed-in users who could be assigned, for the pickers. */
export async function loadAssignableUsers(args: { engine: EngineLike; user: unknown }): Promise<OverviewUser[]> {
  try {
    const result = await args.engine.find({
      collection: 'users',
      limit: 500,
      depth: 0,
      overrideAccess: false,
      user: args.user,
    })
    return (result.docs as Array<Record<string, unknown>>).map((doc) => {
      const email = typeof doc.email === 'string' ? doc.email : ''
      const name = typeof doc.name === 'string' && doc.name.trim() ? doc.name : email || `User ${doc.id}`
      return { id: Number(doc.id), label: name, email }
    })
  } catch {
    return []
  }
}
