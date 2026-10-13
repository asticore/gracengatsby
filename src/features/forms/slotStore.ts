import { slotKeyFromValue } from './slots'
import { SUBMISSIONS_SLUG } from './slugs'

/**
 * Reading the bookings already made for one appointment field.
 *
 * Answers live in a JSON column, so the engine cannot filter on the slot
 * itself. Two routes, same answer:
 *   - D1 directly, when the binding is there: json_extract on the form's own
 *     rows, filtered by form id first, ordered by id and capped with LIMIT.
 *   - the engine's find, filtered by form and not-spam, capped, then read in
 *     memory. Used when there is no binding (tests, local tooling).
 * Spam is never a booking. Entries have no trash state of their own: a deleted
 * entry is gone, and an archived one still stands as a booking.
 */

export const BOOKING_SCAN_LIMIT = 2000

export type SlotEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
}

export type BookedRow = { id: number; key: string }

/** The D1 binding, or null when this runtime has none. Never throws. */
async function getD1(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return (context?.env as { D1?: D1Database } | undefined)?.D1 ?? null
  } catch {
    return null
  }
}

/** The field name becomes a JSON path parameter, so it is limited to safe names. */
const SAFE_FIELD = /^[A-Za-z0-9_-]{1,64}$/

async function rowsFromD1(
  db: D1Database,
  formId: number,
  fieldName: string,
  match: { key: string } | { date: string },
  limit: number,
): Promise<BookedRow[]> {
  const stored = 'json_extract(`values`, ?)'
  const base = `SELECT id, ${stored} AS slot FROM \`eg_form_submissions\` WHERE form_id = ? AND COALESCE(status, 'new') <> 'spam'`
  const path = `$."${fieldName}"`
  const statement =
    'key' in match
      ? db.prepare(`${base} AND ${stored} = ? ORDER BY id ASC LIMIT ?`).bind(path, formId, path, match.key, limit)
      : db.prepare(`${base} AND substr(${stored}, 1, 10) = ? ORDER BY id ASC LIMIT ?`).bind(path, formId, path, match.date, limit)
  const result = await statement.all()
  const rows: BookedRow[] = []
  for (const row of (result.results || []) as { id?: unknown; slot?: unknown }[]) {
    const key = slotKeyFromValue(row.slot)
    if (key && typeof row.id === 'number') rows.push({ id: row.id, key })
  }
  return rows
}

async function rowsFromEngine(
  engine: SlotEngine,
  formId: number,
  fieldName: string,
  match: { key: string } | { date: string },
  limit: number,
): Promise<BookedRow[]> {
  const found = await engine.find({
    collection: SUBMISSIONS_SLUG,
    where: { and: [{ form: { equals: formId } }, { status: { not_equals: 'spam' } }] },
    limit: BOOKING_SCAN_LIMIT,
    depth: 0,
  })
  const rows: BookedRow[] = []
  for (const doc of found.docs as { id?: unknown; values?: Record<string, unknown> }[]) {
    if (typeof doc.id !== 'number') continue
    const key = slotKeyFromValue(doc.values?.[fieldName])
    if (!key) continue
    const wanted = 'key' in match ? key === match.key : key.startsWith(`${match.date} `)
    if (wanted) rows.push({ id: doc.id, key })
  }
  rows.sort((a, b) => a.id - b.id)
  return rows.slice(0, limit)
}

async function bookedRows(
  engine: SlotEngine,
  formId: number,
  fieldName: string,
  match: { key: string } | { date: string },
  limit: number,
): Promise<BookedRow[]> {
  if (!SAFE_FIELD.test(fieldName)) return []
  const db = await getD1()
  if (db) return rowsFromD1(db, formId, fieldName, match, limit)
  return rowsFromEngine(engine, formId, fieldName, match, limit)
}

/** The first `limit` bookings of one exact slot, oldest first. */
export function bookingsForSlot(engine: SlotEngine, formId: number, fieldName: string, key: string, limit: number): Promise<BookedRow[]> {
  return bookedRows(engine, formId, fieldName, { key }, limit)
}

/** Every booked slot key on one day (YYYY-MM-DD), oldest first, capped. */
export function bookedKeysOnDate(engine: SlotEngine, formId: number, fieldName: string, date: string): Promise<string[]> {
  return bookedRows(engine, formId, fieldName, { date }, BOOKING_SCAN_LIMIT).then((rows) => rows.map((row) => row.key))
}
