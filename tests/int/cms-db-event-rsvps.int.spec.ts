// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: this suite is server-only
// (no DOM needed, and jsdom's separate vm realm breaks wrangler's bundled
// esbuild), and @/engage.config must be the side entering the
// @/engine <-> @/engage.config circular import for Vitest's SSR module
// runner to resolve it.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sql } from 'drizzle-orm'

import { createEventRSVP, deleteEventRSVP, findEventRSVPByID, findEventRSVPs, updateEventRSVP } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * Same shape as the Faqs parity suite, one field-type step up: EventRSVPs has
 * a single-target relationship field (`event`), generated as a plain
 * `event_id` FK column rather than a child table (see
 * src/cms/db/schema/generate.ts). This proves the generic schema generator
 * and CRUD ops handle that column exactly like Payload's own adapter does -
 * not just the scalar-only case Faqs covers.
 */
describe('cms/db - event-rsvps (proof of concept, not wired in)', () => {
  let engine: Engine
  let eventId: number
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    const event = await engine.create({
      collection: 'events',
      data: { title: 'CMS data-layer test event', startDate: new Date().toISOString(), eventType: 'free' },
    })
    eventId = event.id as number
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteEventRSVP(id)
    }
    // Not engine.delete: Payload's own checkDocumentLockStatus query against
    // eg_locked_documents_rels currently 500s on this local D1 (it expects an
    // eg_audit_log_id column the local dev database doesn't have - schema
    // drift pre-dating this suite, unrelated to the code under test). A raw
    // delete sidesteps that unrelated, pre-existing path entirely.
    const db = await getDb()
    // Events has versions/drafts enabled (see cms-db-events.int.spec.ts), so
    // engine.create() above also created a row in _eg_events_v - delete it
    // before the live row, since the live row's delete only sets that row's
    // parent_id to null (its FK is ON DELETE set null, not cascade) rather
    // than removing it.
    await db.run(sql`delete from _eg_events_v where parent_id = ${eventId}`)
    await db.run(sql`delete from eg_events where id = ${eventId}`)
  })

  it('reads an RSVP written by Payload, relationship column included', async () => {
    const created = await engine.create({
      collection: 'event-rsvps',
      data: { event: eventId, name: 'Jane Visitor', email: 'jane@example.com', guestCount: 2 },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findEventRSVPByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.event).toBe(eventId)
    expect(viaOurs?.name).toBe('Jane Visitor')
    expect(viaOurs?.email).toBe('jane@example.com')
    expect(viaOurs?.guestCount).toBe(2)
  })

  it('writes an RSVP Payload can read back', async () => {
    const ours = await createEventRSVP({ event: eventId, name: 'Written by clone adapter', email: 'clone@example.com', guestCount: 3 })
    createdIds.push(ours.id)

    // depth: 0 - otherwise Payload populates the relationship into the full
    // related document, which is an API-layer concern, not what the database
    // adapter itself returns (ours returns the raw FK id, correctly).
    const viaPayload = await engine.findByID({ collection: 'event-rsvps', id: ours.id, depth: 0 })
    expect(viaPayload.event).toBe(eventId)
    expect(viaPayload.name).toBe('Written by clone adapter')
    expect(viaPayload.guestCount).toBe(3)
  })

  it('updates, filters by relationship, and deletes', async () => {
    const ours = await createEventRSVP({ event: eventId, name: 'Temp', email: 'temp@example.com' })
    createdIds.push(ours.id)

    const updated = await updateEventRSVP(ours.id, { name: 'Temp, updated' })
    expect(updated?.name).toBe('Temp, updated')

    const matched = await findEventRSVPs({ where: { event: { equals: eventId } } })
    expect(matched.map((doc) => doc.id)).toContain(ours.id)

    const deleted = await deleteEventRSVP(ours.id)
    expect(deleted).toBe(true)
    createdIds.splice(createdIds.indexOf(ours.id), 1)

    await expect(engine.findByID({ collection: 'event-rsvps', id: ours.id })).rejects.toThrow()
  })
})
