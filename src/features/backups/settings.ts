import { decryptSecretHook } from '@/utilities/secretField'

import { DEFAULT_BACKUP_SETTINGS, type BackupSettings, type DestinationProvider } from './types'

/**
 * Reads the Backups screen straight from D1 rather than through the engine.
 *
 * The scheduled handler behind the cron trigger has an `env` and nothing else -
 * no request, no engine instance - so a reader that needs the engine would
 * simply not work for the case backups exist for. One reader used by both the
 * cron path and the API routes also removes the class of bug where a manual run
 * and a scheduled run disagree about what the settings say.
 *
 * Credentials come out of the table encrypted, because the decryption normally
 * happens in a field `afterRead` hook that only fires on an engine read. The
 * same hook is called here directly so there is exactly one implementation of
 * the at-rest format - see utilities/secretField.
 */

const SETTINGS_TABLE = 'eg_backup_settings'
const SITE_SETTINGS_TABLE = 'eg_site_settings'

type Row = Record<string, unknown>

const asBool = (value: unknown, fallback: boolean): boolean =>
  value === null || value === undefined ? fallback : Boolean(Number(value) || value === true)

const asNum = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Runs the shared at-rest decryption over one stored column. The hook only ever
 * looks at `value`, so the rest of the field-hook argument object is not
 * constructed - passing a stub is honest about that and avoids inventing a
 * second copy of the AES-GCM format here.
 */
const decrypt = async (value: unknown): Promise<string> => {
  if (typeof value !== 'string' || value.length === 0) return ''
  const hook = decryptSecretHook as unknown as (args: { value: string }) => string | Promise<string>
  try {
    return (await hook({ value })) ?? ''
  } catch {
    return ''
  }
}

const PROVIDERS: DestinationProvider[] = ['r2', 's3', 'ftp', 'sftp']

const asProvider = (value: unknown): DestinationProvider => {
  const text = asText(value) as DestinationProvider
  return PROVIDERS.includes(text) ? text : 'r2'
}

/** Maps the flat settings row onto the nested shape, decrypting as it goes. */
export async function rowToBackupSettings(row: Row | null, featureEnabled: boolean): Promise<BackupSettings> {
  const base = DEFAULT_BACKUP_SETTINGS
  if (!row) return { ...base, featureEnabled }

  const provider = asProvider(row.destination_provider)

  const destination: BackupSettings['destination'] = { provider }

  if (provider === 'r2') {
    destination.accountId = asText(row.destination_r2_account_id)
    destination.bucket = asText(row.destination_r2_bucket)
    destination.region = 'auto'
    destination.accessKeyId = await decrypt(row.destination_r2_access_key_id)
    destination.secretAccessKey = await decrypt(row.destination_r2_secret_access_key)
    destination.path = asText(row.destination_r2_path)
  } else if (provider === 's3') {
    destination.bucket = asText(row.destination_s3_bucket)
    destination.region = asText(row.destination_s3_region)
    destination.accessKeyId = await decrypt(row.destination_s3_access_key_id)
    destination.secretAccessKey = await decrypt(row.destination_s3_secret_access_key)
    destination.path = asText(row.destination_s3_path)
  } else {
    // FTP and SFTP are read back so the screen and the error message can name
    // the host the operator entered, but nothing here can connect to it. See
    // destinations/index.ts.
    const key = provider
    destination.host = asText(row[`destination_${key}_host`])
    destination.port = asNum(row[`destination_${key}_port`], provider === 'ftp' ? 21 : 22)
    destination.username = asText(row[`destination_${key}_username`])
    destination.path = asText(row[`destination_${key}_path`])
  }

  return {
    featureEnabled,
    schedule: {
      enabled: asBool(row.schedule_enabled, base.schedule.enabled),
      frequency: (['daily', 'weekly', 'monthly'] as const).includes(
        asText(row.schedule_frequency) as 'daily',
      )
        ? (asText(row.schedule_frequency) as BackupSettings['schedule']['frequency'])
        : base.schedule.frequency,
      timeOfDay: /^\d{1,2}:\d{2}$/.test(asText(row.schedule_time_of_day))
        ? asText(row.schedule_time_of_day)
        : base.schedule.timeOfDay,
      retentionCount: asNum(row.schedule_retention_count, base.schedule.retentionCount),
    },
    contents: {
      database: asBool(row.contents_database, base.contents.database),
      media: asBool(row.contents_media, base.contents.media),
      settings: asBool(row.contents_settings, base.contents.settings),
    },
    destination,
  }
}

/**
 * The one entry point. Fails closed rather than open: if the settings row or
 * the feature flag cannot be read, backups stay off. That is the opposite of
 * the Security feature's choice, and deliberately so - a security default that
 * fails open only weakens headers, whereas a backup that fires against
 * half-read settings writes an incomplete copy over a good one.
 */
export async function readBackupSettings(db: D1Database): Promise<BackupSettings> {
  try {
    const settings = await db.prepare(`SELECT * FROM \`${SETTINGS_TABLE}\` LIMIT 1`).all()
    const flags = await db
      .prepare(`SELECT features_backups FROM \`${SITE_SETTINGS_TABLE}\` LIMIT 1`)
      .all()

    const flagRow = flags.results?.[0] as Row | undefined
    return await rowToBackupSettings(
      (settings.results?.[0] as Row) ?? null,
      asBool(flagRow?.features_backups, false),
    )
  } catch {
    return { ...DEFAULT_BACKUP_SETTINGS, featureEnabled: false }
  }
}
