// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { createPage, createPageVersion, deletePage, findLatestPageVersion, findPageByID, updatePage } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * Phase 6: versioned `blocks` fields and their nested hasMany/polymorphic
 * subfields - the gap Events (Phase 5's proof target) deliberately left open,
 * since Events has no `blocks` field. Pages was picked because its `blocks`
 * field uses the exact page-builder library already proven live (not
 * versioned) against PageTemplates in Phase 4 - Faq's `faqs` and Gallery's
 * `images` are its only hasMany/polymorphic fields.
 *
 * Confirmed by creating real documents through Payload's own engine.create()
 * and inspecting the resulting D1 tables directly (not guessed):
 *
 *  - A versioned block table (`_eg_pages_v_blocks_hero`) has an integer
 *    autoincrement `id` plus an extra `_uuid` text column, unlike the live
 *    table's string `id` - see ../../src/cms/db/schema/generate.ts's
 *    generateBlockTables `versioned` param doc comment.
 *  - Both a versioned block row's own `_path` column and a nested hasMany
 *    subfield's `path` in `_eg_pages_v_rels` get a "version." (dot) prefix
 *    that the live table's equivalents never get (`_path` = "blocks" live,
 *    "version.blocks" versioned; `path` = "blocks.0.faqs" live,
 *    "version.blocks.0.faqs" versioned) - a different prefix scheme than the
 *    "version_" (underscore) prefix generateVersionsTable's own COLUMN names
 *    get. See ../../src/cms/db/generic.ts's createBlocksRelsOps `pathPrefix`
 *    doc comment.
 *  - Both a versioned block table's and a versioned `_rels` table's
 *    `_parent_id`/`parent_id` FK point at the VERSION ROW's own id
 *    (`_eg_pages_v`), not the live document's id - confirmed via the real
 *    FOREIGN KEY clause in each table's CREATE TABLE statement, not assumed
 *    from the live-table pattern.
 *
 * Same pre-existing Payload bug as cms-db-events.int.spec.ts: engine.update()
 * on this local dev D1 hits checkDocumentLockStatus's unrelated schema-drift
 * bug (`no such column: ...eg_audit_log_id`) on every update to a lockable
 * collection - so "update" and "cleanup" below use this module's own
 * updatePage/raw SQL instead.
 */
describe('cms/db - pages (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdIds) {
      await db.run(sql`delete from _eg_pages_v where parent_id = ${id}`)
      await deletePage(id)
    }
  })

  it('reads a page written by Payload: blocks with a nested hasMany subfield, group fields', async () => {
    engine = await getEngine()
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Do sections support relationships?', answer: { root: { children: [{ type: 'paragraph', children: [{ text: 'Yes.' }] }] } } },
    })

    const created = await engine.create({
      collection: 'pages',
      data: {
        title: 'Parity page A',
        blocks: [
          { blockType: 'hero', heading: 'Hero heading' },
          { blockType: 'faq', faqs: [faq.id] },
        ],
        seo: { metaTitle: 'Parity page A - SEO title' },
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findPageByID(created.id as number)
    expect(viaOurs?.title).toBe('Parity page A')
    expect(viaOurs?.blocks?.length).toBe(2)
    expect(viaOurs?.blocks?.[0].blockType).toBe('hero')
    expect((viaOurs?.blocks?.[0] as { heading?: string }).heading).toBe('Hero heading')
    const faqBlock = viaOurs?.blocks?.find((b) => b.blockType === 'faq') as { faqs?: number[] } | undefined
    expect(faqBlock?.faqs).toEqual([faq.id])
    expect(viaOurs?.seo?.metaTitle).toBe('Parity page A - SEO title')
    expect(viaOurs?._status).toBe((created as { _status?: string })._status)
  })

  it('writes a page (blocks + nested hasMany) Payload can read back', async () => {
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Can the clone adapter write blocks?', answer: { root: { children: [{ type: 'paragraph', children: [{ text: 'Yes.' }] }] } } },
    })

    const ours = await createPage({
      title: 'Written by clone adapter',
      blocks: [
        { blockType: 'hero', heading: 'Clone hero' } as never,
        { blockType: 'faq', faqs: [faq.id] } as never,
      ],
    })
    createdIds.push(ours.id)
    expect(ours.blocks?.length).toBe(2)

    const viaPayload = await engine.findByID({ collection: 'pages', id: ours.id, depth: 0 })
    expect(viaPayload.blocks?.length).toBe(2)
    const payloadFaqBlock = (viaPayload.blocks as { blockType: string; faqs?: number[] }[]).find((b) => b.blockType === 'faq')
    expect(payloadFaqBlock?.faqs).toEqual([faq.id])
  })

  it('replaces blocks wholesale on update', async () => {
    const created = await createPage({ title: 'Temp', blocks: [{ blockType: 'hero', heading: 'Original' } as never] })
    createdIds.push(created.id)

    const updated = await updatePage(created.id, { blocks: [{ blockType: 'hero', heading: 'Replaced' } as never] })
    expect(updated?.blocks?.length).toBe(1)
    expect((updated?.blocks?.[0] as { heading?: string }).heading).toBe('Replaced')

    const viaPayload = await engine.findByID({ collection: 'pages', id: created.id, depth: 0 })
    expect((viaPayload.blocks as { heading?: string }[])[0].heading).toBe('Replaced')
  })

  it('reads the version row Payload created on write, blocks + nested hasMany included', async () => {
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Do versions carry blocks too?', answer: { root: { children: [{ type: 'paragraph', children: [{ text: 'Yes.' }] }] } } },
    })

    const created = await engine.create({
      collection: 'pages',
      data: {
        title: 'Versioned page',
        blocks: [
          { blockType: 'hero', heading: 'Version Hall hero' },
          { blockType: 'faq', faqs: [faq.id] },
        ],
      },
    })
    createdIds.push(created.id as number)

    const ourVersion = await findLatestPageVersion(created.id as number)
    expect(ourVersion?.title).toBe('Versioned page')
    expect(ourVersion?.latest).toBe(true)
    expect(ourVersion?.blocks?.length).toBe(2)
    const ourVersionFaqBlock = ourVersion?.blocks?.find((b) => b.blockType === 'faq') as { faqs?: number[] } | undefined
    expect(ourVersionFaqBlock?.faqs).toEqual([faq.id])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({ collection: 'pages', where: { parent: { equals: created.id } }, depth: 0 })
    expect(payloadVersions.docs[0].version.title).toBe('Versioned page')
    expect(payloadVersions.docs[0].version.blocks?.length).toBe(2)
  })

  it('writes a version (blocks + nested hasMany) Payload can read back', async () => {
    const faq = await engine.create({
      collection: 'faqs',
      data: { question: 'Can the clone adapter write versioned blocks?', answer: { root: { children: [{ type: 'paragraph', children: [{ text: 'Yes.' }] }] } } },
    })
    const created = await createPage({ title: 'Has a version added' })
    createdIds.push(created.id)

    await createPageVersion(created.id, {
      title: 'Written by clone adapter',
      blocks: [
        { blockType: 'hero', heading: 'Clone version hero' } as never,
        { blockType: 'faq', faqs: [faq.id] } as never,
      ],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({
      collection: 'pages',
      where: { parent: { equals: created.id } },
      sort: '-createdAt',
      depth: 0,
    })
    const latest = payloadVersions.docs[0].version
    expect(latest.title).toBe('Written by clone adapter')
    expect(latest.blocks?.length).toBe(2)
    const payloadFaqBlock = (latest.blocks as { blockType: string; faqs?: number[] }[]).find((b) => b.blockType === 'faq')
    expect(payloadFaqBlock?.faqs).toEqual([faq.id])
  })
})
