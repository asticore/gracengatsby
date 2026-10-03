import { sql } from 'drizzle-orm'
import type { Drizzle } from '@/localapi/migrate'

/**
 * Data access for eg_scheduled_publishes table.
 * Manages publish/unpublish schedules and tracks completion status.
 * Workers-safe: uses raw SQL with the same db handle as other custom-table code.
 */

export interface ScheduleEntry {
  publishAt: string | null
  unpublishAt: string | null
}

export async function getSchedule(engineOrDb: Drizzle, collection: string, docId: number): Promise<ScheduleEntry | null> {
  const rows = (await engineOrDb.all(
    sql`SELECT publish_at, unpublish_at FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { publish_at: string | null; unpublish_at: string | null }[]
  if (!rows[0]) return null
  return {
    publishAt: rows[0].publish_at,
    unpublishAt: rows[0].unpublish_at,
  }
}

/**
 * Set or update a schedule. When either date changes from its previous value,
 * the matching done flag is reset to 0.
 */
export async function setSchedule(
  engineOrDb: Drizzle,
  collection: string,
  docId: number,
  schedule: ScheduleEntry,
): Promise<void> {
  const now = new Date().toISOString()
  const current = await getSchedule(engineOrDb, collection, docId)

  // Determine if done flags should reset
  const resetPublishDone = current?.publishAt !== schedule.publishAt ? 1 : 0
  const resetUnpublishDone = current?.unpublishAt !== schedule.unpublishAt ? 1 : 0

  const publishDoneValue = resetPublishDone ? 0 : (current ? '`publish_done`' : '0')
  const unpublishDoneValue = resetUnpublishDone ? 0 : (current ? '`unpublish_done`' : '0')

  if (!current) {
    // Insert new entry
    await engineOrDb.run(
      sql`INSERT INTO \`eg_scheduled_publishes\` (collection, doc_id, publish_at, unpublish_at, publish_done, unpublish_done, updated_at)
          VALUES (${collection}, ${docId}, ${schedule.publishAt}, ${schedule.unpublishAt}, 0, 0, ${now})`
    )
  } else {
    // Update existing entry with conditional reset of done flags
    const newPublishDone = resetPublishDone ? 0 : (await getPublishDone(engineOrDb, collection, docId))
    const newUnpublishDone = resetUnpublishDone ? 0 : (await getUnpublishDone(engineOrDb, collection, docId))

    await engineOrDb.run(
      sql`UPDATE \`eg_scheduled_publishes\`
          SET publish_at = ${schedule.publishAt},
              unpublish_at = ${schedule.unpublishAt},
              publish_done = ${newPublishDone},
              unpublish_done = ${newUnpublishDone},
              updated_at = ${now}
          WHERE collection = ${collection} AND doc_id = ${docId}`
    )
  }
}

export async function clearSchedule(engineOrDb: Drizzle, collection: string, docId: number): Promise<void> {
  await engineOrDb.run(sql`DELETE FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`)
}

/**
 * List all due publishes/unpublishes across all collections.
 * nowIso should be an ISO timestamp string.
 */
export interface DueAction {
  collection: string
  docId: number
  action: 'publish' | 'unpublish'
}

export async function listDue(engineOrDb: Drizzle, nowIso: string): Promise<DueAction[]> {
  const rows = (await engineOrDb.all(
    sql`SELECT collection, doc_id, 'publish' as action FROM \`eg_scheduled_publishes\` WHERE publish_at <= ${nowIso} AND publish_done = 0
        UNION ALL
        SELECT collection, doc_id, 'unpublish' as action FROM \`eg_scheduled_publishes\` WHERE unpublish_at <= ${nowIso} AND unpublish_done = 0`
  )) as { collection: string; doc_id: number; action: 'publish' | 'unpublish' }[]
  return rows.map((row) => ({ collection: row.collection, docId: row.doc_id, action: row.action }))
}

export async function markDone(engineOrDb: Drizzle, collection: string, docId: number, action: 'publish' | 'unpublish'): Promise<void> {
  if (action === 'publish') {
    await engineOrDb.run(
      sql`UPDATE \`eg_scheduled_publishes\` SET publish_done = 1 WHERE collection = ${collection} AND doc_id = ${docId}`
    )
  } else {
    await engineOrDb.run(
      sql`UPDATE \`eg_scheduled_publishes\` SET unpublish_done = 1 WHERE collection = ${collection} AND doc_id = ${docId}`
    )
  }
}

// Helper to get current publish_done state
async function getPublishDone(engineOrDb: Drizzle, collection: string, docId: number): Promise<number> {
  const rows = (await engineOrDb.all(
    sql`SELECT publish_done FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { publish_done: number }[]
  return rows[0]?.publish_done ?? 0
}

// Helper to get current unpublish_done state
async function getUnpublishDone(engineOrDb: Drizzle, collection: string, docId: number): Promise<number> {
  const rows = (await engineOrDb.all(
    sql`SELECT unpublish_done FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { unpublish_done: number }[]
  return rows[0]?.unpublish_done ?? 0
}
