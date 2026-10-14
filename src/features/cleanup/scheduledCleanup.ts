/**
 * The hourly clean-up job. The cron route calls runScheduledCleanup(engine).
 *
 * Every step is bounded by CLEANUP_BATCH rows in total, and every step catches
 * its own errors, so one failing step never stops the others. Live documents
 * are never removed: only saved versions older than the newest N, trashed
 * documents, and entries past their retention window.
 */

import { getCleanupDb } from './guard'
import type { CleanupDb } from './db'
import { isBookkeepingTable } from './protectedTables'
import { CLEANUP_BATCH, cleanupPolicyFrom, isOlderThan, isSafeIsoStamp, planCleanup, versionTablesFrom, type CleanupStep } from './schedulePlan'
import { AUDIT_TABLE } from '@/features/security/auditLog'
import { SUBMISSIONS_SLUG } from '@/features/forms/slugs'
import { deleteEntryFiles } from '@/features/forms/maintenance'

export type CleanupEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  delete: (args: Record<string, unknown>) => Promise<unknown>
  findGlobal: (args: Record<string, unknown>) => Promise<unknown>
}

/** Collections with a trash, in the order they are checked. */
const TRASHABLE = ['pages', 'posts', 'events'] as const

export type CleanupRunReport = {
  ran: boolean
  removed: Partial<Record<CleanupStep['kind'], number>>
  errors: string[]
}

/** Rows a D1 write touched, read from its metadata when the driver reports it. */
const changesOf = (result: unknown): number => {
  const meta = (result as { meta?: { changes?: number } } | null)?.meta
  return typeof meta?.changes === 'number' ? meta.changes : 0
}

async function pruneVersions(db: CleanupDb, tables: string[], keep: number, budget: number, errors: string[]): Promise<number> {
  let removed = 0
  for (const table of versionTablesFrom(tables)) {
    if (budget - removed <= 0) break
    if (isBookkeepingTable(table)) continue
    // Keep the newest `keep` versions per live document; orphaned versions (no parent) are left alone.
    const sql =
      `DELETE FROM \`${table}\` WHERE id IN (` +
      `SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY id DESC) AS rn ` +
      `FROM \`${table}\` WHERE parent_id IS NOT NULL) WHERE rn > ${keep} LIMIT ${budget - removed})`
    try {
      removed += changesOf(await db.run(sql))
    } catch (error) {
      errors.push(`versions ${table}: ${String((error as Error)?.message || error)}`)
    }
  }
  return removed
}

async function pruneTrash(engine: CleanupEngine, cutoff: string, budget: number, errors: string[]): Promise<number> {
  let removed = 0
  for (const slug of TRASHABLE) {
    if (budget - removed <= 0) break
    try {
      const old = await engine.find({
        collection: slug,
        where: { trashedAt: { less_than: cutoff } },
        limit: budget - removed,
        depth: 0,
        overrideAccess: true,
      })
      for (const doc of old.docs as { id: number; trashedAt?: string }[]) {
        if (!isOlderThan(doc.trashedAt, cutoff)) continue
        await engine.delete({ collection: slug, id: doc.id, overrideAccess: true })
        removed += 1
      }
    } catch (error) {
      errors.push(`trash ${slug}: ${String((error as Error)?.message || error)}`)
    }
  }
  return removed
}

async function pruneForms(engine: CleanupEngine, cutoff: string, budget: number, errors: string[]): Promise<number> {
  let removed = 0
  try {
    const old = await engine.find({
      collection: SUBMISSIONS_SLUG,
      where: { createdAt: { less_than: cutoff } },
      limit: budget,
      depth: 0,
      overrideAccess: true,
    })
    for (const entry of old.docs as { id: number; values?: unknown }[]) {
      await deleteEntryFiles(entry.values)
      await engine.delete({ collection: SUBMISSIONS_SLUG, id: entry.id, overrideAccess: true })
      removed += 1
    }
  } catch (error) {
    errors.push(`forms: ${String((error as Error)?.message || error)}`)
  }
  return removed
}

async function pruneAudit(db: CleanupDb, cutoff: string, budget: number, errors: string[]): Promise<number> {
  if (!isSafeIsoStamp(cutoff)) {
    errors.push('audit: cut-off was not a timestamp, nothing removed')
    return 0
  }
  try {
    const result = await db.run(
      `DELETE FROM \`${AUDIT_TABLE}\` WHERE id IN (SELECT id FROM \`${AUDIT_TABLE}\` WHERE created_at < '${cutoff}' ORDER BY created_at LIMIT ${budget})`,
    )
    return changesOf(result)
  } catch (error) {
    errors.push(`audit: ${String((error as Error)?.message || error)}`)
    return 0
  }
}

export async function runScheduledCleanup(engine: CleanupEngine, now: Date = new Date()): Promise<CleanupRunReport> {
  const report: CleanupRunReport = { ran: false, removed: {}, errors: [] }
  try {
    const settings = (await engine.findGlobal({ slug: 'speed-settings', depth: 0 }).catch((): null => null)) as
      | { cleanup?: unknown }
      | null
    const steps = planCleanup(cleanupPolicyFrom(settings?.cleanup), now)
    if (steps.length === 0) return report
    report.ran = true

    const db = steps.some((step) => step.kind === 'versions' || step.kind === 'audit') ? await getCleanupDb() : null
    const tables = db ? await db.listTables().catch((): string[] => []) : []
    let budget = CLEANUP_BATCH

    for (const step of steps) {
      if (budget <= 0) break
      let count = 0
      if (step.kind === 'versions' && db) count = await pruneVersions(db, tables, step.keep, budget, report.errors)
      if (step.kind === 'trash') count = await pruneTrash(engine, step.cutoff, budget, report.errors)
      if (step.kind === 'forms') count = await pruneForms(engine, step.cutoff, budget, report.errors)
      if (step.kind === 'audit' && db) count = await pruneAudit(db, step.cutoff, budget, report.errors)
      report.removed[step.kind] = (report.removed[step.kind] ?? 0) + count
      budget -= count
    }
  } catch (error) {
    report.errors.push(`clean-up: ${String((error as Error)?.message || error)}`)
  }
  return report
}
