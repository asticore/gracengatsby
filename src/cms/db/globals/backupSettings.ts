import { BackupSettings } from '@/globals/BackupSettings'

import { capitalize } from '../schema/generate'
import { createGlobalOps } from '../generic'
import { backupSettings } from '../schema'

/**
 * Payload's document shape for the `backup-settings` global - see
 * src/globals/BackupSettings.ts.
 *
 * STRUCTURAL DEVIATION FROM EVERY OTHER SETTINGS GLOBAL MODELED SO FAR - read
 * before touching this file: BackupSettings' `destination` group nests FOUR
 * further groups inside it (`r2`, `s3`, `ftp`, `sftp`, one shown at a time by
 * `destination.provider`). ../schema/generate.ts's processFields explicitly
 * THROWS the moment it walks a group's subfields and finds another `type:
 * 'group'` field among them ("group ... may only contain plain fields ...")
 * - confirmed by reading that branch directly, and called out in advance by
 * both securitySettings.ts's and memberSettings.ts's own doc comments as a
 * shape neither of THEM has, but that generateTable() cannot handle if
 * something else ever does. BackupSettings is that something else.
 *
 * The correct long-term fix is extending processFields to recurse (mirroring
 * the existing `allowArrayInGroup` escape hatch already proven for Forms'
 * `conditional.rules`) - but that is shared ../schema/generate.ts code, out
 * of bounds for this phase (parallel agents are wiring other globals through
 * the untouched version of that file at the same time). So this table is
 * instead hand-built directly with drizzle's own column builders in
 * ../schema/index.ts, bypassing generateTable() entirely for just this one
 * table - see that file's `backupSettings` doc comment for the column list,
 * every name confirmed against the REAL migration DDL already committed for
 * this global: src/migrations/schema/settingsSchema.ts's `ac_backup_settings`
 * entry (renamed to `eg_backup_settings` by tableRenames.ts), not guessed.
 *
 * That still only gets `destination` flattened ONE level (a flat
 * `destinationR2AccountId`-style JS key per column) - ../generic.ts's
 * nestGroups/flattenGroups (fed via `groupFields` below) fold exactly one
 * prefix level per call, confirmed by reading both functions directly. The
 * SECOND level - splitting `destination`'s own flat `r2*`/`s3*`/`ftp*`/
 * `sftp*` keys into real `r2`/`s3`/`ftp`/`sftp` sub-objects, matching the
 * nested document shape Payload's own engine actually returns - is done
 * entirely in THIS file, by nestDestination/flattenDestination below, wrapped
 * around the generic ops' `find`/`update`. This is why findBackupSettings/
 * updateBackupSettings are real functions here rather than the bare
 * `ops.find as unknown as ...` alias every other global in this data layer
 * uses - there is a genuine second reshaping step to do, not just a type
 * cast. Proven against a real two-level document (all four destination
 * providers' fields, not just one) in
 * tests/int/cms-db-backup-settings.int.spec.ts.
 *
 * As with every group write in this data layer (see e.g. faqSettings.ts's
 * "replaces introBlocks wholesale" test, or any other multi-field group in
 * securitySettings.ts/memberSettings.ts), writing a group replaces ALL of
 * its declared subfields - `updateBackupSettings({ destination: { r2: {...}
 * } } })` and omitting `s3`/`ftp`/`sftp` will flatten those three to
 * `undefined`, not leave their stored values untouched. A caller updating
 * `destination` must pass every sub-provider it wants preserved, same as
 * updating any other group in this data layer.
 *
 * `runAndRestore` (`type: 'ui'`) gets no column at all, exactly like
 * Payload's own real table - a `ui` field is never backed by one (confirmed
 * against the real `ac_backup_settings`/`eg_backup_settings` DDL, which has
 * no such column) - so it has no place in BackupSettingsDoc and needs no
 * test coverage.
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

/**
 * `destination`'s own four nested groups, keyed by the sub-provider name -
 * the JS-key composition (`r2` + capitalize('accountId') = 'r2AccountId')
 * matches exactly what generateTable()'s group branch would have produced if
 * it recursed (see this file's top doc comment), which is in turn what the
 * `destination` GroupFieldMeta passed to createGlobalOps below declares as
 * its flat `subFieldNames` - so ../generic.ts's own nestGroups/flattenGroups
 * (unmodified) already do the FIRST fold correctly; this map only drives the
 * second one, done by hand in nestDestination/flattenDestination.
 */
const DESTINATION_SUBGROUPS = {
  r2: ['accountId', 'bucket', 'accessKeyId', 'secretAccessKey', 'path'],
  s3: ['bucket', 'region', 'accessKeyId', 'secretAccessKey', 'path'],
  ftp: ['host', 'port', 'username', 'password', 'path'],
  sftp: ['host', 'port', 'username', 'password', 'privateKey', 'path'],
} as const

const destinationSubFieldNames = [
  'provider',
  ...Object.entries(DESTINATION_SUBGROUPS).flatMap(([sub, names]) => names.map((name) => `${sub}${capitalize(name)}`)),
]

/** One-level-flat `destination` object (as nestGroups produces it) -> the real two-level nested shape Payload's own engine returns. */
function nestDestination(flat: Record<string, unknown>): NonNullable<BackupSettingsDoc['destination']> {
  const result: Record<string, unknown> = { provider: flat.provider ?? null }
  for (const [sub, names] of Object.entries(DESTINATION_SUBGROUPS)) {
    const group: Record<string, unknown> = {}
    for (const name of names) {
      group[name] = flat[`${sub}${capitalize(name)}`] ?? null
    }
    result[sub] = group
  }
  return result as NonNullable<BackupSettingsDoc['destination']>
}

/** The reverse of nestDestination - only ever called on a caller-supplied `destination` object before handing it to createGlobalOps' own flattenGroups (which does the remaining, single-level fold). */
function flattenDestination(nested: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { provider: nested.provider }
  for (const [sub, names] of Object.entries(DESTINATION_SUBGROUPS)) {
    const group = (nested[sub] as Record<string, unknown>) ?? {}
    for (const name of names) {
      result[`${sub}${capitalize(name)}`] = group[name]
    }
  }
  return result
}

const ops = createGlobalOps(backupSettings, BackupSettings, {}, {
  groupFields: [
    { name: 'schedule', subFieldNames: ['enabled', 'frequency', 'timeOfDay', 'retentionCount'] },
    { name: 'contents', subFieldNames: ['database', 'media', 'settings'] },
    { name: 'destination', subFieldNames: destinationSubFieldNames },
  ],
})

export async function findBackupSettings(): Promise<BackupSettingsDoc | null> {
  const doc = (await ops.find()) as unknown as (BackupSettingsDoc & { destination?: Record<string, unknown> }) | null
  if (!doc) return null
  return { ...doc, destination: nestDestination(doc.destination ?? {}) }
}

export async function updateBackupSettings(
  data: Partial<Omit<BackupSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
): Promise<BackupSettingsDoc> {
  const { destination, ...rest } = data
  const flatData: Record<string, unknown> = { ...rest }
  if (destination !== undefined) {
    flatData.destination = flattenDestination(destination as Record<string, unknown>)
  }
  const doc = (await ops.update(flatData)) as unknown as BackupSettingsDoc & { destination?: Record<string, unknown> }
  return { ...doc, destination: nestDestination(doc.destination ?? {}) }
}
