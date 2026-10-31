// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import type { StreamingUpload } from '@/features/backups/destinations'
import { dumpTables } from '@/features/backups/export/database'
import { dropStaging, stageDump, swapIn } from '@/features/backups/restore'
import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'

/**
 * Backup and restore round trip against a real (local, in-process) D1.
 *
 * The dump is written by the same code the scheduled backup uses (dumpTables) into an in-memory
 * collector instead of R2 or S3, then read back in small chunks, so the NDJSON line handling is
 * exercised across chunk boundaries. Live rows are changed between the dump and the restore to
 * prove the restore puts back exactly what was dumped.
 */

type Db = D1Database
type Row = Record<string, unknown>

/** An upload that keeps the bytes in memory. dumpTables only calls write(). */
function memoryUpload(): { upload: StreamingUpload; bytes: () => Uint8Array } {
  const chunks: Uint8Array[] = []
  const upload = {
    write: async (chunk: Uint8Array): Promise<void> => {
      chunks.push(chunk.slice())
    },
  } as unknown as StreamingUpload
  const bytes = () => {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }
  return { upload, bytes }
}

/** A byte stream that delivers the dump in pieces of `size` bytes, so lines split across reads. */
function chunkedStream(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(offset, offset + size))
      offset += size
    },
  })
}

const allRows = async (db: Db, table: string): Promise<Row[]> =>
  ((await db.prepare(`SELECT * FROM \`${table}\` ORDER BY id`).all()).results ?? []) as Row[]

describe('backup and restore round trip (real D1, in memory)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: Db

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    db = proxy.env.D1
    await runInternalMigrate(db, consoleLogger)
    await db
      .prepare(
        `INSERT INTO eg_posts (id, title, slug, _status) VALUES
           (1, 'One', 'one', 'published'), (2, 'Two', 'two', 'draft'), (3, 'Three "quoted", with comma', 'three', 'published')`,
      )
      .run()
  }, 300_000)

  afterAll(async () => {
    await proxy?.dispose()
  })

  it('restores a dumped table to the same rows after live rows change', async () => {
    const before = await allRows(db, 'eg_posts')
    expect(before).toHaveLength(3)

    const { upload, bytes } = memoryUpload()
    const counts = await dumpTables(db, ['eg_posts'], upload)
    expect(counts).toEqual({ eg_posts: 3 })

    // Live data moves on after the backup: one row edited, one deleted, one added.
    await db.prepare(`UPDATE eg_posts SET title = 'Edited later' WHERE id = 1`).run()
    await db.prepare(`DELETE FROM eg_posts WHERE id = 2`).run()
    await db.prepare(`INSERT INTO eg_posts (id, title, slug, _status) VALUES (9, 'Added later', 'later', 'draft')`).run()

    const stage = await stageDump(db, chunkedStream(bytes(), 7), null)
    expect(stage.staged).toEqual({ eg_posts: 3 })
    await swapIn(db, stage.staging)
    await dropStaging(db, stage.staging)

    expect(await allRows(db, 'eg_posts')).toEqual(before)
    const leftover = await db.prepare(`SELECT name FROM sqlite_master WHERE name = 'eg_rst_eg_posts'`).first()
    expect(leftover).toBeNull()
  })

  it('refuses a dump whose column list no longer matches, and changes nothing live', async () => {
    const { upload, bytes } = memoryUpload()
    await dumpTables(db, ['eg_posts'], upload)
    const tampered = new TextDecoder().decode(bytes()).replace(/"title",/, '"headline",')

    const live = await allRows(db, 'eg_posts')
    await expect(stageDump(db, chunkedStream(new TextEncoder().encode(tampered), 64), null)).rejects.toThrow(/different columns/)
    expect(await allRows(db, 'eg_posts')).toEqual(live)
    await dropStaging(db, new Map([['eg_posts', 'eg_rst_eg_posts']]))
  })

  it('refuses a table that the database does not have', async () => {
    const line = JSON.stringify({ t: 'table', name: 'eg_not_a_table', columns: ['id'] }) + '\n'
    await expect(stageDump(db, chunkedStream(new TextEncoder().encode(line), 16), null)).rejects.toThrow(/does not exist/)
  })

  it('stages only the tables asked for', async () => {
    const { upload, bytes } = memoryUpload()
    await dumpTables(db, ['eg_posts'], upload)
    const stage = await stageDump(db, chunkedStream(bytes(), 100), new Set(['some_other_table']))
    expect(stage.staged).toEqual({})
    expect(stage.staging.size).toBe(0)
  })
})
