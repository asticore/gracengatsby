import { getEngine } from '@/lib/engine'

import { fingerprintFor } from './fingerprint'
import {
  decideDedupe,
  dedupeCutoff,
  ERROR_LOG_CAP,
  housekeepingDue,
  MESSAGE_CAP,
  PATH_CAP,
  planTrim,
  resolvedCutoff,
  SOURCE_CAP,
  STACK_CAP,
  USER_AGENT_CAP,
  type ExistingEntry,
  type TrimCandidate,
} from './policy'
import { cleanForStorage, stripQuery } from './scrub'

/**
 * Writes one error to the error log (the `error-log` collection, see
 * src/collections/ErrorLog.ts). The rules live in scrub.ts, fingerprint.ts and
 * policy.ts; this file only talks to the engine.
 *
 * logError never throws. A failure to log must not turn a page or a request
 * into a second failure, so every problem ends in a console message instead.
 */

export const ERROR_LOG_SLUG = 'error-log'

export type LogErrorInput = {
  /** Where it came from, such as "client", "paypal-webhook" or "form-submit". */
  source: string
  message: string
  /** The thrown value, when there is one. Its message and stack are used if the fields above are missing. */
  error?: unknown
  path?: string
  /** A stack trace, when the caller has one that is not on an Error object. */
  stack?: string
  userAgent?: string
}

type LogRow = { id: number; count?: number; lastSeen?: string; status?: string }

type LogEngine = {
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
  delete: (args: Record<string, unknown>) => Promise<unknown>
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  count: (args: Record<string, unknown>) => Promise<{ totalDocs: number }>
}

/** The last time housekeeping ran in this isolate. Per isolate, which is enough: it only needs to run now and then. */
let lastHousekeepingMs = 0

/** Most rows removed in one housekeeping or trim pass. */
const BATCH = 200

function errorParts(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack ?? '' }
  if (typeof error === 'string') return { message: error, stack: '' }
  if (error === null || error === undefined) return { message: '', stack: '' }
  try {
    return { message: JSON.stringify(error) ?? '', stack: '' }
  } catch {
    return { message: 'Unknown error', stack: '' }
  }
}

/** Records one error, or counts it when the same error was logged in the last 24 hours. Never throws. */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const parts = errorParts(input.error)

    const source = cleanForStorage(input.source, SOURCE_CAP) || 'unknown'
    const message = cleanForStorage(input.message || parts.message || 'Unknown error', MESSAGE_CAP)
    const stack = cleanForStorage(input.stack || parts.stack, STACK_CAP)
    const path = cleanForStorage(stripQuery(input.path), PATH_CAP)
    const userAgent = cleanForStorage(input.userAgent, USER_AGENT_CAP)
    const fingerprint = fingerprintFor(source, message, stack)

    const engine = (await getEngine()) as unknown as LogEngine
    const found = await engine.find({
      collection: ERROR_LOG_SLUG,
      where: { fingerprint: { equals: fingerprint }, lastSeen: { greater_than: dedupeCutoff(now) } },
      sort: '-lastSeen',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const newest = (found.docs[0] as LogRow | undefined) ?? null
    const existing: ExistingEntry | null = newest && newest.lastSeen ? { id: newest.id, count: newest.count ?? 1, lastSeen: newest.lastSeen } : null
    const decision = decideDedupe(existing, now)

    if (decision.action === 'increment') {
      await engine.update({ collection: ERROR_LOG_SLUG, id: decision.id, data: { count: decision.count, lastSeen: nowIso }, overrideAccess: true })
    } else {
      await engine.create({
        collection: ERROR_LOG_SLUG,
        data: { source, message, stack, path, userAgent, count: 1, firstSeen: nowIso, lastSeen: nowIso, fingerprint, status: 'open' },
        overrideAccess: true,
      })
      await trimIfOver(engine)
    }

    await housekeeping(engine, now)
  } catch (failure) {
    console.error(JSON.stringify({ level: 'warn', msg: 'Error log entry not written', error: String(failure) }))
  }
}

/** Removes the oldest rows when the log is past its cap. Resolved rows go before open ones. */
async function trimIfOver(engine: LogEngine): Promise<void> {
  const { totalDocs } = await engine.count({ collection: ERROR_LOG_SLUG, overrideAccess: true })
  if (totalDocs <= ERROR_LOG_CAP) return

  const resolved = (
    await engine.find({
      collection: ERROR_LOG_SLUG,
      where: { status: { not_equals: 'open' } },
      sort: 'lastSeen',
      limit: BATCH,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as LogRow[]
  const open = resolved.length >= BATCH ? [] : ((await engine.find({ collection: ERROR_LOG_SLUG, where: { status: { equals: 'open' } }, sort: 'lastSeen', limit: BATCH, depth: 0, overrideAccess: true })).docs as LogRow[])

  const candidates = [...resolved, ...open].map((row) => ({ id: row.id, status: row.status ?? 'open', lastSeen: row.lastSeen ?? '' })) as TrimCandidate[]
  for (const id of planTrim(candidates, totalDocs, ERROR_LOG_CAP, BATCH)) {
    await engine.delete({ collection: ERROR_LOG_SLUG, id, overrideAccess: true })
  }
}

/** Removes ignored and fixed entries that have not been seen for 30 days. Runs at most every ten minutes. */
async function housekeeping(engine: LogEngine, now: number): Promise<void> {
  if (!housekeepingDue(lastHousekeepingMs, now)) return
  lastHousekeepingMs = now
  const old = await engine.find({
    collection: ERROR_LOG_SLUG,
    where: { status: { not_equals: 'open' }, lastSeen: { less_than: resolvedCutoff(now) } },
    sort: 'lastSeen',
    limit: BATCH,
    depth: 0,
    overrideAccess: true,
  })
  for (const row of old.docs as { id: number }[]) {
    await engine.delete({ collection: ERROR_LOG_SLUG, id: row.id, overrideAccess: true })
  }
}
