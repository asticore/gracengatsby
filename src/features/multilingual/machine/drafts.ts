/**
 * Machine drafts: the planner and the writer behind "Translate with machine" (bulk and
 * per item) and the on-save path.
 *
 * The planner decides, per language and field, whether a machine draft may replace what
 * is there. A human's work is protected unless the caller asks to overwrite it:
 *   - approved text is never replaced by a machine draft unless `overwrite` is set;
 *   - text a person wrote (no machine provider on the row) is also left alone unless
 *     `overwrite` is set, even when it is waiting for review;
 *   - a row whose source snapshot still matches and which already has text is unchanged,
 *     so a re-save of an unchanged document costs nothing;
 *   - a missing row, an empty one, a machine draft, or a stale translation is (re)drafted.
 *
 * Writes go through evaluateTranslationWrite, the same rule the collection hook applies to a
 * signed-in save. A system write (on save) has no signed-in user, so the hook does not run;
 * the rule is applied here instead, with the same result. Either way a draft is stored as
 * machine_draft with machine_provider set, and review then decides what the public site shows
 * (isTranslationPublishable): with review on it stays hidden until a reviewer approves it.
 */

import { evaluateTranslationWrite } from '../translationStatus'
import type { MultilingualSettings } from '../settings'
import { translationKey, type TranslationRow } from '../store'
import { slugSuggestion } from '../localizedSlugs'
import { SLUG_FIELD } from '../translatableFields'
import { checkTranslatedSlug } from '../slugClaims'
import type { MachineProviderId } from './providers'
import { translateTexts, type MachineOutcome } from './service'
import type { MachineContext } from './service'

export type DraftField = { fieldPath: string; sourceText: string }
export type DraftItem = { sourceKind: 'interface' | 'collection' | 'global'; sourceId: string; fields: DraftField[] }

export type FieldDecision = 'draft' | 'unchanged' | 'approved' | 'human'

/** Whether a machine draft may replace this field's stored translation. Pure. */
export function decideFieldDraft(args: { row: TranslationRow | null; sourceText: string; overwrite: boolean }): FieldDecision {
  const { row, sourceText, overwrite } = args
  const hasText = Boolean(row?.value && row.value.trim().length > 0)
  if (!row || !hasText || overwrite) return 'draft'
  if (row.status === 'approved') return 'approved'
  // No machine provider on the row: a person wrote it, so it is theirs to keep.
  if (!row.machineProvider) return 'human'
  // A machine provider is recorded but a person has since edited it (waiting for review).
  if (row.sourceText === sourceText && row.status === 'needs_review') return 'human'
  // The source has moved on since the draft was written: draft it again.
  if (row.sourceText !== sourceText) return 'draft'
  return 'unchanged'
}

/** Reads settings and Integrations (for the key) and writes the translation rows. */
export type DraftEngine = MachineContext['engine'] & {
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
}

export type DraftResult = {
  updated: number
  skipped: number
  refused: string[]
}

/**
 * Drafts the planned fields for the given languages.
 *
 * One provider call per language, with every planned string for it, so the monthly limit
 * is checked once per language. A refusal is reported and the other languages still run.
 * `user` is the signed-in person for a manual action, or null for a system write.
 */
export async function runMachineDrafts(
  args: Omit<MachineContext, 'engine'> & {
    engine: DraftEngine
    user: { id: number } | null
    items: DraftItem[]
    locales: string[]
    stored: TranslationRow[]
    overwrite: boolean
    settings: MultilingualSettings
    provider?: MachineProviderId | null
  },
): Promise<DraftResult> {
  const { user, settings, engine } = args
  const stored = new Map<string, TranslationRow>(args.stored.map((row) => [translationKey(row), row]))
  const result: DraftResult = { updated: 0, skipped: 0, refused: [] }

  for (const locale of args.locales) {
    const planned: Array<{ key: Parameters<typeof translationKey>[0]; sourceText: string; row: TranslationRow | null }> = []
    for (const item of args.items) {
      for (const field of item.fields) {
        if (field.sourceText.trim().length === 0) {
          result.skipped += 1
          continue
        }
        const key = { locale, sourceKind: item.sourceKind, sourceId: item.sourceId, fieldPath: field.fieldPath }
        const row = stored.get(translationKey(key)) ?? null
        const decision = decideFieldDraft({ row, sourceText: field.sourceText, overwrite: args.overwrite })
        if (decision !== 'draft') {
          result.skipped += 1
          continue
        }
        planned.push({ key, sourceText: field.sourceText, row })
      }
    }
    if (planned.length === 0) continue

    const outcome: MachineOutcome = await translateTexts({
      engine,
      locale,
      source: settings.defaultLocale,
      texts: planned.map((p) => p.sourceText),
      provider: args.provider ?? null,
      settings,
      d1: args.d1,
      now: args.now,
      deps: args.deps,
    })
    if (outcome.ok === false) {
      result.refused.push(`${locale}: ${outcome.message}`)
      result.skipped += planned.length
      continue
    }

    const now = (args.now ?? new Date()).toISOString()
    for (let i = 0; i < planned.length; i += 1) {
      const { key, sourceText, row } = planned[i]
      let value = outcome.translations[i]
      if (key.fieldPath === SLUG_FIELD) {
        // A machine slug is a suggestion: normalised like a typed one, unique like one, and reviewed like any draft.
        value = slugSuggestion(value ?? '')
        if (value.length === 0) {
          result.skipped += 1
          continue
        }
        const separator = key.sourceId.indexOf(':')
        const claim = await checkTranslatedSlug({
          engine: engine as unknown as Parameters<typeof checkTranslatedSlug>[0]['engine'],
          collection: key.sourceId.slice(0, separator),
          documentId: key.sourceId.slice(separator + 1),
          locale,
          slug: value,
        })
        if (claim.ok === false) {
          result.refused.push(`${locale}: ${claim.message}`)
          result.skipped += 1
          continue
        }
      }
      const decision = evaluateTranslationWrite({
        current: row,
        incoming: { value, sourceText, status: 'machine_draft', machineProvider: outcome.provider },
        locale,
        actor: { id: user?.id ?? 0, isAdmin: false },
        settings,
        now,
      })
      if (decision.ok === false) {
        result.refused.push(`${locale}: ${decision.message}`)
        result.skipped += 1
        continue
      }
      if (row) {
        await engine.update({
          collection: 'translations',
          id: row.id,
          data: decision.patch,
          depth: 0,
          overrideAccess: !user,
          ...(user ? { user } : {}),
        })
      } else {
        await engine.create({
          collection: 'translations',
          data: { ...key, ...decision.patch },
          depth: 0,
          overrideAccess: !user,
          ...(user ? { user } : {}),
        })
      }
      result.updated += 1
    }
  }
  return result
}
