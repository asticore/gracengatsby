import { sql } from 'drizzle-orm'

import type { Drizzle } from '@/localapi/migrate'

import { readPageSpeedSettings, testDocument } from './service'
import { countSince } from './store'
import { isPageSpeedCollection, type PageSpeedCollection } from './types'

/**
 * "Test after publish": a publish queues one row here (one per document, so repeat saves only push the
 * time back), and the five-minute cron tick (cloudflare-worker.ts -> /api/cron/publish-scheduled) runs
 * the due ones. Runs are mobile-only to keep within Google's quota, one document per tick, and stop for
 * the day once the daily cap is reached.
 */

/** Minutes after a publish before the test runs, so caches and the new page have settled. */
export const DELAY_MINUTES = 5
const MAX_ATTEMPTS = 3
const RETRY_MINUTES = 15

export async function enqueueTest(db: Drizzle, collection: PageSpeedCollection, docId: number, now = new Date()): Promise<void> {
  const runAt = new Date(now.getTime() + DELAY_MINUTES * 60_000).toISOString()
  await db.run(
    sql`INSERT INTO \`eg_pagespeed_queue\` (collection, doc_id, run_at, attempts) VALUES (${collection}, ${docId}, ${runAt}, 0)
      ON CONFLICT(collection, doc_id) DO UPDATE SET run_at = excluded.run_at, attempts = 0`,
  )
}

export function startOfUtcDay(now: Date): string {
  return `${now.toISOString().slice(0, 10)}T00:00:00.000Z`
}

export type QueueRunResult = { ran: number; skipped: 'off' | 'cap' | 'empty' | null; errors: string[] }

type EngineLike = Parameters<typeof testDocument>[0]['engine']

/** Runs at most one due test. Never throws. */
export async function runDueTests(
  engine: EngineLike,
  db: Drizzle,
  now = new Date(),
  fetchImpl?: Parameters<typeof testDocument>[0]['fetchImpl'],
): Promise<QueueRunResult> {
  const result: QueueRunResult = { ran: 0, skipped: null, errors: [] }
  try {
    const settings = await readPageSpeedSettings(engine)
    if (!settings.testAfterPublish) {
      // Setting is off: drop anything left over so it does not fire when switched on later.
      await db.run(sql`DELETE FROM \`eg_pagespeed_queue\``)
      return { ...result, skipped: 'off' }
    }
    if ((await countSince(db, startOfUtcDay(now), 'auto')) >= settings.dailyCap) {
      // Rows that waited more than a day are stale; drop them so they do not pile up behind the cap.
      const cutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString()
      await db.run(sql`DELETE FROM \`eg_pagespeed_queue\` WHERE run_at < ${cutoff}`)
      return { ...result, skipped: 'cap' }
    }

    const rows = (await db.all(
      sql`SELECT collection, doc_id, attempts FROM \`eg_pagespeed_queue\` WHERE run_at <= ${now.toISOString()} ORDER BY run_at ASC LIMIT 1`,
    )) as { collection: string; doc_id: number; attempts: number }[]
    const row = rows[0]
    if (!row) return { ...result, skipped: 'empty' }

    const drop = () => db.run(sql`DELETE FROM \`eg_pagespeed_queue\` WHERE collection = ${row.collection} AND doc_id = ${row.doc_id}`)
    if (!isPageSpeedCollection(row.collection)) {
      await drop()
      return result
    }

    const outcome = await testDocument({
      engine,
      db,
      collection: row.collection,
      id: Number(row.doc_id),
      strategy: 'mobile',
      source: 'auto',
      apiKey: settings.apiKey,
      fetchImpl,
      now,
    })
    if (outcome.ok === true) {
      result.ran = 1
      await drop()
    } else if (outcome.status === 404 || outcome.status === 422) {
      // Gone, or no longer published: nothing to test.
      await drop()
    } else if (Number(row.attempts) + 1 >= MAX_ATTEMPTS) {
      result.errors.push(outcome.message)
      await drop()
    } else {
      result.errors.push(outcome.message)
      const retryAt = new Date(now.getTime() + RETRY_MINUTES * 60_000).toISOString()
      await db.run(
        sql`UPDATE \`eg_pagespeed_queue\` SET run_at = ${retryAt}, attempts = attempts + 1 WHERE collection = ${row.collection} AND doc_id = ${row.doc_id}`,
      )
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
  }
  return result
}
