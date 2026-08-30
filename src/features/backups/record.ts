import type { BackupStatus, BackupTrigger } from './types'

/**
 * The `eg_backups` row behind every run.
 *
 * Written straight to D1 rather than through the engine, for the same reason
 * the audit log is: the scheduled handler behind the cron trigger has no engine
 * instance, and a record that only exists on the manual path would be missing
 * for exactly the runs nobody is watching.
 *
 * A row is inserted as `running` before any bytes move and updated when the run
 * finishes. That ordering is the point - a run that dies mid-way (a timeout, an
 * isolate eviction) leaves a visible `running` row rather than no trace at all,
 * so the screen shows something went wrong instead of showing nothing.
 *
 * The column names here and the field names on the collection are two halves of
 * one thing; the collection reads this table directly. Change one, change the
 * other.
 */

export const BACKUPS_TABLE = 'eg_backups'

const clip = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined) return null
  const text = String(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export type BackupRecordStart = {
  backupId: string
  trigger: BackupTrigger
  destination: string
  storagePath: string
  contents: string
}

/** Inserts the `running` row and returns its id, or null if the table is missing. */
export async function startBackupRecord(db: D1Database, start: BackupRecordStart): Promise<number | null> {
  try {
    const now = new Date().toISOString()
    const result = await db
      .prepare(
        `INSERT INTO \`${BACKUPS_TABLE}\`
           (backup_id, started_at, trigger_source, contents, destination, storage_path, status, size_bytes, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', 0, ?, ?)
         RETURNING id`,
      )
      .bind(
        start.backupId,
        now,
        start.trigger,
        clip(start.contents, 500),
        clip(start.destination, 200),
        clip(start.storagePath, 500),
        now,
        now,
      )
      .all()

    const row = result.results?.[0] as { id?: number } | undefined
    return row?.id ?? null
  } catch {
    // A backup must not fail because its bookkeeping row could not be written.
    return null
  }
}

export type BackupRecordFinish = {
  status: BackupStatus
  sizeBytes: number
  tablesBackedUp?: number
  mediaObjects?: number
  error?: string | null
}

export async function finishBackupRecord(
  db: D1Database,
  id: number | null,
  finish: BackupRecordFinish,
): Promise<void> {
  if (id === null) return
  try {
    const now = new Date().toISOString()
    await db
      .prepare(
        `UPDATE \`${BACKUPS_TABLE}\`
            SET finished_at = ?, status = ?, size_bytes = ?, tables_backed_up = ?, media_objects = ?, error = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        now,
        finish.status,
        Math.max(0, Math.round(finish.sizeBytes)),
        finish.tablesBackedUp ?? 0,
        finish.mediaObjects ?? 0,
        clip(finish.error, 2000),
        now,
        id,
      )
      .run()
  } catch {
    // Same reasoning as above - the copy is already safely at the destination.
  }
}

/** Drops the rows for backups retention has just deleted, so the two agree. */
export async function forgetBackupRecords(db: D1Database, backupIds: string[]): Promise<void> {
  if (backupIds.length === 0) return
  try {
    const placeholders = backupIds.map(() => '?').join(', ')
    await db
      .prepare(`DELETE FROM \`${BACKUPS_TABLE}\` WHERE backup_id IN (${placeholders})`)
      .bind(...backupIds)
      .run()
  } catch {
    // A stale row is cosmetic; the object it points at is already gone and the
    // restore screen lists from the destination, not from this table.
  }
}
