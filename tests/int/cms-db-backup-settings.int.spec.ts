// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { describe, expect, it } from 'vitest'

import { findBackupSettings, updateBackupSettings } from '@/cms/db'
import { encryptSecretHook } from '@/utilities/secretField'

/**
 * BackupSettings: the one global (so far) whose `destination` group nests
 * FOUR further groups inside it (`r2`, `s3`, `ftp`, `sftp`) - see
 * src/cms/db/globals/backupSettings.ts's doc comment for the full structural
 * explanation (why `generateTable()` can't be used for this table, how the
 * two-level nesting is reconstructed by hand, and the confirmed real DDL
 * this checks against).
 *
 * The first two tests prove `schedule`/`contents` (single-level groups,
 * handled by the ordinary ../generic.ts groupFields mechanism) AND
 * `destination` (the hand-reconstructed two-level group) all round-trip -
 * deliberately exercising ALL FOUR destination sub-providers in the same
 * document (real BackupSettings only shows one at a time via
 * `admin.condition`, confirmed UI-only - every column exists unconditionally
 * regardless of `destination.provider`), not just whichever one
 * `destination.provider` happens to be set to.
 *
 * The remaining tests exercise the seven secret fields
 * (`destination.r2.accessKeyId`, `destination.r2.secretAccessKey`,
 * `destination.s3.accessKeyId`, `destination.s3.secretAccessKey`,
 * `destination.ftp.password`, `destination.sftp.password`,
 * `destination.sftp.privateKey`) - one representative from each of the four
 * sub-providers, plus the R2 pair together - same two directions as
 * cms-db-integrations.int.spec.ts's `claudeApiKey` tests:
 *  - Payload writes plaintext -> our find() returns the raw ciphertext,
 *    never the decrypted plaintext.
 *  - We write a pre-encrypted ciphertext (via encryptSecretHook, mirroring
 *    Payload's real beforeChange hook) through updateBackupSettings() ->
 *    Payload's real findGlobal() decrypts it back to the original
 *    plaintext. We do NOT write a plain unencrypted string through
 *    updateBackupSettings() and expect Payload to read it back correctly -
 *    decryptSecretHook only decrypts values starting with 'enc:v1:', so an
 *    un-prefixed value would come back unchanged, which is not what a real
 *    save through this data layer should ever produce.
 *
 * `runAndRestore` (`type: 'ui'`) is not touched anywhere in this suite - it
 * has no column and no place in BackupSettingsDoc, per backupSettings.ts's
 * doc comment.
 */
describe('cms/db - backup-settings global', () => {
  let engine: Engine

  const fullDestination = {
    provider: 'r2',
    r2: { accountId: 'acct-parity', bucket: 'r2-bucket-parity', accessKeyId: 'r2-plain-access-A', secretAccessKey: 'r2-plain-secret-A', path: 'backups/live' },
    s3: { bucket: 's3-bucket-parity', region: 'ap-southeast-2', accessKeyId: 's3-plain-access-A', secretAccessKey: 's3-plain-secret-A', path: 'backups/live' },
    ftp: { host: 'ftp.parity.example', port: 21, username: 'ftp-user', password: 'ftp-plain-secret-A', path: '/backups' },
    sftp: { host: 'sftp.parity.example', port: 22, username: 'sftp-user', password: 'sftp-plain-secret-A', privateKey: 'sftp-plain-key-A', path: '/backups' },
  } as const

  it('reads a global updated by Payload: schedule/contents groups plus all four destination sub-providers nested two levels deep', async () => {
    engine = await getEngine()

    await engine.updateGlobal({
      slug: 'backup-settings',
      data: {
        schedule: { enabled: true, frequency: 'daily', timeOfDay: '02:00', retentionCount: 14 },
        contents: { database: true, media: false, settings: true },
        destination: fullDestination,
      },
    })

    const viaOurs = await findBackupSettings()
    expect(viaOurs?.schedule).toEqual({ enabled: true, frequency: 'daily', timeOfDay: '02:00', retentionCount: 14 })
    expect(viaOurs?.contents).toEqual({ database: true, media: false, settings: true })
    expect(viaOurs?.destination?.provider).toBe('r2')
    expect(viaOurs?.destination?.r2?.accountId).toBe('acct-parity')
    expect(viaOurs?.destination?.r2?.bucket).toBe('r2-bucket-parity')
    expect(viaOurs?.destination?.r2?.path).toBe('backups/live')
    expect(viaOurs?.destination?.s3).toMatchObject({ bucket: 's3-bucket-parity', region: 'ap-southeast-2', path: 'backups/live' })
    expect(viaOurs?.destination?.ftp).toMatchObject({ host: 'ftp.parity.example', port: 21, username: 'ftp-user', path: '/backups' })
    expect(viaOurs?.destination?.sftp).toMatchObject({ host: 'sftp.parity.example', port: 22, username: 'sftp-user', path: '/backups' })
  })

  it('writes a global (schedule/contents/destination, all four sub-providers) Payload can read back', async () => {
    const ours = await updateBackupSettings({
      schedule: { enabled: false, frequency: 'monthly', timeOfDay: '04:30', retentionCount: 3 },
      contents: { database: true, media: true, settings: false },
      destination: {
        ...fullDestination,
        provider: 's3',
        r2: { ...fullDestination.r2, accountId: 'acct-parity-B' },
        s3: { ...fullDestination.s3, bucket: 's3-bucket-parity-B' },
      },
    })
    expect(ours.schedule?.frequency).toBe('monthly')
    expect(ours.destination?.provider).toBe('s3')
    expect(ours.destination?.r2?.accountId).toBe('acct-parity-B')
    expect(ours.destination?.s3?.bucket).toBe('s3-bucket-parity-B')

    const viaPayload = await engine.findGlobal({ slug: 'backup-settings', depth: 0 })
    expect((viaPayload.schedule as { frequency?: string })?.frequency).toBe('monthly')
    const destination = viaPayload.destination as { provider?: string; r2?: { accountId?: string }; s3?: { bucket?: string } }
    expect(destination.provider).toBe('s3')
    expect(destination.r2?.accountId).toBe('acct-parity-B')
    expect(destination.s3?.bucket).toBe('s3-bucket-parity-B')
  })

  it('replaces the destination group wholesale on update - an omitted sub-provider field comes back null, not the old value', async () => {
    await updateBackupSettings({ destination: fullDestination })

    const updated = await updateBackupSettings({ destination: { provider: 'r2', r2: { accountId: 'acct-parity-only' } } })
    expect(updated.destination?.provider).toBe('r2')
    expect(updated.destination?.r2).toEqual({ accountId: 'acct-parity-only', bucket: null, accessKeyId: null, secretAccessKey: null, path: null })
    expect(updated.destination?.s3).toEqual({ bucket: null, region: null, accessKeyId: null, secretAccessKey: null, path: null })

    const viaPayload = await engine.findGlobal({ slug: 'backup-settings' })
    expect((viaPayload.destination as { r2?: { accountId?: string } })?.r2?.accountId).toBe('acct-parity-only')
  })

  it('reads a global updated by Payload: destination.r2.accessKeyId and destination.r2.secretAccessKey come back as raw ciphertext, not plaintext', async () => {
    await engine.updateGlobal({
      slug: 'backup-settings',
      data: { destination: { provider: 'r2', r2: { accessKeyId: 'r2-plain-access-A', secretAccessKey: 'r2-plain-secret-A' } } },
    })

    const viaOurs = await findBackupSettings()
    expect(viaOurs?.destination?.r2?.accessKeyId).toBeTruthy()
    expect(viaOurs?.destination?.r2?.accessKeyId).not.toBe('r2-plain-access-A')
    expect(viaOurs?.destination?.r2?.accessKeyId?.startsWith('enc:v1:')).toBe(true)
    expect(viaOurs?.destination?.r2?.secretAccessKey).toBeTruthy()
    expect(viaOurs?.destination?.r2?.secretAccessKey).not.toBe('r2-plain-secret-A')
    expect(viaOurs?.destination?.r2?.secretAccessKey?.startsWith('enc:v1:')).toBe(true)
  })

  it('reads a global updated by Payload: destination.s3.secretAccessKey, destination.ftp.password, destination.sftp.password and destination.sftp.privateKey come back as raw ciphertext, not plaintext', async () => {
    await engine.updateGlobal({
      slug: 'backup-settings',
      data: {
        destination: {
          provider: 's3',
          s3: { secretAccessKey: 's3-plain-secret-A' },
          ftp: { password: 'ftp-plain-secret-A' },
          sftp: { password: 'sftp-plain-secret-A', privateKey: 'sftp-plain-key-A' },
        },
      },
    })

    const viaOurs = await findBackupSettings()
    expect(viaOurs?.destination?.s3?.secretAccessKey?.startsWith('enc:v1:')).toBe(true)
    expect(viaOurs?.destination?.s3?.secretAccessKey).not.toBe('s3-plain-secret-A')
    expect(viaOurs?.destination?.ftp?.password?.startsWith('enc:v1:')).toBe(true)
    expect(viaOurs?.destination?.ftp?.password).not.toBe('ftp-plain-secret-A')
    expect(viaOurs?.destination?.sftp?.password?.startsWith('enc:v1:')).toBe(true)
    expect(viaOurs?.destination?.sftp?.password).not.toBe('sftp-plain-secret-A')
    expect(viaOurs?.destination?.sftp?.privateKey?.startsWith('enc:v1:')).toBe(true)
    expect(viaOurs?.destination?.sftp?.privateKey).not.toBe('sftp-plain-key-A')
  })

  it('writes pre-encrypted ciphertexts for all seven secret fields Payload decrypts back to the original plaintext', async () => {
    // Mirrors what Payload's real beforeChange hook does before a value ever
    // reaches the database - see secretField.ts's encryptSecretHook. The
    // hook's real type requires a full Payload FieldHookArgs object; only
    // `value` is read at runtime, so the rest is safely cast away here.
    const cipher = (plaintext: string) => encryptSecretHook({ value: plaintext } as never) as string
    const r2AccessKeyId = cipher('r2-plain-access-B')
    const r2SecretAccessKey = cipher('r2-plain-secret-B')
    const s3AccessKeyId = cipher('s3-plain-access-B')
    const s3SecretAccessKey = cipher('s3-plain-secret-B')
    const ftpPassword = cipher('ftp-plain-secret-B')
    const sftpPassword = cipher('sftp-plain-secret-B')
    const sftpPrivateKey = cipher('sftp-plain-key-B')
    for (const c of [r2AccessKeyId, r2SecretAccessKey, s3AccessKeyId, s3SecretAccessKey, ftpPassword, sftpPassword, sftpPrivateKey]) {
      expect(c.startsWith('enc:v1:')).toBe(true)
    }

    const ours = await updateBackupSettings({
      destination: {
        provider: 'sftp',
        r2: { accountId: 'acct-parity', bucket: 'r2-bucket-parity', accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey, path: 'backups/live' },
        s3: { bucket: 's3-bucket-parity', region: 'ap-southeast-2', accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey, path: 'backups/live' },
        ftp: { host: 'ftp.parity.example', port: 21, username: 'ftp-user', password: ftpPassword, path: '/backups' },
        sftp: { host: 'sftp.parity.example', port: 22, username: 'sftp-user', password: sftpPassword, privateKey: sftpPrivateKey, path: '/backups' },
      },
    })
    expect(ours.destination?.r2?.accessKeyId).toBe(r2AccessKeyId)
    expect(ours.destination?.sftp?.privateKey).toBe(sftpPrivateKey)

    const viaPayload = await engine.findGlobal({ slug: 'backup-settings', depth: 0 })
    const destination = viaPayload.destination as {
      r2?: { accessKeyId?: string; secretAccessKey?: string }
      s3?: { accessKeyId?: string; secretAccessKey?: string }
      ftp?: { password?: string }
      sftp?: { password?: string; privateKey?: string }
    }
    expect(destination.r2?.accessKeyId).toBe('r2-plain-access-B')
    expect(destination.r2?.secretAccessKey).toBe('r2-plain-secret-B')
    expect(destination.s3?.accessKeyId).toBe('s3-plain-access-B')
    expect(destination.s3?.secretAccessKey).toBe('s3-plain-secret-B')
    expect(destination.ftp?.password).toBe('ftp-plain-secret-B')
    expect(destination.sftp?.password).toBe('sftp-plain-secret-B')
    expect(destination.sftp?.privateKey).toBe('sftp-plain-key-B')
  })
})
