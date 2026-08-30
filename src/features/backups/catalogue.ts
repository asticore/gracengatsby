import type { S3Store } from './destinations'
import type { BackupManifest } from './types'

/**
 * Reading the destination back: what backups are there, and pruning the ones
 * past the retention count.
 *
 * The destination is the authority, not the `eg_backups` table. A backup that
 * exists as bytes but has no row (the run died after uploading) is still
 * restorable and must be listed; a row whose object has been deleted by hand at
 * the far end is not. Listing from the store is the only answer that is true
 * for both.
 */

/** Everything for one backup lives under `backups/<id>/`. */
export const BACKUP_ROOT = 'backups'

/** Sortable and human-readable: 2026-08-29T041500Z-a1b2c3. */
export function newBackupId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '').replace(/\d{3}Z$/, 'Z')
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${suffix}`
}

export const prefixFor = (backupId: string): string => `${BACKUP_ROOT}/${backupId}`

export const manifestKeyFor = (backupId: string): string => `${prefixFor(backupId)}/manifest.json`

export type CataloguedBackup = {
  id: string
  /** Total bytes of every object under the backup's prefix. */
  bytes: number
  objects: number
  manifest: BackupManifest | null
}

/**
 * Lists the backups at the destination, newest first.
 *
 * One `list` call covers the whole root and the ids are grouped from the keys,
 * rather than one `list` per id. Manifests are fetched only when asked for,
 * because the retention pass needs the ids and nothing else, and a manifest
 * fetch per backup would be one request per kept copy on every single run.
 */
export async function listBackups(store: S3Store, withManifests = false): Promise<CataloguedBackup[]> {
  const objects = await store.list(`${BACKUP_ROOT}/`)
  const root = store.keyFor(`${BACKUP_ROOT}/`)

  const grouped = new Map<string, { bytes: number; objects: number }>()

  for (const object of objects) {
    const relative = object.key.startsWith(root) ? object.key.slice(root.length) : ''
    const id = relative.split('/')[0]
    if (!id) continue
    const entry = grouped.get(id) ?? { bytes: 0, objects: 0 }
    entry.bytes += object.size
    entry.objects += 1
    grouped.set(id, entry)
  }

  // Ids start with an ISO timestamp, so a plain descending string sort is a
  // newest-first sort - no manifest read needed to order the list.
  const ids = [...grouped.keys()].sort().reverse()

  const out: CataloguedBackup[] = []
  for (const id of ids) {
    const entry = grouped.get(id)!
    let manifest: BackupManifest | null = null

    if (withManifests) {
      manifest = await readManifest(store, id)
    }

    out.push({ id, bytes: entry.bytes, objects: entry.objects, manifest })
  }

  return out
}

export async function readManifest(store: S3Store, backupId: string): Promise<BackupManifest | null> {
  try {
    const response = await store.get(manifestKeyFor(backupId))
    const manifest = (await response.json()) as BackupManifest
    return manifest?.manifestVersion === 1 ? manifest : null
  } catch {
    // A backup whose manifest will not load is listed but not restorable; the
    // restore path refuses it by name rather than guessing at its contents.
    return null
  }
}

/** Removes every object under one backup's prefix. */
export async function deleteBackup(store: S3Store, backupId: string): Promise<number> {
  const objects = await store.list(`${prefixFor(backupId)}/`)
  const root = store.keyFor('')
  let deleted = 0

  for (const object of objects) {
    const relative = root && object.key.startsWith(`${root}/`) ? object.key.slice(root.length + 1) : object.key
    await store.delete(relative)
    deleted++
  }

  return deleted
}

/**
 * Prunes to the configured kept count, newest kept.
 *
 * Runs AFTER a successful backup and never before, so a failed run can never
 * take the retention count down a notch and delete a good copy to make room for
 * one that was never written. Returns the ids removed.
 */
export async function pruneBackups(store: S3Store, keep: number): Promise<string[]> {
  const safeKeep = Math.max(1, Math.floor(keep))
  const backups = await listBackups(store)
  const doomed = backups.slice(safeKeep)

  const removed: string[] = []
  for (const backup of doomed) {
    try {
      await deleteBackup(store, backup.id)
      removed.push(backup.id)
    } catch {
      // Leaving an old backup in place costs storage; failing the run over it
      // would throw away a backup that has already been written successfully.
    }
  }

  return removed
}
