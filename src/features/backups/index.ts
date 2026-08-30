/**
 * Public surface of the Backups feature. Everything outside this folder imports
 * from here, so the internal layout can change without touching the API routes,
 * the config or the worker entry.
 *
 * The worker entry is deliberately NOT re-exported: it imports the adapter's
 * built output, which does not exist until after a build, and pulling that into
 * anything Next renders would break `next build`.
 */

export { Backups } from './collection'

export {
  BACKUPS_FEATURE_KEY,
  DEFAULT_BACKUP_SETTINGS,
  type BackupContents,
  type BackupManifest,
  type BackupRunResult,
  type BackupSettings,
  type BackupStatus,
  type BackupTrigger,
  type DestinationProvider,
} from './types'

export { readBackupSettings, rowToBackupSettings } from './settings'

export { resolveDestination, type ResolvedDestination } from './destinations'

export {
  BACKUP_ROOT,
  deleteBackup,
  listBackups,
  manifestKeyFor,
  newBackupId,
  prefixFor,
  pruneBackups,
  readManifest,
  type CataloguedBackup,
} from './catalogue'

export { runBackup, type RunOptions } from './run'

export { isBackupDue, runScheduledBackup, type DueVerdict } from './scheduled'

export {
  RESTORE_CONFIRMATION,
  availableBackups,
  restoreBackup,
  type RestorePart,
  type RestoreReport,
  type RestoreRequest,
} from './restore'

export { BACKUPS_TABLE } from './record'

export { listAppTables, type TableSplit } from './export/tables'
