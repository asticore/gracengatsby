import { getMultilingualSettings } from './settings'
import { evaluateTranslationWrite, serialiseAssignedTo } from './translationStatus'
import { notifyAssignees } from './translationNotify'
import { itemKey } from './translationOverview'
import { translationKey, type TranslationRow } from './store'
import { loadOverviewData, type OverviewData } from './views/translationsData'
import { runMachineDrafts } from './machine/drafts'
import { isMachineProviderId, type MachineProviderId } from './machine/providers'

/**
 * Bulk actions on the Translations overview: approve, or assign.
 *
 * Every change goes through the collection's own write (with the signed-in user),
 * so the same rule that guards a single save guards a bulk approve. A bulk
 * approval a reviewer may not give is refused per translation and reported,
 * not forced.
 *
 * Capped at MAX_BULK_ITEMS items per request: each write runs the workflow hook
 * (which reads settings), and a request that touches thousands of rows belongs
 * in several requests, not one long one.
 */

export const MAX_BULK_ITEMS = 100

export type BulkAction = 'approve' | 'assign' | 'translate'

export type BulkBody = {
  action: BulkAction
  items: string[]
  /** Languages to act on. Defaults to every target language. */
  locales?: string[]
  /** For assign: the people to assign. An empty list clears the item's own assignment, and the language rules apply again. */
  assignees?: number[]
  /** For translate: replace approved and human-written text too. Off by default. */
  overwrite?: boolean
  /** For translate: one provider for every language. Default: the per-language setting. */
  provider?: MachineProviderId | null
}

export type BulkResult = {
  ok: boolean
  updated: number
  skipped: number
  refused: string[]
  notified: number
}

export type BulkHandlerResult = { status: number; body: Record<string, unknown> }

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  findGlobal: (args: { slug: string; depth?: number }) => Promise<Record<string, unknown>>
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
}

export function parseBulkBody(body: unknown): { ok: true; value: BulkBody } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Send a JSON object.' }
  const record = body as Record<string, unknown>
  if (record.action !== 'approve' && record.action !== 'assign' && record.action !== 'translate') {
    return { ok: false, message: 'action must be "approve", "assign" or "translate".' }
  }
  if (!Array.isArray(record.items) || record.items.length === 0 || !record.items.every((k) => typeof k === 'string')) {
    return { ok: false, message: 'items must be a non-empty list of item keys.' }
  }
  if (record.items.length > MAX_BULK_ITEMS) {
    return { ok: false, message: `Act on at most ${MAX_BULK_ITEMS} items at a time.` }
  }
  if (record.locales !== undefined && (!Array.isArray(record.locales) || !record.locales.every((c) => typeof c === 'string'))) {
    return { ok: false, message: 'locales must be a list of language codes.' }
  }
  if (record.action === 'assign' && (!Array.isArray(record.assignees) || !record.assignees.every((id) => Number.isInteger(Number(id))))) {
    return { ok: false, message: 'assignees must be a list of user ids.' }
  }
  if (record.overwrite !== undefined && typeof record.overwrite !== 'boolean') {
    return { ok: false, message: 'overwrite must be true or false.' }
  }
  if (record.provider !== undefined && record.provider !== null && !isMachineProviderId(record.provider)) {
    return { ok: false, message: 'provider must be one of google, deepl, claude or openai.' }
  }
  return {
    ok: true,
    value: {
      action: record.action,
      items: record.items as string[],
      locales: record.locales as string[] | undefined,
      assignees: record.assignees === undefined ? undefined : (record.assignees as unknown[]).map(Number),
      overwrite: record.overwrite === true,
      provider: isMachineProviderId(record.provider) ? record.provider : null,
    },
  }
}

const emptyResult = (): BulkResult => ({ ok: true, updated: 0, skipped: 0, refused: [], notified: 0 })

export async function runTranslationBulk(args: {
  engine: EngineLike
  user: { id: number } | null
  isAdmin: boolean
  canUpdate: boolean
  body: unknown
}): Promise<BulkHandlerResult> {
  const { engine, user } = args
  if (!user) return { status: 401, body: { error: 'Unauthorised' } }
  if (!args.canUpdate) return { status: 403, body: { error: 'You may not change translations.' } }

  const parsed = parseBulkBody(args.body)
  if (parsed.ok === false) return { status: 400, body: { error: parsed.message } }
  const body = parsed.value

  const settings = await getMultilingualSettings(engine)
  if (!settings.enabled) return { status: 409, body: { error: 'Multiple languages are switched off.' } }

  const targetLocales = settings.activeLocales.filter((code) => code !== settings.defaultLocale)
  const locales = (body.locales ?? targetLocales).filter((code) => targetLocales.includes(code))
  if (locales.length === 0) return { status: 400, body: { error: 'Choose at least one target language.' } }

  const data: OverviewData = await loadOverviewData({ engine, user, settings })
  const wanted = new Set(body.items)
  const items = data.items.filter((item) => wanted.has(itemKey(item.sourceKind, item.sourceId)))
  const stored = new Map<string, TranslationRow>(data.stored.map((row) => [translationKey(row), row]))
  const actor = { id: user.id, isAdmin: args.isAdmin }
  const result = emptyResult()
  const refused = new Set<string>()

  if (body.action === 'translate') {
    if (!settings.machine.enabled) return { status: 409, body: { error: 'Machine translation is switched off.' } }
    const drafts = await runMachineDrafts({
      engine,
      user,
      items,
      locales,
      stored: data.stored,
      overwrite: body.overwrite === true,
      settings,
      provider: body.provider ?? null,
    })
    result.updated = drafts.updated
    result.skipped = drafts.skipped
    for (const message of drafts.refused) refused.add(message)
  } else if (body.action === 'approve') {
    for (const item of items) {
      for (const locale of locales) {
        for (const field of item.fields) {
          const key = { locale, sourceKind: item.sourceKind, sourceId: item.sourceId, fieldPath: field.fieldPath }
          const row = stored.get(translationKey(key))
          // Nothing written yet: there is no text to approve.
          if (!row || !row.value || row.value.trim().length === 0) {
            result.skipped += 1
            continue
          }
          const decision = evaluateTranslationWrite({
            current: row,
            incoming: { status: 'approved', sourceText: field.sourceText },
            locale,
            actor,
            settings,
            now: new Date().toISOString(),
          })
          if (decision.ok === false) {
            refused.add(decision.message)
            result.skipped += 1
            continue
          }
          // Already approved against the current source: nothing to do.
          if (row.status === 'approved' && row.sourceText === field.sourceText) {
            result.skipped += 1
            continue
          }
          await engine.update({
            collection: 'translations',
            id: row.id,
            data: { status: 'approved', sourceText: field.sourceText },
            depth: 0,
            overrideAccess: false,
            user,
          })
          result.updated += 1
        }
      }
    }
  } else {
    const assignees = [...new Set((body.assignees ?? []).filter((id) => Number.isInteger(id) && id > 0))]
    const serialised = serialiseAssignedTo(assignees)
    for (const item of items) {
      for (const locale of locales) {
        for (const field of item.fields) {
          const key = { locale, sourceKind: item.sourceKind, sourceId: item.sourceId, fieldPath: field.fieldPath }
          const row = stored.get(translationKey(key))
          if (row) {
            if (serialiseAssignedTo(row.assignedTo) === serialised) {
              result.skipped += 1
              continue
            }
            await engine.update({
              collection: 'translations',
              id: row.id,
              data: { assignedTo: serialised },
              depth: 0,
              overrideAccess: false,
              user,
            })
          } else {
            if (!serialised) {
              result.skipped += 1
              continue
            }
            await engine.create({
              collection: 'translations',
              data: { ...key, value: '', sourceText: field.sourceText, assignedTo: serialised },
              depth: 0,
              overrideAccess: false,
              user,
            })
          }
          result.updated += 1
        }
      }
    }
    result.notified = await notifyAssignees({ engine, userIds: assignees, count: result.updated, locales })
  }

  result.refused = [...refused]
  result.ok = result.refused.length === 0
  return { status: 200, body: { ...result } }
}

