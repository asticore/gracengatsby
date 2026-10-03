import { sql } from 'drizzle-orm'
import type { Drizzle } from '@/localapi/migrate'

/**
 * Data access for eg_scheduled_publishes table.
 * Tracks when documents should automatically publish/unpublish.
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

export async function setSchedule(engineOrDb: Drizzle, collection: string, docId: number, schedule: ScheduleEntry): Promise<void> {
  const now = new Date().toISOString()

  // Check if publishAt changed to reset publish_done flag
  const existing = (await engineOrDb.all(
    sql`SELECT publish_at, unpublish_at FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { publish_at: string | null; unpublish_at: string | null }[]

  const publishAtChanged = existing.length === 0 || existing[0].publish_at !== schedule.publishAt
  const unpublishAtChanged = existing.length === 0 || existing[0].unpublish_at !== schedule.unpublishAt

  await engineOrDb.run(
    sql`INSERT INTO \`eg_scheduled_publishes\` (collection, doc_id, publish_at, unpublish_at, publish_done, unpublish_done, updated_at)
        VALUES (${collection}, ${docId}, ${schedule.publishAt}, ${schedule.unpublishAt}, 0, 0, ${now})
        ON CONFLICT(collection, doc_id) DO UPDATE SET
          publish_at = excluded.publish_at,
          unpublish_at = excluded.unpublish_at,
          publish_done = CASE WHEN excluded.publish_at != \`eg_scheduled_publishes\`.publish_at THEN 0 ELSE \`eg_scheduled_publishes\`.publish_done END,
          unpublish_done = CASE WHEN excluded.unpublish_at != \`eg_scheduled_publishes\`.unpublish_at THEN 0 ELSE \`eg_scheduled_publishes\`.unpublish_done END,
          updated_at = excluded.updated_at`
  )
}

export async function clearSchedule(engineOrDb: Drizzle, collection: string, docId: number): Promise<void> {
  await engineOrDb.run(sql`DELETE FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`)
}

export interface DueAction {
  collection: string
  docId: number
  action: 'publish' | 'unpublish'
}

export async function listDue(engineOrDb: Drizzle, nowIso: string): Promise<DueAction[]> {
  const rows = (await engineOrDb.all(
    sql`SELECT collection, doc_id, publish_at, unpublish_at, publish_done, unpublish_done
        FROM \`eg_scheduled_publishes\`
        WHERE (publish_at IS NOT NULL AND publish_at <= ${nowIso} AND publish_done = 0)
           OR (unpublish_at IS NOT NULL AND unpublish_at <= ${nowIso} AND unpublish_done = 0)`
  )) as {
    collection: string
    doc_id: number
    publish_at: string | null
    unpublish_at: string | null
    publish_done: number
    unpublish_done: number
  }[]

  const due: DueAction[] = []
  for (const row of rows) {
    if (row.publish_at && row.publish_at <= nowIso && row.publish_done === 0) {
      due.push({ collection: row.collection, docId: row.doc_id, action: 'publish' })
    }
    if (row.unpublish_at && row.unpublish_at <= nowIso && row.unpublish_done === 0) {
      due.push({ collection: row.collection, docId: row.doc_id, action: 'unpublish' })
    }
  }
  return due
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

async function getPublishDone(engineOrDb: Drizzle, collection: string, docId: number): Promise<number> {
  const rows = (await engineOrDb.all(
    sql`SELECT publish_done FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { publish_done: number }[]
  return rows[0]?.publish_done ?? 0
}

async function getUnpublishDone(engineOrDb: Drizzle, collection: string, docId: number): Promise<number> {
  const rows = (await engineOrDb.all(
    sql`SELECT unpublish_done FROM \`eg_scheduled_publishes\` WHERE collection = ${collection} AND doc_id = ${docId}`
  )) as { unpublish_done: number }[]
  return rows[0]?.unpublish_done ?? 0
}
