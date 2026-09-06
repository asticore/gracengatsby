// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { createEvent, createEventVersion, deleteEvent, findEventByID, findLatestEventVersion, updateEvent } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * Phase 5: `group` fields (flattened onto the table with a name prefix, e.g.
 * `location_venue_name`, but reconstructed as a nested `location` object in
 * the document shape - unlike row/collapsible, which stay flat in the
 * document too) and `versions: { drafts: true }` (the parallel `_eg_events_v`
 * table - one row per saved version, not per document).
 *
 * Events was picked over Pages/Posts/Courses (this app's other versioned
 * collections) because it needs group+versions WITHOUT also needing
 * blocks/array-in-versions (generateVersionsTable doesn't build those yet
 * at the time) or a working `join` field to be usable.
 *
 * Phase 8 (the last test below) resolves that join field for real - see
 * ../../src/cms/db/generic.ts's createJoinOps doc comment for the confirmed
 * `{ docs: [...ids], hasNextPage }` shape and paging default.
 *
 * Note: Payload's own `engine.update()` on this local dev D1 hits a
 * pre-existing, unrelated schema-drift bug in its own
 * checkDocumentLockStatus path (`no such column: ...eg_audit_log_id`) on
 * every update to a lockable collection, not just delete (see
 * cms-db-event-rsvps.int.spec.ts for the same bug on delete) - so the
 * "update" and "cleanup" paths below go through this module's own
 * updateEvent/raw SQL instead, same workaround as that suite.
 */
describe('cms/db - events (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdIds) {
      await db.run(sql`delete from _eg_events_v where parent_id = ${id}`)
      await deleteEvent(id)
    }
  })

  it('reads an event written by Payload: nested group field, empty join field', async () => {
    engine = await getEngine()
    const created = await engine.create({
      collection: 'events',
      data: {
        title: 'Parity event A',
        startDate: new Date().toISOString(),
        eventType: 'free',
        location: { venueName: 'Hall A', address: '1 Main St', isOnline: false },
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findEventByID(created.id as number)
    expect(viaOurs?.title).toBe('Parity event A')
    expect(viaOurs?.location).toEqual({ venueName: 'Hall A', address: '1 Main St', isOnline: false })
    expect(viaOurs?._status).toBe((created as { _status?: string })._status)
    expect(viaOurs?.rsvps).toEqual({ docs: [], hasNextPage: false })
  })

  it('writes an event (group field) Payload can read back', async () => {
    const ours = await createEvent({
      title: 'Written by clone adapter',
      startDate: new Date().toISOString(),
      eventType: 'free',
      location: { venueName: 'Hall B', isOnline: true },
    })
    createdIds.push(ours.id)
    expect(ours.location).toEqual({ venueName: 'Hall B', address: null, isOnline: true })

    const viaPayload = await engine.findByID({ collection: 'events', id: ours.id, depth: 0 })
    expect(viaPayload.location).toEqual({ venueName: 'Hall B', address: null, isOnline: true })
  })

  it('replaces group fields wholesale on update', async () => {
    const created = await createEvent({ title: 'Temp', startDate: new Date().toISOString(), eventType: 'free', location: { venueName: 'Original' } })
    createdIds.push(created.id)

    const updated = await updateEvent(created.id, { location: { venueName: 'Replaced', isOnline: true } })
    expect(updated?.location).toEqual({ venueName: 'Replaced', address: null, isOnline: true })

    const viaPayload = await engine.findByID({ collection: 'events', id: created.id, depth: 0 })
    expect(viaPayload.location).toEqual({ venueName: 'Replaced', address: null, isOnline: true })
  })

  it('reads the version row Payload created on write, group field included', async () => {
    const created = await engine.create({
      collection: 'events',
      data: {
        title: 'Versioned event',
        startDate: new Date().toISOString(),
        eventType: 'free',
        location: { venueName: 'Version Hall', isOnline: false },
      },
    })
    createdIds.push(created.id as number)

    const ourVersion = await findLatestEventVersion(created.id as number)
    expect(ourVersion?.title).toBe('Versioned event')
    expect(ourVersion?.location).toEqual({ venueName: 'Version Hall', address: null, isOnline: false })
    expect(ourVersion?.latest).toBe(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({ collection: 'events', where: { parent: { equals: created.id } } })
    expect(payloadVersions.docs[0].version.title).toBe('Versioned event')
    expect(payloadVersions.docs[0].version.location).toEqual({ venueName: 'Version Hall', address: null, isOnline: false })
  })

  it('writes a version row Payload can read back', async () => {
    const created = await createEvent({ title: 'Has a version added', startDate: new Date().toISOString(), eventType: 'free' })
    createdIds.push(created.id)

    await createEventVersion(created.id, { title: 'Written by clone adapter', location: { venueName: 'Clone Hall', isOnline: true } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({ collection: 'events', where: { parent: { equals: created.id } }, sort: '-createdAt' })
    expect(payloadVersions.docs[0].version.title).toBe('Written by clone adapter')
    expect(payloadVersions.docs[0].version.location).toEqual({ venueName: 'Clone Hall', address: null, isOnline: true })
  })

  it('resolves the rsvps join field query-time against real EventRSVPs, matching Payload for both direction and pagination', async () => {
    const created = await createEvent({ title: `Join phase event ${Date.now()}`, startDate: new Date().toISOString(), eventType: 'free' })
    createdIds.push(created.id)

    // One more than the confirmed default page size (10) to prove hasNextPage.
    const rsvpIds: number[] = []
    for (let i = 0; i < 11; i++) {
      const rsvp = await engine.create({
        collection: 'event-rsvps',
        data: { event: created.id, name: `RSVP ${i}`, email: `join-phase-${Date.now()}-${i}@example.com`, guestCount: 1 },
      })
      rsvpIds.push(rsvp.id as number)
    }

    const viaOurs = await findEventByID(created.id)
    expect(viaOurs?.rsvps?.hasNextPage).toBe(true)
    expect(viaOurs?.rsvps?.docs).toHaveLength(10)
    // Newest-first (descending id) - matches Payload's own default join ordering, confirmed by inspection.
    expect(viaOurs?.rsvps?.docs).toEqual([...rsvpIds].reverse().slice(0, 10))

    const viaPayload = await engine.findByID({ collection: 'events', id: created.id, depth: 0 })
    expect(viaPayload.rsvps).toEqual({ docs: viaOurs?.rsvps?.docs, hasNextPage: true })

    const db = await getDb()
    for (const id of rsvpIds) {
      await db.run(sql`delete from eg_event_rsvps where id = ${id}`)
    }
  })
})
