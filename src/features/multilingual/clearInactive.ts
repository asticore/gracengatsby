import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'

import { getMultilingualSettings } from './settings'
import { findTranslations, type TranslationRow } from './store'
import { loadOverviewData } from './views/translationsData'
import {
  findInactiveRows,
  unconfirmedSourceIds,
  type LiveDocument,
  type TranslationCatalogue,
} from './documentRows'
import { translatableSource } from './translatableFields'

/**
 * "Clear inactive translations": deletes stored translations whose field or
 * document no longer exists. Never touches active or outdated rows (the
 * selection is `findInactiveRows`, a pure function with tests), and an
 * unreadable-but-present document is never treated as deleted.
 *
 * Deleting a document is only trusted after an overrideAccess existence check
 * finds it missing. A missing document in the readable list alone is not proof:
 * the viewer may simply not be allowed to see it.
 *
 * Admin only, and the delete runs as the signed-in user through the
 * translations collection's own delete rule. One audit entry is written per
 * request, with the count.
 */

export type ClearInactiveBody = {
  action: 'clear-inactive'
  /** 'all' for the whole site, or 'items' for the item keys listed in `items` (`collection:<slug>:<id>`). */
  scope: 'all' | 'items'
  items?: string[]
  /** Count only; delete nothing. The screen calls this first to show the number in its confirmation. */
  dryRun?: boolean
}

export function isClearInactiveBody(body: unknown): body is Record<string, unknown> & { action: 'clear-inactive' } {
  return Boolean(body) && typeof body === 'object' && (body as { action?: unknown }).action === 'clear-inactive'
}

export function parseClearInactiveBody(body: unknown): { ok: true; value: ClearInactiveBody } | { ok: false; message: string } {
  if (!isClearInactiveBody(body)) return { ok: false, message: 'action must be "clear-inactive".' }
  const record = body as Record<string, unknown>
  const scope = record.scope === 'items' ? 'items' : 'all'
  if (scope === 'items') {
    if (!Array.isArray(record.items) || record.items.length === 0 || !record.items.every((k) => typeof k === 'string')) {
      return { ok: false, message: 'items must be a non-empty list of item keys.' }
    }
  }
  return {
    ok: true,
    value: {
      action: 'clear-inactive',
      scope,
      items: scope === 'items' ? (record.items as string[]) : undefined,
      dryRun: record.dryRun === true,
    },
  }
}

/** `collection:pages:12` -> `pages:12`, the sourceId the stored rows carry. */
export const sourceIdFromItemKey = (key: string): string | null => (key.startsWith('collection:') ? key.slice('collection:'.length) : null)

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  delete: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
  findByID?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

/** Ids of the documents that exist, checked with overrideAccess so a hidden document still counts as present. */
async function existingIds(engine: EngineLike, collection: string, ids: string[]): Promise<Set<string>> {
  const numeric = ids.every((id) => /^\d+$/.test(id))
  const result = await engine.find({
    collection,
    where: { id: { in: numeric ? ids.map(Number) : ids } },
    limit: ids.length,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return new Set((result.docs as Array<Record<string, unknown>>).map((doc) => String(doc.id)))
}

export type ClearInactiveResult = { status: number; body: Record<string, unknown> }

export async function runClearInactive(args: {
  engine: EngineLike
  user: { id: number; email?: string | null } | null
  isAdmin: boolean
  canDelete: boolean
  body: unknown
  request?: Request
}): Promise<ClearInactiveResult> {
  const { engine, user } = args
  if (!user) return { status: 401, body: { error: 'Unauthorised' } }
  if (!args.isAdmin || !args.canDelete) return { status: 403, body: { error: 'Only an administrator may clear translations.' } }

  const parsed = parseClearInactiveBody(args.body)
  if (parsed.ok === false) return { status: 400, body: { error: parsed.message } }
  const body = parsed.value

  const settings = await getMultilingualSettings(engine as never)
  if (!settings.enabled) return { status: 409, body: { error: 'Multiple languages are switched off.' } }
  const targets = settings.activeLocales.filter((code) => code !== settings.defaultLocale)
  if (targets.length === 0) return { status: 200, body: { ok: true, count: 0, deleted: 0 } }

  const data = await loadOverviewData({ engine: engine as never, user, settings })
  const stored: TranslationRow[] = await findTranslations(engine as never, { locales: targets })

  // Scope. For items, only the listed documents' rows are candidates.
  let scoped: Set<string> | undefined
  if (body.scope === 'items') {
    scoped = new Set((body.items ?? []).map(sourceIdFromItemKey).filter((id): id is string => id !== null))
  }

  // Confirm missing documents with overrideAccess before any row is called inactive.
  const documents = new Map<string, LiveDocument>(data.documents.map((doc) => [doc.sourceId, doc]))
  const confirmedMissing = new Set<string>()
  const unknownIds = unconfirmedSourceIds(stored, { documents, confirmedMissing })
  const byCollection = new Map<string, string[]>()
  for (const sourceId of unknownIds) {
    if (scoped && !scoped.has(sourceId)) continue
    const collection = sourceId.split(':')[0] ?? ''
    if (!translatableSource(collection)) continue
    const list = byCollection.get(collection) ?? []
    list.push(sourceId.slice(collection.length + 1))
    byCollection.set(collection, list)
  }
  for (const [collection, ids] of byCollection) {
    try {
      const present = await existingIds(engine, collection, ids)
      for (const id of ids) {
        if (!present.has(id)) confirmedMissing.add(`${collection}:${id}`)
      }
    } catch {
      // If the check fails, nothing is confirmed missing for this collection, so nothing there is deleted.
    }
  }

  const catalogue: TranslationCatalogue = { documents, confirmedMissing }
  const candidates = findInactiveRows(stored, catalogue, scoped)

  if (body.dryRun) return { status: 200, body: { ok: true, count: candidates.length, deleted: 0 } }

  let deleted = 0
  const refused: string[] = []
  for (const row of candidates) {
    try {
      await engine.delete({ collection: 'translations', id: row.id, depth: 0, overrideAccess: false, user })
      deleted += 1
    } catch {
      refused.push(`${row.locale} ${row.fieldPath}`)
    }
  }

  try {
    const security = await getSecuritySettings(engine as never)
    await audit(
      {
        action: 'delete',
        actorId: user.id,
        actorEmail: user.email ?? null,
        collectionSlug: 'translations',
        detail: `Cleared ${deleted} inactive translation${deleted === 1 ? '' : 's'} (${body.scope === 'all' ? 'whole site' : `${body.items?.length ?? 0} items`})`,
        ...(args.request ? auditContext(args.request) : {}),
      },
      security,
    )
  } catch {
    // The deletes stand; a failed audit write is logged by auditLog.ts and must not fail the request.
  }

  return { status: 200, body: { ok: refused.length === 0, count: candidates.length, deleted, refused } }
}

