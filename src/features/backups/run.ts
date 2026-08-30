import { StreamingUpload, resolveDestination } from './destinations'
import { dumpTables } from './export/database'
import { copyMedia } from './export/media'
import { listAppTables } from './export/tables'
import { manifestKeyFor, newBackupId, prefixFor, pruneBackups } from './catalogue'
import { finishBackupRecord, forgetBackupRecords, startBackupRecord } from './record'
import { readBackupSettings } from './settings'
import type { BackupManifest, BackupRunResult, BackupTrigger } from './types'

/**
 * One backup run, start to finish.
 *
 * The order is deliberate and is the whole design:
 *
 *   1. Refuse early. The feature flag, the destination and the credentials are
 *      all checked before a single byte is read out of the database, so a
 *      misconfigured destination costs one HTTP request rather than a full
 *      export that discovers at the end it has nowhere to go.
 *   2. Write the parts, smallest first. Settings, then the database, then media.
 *      If the run is going to hit a limit it will hit it on media, which is
 *      almost always the bulk - and a backup with everything but some of the
 *      images is worth far more than one that got nowhere.
 *   3. Write the manifest LAST. Restore only lists backups it can read a
 *      manifest for, so a run that dies part-way leaves an unreferenced pile of
 *      objects rather than something that looks restorable and is not.
 *   4. Prune only after the manifest lands. Retention can never delete a good
 *      copy to make room for a failed one.
 */

/**
 * How long a run gives itself before it stops copying media and reports what it
 * managed. Cloudflare's scheduled invocations get generous wall time but not
 * unlimited, and a run killed by the platform mid-upload leaves no manifest at
 * all. Stopping voluntarily leaves a complete, restorable database with a
 * partial media set and says so in the record.
 */
const TIME_BUDGET_MS = 10 * 60 * 1000

export type RunOptions = {
  db: D1Database
  bucket: R2Bucket
  trigger: BackupTrigger
  /** Overrides the time budget; the manual route uses a shorter one. */
  budgetMs?: number
}

export async function runBackup(options: RunOptions): Promise<BackupRunResult> {
  const { db, bucket, trigger } = options
  const startedAt = Date.now()
  const budget = options.budgetMs ?? TIME_BUDGET_MS
  const withinBudget = () => Date.now() - startedAt < budget

  const id = newBackupId()
  const settings = await readBackupSettings(db)

  if (!settings.featureEnabled) {
    return {
      ok: false,
      id,
      status: 'failed',
      bytes: 0,
      error: 'Backups are switched off for this site. Turn the feature on in Site Settings first.',
    }
  }

  const contents = settings.contents
  if (!contents.database && !contents.media && !contents.settings) {
    return {
      ok: false,
      id,
      status: 'failed',
      bytes: 0,
      error: 'Nothing is selected under Contents, so there is nothing to back up.',
    }
  }

  const destination = resolveDestination(settings)
  if (!destination.ok || !destination.store) {
    return { ok: false, id, status: 'failed', bytes: 0, error: destination.error }
  }

  const store = destination.store
  const label = destination.label ?? 'the destination'
  const prefix = prefixFor(id)

  try {
    await store.check()
  } catch (error) {
    return {
      ok: false,
      id,
      status: 'failed',
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const chosen = [
    contents.database ? 'database' : null,
    contents.media ? 'media' : null,
    contents.settings ? 'settings' : null,
  ].filter(Boolean)

  const recordId = await startBackupRecord(db, {
    backupId: id,
    trigger,
    destination: label,
    storagePath: store.keyFor(prefix),
    contents: chosen.join(', '),
  })

  const bytes = { database: 0, settings: 0, media: 0, total: 0 }
  let tables: Record<string, number> = {}
  let settingsTables: string[] = []
  let media = { objects: 0, bytes: 0 }
  const problems: string[] = []

  /** Runs one part, aborting its upload cleanly if the part throws. */
  const writePart = async (
    relative: string,
    write: (upload: StreamingUpload) => Promise<void>,
  ): Promise<number> => {
    const upload = new StreamingUpload(store, relative, 'application/x-ndjson')
    try {
      await write(upload)
      return await upload.close()
    } catch (error) {
      await upload.abort()
      throw error
    }
  }

  try {
    const split = await listAppTables(db)

    if (contents.settings) {
      settingsTables = split.settings
      bytes.settings = await writePart(`${prefix}/settings.ndjson`, async (upload) => {
        await dumpTables(db, split.settings, upload)
      })
    }

    if (contents.database) {
      bytes.database = await writePart(`${prefix}/database.ndjson`, async (upload) => {
        tables = await dumpTables(db, split.database, upload)
      })
    }

    if (contents.media) {
      const copied = await copyMedia(bucket, store, prefix, withinBudget)
      media = { objects: copied.objects, bytes: copied.bytes }
      bytes.media = copied.bytes
      // Media failures are reported but do not sink the run - see the ordering
      // note at the top of this file.
      problems.push(...copied.failures.slice(0, 20))
    }

    bytes.total = bytes.database + bytes.settings + bytes.media

    const manifest: BackupManifest = {
      manifestVersion: 1,
      id,
      createdAt: new Date().toISOString(),
      trigger,
      contents,
      tables,
      media,
      bytes,
      settingsTables,
    }

    await store.put(manifestKeyFor(id), JSON.stringify(manifest, null, 2), 'application/json')

    const status = problems.length > 0 ? 'partial' : 'success'

    await finishBackupRecord(db, recordId, {
      status,
      sizeBytes: bytes.total,
      tablesBackedUp: Object.keys(tables).length + settingsTables.length,
      mediaObjects: media.objects,
      error: problems.length > 0 ? problems.join('\n') : null,
    })

    const pruned = await pruneBackups(store, settings.schedule.retentionCount)
    await forgetBackupRecords(db, pruned)

    return {
      ok: true,
      id,
      status,
      bytes: bytes.total,
      prefix: store.keyFor(prefix),
      pruned,
      ...(problems.length > 0 ? { error: problems.join('\n') } : {}),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await finishBackupRecord(db, recordId, {
      status: 'failed',
      sizeBytes: bytes.database + bytes.settings + bytes.media,
      tablesBackedUp: Object.keys(tables).length,
      mediaObjects: media.objects,
      error: message,
    })

    // Whatever landed before the failure is deliberately NOT deleted. It has no
    // manifest, so restore will not offer it, and leaving it is what lets an
    // operator look at the destination and see how far the run got.
    return { ok: false, id, status: 'failed', bytes: 0, error: message }
  }
}
