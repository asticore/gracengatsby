import type { FeatureKey } from '@/features/registry'

/**
 * The shapes shared across the Backups feature.
 *
 * Kept in one file with no imports of its own beyond the registry so the
 * scheduled worker entry - which runs outside Next and must not drag the whole
 * engine into its bundle - can import types without pulling in runtime code.
 */

export const BACKUPS_FEATURE_KEY: FeatureKey = 'backups'

export type DestinationProvider = 'r2' | 's3' | 'ftp' | 'sftp'

export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

export type BackupContents = {
  database: boolean
  media: boolean
  settings: boolean
}

export type BackupSettings = {
  /** False when Backups is switched off in Site Settings. Nothing runs then. */
  featureEnabled: boolean
  schedule: {
    enabled: boolean
    frequency: BackupFrequency
    /** 24-hour UTC time, "HH:MM". */
    timeOfDay: string
    retentionCount: number
  }
  contents: BackupContents
  destination: {
    provider: DestinationProvider
    /** Only the fields the chosen provider needs are populated. */
    accountId?: string
    bucket?: string
    region?: string
    accessKeyId?: string
    secretAccessKey?: string
    path?: string
    host?: string
    port?: number
    username?: string
  }
}

/** Mirrors every `defaultValue` on the Backups settings screen. */
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  featureEnabled: false,
  schedule: { enabled: false, frequency: 'weekly', timeOfDay: '03:00', retentionCount: 7 },
  contents: { database: true, media: true, settings: true },
  destination: { provider: 'r2' },
}

export type BackupTrigger = 'scheduled' | 'manual'

export type BackupStatus = 'running' | 'success' | 'failed' | 'partial'

/**
 * The index written alongside every backup, and the only thing restore reads to
 * decide what a backup contains. Versioned because a restore may be run months
 * later against a newer build - an unknown version is refused rather than
 * guessed at.
 */
export type BackupManifest = {
  manifestVersion: 1
  id: string
  createdAt: string
  trigger: BackupTrigger
  contents: BackupContents
  /** Table name to row count, for the database part. Empty when not included. */
  tables: Record<string, number>
  media: { objects: number; bytes: number }
  /** Byte totals for the files actually written, for the record and for pruning. */
  bytes: { database: number; settings: number; media: number; total: number }
  /** Which settings-owning tables were captured as the "settings" part. */
  settingsTables: string[]
}

export type BackupRunResult = {
  ok: boolean
  id: string
  status: BackupStatus
  bytes: number
  error?: string
  /** Key prefix the backup was written under, relative to the bucket root. */
  prefix?: string
  /** Backups deleted by retention during this run. */
  pruned?: string[]
}
