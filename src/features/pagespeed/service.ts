import type { Drizzle } from '@/localapi/migrate'

import { runPageSpeed } from './psi'
import { countSince, latestFetchedAt, saveResult } from './store'
import { publicPath, resolveTarget } from './target'
import type { PageSpeedCollection, StoredResult, Strategy } from './types'

/**
 * One test of one document: load it on the server, build its public URL, ask Google, store the
 * result. Shared by the admin route (manual runs) and the cron queue (runs after publish).
 */

type EngineLike = {
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  findGlobal: (args: Record<string, unknown>) => Promise<unknown>
}

/** Seconds a document+strategy must rest between manual runs, so a button mash cannot burn the quota. */
export const MANUAL_COOLDOWN_SECONDS = 20

/** Manual tests allowed per UTC day across the site (each one spends Google quota). */
export const MANUAL_DAILY_CAP = 100

/** Tests being run right now in this isolate. Claimed before the slow call, so two clicks cannot both pass the cooldown. */
const inFlight = new Set<string>()

export type PageSpeedSettings = { apiKey: string | null; testAfterPublish: boolean; dailyCap: number }

export const DEFAULT_DAILY_CAP = 20
export const MAX_DAILY_CAP = 200

/** Reads the API key (Integrations) and the after-publish settings (Speed). Never throws. */
export async function readPageSpeedSettings(engine: EngineLike): Promise<PageSpeedSettings> {
  const [integrations, speed] = await Promise.all([
    engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true }).catch((): null => null),
    engine.findGlobal({ slug: 'speed-settings', depth: 0, overrideAccess: true }).catch((): null => null),
  ])
  const google = (integrations as { google?: { pageSpeedApiKey?: unknown } } | null)?.google
  const key = typeof google?.pageSpeedApiKey === 'string' ? google.pageSpeedApiKey.trim() : ''
  const group = (speed as { pagespeed?: { testAfterPublish?: unknown; dailyCap?: unknown } } | null)?.pagespeed
  const cap = Number(group?.dailyCap)
  return {
    apiKey: key && !key.startsWith('enc:v1:') ? key : null,
    testAfterPublish: group?.testAfterPublish === true,
    dailyCap: Number.isFinite(cap) && cap >= 1 ? Math.min(Math.floor(cap), MAX_DAILY_CAP) : DEFAULT_DAILY_CAP,
  }
}

export type TestOutcome =
  | { ok: true; result: StoredResult }
  | { ok: false; status: number; code: string; message: string }

export type Resolved = { ok: true; url: string } | { ok: false; reason: string }

/** Loads the document and works out the public URL to test, or why it cannot be tested. */
export async function resolveDocTarget(
  engine: EngineLike,
  collection: PageSpeedCollection,
  id: number,
): Promise<{ found: false } | { found: true; target: Resolved }> {
  const doc = (await engine.findByID({ collection, id, depth: 0, overrideAccess: true }).catch((): null => null)) as Record<string, unknown> | null
  if (!doc) return { found: false }
  const path = await publicPath(collection, doc, async (parentId) => {
    const parent = await engine.findByID({ collection: 'pages', id: parentId, depth: 0, overrideAccess: true }).catch((): null => null)
    return parent as Record<string, unknown> | null
  })
  // All four collections have drafts, so only a published status is testable.
  return { found: true, target: resolveTarget({ status: doc._status, path }) }
}

export async function testDocument(opts: {
  engine: EngineLike
  db: Drizzle
  collection: PageSpeedCollection
  id: number
  strategy: Strategy
  source: 'manual' | 'auto'
  apiKey?: string | null
  fetchImpl?: Parameters<typeof runPageSpeed>[0]['fetchImpl']
  now?: Date
}): Promise<TestOutcome> {
  const resolved = await resolveDocTarget(opts.engine, opts.collection, opts.id)
  if (!resolved.found) return { ok: false, status: 404, code: 'not-found', message: 'Document not found.' }
  if (resolved.target.ok === false) return { ok: false, status: 422, code: 'not-testable', message: resolved.target.reason }

  const now = opts.now ?? new Date()
  if (opts.source === 'manual') {
    const last = await latestFetchedAt(opts.db, opts.collection, opts.id, opts.strategy)
    if (last && now.getTime() - new Date(last).getTime() < MANUAL_COOLDOWN_SECONDS * 1000) {
      return { ok: false, status: 429, code: 'cooldown', message: `This page was just tested. Wait ${MANUAL_COOLDOWN_SECONDS} seconds between tests.` }
    }
  }

  const flightKey = `${opts.collection}:${opts.id}:${opts.strategy}`
  if (opts.source === 'manual') {
    if (inFlight.has(flightKey)) {
      return { ok: false, status: 429, code: 'cooldown', message: 'This page is already being tested.' }
    }
    const startOfDay = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`
    if ((await countSince(opts.db, startOfDay, 'manual')) >= MANUAL_DAILY_CAP) {
      return { ok: false, status: 429, code: 'cooldown', message: 'The daily limit for manual tests has been reached. Try again tomorrow.' }
    }
    inFlight.add(flightKey)
  }
  try {
    return await runAndSave(opts, resolved.target.url, now)
  } finally {
    inFlight.delete(flightKey)
  }
}

async function runAndSave(opts: Parameters<typeof testDocument>[0], url: string, now: Date): Promise<TestOutcome> {
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : (await readPageSpeedSettings(opts.engine)).apiKey
  const outcome = await runPageSpeed({ url: url, strategy: opts.strategy, apiKey, fetchImpl: opts.fetchImpl })
  if (outcome.ok === false) {
    const status = outcome.code === 'rate-limited' ? 429 : outcome.code === 'timeout' ? 504 : 502
    return { ok: false, status, code: outcome.code, message: outcome.message }
  }
  const result = await saveResult(opts.db, {
    collection: opts.collection,
    docId: opts.id,
    url: url,
    strategy: opts.strategy,
    source: opts.source,
    report: outcome.report,
    now,
  })
  return { ok: true, result }
}
