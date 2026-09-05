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

import { countFaqs, createFaq, deleteFaq, findFaqByID, findFaqs, updateFaq } from '@/cms/db'

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
})
