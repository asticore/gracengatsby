import { getEngine } from '@/lib/engine'

import type { SendEmailArgs, SendEmailResult } from './types'

import { cleanupPolicyFrom, emailRetentionDays } from '@/features/cleanup/schedulePlan'

import { buildLogRow, EMAIL_LOG_SLUG, retentionCutoff } from './emailLog'

/**
 * Writes and prunes the email log. Lives apart from emailLog.ts so the rules
 * there stay free of the engine.
 *
 * Every function here swallows its own errors. A failed log write must never
 * fail the send it describes, or the request that asked for it.
 */

type LogEngine = {
  create: (args: Record<string, unknown>) => Promise<unknown>
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  delete: (args: Record<string, unknown>) => Promise<unknown>
  findGlobal?: (args: Record<string, unknown>) => Promise<unknown>
}

/** Most rows removed in one housekeeping run. The cron runs hourly, so a backlog clears over time. */
const PRUNE_BATCH = 200

/** Records one send attempt. Called from sendEmail after the provider has answered (or the send was refused). */
export async function recordEmailSend(args: SendEmailArgs, result: SendEmailResult): Promise<void> {
  try {
    const row = buildLogRow(args, result)
    if (!row) return
    const engine = (await getEngine()) as unknown as LogEngine
    await engine.create({ collection: EMAIL_LOG_SLUG, data: row, overrideAccess: true })
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', msg: 'Email log entry not written', error: String(error) }))
  }
}

/**
 * Email log retention in days. The Speed page's clean-up setting takes over
 * while clean-up is on; otherwise, or if that setting cannot be read, the
 * built-in 90 day rule applies.
 */
async function emailRetentionFor(engine: LogEngine): Promise<number> {
  try {
    const settings = (await engine.findGlobal?.({ slug: 'speed-settings', depth: 0 })) as { cleanup?: unknown } | null | undefined
    return emailRetentionDays(cleanupPolicyFrom(settings?.cleanup))
  } catch {
    return emailRetentionDays(cleanupPolicyFrom(null))
  }
}

/** Removes rows older than the retention period. Returns how many were removed. Never throws. */
export async function pruneEmailLog(engine: LogEngine, now = new Date()): Promise<number> {
  try {
    const cutoff = retentionCutoff(now, await emailRetentionFor(engine))
    const old = await engine.find({
      collection: EMAIL_LOG_SLUG,
      where: { createdAt: { less_than: cutoff } },
      limit: PRUNE_BATCH,
      depth: 0,
      overrideAccess: true,
    })
    let deleted = 0
    for (const doc of old.docs as { id: number }[]) {
      await engine.delete({ collection: EMAIL_LOG_SLUG, id: doc.id, overrideAccess: true })
      deleted += 1
    }
    return deleted
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', msg: 'Email log prune failed', error: String(error) }))
    return 0
  }
}
