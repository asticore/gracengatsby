import type { StreamingUpload } from '../destinations'

import { columnsOf } from './tables'

/**
 * Writes a set of tables out as NDJSON, one line at a time, into a streaming
 * upload.
 *
 * NDJSON rather than SQL `INSERT` statements on purpose. SQL has to be
 * re-parsed and correctly escaped on the way back in - blobs, embedded quotes
 * and NULLs are all chances to corrupt a restore - whereas each line here is a
 * JSON array of values that goes straight into a parameterised insert. It also
 * means a restore can be resumed mid-file, and a damaged line loses one row
 * instead of the remainder of the dump.
 *
 * Nothing is ever concatenated into a whole-dump string. Each row is encoded,
 * handed to the upload, and dropped; the upload holds at most one 8 MiB part.
 * That is what keeps a database far larger than the Worker's 128 MB cap
 * exportable at all.
 *
 * Rows are paged by `rowid` rather than by `LIMIT ... OFFSET`, because OFFSET
 * makes SQLite walk and discard every row before the window, turning a large
 * table into quadratic work. Keyset paging reads each row once.
 */

/** Rows per query. Small enough to stay well inside D1's response size limit. */
const PAGE = 500

const encoder = new TextEncoder()

export type DumpProgress = { table: string; rows: number }

/**
 * A value as it goes into the file.
 *
 * D1 hands back numbers, strings, null and - for BLOB columns - an array of
 * byte values. Byte arrays are tagged rather than written bare so a restore can
 * tell a blob from a genuine JSON array of numbers, which is otherwise the same
 * text.
 */
const toBase64 = (bytes: Uint8Array): string => {
  // Chunked rather than one spread: `String.fromCharCode(...bytes)` passes every
  // byte as a separate argument and overflows the call stack somewhere around a
  // hundred thousand of them, which is a size a stored file easily reaches.
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  }
  return btoa(binary)
}

const encodeValue = (value: unknown): unknown => {
  if (value instanceof ArrayBuffer) return { $b64: toBase64(new Uint8Array(value)) }
  if (ArrayBuffer.isView(value)) {
    const view = value as Uint8Array
    return { $b64: toBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) }
  }
  if (Array.isArray(value)) return { $b64: toBase64(Uint8Array.from(value as number[])) }
  return value
}

/** Reverses `encodeValue` on the restore side. */
export const decodeValue = (value: unknown): unknown => {
  if (value && typeof value === 'object' && '$b64' in (value as Record<string, unknown>)) {
    const text = atob(String((value as { $b64: string }).$b64))
    const bytes = new Uint8Array(text.length)
    for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index)
    // An ArrayBuffer, not the view: that is what D1 accepts as a bound BLOB.
    return bytes.buffer
  }
  return value
}

/**
 * Dumps every named table into `upload`, returning the row count per table.
 *
 * The per-table header line carries the column list, so a restore never has to
 * assume the column order matches the database it is going back into.
 */
export async function dumpTables(
  db: D1Database,
  tables: string[],
  upload: StreamingUpload,
  onProgress?: (progress: DumpProgress) => void,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}

  const line = (value: unknown) => upload.write(encoder.encode(`${JSON.stringify(value)}\n`))

  await line({ t: 'dump', version: 1, at: new Date().toISOString(), tables })

  for (const table of tables) {
    const columns = await columnsOf(db, table)
    if (columns.length === 0) continue

    await line({ t: 'table', name: table, columns })

    const select = columns.map((name) => `\`${name}\``).join(', ')
    let after = -1
    let rows = 0

    // `rowid` is not one of the selected columns - it is asked for separately
    // so the cursor never depends on the table having an `id`, which the
    // engine's join tables do not always have.
    for (;;) {
      const page = await db
        .prepare(
          `SELECT rowid AS __rid, ${select} FROM \`${table}\` WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`,
        )
        .bind(after)
        .all()

      const results = (page.results ?? []) as Record<string, unknown>[]
      if (results.length === 0) break

      for (const row of results) {
        after = Number(row.__rid)
        await line({ t: 'r', v: columns.map((name) => encodeValue(row[name])) })
        rows++
      }

      if (results.length < PAGE) break
    }

    await line({ t: 'end', name: table, rows })
    counts[table] = rows
    onProgress?.({ table, rows })
  }

  await line({ t: 'done', tables: Object.keys(counts).length })
  return counts
}
