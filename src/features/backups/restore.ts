import type { S3Store } from './destinations'

import { listBackups, readManifest, prefixFor, type CataloguedBackup } from './catalogue'
import { resolveDestination } from './destinations'
import { decodeValue } from './export/database'
import { MEDIA_PREFIX } from './export/media'
import { columnsOf } from './export/tables'
import { readBackupSettings } from './settings'
import type { BackupManifest } from './types'

/**
 * Putting a backup back.
 *
 * This is the destructive half of the feature, and it is written on one
 * principle: a half-restore is worse than no restore. A site with some tables
 * from Tuesday and some from today is broken in ways nobody can reason about,
 * whereas a refused restore leaves the operator exactly where they started with
 * the option to try again.
 *
 * So the database is never written to incrementally. Every row is loaded into
 * staging tables first - `eg_rst_<table>`, created from the live table's own
 * shape - and only when every table has landed does one final transaction move
 * the data across. Up to that moment the live tables have not been touched, and
 * any failure means dropping the staging tables and walking away. The swap
 * itself is a single `db.batch()`, which D1 runs as one transaction, so it
 * either all happens or none of it does.
 *
 * The swap deletes and refills the existing tables rather than renaming staging
 * over them. Renaming would be simpler and is the wrong choice: SQLite keeps
 * indexes and constraints attached to the table object, so a renamed-in staging
 * table would arrive with no indexes and no foreign keys, and the site would
 * come back slow and unprotected in a way nothing would report.
 *
 * Three guards sit in front of all of it: the typed confirmation, the
 * not-empty check, and a column-set comparison against the manifest. The last
 * one is the quiet but important guard - restoring a backup taken before a
 * schema change into the table as it exists today is how you get a database
 * that loads and is subtly wrong.
 */

/** What the operator must type, exactly, for anything here to run. */
export const RESTORE_CONFIRMATION = 'RESTORE'

export type RestorePart = 'database' | 'settings' | 'media'

export type RestoreRequest = {
  db: D1Database
  bucket: R2Bucket
  backupId: string
  /** Must equal RESTORE_CONFIRMATION. */
  confirm: string
  /** Required when the target already holds data. */
  overwrite: boolean
  /** Defaults to every part the backup contains. */
  parts?: RestorePart[]
  /** Stops before writing anything and reports what would happen. */
  dryRun?: boolean
}

export type RestoreReport = {
  ok: boolean
  backupId: string
  dryRun: boolean
  /** Tables that already hold rows, with their counts. */
  occupied: Record<string, number>
  mediaObjectsPresent: number
  restored: { tables: Record<string, number>; mediaObjects: number }
  error?: string
  /** Anything the operator should know that did not stop the restore. */
  warnings: string[]
}

const fail = (backupId: string, error: string, extra: Partial<RestoreReport> = {}): RestoreReport => ({
  ok: false,
  backupId,
  dryRun: false,
  occupied: {},
  mediaObjectsPresent: 0,
  restored: { tables: {}, mediaObjects: 0 },
  warnings: [],
  error,
  ...extra,
})

const stagingName = (table: string): string => `eg_rst_${table.replace(/^_/, 'v_')}`

/**
 * Reads an NDJSON body a line at a time.
 *
 * The dump is streamed rather than parsed whole for the same reason it is
 * written streamed - a database export can be far larger than the Worker's
 * memory cap, and `await response.text()` on one would end the restore before
 * it started.
 */
async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let carry = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    carry += decoder.decode(value, { stream: true })

    let newline = carry.indexOf('\n')
    while (newline !== -1) {
      const line = carry.slice(0, newline).trim()
      carry = carry.slice(newline + 1)
      if (line) yield JSON.parse(line)
      newline = carry.indexOf('\n')
    }
  }

  const last = carry.trim()
  if (last) yield JSON.parse(last)
}

/** D1 caps a statement at 100 bound parameters, so wide tables get fewer rows. */
const rowsPerStatement = (columnCount: number): number =>
  Math.max(1, Math.floor(100 / Math.max(1, columnCount)))

/** Statements per `db.batch`. Keeps one batch well inside D1's request size. */
const BATCH_STATEMENTS = 40

type StageResult = { staged: Record<string, number>; staging: Map<string, string> }

/**
 * Loads a dump into staging tables. Touches nothing live.
 *
 * Every table named in the dump must already exist with exactly the same
 * columns; a mismatch throws here, before the swap, which is the entire reason
 * this phase is separate.
 */
// stageDump, swapIn and dropStaging are exported for the round-trip test that
// proves a dump restores to byte-identical rows. They are deliberately NOT in
// index.ts: the only supported way in is restoreBackup, which is where the
// confirmation and not-empty guards live.
export async function stageDump(
  db: D1Database,
  body: ReadableStream<Uint8Array>,
  only: Set<string> | null,
): Promise<StageResult> {
  const staged: Record<string, number> = {}
  const staging = new Map<string, string>()

  let table: string | null = null
  let columns: string[] = []
  let pending: unknown[][] = []
  let perStatement = 1

  const flush = async () => {
    if (!table || pending.length === 0) return
    const target = staging.get(table)!
    const placeholders = `(${columns.map(() => '?').join(', ')})`
    const statements = []

    for (let index = 0; index < pending.length; index += perStatement) {
      const group = pending.slice(index, index + perStatement)
      statements.push(
        db
          .prepare(
            `INSERT INTO \`${target}\` VALUES ${group.map(() => placeholders).join(', ')}`,
          )
          .bind(...group.flat()),
      )
    }

    for (let index = 0; index < statements.length; index += BATCH_STATEMENTS) {
      await db.batch(statements.slice(index, index + BATCH_STATEMENTS))
    }

    staged[table] = (staged[table] ?? 0) + pending.length
    pending = []
  }

  for await (const entry of ndjsonLines(body)) {
    const record = entry as { t?: string; name?: string; columns?: string[]; v?: unknown[] }

    if (record.t === 'table') {
      await flush()
      const name = record.name!

      if (only && !only.has(name)) {
        table = null
        continue
      }

      const live = await columnsOf(db, name)
      if (live.length === 0) {
        throw new Error(
          `The backup contains \`${name}\`, which does not exist in this database. Run the schema step first, then try again.`,
        )
      }

      const expected = record.columns ?? []
      if (live.length !== expected.length || live.some((column, index) => column !== expected[index])) {
        throw new Error(
          `\`${name}\` has different columns now than when this backup was taken ` +
            `(backup: ${expected.join(', ')}; now: ${live.join(', ')}). Restoring it would put values in the wrong fields, so nothing has been changed.`,
        )
      }

      table = name
      columns = live
      perStatement = rowsPerStatement(columns.length)

      const target = stagingName(name)
      staging.set(name, target)
      await db.prepare(`DROP TABLE IF EXISTS \`${target}\``).run()
      await db.prepare(`CREATE TABLE \`${target}\` AS SELECT * FROM \`${name}\` WHERE 0`).run()
      staged[name] = 0
      continue
    }

    if (record.t === 'r' && table) {
      pending.push((record.v ?? []).map(decodeValue))
      if (pending.length >= perStatement * BATCH_STATEMENTS) await flush()
      continue
    }

    if (record.t === 'end') await flush()
  }

  await flush()
  return { staged, staging }
}

/** Removes staging tables. Called on every path out, success or failure. */
export async function dropStaging(db: D1Database, staging: Map<string, string>): Promise<void> {
  for (const target of staging.values()) {
    await db.prepare(`DROP TABLE IF EXISTS \`${target}\``).run().catch(() => {})
  }
}

/**
 * The one moment live data changes: empty each table and refill it from its
 * staging copy, in a single transaction.
 *
 * Every delete goes before every insert. Doing it table by table would leave
 * the database referentially inconsistent between statements, which matters
 * when foreign keys are on.
 */
export async function swapIn(db: D1Database, staging: Map<string, string>): Promise<void> {
  const statements = [
    // Without this the very first DELETE fails: emptying a parent table while
    // its children still hold rows breaks a foreign key immediately, and every
    // ordering of ~170 interlinked tables breaks some other one. Deferring the
    // checks to the end of the transaction is the only ordering that works, and
    // it is stricter rather than looser - the constraints are all still checked,
    // just once the data is whole again. It lasts for this transaction only.
    db.prepare('PRAGMA defer_foreign_keys = ON'),
    ...[...staging.keys()].map((table) => db.prepare(`DELETE FROM \`${table}\``)),
    ...[...staging.entries()].map(([table, target]) =>
      db.prepare(`INSERT INTO \`${table}\` SELECT * FROM \`${target}\``),
    ),
  ]

  // One batch, one transaction. Splitting it to stay inside a size limit would
  // reintroduce exactly the partial-restore this whole file exists to prevent,
  // so if this is ever too large for one batch the answer is to restore fewer
  // parts at a time, not to split the swap.
  await db.batch(statements)
}

/** Where a backup's media object sits, relative to the store's own prefix. */
const mediaKeyPrefix = (backupId: string): string => `${prefixFor(backupId)}/${MEDIA_PREFIX}/`

async function restoreMedia(
  store: S3Store,
  bucket: R2Bucket,
  backupId: string,
): Promise<{ objects: number; warnings: string[] }> {
  const warnings: string[] = []
  const prefix = mediaKeyPrefix(backupId)
  const objects = await store.list(prefix)
  const root = store.keyFor(prefix)
  let restored = 0

  for (const object of objects) {
    const key = object.key.startsWith(root) ? object.key.slice(root.length) : ''
    if (!key) continue

    try {
      const response = await store.get(`${prefix}${key}`)
      if (!response.body) {
        warnings.push(`${key}: the backup copy could not be opened.`)
        continue
      }
      await bucket.put(key, response.body, {
        httpMetadata: { contentType: response.headers.get('content-type') || 'application/octet-stream' },
      })
      restored++
    } catch (error) {
      warnings.push(`${key}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { objects: restored, warnings }
}

/**
 * Lists the backups available to restore from, with their manifests, so the
 * screen can show what each one actually contains.
 */
export async function availableBackups(
  db: D1Database,
): Promise<{ ok: boolean; error?: string; backups: CataloguedBackup[] }> {
  const settings = await readBackupSettings(db)
  const destination = resolveDestination(settings)
  if (!destination.ok || !destination.store) {
    return { ok: false, error: destination.error, backups: [] }
  }

  const backups = await listBackups(destination.store, true)
  return { ok: true, backups }
}

export async function restoreBackup(request: RestoreRequest): Promise<RestoreReport> {
  const { db, bucket, backupId } = request

  if (request.confirm !== RESTORE_CONFIRMATION) {
    return fail(
      backupId,
      `Nothing was restored. Type ${RESTORE_CONFIRMATION} exactly to confirm - this replaces the live site with the backup's contents.`,
    )
  }

  const settings = await readBackupSettings(db)
  if (!settings.featureEnabled) {
    return fail(backupId, 'Backups are switched off for this site, so there is nothing to restore from.')
  }

  const destination = resolveDestination(settings)
  if (!destination.ok || !destination.store) return fail(backupId, destination.error)
  const store = destination.store

  const manifest: BackupManifest | null = await readManifest(store, backupId)
  if (!manifest) {
    return fail(
      backupId,
      `That backup has no readable manifest, so what it contains cannot be established. It is not safe to restore and has been left alone.`,
    )
  }

  const parts = new Set<RestorePart>(
    request.parts ??
      ([
        manifest.contents.database ? 'database' : null,
        manifest.contents.settings ? 'settings' : null,
        manifest.contents.media ? 'media' : null,
      ].filter(Boolean) as RestorePart[]),
  )

  // --- Preflight: what is in the way ------------------------------------

  const occupied: Record<string, number> = {}
  const wantedTables = [
    ...(parts.has('database') ? Object.keys(manifest.tables) : []),
    ...(parts.has('settings') ? manifest.settingsTables : []),
  ]

  for (const table of wantedTables) {
    try {
      const result = await db.prepare(`SELECT COUNT(*) AS n FROM \`${table}\``).all()
      const count = Number((result.results?.[0] as { n?: number })?.n ?? 0)
      if (count > 0) occupied[table] = count
    } catch {
      return fail(
        backupId,
        `\`${table}\` is in the backup but not in this database. Bring the schema up to date first - nothing has been changed.`,
      )
    }
  }

  let mediaPresent = 0
  if (parts.has('media')) {
    const existing = await bucket.list({ limit: 1000 })
    mediaPresent = existing.objects.length
  }

  const notEmpty = Object.keys(occupied).length > 0 || mediaPresent > 0
  const base: RestoreReport = {
    ok: false,
    backupId,
    dryRun: Boolean(request.dryRun),
    occupied,
    mediaObjectsPresent: mediaPresent,
    restored: { tables: {}, mediaObjects: 0 },
    warnings: [],
  }

  if (notEmpty && !request.overwrite) {
    return {
      ...base,
      error:
        `This site already holds data - ${Object.keys(occupied).length} table(s) with rows` +
        (mediaPresent > 0 ? ` and at least ${mediaPresent} media file(s)` : '') +
        `. Restoring replaces all of it. Confirm the overwrite to go ahead; nothing has been changed.`,
    }
  }

  if (request.dryRun) {
    return { ...base, ok: true, warnings: ['Nothing was changed - this was a check only.'] }
  }

  // --- Stage, then swap --------------------------------------------------

  const staging = new Map<string, string>()
  const restoredTables: Record<string, number> = {}
  const warnings: string[] = []

  try {
    for (const [part, file] of [
      ['settings', 'settings.ndjson'],
      ['database', 'database.ndjson'],
    ] as const) {
      if (!parts.has(part)) continue

      const response = await store.get(`${prefixFor(backupId)}/${file}`)
      if (!response.body) throw new Error(`The ${part} part of this backup could not be opened.`)

      const staged = await stageDump(db, response.body, null)
      for (const [table, target] of staged.staging) staging.set(table, target)
      Object.assign(restoredTables, staged.staged)
    }

    if (staging.size > 0) await swapIn(db, staging)
  } catch (error) {
    await dropStaging(db, staging)
    return {
      ...base,
      error:
        `${error instanceof Error ? error.message : String(error)} ` +
        `Nothing on the live site was changed - the restore stops before touching it if any part fails.`,
    }
  }

  await dropStaging(db, staging)

  let mediaObjects = 0
  if (parts.has('media')) {
    // Media goes last and on its own. It is not part of the transaction above
    // and cannot be - object storage has no transactions - so it is ordered
    // after the database so a media failure leaves a consistent database
    // rather than the other way round.
    const result = await restoreMedia(store, bucket, backupId)
    mediaObjects = result.objects
    warnings.push(...result.warnings.slice(0, 20))
  }

  return {
    ...base,
    ok: true,
    restored: { tables: restoredTables, mediaObjects },
    warnings,
  }
}
