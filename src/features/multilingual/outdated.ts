/**
 * Persisting "outdated": when a source document is saved, translations whose
 * stored snapshot (`sourceText`) no longer matches the source are marked
 * needs_review in the database. Until now staleness was only computed on read,
 * so the nav badge, the rollup counts and assignee lists could not see it.
 *
 * `planOutdatedMarks` is pure and tested. `markOutdatedAfterSave` is the
 * afterChange hook: it skips when multilingual is off, touches only rows that
 * exist for this one document (indexed on sourceId), and writes one assignee
 * email per document per save. It never throws into the save.
 */

import { getMultilingualSettings } from './settings'
import { findTranslations, sourceTextOf, valueAtPath, type TranslationRow } from './store'
import { fieldsForDocument, sourceIdFor, translatableSource } from './translatableFields'
import { effectiveAssignees, type TranslationRules } from './translationStatus'
import { notifyAssignees } from './translationNotify'
import { after } from './machine/autoDraft'

export type OutdatedMark = {
  id: string | number
  locale: string
  fieldPath: string
  /** Who should look at it now, by the language's rules or the item's own override. */
  assignees: number[]
}

/**
 * The rows to mark. A row is marked when it has text, a stored snapshot that
 * differs from the current source, and is not already needs_review. A field
 * that no longer exists is left alone: that is "inactive", not "outdated",
 * and clearing it is a separate, explicit action.
 */
export function planOutdatedMarks(args: {
  rows: readonly TranslationRow[]
  current: ReadonlyMap<string, string>
  rules: TranslationRules
}): OutdatedMark[] {
  const marks: OutdatedMark[] = []
  for (const row of args.rows) {
    if (row.sourceKind !== 'collection') continue
    if (row.sourceText === null || row.sourceText === undefined) continue
    if (!row.value || row.value.trim().length === 0) continue
    if (!args.current.has(row.fieldPath)) continue
    if (row.status === 'needs_review') continue
    const now = args.current.get(row.fieldPath) ?? ''
    if (now === row.sourceText) continue
    marks.push({
      id: row.id,
      locale: row.locale,
      fieldPath: row.fieldPath,
      assignees: effectiveAssignees({
        status: 'needs_review',
        assignedTo: row.assignedTo,
        locale: row.locale,
        rules: args.rules,
      }),
    })
  }
  return marks
}

/** The current source text of every translatable field of one saved document. */
export function currentSourceFields(slug: string, doc: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>()
  for (const field of fieldsForDocument(slug, doc)) {
    map.set(field.path, sourceTextOf(valueAtPath(doc, field.path)))
  }
  return map
}

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  update: (args: Record<string, unknown>) => Promise<unknown>
  findByID?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

/** Marks one saved document's stale translations. Resolves with counts; never rejects. */
export async function markOutdatedForDocument(args: {
  engine: EngineLike
  slug: string
  doc: Record<string, unknown>
}): Promise<{ marked: number; notified: number }> {
  const none = { marked: 0, notified: 0 }
  try {
    if (!translatableSource(args.slug) || args.doc.id === undefined || args.doc.id === null) return none
    const settings = await getMultilingualSettings(args.engine as never)
    if (!settings.enabled) return none
    const locales = settings.activeLocales.filter((code) => code !== settings.defaultLocale)
    if (locales.length === 0) return none

    const sourceId = sourceIdFor(args.slug, String(args.doc.id))
    const rows = await findTranslations(args.engine as never, { locales, sourceKind: 'collection', sourceId })
    const marks = planOutdatedMarks({ rows, current: currentSourceFields(args.slug, args.doc), rules: settings.translationRules })
    if (marks.length === 0) return none

    let marked = 0
    for (const mark of marks) {
      try {
        await args.engine.update({
          collection: 'translations',
          id: mark.id,
          data: { status: 'needs_review' },
          depth: 0,
          overrideAccess: true,
        })
        marked += 1
      } catch {
        // One row that will not write does not stop the others or the save.
      }
    }

    const userIds = [...new Set(marks.flatMap((mark) => mark.assignees))]
    const notified = await notifyAssignees({
      engine: args.engine as never,
      userIds,
      count: marked,
      locales: [...new Set(marks.map((mark) => mark.locale))],
    })
    return { marked, notified }
  } catch (error) {
    console.error('[multilingual] outdated marking failed:', error instanceof Error ? error.message : 'unknown error')
    return none
  }
}

type AfterChangeArgs = { doc: Record<string, unknown>; req?: { engine?: unknown } | null }

/** afterChange hook for a translatable collection. Work runs after the response; the save is never held up or failed. */
export const outdatedAfterChange =
  (slug: string) =>
  async (args: unknown): Promise<unknown> => {
    const { doc, req } = args as AfterChangeArgs
    try {
      const engine = req?.engine as EngineLike | undefined
      if (engine && doc) after(markOutdatedForDocument({ engine, slug, doc }))
    } catch {
      // A hook failure must never fail the save.
    }
    return doc
  }
