import { BackupSettings } from '@/globals/BackupSettings'

import { createGlobalOps } from '../generic'
import { backupSettings, backupSettingsGroupFields } from '../schema'

/**
 * Payload's document shape for the `backup-settings` global - see
 * src/globals/BackupSettings.ts.
 *
 * `destination` nests FOUR further groups inside it (`r2`, `s3`, `ftp`,
 * `sftp`, one shown at a time by `destination.provider`) - Phase 20's Gap B,
 * confirmed against the real `ac_backup_settings`/`eg_backup_settings` DDL
 * (src/migrations/schema/settingsSchema.ts) to be ONE flat table
 * (`destination_r2_account_id`, `destination_ftp_host`, etc, no new child
 * table). ../schema/generate.ts's processGroupField now recurses into a
 * group's own nested groups unconditionally (no escape hatch needed, unlike
 * the array/hasMany-select case), and ../generic.ts's nestGroups/
 * flattenGroups (`extractGroup`/`flattenOneGroup`) fold/flatten that
 * recursion at any depth - so `backupSettingsGroupFields` (generated, not
 * hand-built) already carries `destination`'s nested `r2`/`s3`/`ftp`/`sftp`
 * groups under its own `groups` array, and `findBackupSettings`/
 * `updateBackupSettings` are the same bare `ops.find`/`ops.update` alias
 * every other global in this data layer uses - no per-file reshaping step
 * needed any more.
 *
 * As with every group write in this data layer (see e.g. faqSettings.ts's
 * "replaces introBlocks wholesale" test, or any other multi-field group in
 * securitySettings.ts/memberSettings.ts), writing a group replaces ALL of
 * its declared subfields - `updateBackupSettings({ destination: { r2: {...}
 * } } })` and omitting `s3`/`ftp`/`sftp` will flatten those three to
 * `null`, not leave their stored values untouched. A caller updating
 * `destination` must pass every sub-provider it wants preserved, same as
 * updating any other group in this data layer.
 *
 * `runAndRestore` (`type: 'ui'`) gets no column at all, exactly like
 * Payload's own real table - a `ui` field is never backed by one (confirmed
 * against the real `ac_backup_settings`/`eg_backup_settings` DDL, which has
 * no such column) - stripped from the field list ../schema/index.ts feeds
 * generateTable (see its `backupSettingsSchemaConfig` doc comment), so it has
 * no place in BackupSettingsDoc and needs no test coverage.
 *
 * Seven fields are secrets (hooks: { beforeChange: encryptSecretHook,
 * afterRead: decryptSecretHook }, src/utilities/secretField.ts):
 * `destination.r2.accessKeyId`, `destination.r2.secretAccessKey`,
 * `destination.s3.accessKeyId`, `destination.s3.secretAccessKey`,
 * `destination.ftp.password`, `destination.sftp.password`,
 * `destination.sftp.privateKey`. `findBackupSettings()` returns exactly
 * what's stored: a document Payload wrote comes back with all seven still
 * ciphertext, never decrypted plaintext - confirmed both directions in
 * tests/int/cms-db-backup-settings.int.spec.ts.
 *
 * KNOWN GAP (mirrors the pre-existing Form-block gap noted on
 * generate.ts's isHasManyRelational, and the same gap noted on
 * ../globals/integrations.ts, ../globals/emailSettings.ts and
 * ../globals/paymentSettings.ts): updateBackupSettings()'s raw column writes
 * do not run encryptSecretHook - a caller writing a plaintext secret through
 * this layer directly, for any of the seven fields listed above, would store
 * it unencrypted at rest. Not a problem yet since this layer isn't wired
 * into engine/db.ts, but must be resolved (e.g. by running encryptSecretHook
 * in createGlobalOps, or forbidding plaintext writes to secret fields)
 * before cutover for any global/collection holding a secret field.
 */
export type BackupSettingsDoc = {
  id: number
  schedule?: {
    enabled?: boolean | null
    frequency?: string | null
    timeOfDay?: string | null
    retentionCount?: number | null
  } | null
  contents?: {
    database?: boolean | null
    media?: boolean | null
    settings?: boolean | null
  } | null
  destination?: {
    provider?: string | null
    r2?: {
      accountId?: string | null
      bucket?: string | null
      accessKeyId?: string | null
      secretAccessKey?: string | null
      path?: string | null
    } | null
    s3?: {
      bucket?: string | null
      region?: string | null
      accessKeyId?: string | null
      secretAccessKey?: string | null
      path?: string | null
    } | null
    ftp?: {
      host?: string | null
      port?: number | null
      username?: string | null
      password?: string | null
      path?: string | null
    } | null
    sftp?: {
      host?: string | null
      port?: number | null
      username?: string | null
      password?: string | null
      privateKey?: string | null
      path?: string | null
    } | null
  } | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(backupSettings, BackupSettings, {}, { groupFields: backupSettingsGroupFields })

export const findBackupSettings = ops.find as unknown as () => Promise<BackupSettingsDoc | null>
export const updateBackupSettings = ops.update as unknown as (
  data: Partial<Omit<BackupSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<BackupSettingsDoc>
