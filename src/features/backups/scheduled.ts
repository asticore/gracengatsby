import { BACKUPS_TABLE } from './record'
import { runBackup } from './run'
import { readBackupSettings } from './settings'
import type { BackupSettings, BackupRunResult } from './types'

/**
 * The scheduled side: deciding whether this cron firing is the one that should
 * take a backup.
 *
 * The cron trigger runs hourly rather than at the configured time, and this
 * decides. Cloudflare's cron expressions live in wrangler.jsonc, which is
 * committed and deployed - wiring the operator's "time of day" field to it
 * would mean a redeploy every time someone changed a dropdown. An hourly wake
 * that usually does nothing costs a few milliseconds and keeps the setting
 * where the operator can change it.
 *
 * Whether a backup is due is answered from the last SUCCESSFUL run recorded in
 * the database, not from a counter or the wall clock alone. That is what makes
 * it self-correcting: a firing that is missed because the platform was busy, or
 * a run that failed, means the next hour at the right time picks it up rather
 * than the site waiting another whole week.
 */

/** How long since the last success before another is due, per frequency. */
const INTERVAL_MS: Record<BackupSettings['schedule']['frequency'], number> = {
  // Each is set slightly SHORT of the nominal period. A run started at 03:00
  // that finishes at 03:20 must not push the next day's 03:00 firing out to the
  // day after, which an exact 24 hours would do.
  daily: 23 * 60 * 60 * 1000,
  weekly: 6.5 * 24 * 60 * 60 * 1000,
  monthly: 27 * 24 * 60 * 60 * 1000,
}

const hourOf = (timeOfDay: string): number => {
  const hour = Number(timeOfDay.split(':')[0])
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 3
}

/** Timestamp of the most recent run that actually produced a usable backup. */
async function lastSuccessAt(db: D1Database): Promise<number | null> {
  try {
    const result = await db
      .prepare(
        `SELECT finished_at FROM \`${BACKUPS_TABLE}\`
          WHERE status IN ('success', 'partial') AND finished_at IS NOT NULL
          ORDER BY finished_at DESC LIMIT 1`,
      )
      .all()
    const value = (result.results?.[0] as { finished_at?: string })?.finished_at
    const at = value ? Date.parse(value) : NaN
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

export type DueVerdict = { due: boolean; reason: string }

export async function isBackupDue(db: D1Database, now: Date = new Date()): Promise<DueVerdict> {
  const settings = await readBackupSettings(db)

  if (!settings.featureEnabled) return { due: false, reason: 'The Backups feature is off.' }
  if (!settings.schedule.enabled) return { due: false, reason: 'Scheduled backups are switched off.' }

  const wanted = hourOf(settings.schedule.timeOfDay)
  if (now.getUTCHours() !== wanted) {
    return { due: false, reason: `Not the scheduled hour (waiting for ${String(wanted).padStart(2, '0')}:00 UTC).` }
  }

  const last = await lastSuccessAt(db)
  if (last === null) return { due: true, reason: 'No successful backup has been recorded yet.' }

  const elapsed = now.getTime() - last
  const interval = INTERVAL_MS[settings.schedule.frequency]
  if (elapsed < interval) {
    const hours = Math.round(elapsed / 3_600_000)
    return { due: false, reason: `The last backup was ${hours}h ago; ${settings.schedule.frequency} is not due yet.` }
  }

  return { due: true, reason: `Due - the last backup was ${Math.round(elapsed / 3_600_000)}h ago.` }
}

/**
 * What the cron trigger calls. Never throws: an exception out of a scheduled
 * handler is retried by the platform, and retrying a backup that failed because
 * the destination rejected the credentials just repeats the same failure with
 * more requests to pay for. The failure is already recorded in `eg_backups`.
 */
export async function runScheduledBackup(
  env: { D1: D1Database; R2: R2Bucket },
  now: Date = new Date(),
): Promise<BackupRunResult | { skipped: true; reason: string }> {
  try {
    const verdict = await isBackupDue(env.D1, now)
    if (!verdict.due) return { skipped: true, reason: verdict.reason }

    return await runBackup({ db: env.D1, bucket: env.R2, trigger: 'scheduled' })
  } catch (error) {
    return { skipped: true, reason: error instanceof Error ? error.message : String(error) }
  }
}
