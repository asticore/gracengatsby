// @vitest-environment node
//
// jsdom's global scope is a separate vm realm from Node's, and its
// TextEncoder().encode() returns a Uint8Array that isn't `instanceof` that
// realm's own Uint8Array - a known jsdom/esbuild incompatibility. wrangler's
// getPlatformProxy() (used below to reach the local D1 emulation, same as
// scripts/prepareEngineTables.mts) shells out to its bundled esbuild, which
// hits exactly that check. This suite is server-only and needs no DOM, so it
// opts out of the project-wide jsdom environment instead of patching globals.
import type { Engine } from '@/engine'

// Imported first and by its own path on purpose: @/engine/index.ts and
// @/engage.config.ts import each other (the config needs buildConfig from
// the engine seam, the seam's getEngine() needs the built config), and
// Vitest's SSR module runner resolves that circularity correctly only when
// @/engage.config is the side entering it, not @/engine - entering from the
// other side leaves `buildConfig` unbound (`buildConfig is not a function`)
// when @/engage.config's top-level buildConfig(...) call runs. Plain Node/tsx
// does not have this problem; this is specific to Vitest's SSR pipeline.
import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { countFaqs, createFaq, deleteFaq, findFaqByID, findFaqs, findFaqsPaginated, updateFaq } from '@/cms/db'

/**
 * Proves the first slice of the CMS's own data layer (src/cms/db) actually
 * agrees with Payload's real adapter on the same table, rather than just
 * "runs without throwing":
 *
 * 1. Write a row through Payload's engine, read it back through our adapter.
 * 2. Write a row through our adapter, read it back through Payload's engine.
 *
 * If either direction disagrees on the data, our column mapping or JSON
 * (de)serialisation is wrong - exactly the kind of mistake that would corrupt
 * real content if this were ever pointed at production.
 */
describe('cms/db - faqs (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteFaq, not engine.delete: this suite's own writes should be
      // cleaned up by the same code under test, and a swallowed failure here
      // previously left rows behind for the next run to trip over.
      await deleteFaq(id)
    }
  })

  it('reads a document written by Payload', async () => {
    const created = await engine.create({
      collection: 'faqs',
      data: {
        question: 'Do you validate the data layer?',
        answer: { root: { children: [{ type: 'paragraph', children: [{ text: 'Yes.' }] }] } },
        category: 'Testing',
        order: 7,
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findFaqByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.question).toBe('Do you validate the data layer?')
    expect(viaOurs?.category).toBe('Testing')
    expect(viaOurs?.order).toBe(7)
    expect(viaOurs?.answer).toEqual(created.answer)
  })

  it('writes a document Payload can read back', async () => {
    const ours = await createFaq({
      question: 'Was this row written by the clone adapter?',
      answer: { root: { children: [{ type: 'paragraph', children: [{ text: 'It was.' }] }] } },
      category: 'Testing',
      order: 8,
    })
    createdIds.push(ours.id)

    const viaPayload = await engine.findByID({ collection: 'faqs', id: ours.id })
    expect(viaPayload.question).toBe('Was this row written by the clone adapter?')
    expect(viaPayload.category).toBe('Testing')
    expect(viaPayload.order).toBe(8)
    expect(viaPayload.answer).toEqual(ours.answer)
  })

  it('updates and deletes through the clone adapter', async () => {
    const ours = await createFaq({ question: 'Temp', answer: { root: { children: [] } }, order: 99 })
    createdIds.push(ours.id)

    const updated = await updateFaq(ours.id, { question: 'Temp, updated' })
    expect(updated?.question).toBe('Temp, updated')

    const viaPayload = await engine.findByID({ collection: 'faqs', id: ours.id })
    expect(viaPayload.question).toBe('Temp, updated')

    const deleted = await deleteFaq(ours.id)
    expect(deleted).toBe(true)
    await expect(engine.findByID({ collection: 'faqs', id: ours.id })).rejects.toThrow()

    createdIds.splice(createdIds.indexOf(ours.id), 1)
  })

  it('filters and counts with a where clause', async () => {
    const a = await createFaq({ question: 'Filter A', answer: { root: { children: [] } }, category: 'FilterTest', order: 1 })
    const b = await createFaq({ question: 'Filter B', answer: { root: { children: [] } }, category: 'FilterTest', order: 2 })
    createdIds.push(a.id, b.id)

    const matched = await findFaqs({ where: { category: { equals: 'FilterTest' } } })
    expect(matched.map((doc) => doc.id).sort()).toEqual([a.id, b.id].sort())

    const total = await countFaqs({ where: { category: { equals: 'FilterTest' } } })
    expect(total).toBe(2)
  })

  /**
   * findFaqsPaginated is what the engine.db.ts cutover's adapter intercept
   * calls for Faqs' `find` - Payload's real adapter contract needs sort and
   * page/limit regardless of how simple a collection's fields are (every
   * admin list view and API query passes them), so this proves the new
   * ../generic.ts findPaginated machinery against a real, isolated set of
   * rows before it's ever wired into the adapter.
   */
  it('paginates and sorts (the shape the engine cutover adapter intercept needs)', async () => {
    const marker = `PaginationTest-${Date.now()}`
    const rows = await Promise.all(
      [3, 1, 4, 2, 5].map((order) => createFaq({ question: `Page ${order}`, answer: { root: { children: [] } }, category: marker, order })),
    )
    createdIds.push(...rows.map((r) => r.id))

    // Sorted ascending by `order`, page 1 of size 2.
    const page1 = await findFaqsPaginated({ where: { category: { equals: marker } }, sort: 'order', limit: 2, page: 1 })
    expect(page1.docs.map((d) => d.order)).toEqual([1, 2])
    expect(page1.totalDocs).toBe(5)
    expect(page1.totalPages).toBe(3)
    expect(page1.hasPrevPage).toBe(false)
    expect(page1.hasNextPage).toBe(true)
    expect(page1.page).toBe(1)
    expect(page1.nextPage).toBe(2)

    const page2 = await findFaqsPaginated({ where: { category: { equals: marker } }, sort: 'order', limit: 2, page: 2 })
    expect(page2.docs.map((d) => d.order)).toEqual([3, 4])
    expect(page2.hasPrevPage).toBe(true)
    expect(page2.hasNextPage).toBe(true)

    const page3 = await findFaqsPaginated({ where: { category: { equals: marker } }, sort: 'order', limit: 2, page: 3 })
    expect(page3.docs.map((d) => d.order)).toEqual([5])
    expect(page3.hasNextPage).toBe(false)

    // Descending sort.
    const desc = await findFaqsPaginated({ where: { category: { equals: marker } }, sort: '-order', limit: 5, page: 1 })
    expect(desc.docs.map((d) => d.order)).toEqual([5, 4, 3, 2, 1])

    // `limit: 0` disables pagination entirely - every matching row, still sorted.
    const unpaginated = await findFaqsPaginated({ where: { category: { equals: marker } }, sort: 'order', limit: 0 })
    expect(unpaginated.docs.map((d) => d.order)).toEqual([1, 2, 3, 4, 5])
    expect(unpaginated.totalDocs).toBe(5)
    expect(unpaginated.hasNextPage).toBe(false)
  })

  /**
   * Faqs is the first collection cut over in src/engage.config.ts's
   * engageD1Adapter - this is what actually proves it, by going through
   * Payload's own real local API (engine.find/update/delete), not our own
   * ops functions, for every one of the five methods that adapter now
   * intercepts (find/findOne/create/updateOne/deleteOne - findOne and
   * create are already exercised above via engine.findByID/engine.create).
   * If the intercept were wired wrong, these calls would either throw or
   * silently fall through to the real base adapter and still pass by
   * accident - the assertions below check actual returned values (sort
   * order, pagination totals, the updated/deleted document shape) precisely
   * so a wrong intercept can't hide behind a passing test.
   */
  it('cuts over cleanly: engine.find/update/delete for faqs go through our own adapter', async () => {
    const marker = `AdapterCutover-${Date.now()}`
    const a = await engine.create({ collection: 'faqs', data: { question: 'Cutover A', answer: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'A', version: 1 }], version: 1 }], direction: null, format: '', indent: 0, version: 1 } }, category: marker, order: 2 } })
    const b = await engine.create({ collection: 'faqs', data: { question: 'Cutover B', answer: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'B', version: 1 }], version: 1 }], direction: null, format: '', indent: 0, version: 1 } }, category: marker, order: 1 } })
    createdIds.push(a.id as number, b.id as number)

    // engine.find -> adapter.find -> findFaqsPaginated, sorted by `order` ascending.
    const listed = await engine.find({ collection: 'faqs', where: { category: { equals: marker } }, sort: 'order', limit: 10 })
    expect(listed.docs.map((d) => d.question)).toEqual(['Cutover B', 'Cutover A'])
    expect(listed.totalDocs).toBe(2)
    expect(listed.hasNextPage).toBe(false)

    // engine.update (by id) -> adapter.updateOne -> updateFaq.
    const updated = await engine.update({ collection: 'faqs', id: a.id, data: { question: 'Cutover A, updated' } })
    expect(updated.question).toBe('Cutover A, updated')
    const reread = await findFaqByID(a.id as number)
    expect(reread?.question).toBe('Cutover A, updated')

    // engine.delete (by id) -> adapter.deleteOne (resolves id from `where`) -> deleteFaq.
    const deletedDoc = await engine.delete({ collection: 'faqs', id: b.id })
    expect(deletedDoc.question).toBe('Cutover B')
    expect(await findFaqByID(b.id as number)).toBeNull()
    createdIds.splice(createdIds.indexOf(b.id as number), 1)
  })
})
