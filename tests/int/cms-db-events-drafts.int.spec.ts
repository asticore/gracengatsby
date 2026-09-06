// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite, and
// @/engage.config must be the side entering the @/engine <-> @/engage.config
// circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { createEvent, deleteEvent, findEventByID, findEventVersions, updateEvent } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * The draft/publish policy createDraftOps composes on top of
 * createCollectionOps + createVersionsOps (see ../../src/cms/db/generic.ts's
 * createDraftOps doc comment for the confirmed real-Payload behaviour this
 * proves against). Two directions, matching this project's standing
 * write-both-ways pattern:
 *
 *  - "ours writes, Payload reads" - createEvent/updateEvent (with and
 *    without `draft: true`) produce exactly what Payload's own engine sees
 *    via findByID (default and `draft: true`) and findVersions.
 *  - "Payload writes, ours reads" - engine.create/engine.update (with and
 *    without `draft: true`) produce exactly what findEventByID (default and
 *    `draft: true`) sees.
 *
 * Requires the local eg_locked_documents_rels schema-drift fix (see
 * src/migrations/sql/20260906_000000_fix_locked_documents_rels_missing_columns.sql)
 * - without it, every engine.update()/engine.delete() call against a
 * lockable collection 500s before it even reaches the drafts logic.
 */
describe('cms/db - events draft/publish policy (createDraftOps)', () => {
  let engine: Engine
  const createdIds: number[] = []

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdIds) {
      await db.run(sql`delete from _eg_events_v where parent_id = ${id}`)
      await deleteEvent(id)
    }
  })

  it('ours writes, Payload reads: create defaults to draft on both live and version', async () => {
    engine = await getEngine()
    const ours = await createEvent({ title: 'Ours: created draft', startDate: new Date().toISOString(), eventType: 'free' })
    createdIds.push(ours.id)
    expect(ours._status).toBe('draft')

    const viaPayload = await engine.findByID({ collection: 'events', id: ours.id, depth: 0 })
    expect(viaPayload.title).toBe('Ours: created draft')
    expect((viaPayload as { _status?: string })._status).toBe('draft')

    const versions = await findEventVersions(ours.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].latest).toBe(true)
    expect(versions[0].title).toBe('Ours: created draft')
  })

  it('ours writes, Payload reads: a normal (non-draft) update publishes live AND versions', async () => {
    const ours = await createEvent({ title: 'Ours: pre-publish', startDate: new Date().toISOString(), eventType: 'free' })
    createdIds.push(ours.id)

    const published = await updateEvent(ours.id, { title: 'Ours: published', _status: 'published' })
    expect(published?._status).toBe('published')

    const viaPayload = await engine.findByID({ collection: 'events', id: ours.id, depth: 0 })
    expect(viaPayload.title).toBe('Ours: published')
    expect((viaPayload as { _status?: string })._status).toBe('published')

    const versions = await findEventVersions(ours.id)
    expect(versions).toHaveLength(2)
    expect(versions[0].latest).toBe(true)
    expect(versions[0].title).toBe('Ours: published')
    expect(versions[1].latest).toBe(false)
  })

  it('ours writes, Payload reads: draft:true leaves the live row untouched, versions only', async () => {
    const ours = await createEvent({ title: 'Ours: base', startDate: new Date().toISOString(), eventType: 'free' })
    createdIds.push(ours.id)
    await updateEvent(ours.id, { title: 'Ours: published base', _status: 'published' })

    const draftEdit = await updateEvent(ours.id, { title: 'Ours: draft on top' }, { draft: true })
    expect(draftEdit?.title).toBe('Ours: draft on top')

    // Live row (Payload's own default findByID) must be untouched.
    const viaPayloadDefault = await engine.findByID({ collection: 'events', id: ours.id, depth: 0 })
    expect(viaPayloadDefault.title).toBe('Ours: published base')
    expect((viaPayloadDefault as { _status?: string })._status).toBe('published')

    // Our own default findByID must agree (reads the live row too).
    const oursDefault = await findEventByID(ours.id)
    expect(oursDefault?.title).toBe('Ours: published base')

    // Both draft:true reads must see the new draft content.
    const viaPayloadDraft = await engine.findByID({ collection: 'events', id: ours.id, depth: 0, draft: true })
    expect(viaPayloadDraft.title).toBe('Ours: draft on top')
    const oursDraft = await findEventByID(ours.id, { draft: true })
    expect(oursDraft?.title).toBe('Ours: draft on top')
  })

  it('Payload writes, ours reads: engine.create defaults to draft, ours sees it on both live and draft reads', async () => {
    const created = await engine.create({
      collection: 'events',
      data: { title: 'Payload: created draft', startDate: new Date().toISOString(), eventType: 'free' },
    })
    const id = created.id as number
    createdIds.push(id)
    expect((created as { _status?: string })._status).toBe('draft')

    const oursDefault = await findEventByID(id)
    expect(oursDefault?.title).toBe('Payload: created draft')
    expect(oursDefault?._status).toBe('draft')

    const oursDraft = await findEventByID(id, { draft: true })
    expect(oursDraft?.title).toBe('Payload: created draft')
  })

  it('Payload writes, ours reads: a real Payload draft:true update leaves live untouched, ours agrees', async () => {
    const created = await engine.create({
      collection: 'events',
      data: { title: 'Payload: base', startDate: new Date().toISOString(), eventType: 'free', _status: 'published' },
    })
    const id = created.id as number
    createdIds.push(id)

    await engine.update({ collection: 'events', id, data: { title: 'Payload: draft on top' }, draft: true })

    const oursDefault = await findEventByID(id)
    expect(oursDefault?.title).toBe('Payload: base')
    expect(oursDefault?._status).toBe('published')

    const oursDraft = await findEventByID(id, { draft: true })
    expect(oursDraft?.title).toBe('Payload: draft on top')
  })
})
