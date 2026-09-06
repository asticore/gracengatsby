// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite, and
// @/engage.config must be the side entering the @/engine <-> @/engage.config
// circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { createPage, deletePage, findPageByID, findPageVersions, updatePage } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * The same createDraftOps policy proven against Events in
 * cms-db-events-drafts.int.spec.ts, wired onto Pages instead - see
 * ../../src/cms/db/collections/pages.ts and ../../src/cms/db/generic.ts's
 * createDraftOps doc comment. Pages has no join field (unlike Events'
 * `rsvps`), so this is a narrower proof: it confirms the SAME policy holds
 * on a second drafts-enabled collection, not a new behaviour.
 *
 * Requires the local eg_locked_documents_rels schema-drift fix (see
 * src/migrations/sql/20260906_000000_fix_locked_documents_rels_missing_columns.sql)
 * - without it, every engine.update()/engine.delete() call against a
 * lockable collection 500s before it even reaches the drafts logic.
 */
describe('cms/db - pages draft/publish policy (createDraftOps)', () => {
  let engine: Engine
  const createdIds: number[] = []

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdIds) {
      await db.run(sql`delete from _eg_pages_v where parent_id = ${id}`)
      await deletePage(id)
    }
  })

  it('ours writes, Payload reads: create defaults to draft on both live and version', async () => {
    engine = await getEngine()
    const ours = await createPage({ title: 'Ours: created draft' })
    createdIds.push(ours.id)
    expect(ours._status).toBe('draft')

    const viaPayload = await engine.findByID({ collection: 'pages', id: ours.id, depth: 0 })
    expect(viaPayload.title).toBe('Ours: created draft')
    expect((viaPayload as { _status?: string })._status).toBe('draft')

    const versions = await findPageVersions(ours.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].latest).toBe(true)
    expect(versions[0].title).toBe('Ours: created draft')
  })

  it('ours writes, Payload reads: a normal (non-draft) update publishes live AND versions', async () => {
    const ours = await createPage({ title: 'Ours: pre-publish' })
    createdIds.push(ours.id)

    const published = await updatePage(ours.id, { title: 'Ours: published', _status: 'published' })
    expect(published?._status).toBe('published')

    const viaPayload = await engine.findByID({ collection: 'pages', id: ours.id, depth: 0 })
    expect(viaPayload.title).toBe('Ours: published')
    expect((viaPayload as { _status?: string })._status).toBe('published')

    const versions = await findPageVersions(ours.id)
    expect(versions).toHaveLength(2)
    expect(versions[0].latest).toBe(true)
    expect(versions[0].title).toBe('Ours: published')
    expect(versions[1].latest).toBe(false)
  })

  it('ours writes, Payload reads: draft:true leaves the live row untouched, versions only', async () => {
    const ours = await createPage({ title: 'Ours: base' })
    createdIds.push(ours.id)
    await updatePage(ours.id, { title: 'Ours: published base', _status: 'published' })

    const draftEdit = await updatePage(ours.id, { title: 'Ours: draft on top' }, { draft: true })
    expect(draftEdit?.title).toBe('Ours: draft on top')

    const viaPayloadDefault = await engine.findByID({ collection: 'pages', id: ours.id, depth: 0 })
    expect(viaPayloadDefault.title).toBe('Ours: published base')
    expect((viaPayloadDefault as { _status?: string })._status).toBe('published')

    const oursDefault = await findPageByID(ours.id)
    expect(oursDefault?.title).toBe('Ours: published base')

    const viaPayloadDraft = await engine.findByID({ collection: 'pages', id: ours.id, depth: 0, draft: true })
    expect(viaPayloadDraft.title).toBe('Ours: draft on top')
    const oursDraft = await findPageByID(ours.id, { draft: true })
    expect(oursDraft?.title).toBe('Ours: draft on top')
  })

  it('Payload writes, ours reads: engine.create defaults to draft, ours sees it on both live and draft reads', async () => {
    const created = await engine.create({ collection: 'pages', data: { title: 'Payload: created draft' } })
    const id = created.id as number
    createdIds.push(id)
    expect((created as { _status?: string })._status).toBe('draft')

    const oursDefault = await findPageByID(id)
    expect(oursDefault?.title).toBe('Payload: created draft')
    expect(oursDefault?._status).toBe('draft')

    const oursDraft = await findPageByID(id, { draft: true })
    expect(oursDraft?.title).toBe('Payload: created draft')
  })

  it('Payload writes, ours reads: a real Payload draft:true update leaves live untouched, ours agrees', async () => {
    const created = await engine.create({ collection: 'pages', data: { title: 'Payload: base', _status: 'published' } })
    const id = created.id as number
    createdIds.push(id)

    await engine.update({ collection: 'pages', id, data: { title: 'Payload: draft on top' }, draft: true })

    const oursDefault = await findPageByID(id)
    expect(oursDefault?.title).toBe('Payload: base')
    expect(oursDefault?._status).toBe('published')

    const oursDraft = await findPageByID(id, { draft: true })
    expect(oursDraft?.title).toBe('Payload: draft on top')
  })
})
