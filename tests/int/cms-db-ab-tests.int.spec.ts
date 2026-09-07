// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createABTest, createPage, deleteABTest, deletePage, findABTestByID, updateABTest } from '@/cms/db'

/**
 * Phase 16: AB Tests - a scalar collection plus TWO array fields (`variants`,
 * `goals`), each with row-wrapped subfields and a single-target relationship
 * living directly on the array's own child table (eg_ab_tests_variants'
 * `page`/`template`, eg_ab_tests_goals' `form`) - the exact mechanism
 * Lessons' `resources.file` proved, just two array fields on one collection
 * instead of one.
 *
 * Payload's own `beforeChange` hook assigns `variants[].key`/`goals[].key`
 * and recomputes `targetPath` - that runs inside Payload's engine, not this
 * data layer, so writes through `createABTest` below set `key`/`targetPath`
 * explicitly rather than relying on it.
 *
 * This suite only touches rows it creates itself (scoped creates/reads/
 * deletes by id, never an unscoped count or delete) because sibling suites
 * exercise translations/memberships/form-submissions against the same local
 * D1 database concurrently.
 */
describe('cms/db - ab-tests (proof of concept, not wired in)', () => {
  let engine: Engine
  let pageId: number
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()

    const page = await createPage({ title: `AB test phase page ${Date.now()}` })
    pageId = page.id
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteABTest, not engine.delete: this suite's own writes should be
      // cleaned up by the same code under test.
      await deleteABTest(id)
    }
    await deletePage(pageId)
  })

  it('reads a document written by Payload: variants/goals arrays, in order, with relationship subfields intact', async () => {
    const name = `phase16-ab-a-${Date.now()}`
    const created = await engine.create({
      collection: 'ab-tests',
      data: {
        name,
        page: pageId,
        scope: 'page',
        variants: [
          { label: 'Control', weight: 50, isControl: true },
          { label: 'Challenger', weight: 50, page: pageId },
        ],
        goals: [{ label: 'Signed up', type: 'page-visited', path: '/thanks' }],
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findABTestByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.name).toBe(name)
    expect(viaOurs?.page).toBe(pageId)
    expect(viaOurs?.variants).toHaveLength(2)

    const [control, challenger] = viaOurs!.variants!
    expect(control.label).toBe('Control')
    expect(control.weight).toBe(50)
    expect(control.isControl).toBe(true)
    expect(control.page == null).toBe(true)

    expect(challenger.label).toBe('Challenger')
    expect(challenger.page).toBe(pageId)

    expect(viaOurs?.goals).toHaveLength(1)
    expect(viaOurs?.goals?.[0].label).toBe('Signed up')
    expect(viaOurs?.goals?.[0].type).toBe('page-visited')
    expect(viaOurs?.goals?.[0].path).toBe('/thanks')
  })

  it('writes a document (variants/goals arrays, relationship subfields) Payload can read back, in order', async () => {
    const name = `phase16-ab-b-${Date.now()}`
    const ours = await createABTest({
      name,
      status: 'draft',
      page: pageId,
      scope: 'page',
      variants: [
        { key: 'A', label: 'Control', weight: 50, isControl: true },
        { key: 'B', label: 'Challenger', weight: 50, page: pageId },
      ],
      goals: [
        { key: 'gA', label: 'Signed up', type: 'page-visited', path: '/thanks' },
        { key: 'gB', label: 'Clicked CTA', type: 'element-clicked', selector: '.hero .button--primary' },
      ],
      targetPath: '/',
    })
    createdIds.push(ours.id)

    expect(ours.variants?.map((v) => v.label)).toEqual(['Control', 'Challenger'])
    expect(ours.goals?.map((g) => g.label)).toEqual(['Signed up', 'Clicked CTA'])

    const viaPayload = await engine.findByID({ collection: 'ab-tests', id: ours.id, depth: 0 })
    const variants = viaPayload.variants as { key: string; label: string; weight: number; isControl?: boolean; page?: number }[]
    expect(variants.map((v) => v.label)).toEqual(['Control', 'Challenger'])
    expect(variants[0].isControl).toBe(true)
    expect(variants[1].page).toBe(pageId)

    const goals = viaPayload.goals as { key: string; label: string; type: string; path?: string; selector?: string }[]
    expect(goals.map((g) => g.label)).toEqual(['Signed up', 'Clicked CTA'])
    expect(goals[0].path).toBe('/thanks')
    expect(goals[1].selector).toBe('.hero .button--primary')
  })

  it('replaces variants wholesale on update', async () => {
    const name = `phase16-ab-c-${Date.now()}`
    const created = await createABTest({
      name,
      status: 'draft',
      page: pageId,
      scope: 'page',
      variants: [{ key: 'A', label: 'Original', weight: 50, isControl: true }],
      targetPath: '/',
    })
    createdIds.push(created.id)

    const updated = await updateABTest(created.id, {
      variants: [
        { key: 'A', label: 'Replaced control', weight: 40, isControl: true },
        { key: 'B', label: 'Replaced challenger', weight: 60, page: pageId },
      ],
    })
    expect(updated?.variants?.map((v) => v.label)).toEqual(['Replaced control', 'Replaced challenger'])
    expect(updated?.variants?.[1].page).toBe(pageId)

    const viaPayload = await engine.findByID({ collection: 'ab-tests', id: created.id, depth: 0 })
    const variants = viaPayload.variants as { label: string; page?: number }[]
    expect(variants.map((v) => v.label)).toEqual(['Replaced control', 'Replaced challenger'])
    expect(variants[1].page).toBe(pageId)
  })
})
