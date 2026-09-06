// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPageTemplate, deleteFaq, deletePageTemplate, findPageTemplateByID, updatePageTemplate } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

const richText = (text: string) => ({
  root: {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', text, version: 1 }], version: 1 }],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

/**
 * Phase 4: `blocks` fields (one child table per block type) and
 * hasMany/polymorphic relationship/upload fields (the parent's shared
 * `_rels` table) - proven together because in this app's real config the
 * second only ever appears inside the first (src/blocks/Faq.ts's `faqs`,
 * src/blocks/Gallery.ts's `images`).
 *
 * PageTemplates uses the full page-builder block library, so a document with
 * hero/faq/gallery blocks exercises: a single-target upload field inside a
 * block (Hero's `backgroundImage`, same `<name>_id` column treatment as a
 * single relationship), a hasMany relationship inside a block (Faq's
 * `faqs`), a hasMany upload inside a block (Gallery's `images`), and -
 * critically - that mixed block types interleave back into one array in the
 * right order (Payload's `_order` is sequential across every type sharing
 * the field, not per-type - confirmed by direct D1 inspection before writing
 * this).
 */
describe('cms/db - page-templates (proof of concept, not wired in)', () => {
  let engine: Engine
  let faq1Id: number
  let faq2Id: number
  let media1Id: number
  let media2Id: number
  const createdTemplateIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()

    const faq1 = await engine.create({ collection: 'faqs', data: { question: 'Q1', answer: richText('A1') } })
    const faq2 = await engine.create({ collection: 'faqs', data: { question: 'Q2', answer: richText('A2') } })
    faq1Id = faq1.id as number
    faq2Id = faq2.id as number

    // Real media docs need an actual uploaded file to go through Payload's
    // own create() - not needed to prove this data layer's own read/write
    // code, so these are inserted directly (`alt` is the only NOT NULL
    // column - see the real eg_media schema).
    const db = await getDb()
    const [media1] = await db.run(sql`insert into eg_media (alt) values ('Test media 1') returning id`).then((r) => r.results as { id: number }[])
    const [media2] = await db.run(sql`insert into eg_media (alt) values ('Test media 2') returning id`).then((r) => r.results as { id: number }[])
    media1Id = media1.id
    media2Id = media2.id
  })

  afterAll(async () => {
    for (const id of createdTemplateIds) {
      await deletePageTemplate(id)
    }
    await deleteFaq(faq1Id)
    await deleteFaq(faq2Id)
    const db = await getDb()
    await db.run(sql`delete from eg_media where id in (${media1Id}, ${media2Id})`)
  })

  it('reads a template written by Payload: upload FK, hasMany relationship, mixed block order', async () => {
    const created = await engine.create({
      collection: 'page-templates',
      data: {
        name: 'Parity template A',
        blocks: [
          { blockType: 'hero', heading: 'Welcome', backgroundImage: media1Id },
          { blockType: 'faq', heading: 'FAQs', source: 'manual', faqs: [faq1Id, faq2Id] },
        ],
      },
    })
    createdTemplateIds.push(created.id as number)

    const viaOurs = await findPageTemplateByID(created.id as number)
    expect(viaOurs?.blocks).toHaveLength(2)

    const [hero, faq] = viaOurs!.blocks!
    expect(hero.blockType).toBe('hero')
    expect(hero.heading).toBe('Welcome')
    expect(hero.backgroundImage).toBe(media1Id)

    expect(faq.blockType).toBe('faq')
    expect(faq.heading).toBe('FAQs')
    expect(faq.faqs).toEqual([faq1Id, faq2Id])
  })

  it('writes a template (hasMany upload inside a block) Payload can read back, in order', async () => {
    const ours = await createPageTemplate({
      name: 'Written by clone adapter',
      blocks: [
        { blockType: 'gallery', heading: 'Gallery', images: [media1Id, media2Id] } as never,
        { blockType: 'faq', heading: 'More FAQs', source: 'manual', faqs: [faq2Id] } as never,
      ],
    })
    createdTemplateIds.push(ours.id)
    expect(ours.blocks?.map((b) => b.blockType)).toEqual(['gallery', 'faq'])
    expect(ours.blocks?.[0].images).toEqual([media1Id, media2Id])
    expect(ours.blocks?.[1].faqs).toEqual([faq2Id])

    const viaPayload = await engine.findByID({ collection: 'page-templates', id: ours.id, depth: 0 })
    const payloadBlocks = viaPayload.blocks as { blockType: string; images?: number[]; faqs?: number[] }[]
    expect(payloadBlocks.map((b) => b.blockType)).toEqual(['gallery', 'faq'])
    expect(payloadBlocks[0].images).toEqual([media1Id, media2Id])
    expect(payloadBlocks[1].faqs).toEqual([faq2Id])
  })

  it('replaces blocks (and their rels rows) wholesale on update', async () => {
    const created = await createPageTemplate({
      name: 'Temp',
      blocks: [{ blockType: 'faq', heading: 'Original', source: 'manual', faqs: [faq1Id] } as never],
    })
    createdTemplateIds.push(created.id)

    const updated = await updatePageTemplate(created.id, {
      blocks: [
        { blockType: 'hero', heading: 'Replaced hero' } as never,
        { blockType: 'faq', heading: 'Replaced faq', source: 'manual', faqs: [faq2Id] } as never,
      ],
    })
    expect(updated?.blocks?.map((b) => b.blockType)).toEqual(['hero', 'faq'])
    expect(updated?.blocks?.[1].faqs).toEqual([faq2Id])

    const viaPayload = await engine.findByID({ collection: 'page-templates', id: created.id, depth: 0 })
    const payloadBlocks = viaPayload.blocks as { blockType: string; faqs?: number[] }[]
    expect(payloadBlocks.map((b) => b.blockType)).toEqual(['hero', 'faq'])
    expect(payloadBlocks[1].faqs).toEqual([faq2Id])
  })

  it('cascades block rows and rels rows on delete', async () => {
    const created = await createPageTemplate({
      name: 'To delete',
      blocks: [{ blockType: 'faq', heading: 'Gone soon', source: 'manual', faqs: [faq1Id] } as never],
    })

    const deleted = await deletePageTemplate(created.id)
    expect(deleted).toBe(true)

    const afterDelete = await findPageTemplateByID(created.id)
    expect(afterDelete).toBeNull()

    const db = await getDb()
    const blockRows = await db.run(sql`select count(*) as n from eg_page_templates_blocks_faq where _parent_id = ${created.id}`)
    const relsRows = await db.run(sql`select count(*) as n from eg_page_templates_rels where parent_id = ${created.id}`)
    expect((blockRows.results as { n: number }[])[0].n).toBe(0)
    expect((relsRows.results as { n: number }[])[0].n).toBe(0)
  })
})
