// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createProduct, deleteFaq, deleteProduct, findProductByID, updateProduct } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture only, shape matched to what the richText field accepts; see tests/int/cms-db-page-templates.int.spec.ts's identical helper.
const richText = (text: string): any => ({
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
 * Stage 10 (Ecommerce), Layer 1: Products - the most complex of the 5 shop
 * collections. Exercises, together, three things nothing else in this data
 * layer previously combined:
 *
 *  1. `versions: { drafts: true }` (same policy as Events/Pages).
 *  2. TWO top-level (not blocks-nested) hasMany fields (`images`, `faqs`) on
 *     a drafts-enabled collection - this app's first, at both the live AND
 *     versioned level (generic.ts's createVersionsOps didn't support the
 *     versioned side until this stage - see its own doc comment for the
 *     gap this closed).
 *  3. `layout`, a `blocks` field reusing the SAME `pageBuilderBlocks`
 *     library page-templates.ts already proved (hero/faq block types used
 *     below), plus `trash: true` (soft-delete - generate.ts's `hasTrash`/
 *     `deletedAtColumn`, also new this stage).
 */
describe('cms/db - products (Stage 10 Ecommerce, Layer 1)', () => {
  let engine: Engine
  let faqId: number
  let mediaId: number
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    const faq = await engine.create({ collection: 'faqs', data: { question: 'Shipping?', answer: richText('Ships in 2 days.') } })
    faqId = faq.id as number
    const db = await getDb()
    const [media] = await db.run(sql`insert into eg_media (alt) values ('Product parity test media') returning id`).then((r) => r.results as { id: number }[])
    mediaId = media.id
  })

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdIds) {
      await deleteProduct(id)
    }
    // deleteProduct only removes the LIVE row (+ its own live rels/blocks
    // rows). A draft's version row (`_eg_products_v`, `parent_id` set-null
    // rather than cascaded on the live row's delete - confirmed against the
    // real migration) survives it, and so does that version's own
    // `_eg_products_v_rels` row referencing `faqId`/`mediaId` - not a bug,
    // this data layer's create/update never deletes a document's version
    // history, same as real Payload. This local D1 emulation's cascade
    // behavior for the LIVE `eg_products_rels.parent_id -> eg_products(id)`
    // FK isn't fully trusted here either (a lingering row blocked the fixture
    // faq's delete even after its owning product was gone) - clean up every
    // rels row referencing the fixtures directly, by target rather than by
    // parent, so this doesn't depend on cascade behavior at all.
    // Column names are `eg_faqs_id`/`eg_media_id`, not `faqs_id`/`media_id` -
    // generateRelsTable names each target column after the TARGET's own
    // table name (`eg_faqs`/`eg_media`, via resolveTargetTable/tableNameFor),
    // confirmed against this live table's real PRAGMA table_info.
    await db.run(sql`delete from eg_products_rels where eg_faqs_id = ${faqId} or eg_media_id = ${mediaId}`)
    await db.run(sql`delete from _eg_products_v_rels where eg_faqs_id = ${faqId} or eg_media_id = ${mediaId}`)
    await deleteFaq(faqId)
    await db.run(sql`delete from eg_media where id = ${mediaId}`)
  })

  it('reads a draft product written by Payload: top-level hasMany fields + a block', async () => {
    const created = await engine.create({
      collection: 'products',
      data: {
        title: 'Parity Product A',
        category: 'apparel',
        images: [mediaId],
        faqs: [faqId],
        layout: [{ blockType: 'hero', heading: 'Welcome' }],
        _status: 'draft',
      },
      draft: true,
    })
    createdIds.push(created.id as number)

    const viaOurs = await findProductByID(created.id as number, { draft: true })
    expect(viaOurs?.title).toBe('Parity Product A')
    expect(viaOurs?.images).toEqual([mediaId])
    expect(viaOurs?.faqs).toEqual([faqId])
    expect(viaOurs?.layout).toHaveLength(1)
    expect(viaOurs?.layout?.[0].blockType).toBe('hero')
    expect(viaOurs?._status).toBe('draft')
  })

  it('writes a product (top-level hasMany + block) Payload can read back, then publishes it', async () => {
    const ours = await createProduct({
      title: 'Written by clone adapter',
      images: [mediaId],
      faqs: [faqId],
      layout: [{ blockType: 'faq', heading: 'FAQs', source: 'manual', faqs: [faqId] } as never],
    })
    createdIds.push(ours.id)
    expect(ours.images).toEqual([mediaId])
    expect(ours.faqs).toEqual([faqId])

    const viaPayload = await engine.findByID({ collection: 'products', id: ours.id, depth: 0, draft: true })
    expect(viaPayload.images).toEqual([mediaId])
    expect(viaPayload.faqs).toEqual([faqId])
    const payloadBlocks = viaPayload.layout as { blockType: string; faqs?: number[] }[]
    expect(payloadBlocks[0].blockType).toBe('faq')
    expect(payloadBlocks[0].faqs).toEqual([faqId])

    const published = await updateProduct(ours.id, { title: 'Written by clone adapter', _status: 'published' }, { draft: false })
    expect(published?._status).toBe('published')
    const viaPayloadPublished = await engine.findByID({ collection: 'products', id: ours.id })
    expect(viaPayloadPublished._status).toBe('published')
  })

  it('inventory/price fields (unnamed presentational group) round-trip as flat columns', async () => {
    const ours = await createProduct({ title: 'Priced product', inventory: 10, priceInAUDEnabled: true, priceInAUD: 29.99 })
    createdIds.push(ours.id)
    expect(ours.inventory).toBe(10)
    expect(ours.priceInAUDEnabled).toBe(true)
    expect(ours.priceInAUD).toBe(29.99)

    const viaPayload = await engine.findByID({ collection: 'products', id: ours.id })
    expect(viaPayload.inventory).toBe(10)
    expect(viaPayload.priceInAUDEnabled).toBe(true)
    expect(viaPayload.priceInAUD).toBe(29.99)
  })
})
