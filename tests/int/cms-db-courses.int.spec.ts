// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createCourse, createCourseVersion, deleteCourse, findCourseByID, findLatestCourseVersion, updateCourse } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * Phase 10: Courses - the first collection to combine drafts (versions.drafts
 * like Events/Pages/Posts) with a `join` field (`lessons`, resolved
 * query-time against Lessons - Phase 11's own collection, proven next).
 * Courses has no blocks/array field of its own to version, so its own
 * version-row shape is scalar/group fields only (title/slug/description/
 * coverImage/accessType/product/tierSlug/seo) - CourseVersion in
 * ../../src/cms/db/collections/courses.ts mirrors that.
 */
describe('cms/db - courses (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteCourse(id)
    }
  })

  it('reads a course written by Payload: nested seo group, empty join field', async () => {
    const title = `Phase10 course A ${Date.now()}`
    const created = await engine.create({
      collection: 'courses',
      data: {
        title,
        accessType: 'free',
        seo: { metaTitle: 'Custom title', metaDescription: 'Custom description' },
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findCourseByID(created.id as number)
    expect(viaOurs?.title).toBe(title)
    expect(viaOurs?.accessType).toBe('free')
    expect(viaOurs?.seo).toEqual({ metaTitle: 'Custom title', metaDescription: 'Custom description', ogImage: null, noIndex: false })
    expect(viaOurs?.lessons).toEqual({ docs: [], hasNextPage: false })
  })

  it('writes a course (seo group) Payload can read back', async () => {
    const title = `Written by clone adapter ${Date.now()}`
    const ours = await createCourse({
      title,
      accessType: 'tier',
      tierSlug: 'gold',
      seo: { metaTitle: 'Clone title' },
    })
    createdIds.push(ours.id)

    const viaPayload = await engine.findByID({ collection: 'courses', id: ours.id, depth: 0 })
    expect(viaPayload.title).toBe(title)
    expect(viaPayload.accessType).toBe('tier')
    expect(viaPayload.tierSlug).toBe('gold')
    expect((viaPayload.seo as { metaTitle?: string }).metaTitle).toBe('Clone title')
  })

  it('replaces group fields wholesale on update', async () => {
    const created = await createCourse({ title: `Temp ${Date.now()}`, accessType: 'free', seo: { metaTitle: 'Original' } })
    createdIds.push(created.id)

    const updated = await updateCourse(created.id, { seo: { metaTitle: 'Replaced', noIndex: true } })
    expect(updated?.seo).toEqual({ metaTitle: 'Replaced', metaDescription: null, ogImage: null, noIndex: true })

    const viaPayload = await engine.findByID({ collection: 'courses', id: created.id, depth: 0 })
    expect(viaPayload.seo).toEqual({ metaTitle: 'Replaced', metaDescription: null, ogImage: null, noIndex: true })
  })

  it('reads the version row Payload created on write, seo group included', async () => {
    const created = await engine.create({
      collection: 'courses',
      data: { title: `Phase10 version A ${Date.now()}`, accessType: 'free', seo: { metaTitle: 'Versioned' } },
    })
    createdIds.push(created.id as number)

    const latest = await findLatestCourseVersion(created.id as number)
    expect(latest?.title).toBe(created.title)
    expect(latest?.seo).toEqual({ metaTitle: 'Versioned', metaDescription: null, ogImage: null, noIndex: false })
    expect(latest?.latest).toBe(true)
  })

  it('writes a version row Payload can read back', async () => {
    const created = await createCourse({ title: `Temp ${Date.now()}`, accessType: 'free' })
    createdIds.push(created.id)

    await createCourseVersion(created.id, { title: 'Written by clone adapter', seo: { metaTitle: 'Clone version' } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({ collection: 'courses', where: { parent: { equals: created.id } }, sort: '-createdAt' })
    expect(payloadVersions.docs[0].version.title).toBe('Written by clone adapter')
    // createCourseVersion writes the version row directly (bypassing createCollectionOps' defaultValue-filling), so an omitted noIndex stays null here rather than getting seoFields' defaultValue: false.
    expect(payloadVersions.docs[0].version.seo).toEqual({ metaTitle: 'Clone version', metaDescription: null, ogImage: null, noIndex: null })
  })

  // Explicit timeout, not the default 5000ms: `lessons` (cut over to our own
  // adapter dispatch - see src/engage.config.ts) has a `content` blocks field
  // sharing the full page-builder block library (12 block types - see
  // src/blocks/index.ts's pageBuilderBlocks), and generic.ts's own
  // attachBlocksFields does one SELECT per block type on every create/read,
  // whether or not `content` actually has data. 11 sequential
  // `engine.create` calls below each pay that cost, measured at ~700ms/call
  // in this environment - comfortably under a real save's tolerance, but
  // tight against vitest's default per-test budget for a loop written to
  // prove pagination, not to be fast.
  it('resolves the lessons join field query-time against real Lessons, sorted by the join field\'s own defaultSort (not id)', async () => {
    const created = await createCourse({ title: `Join phase course ${Date.now()}`, accessType: 'free' })
    createdIds.push(created.id)

    // Courses' `lessons` join field declares `defaultSort: 'order'` of its
    // own (see Courses.ts) - confirmed real Payload honors THAT, not a
    // generic id-descending default (see ../../src/cms/db/generic.ts's
    // createJoinOps doc comment: this is what Events' rsvps, which has no
    // defaultSort of its own, does NOT do). `order` is deliberately a full
    // permutation of creation sequence here (not `order: i`) so a pass can
    // only mean real sorting by `order`, not a coincidence of ascending ids.
    // One more than the confirmed default page size (10) to prove hasNextPage.
    const orderValues = [6, 2, 9, 0, 4, 10, 1, 7, 3, 8, 5]
    const lessonIds: number[] = []
    for (let i = 0; i < 11; i++) {
      // `order` is required:true on Lessons (despite defaultValue: 0) - Payload's own RequiredDataFromCollectionSlug type demands it explicitly.
      const lesson = await engine.create({ collection: 'lessons', data: { title: `Lesson ${i}`, course: created.id, order: orderValues[i] } })
      lessonIds.push(lesson.id as number)
    }
    const expectedDocs = lessonIds
      .map((id, i) => ({ id, order: orderValues[i] }))
      .sort((a, b) => a.order - b.order)
      .slice(0, 10)
      .map((row) => row.id)

    const viaOurs = await findCourseByID(created.id)
    expect(viaOurs?.lessons?.hasNextPage).toBe(true)
    expect(viaOurs?.lessons?.docs).toHaveLength(10)
    expect(viaOurs?.lessons?.docs).toEqual(expectedDocs)

    const viaPayload = await engine.findByID({ collection: 'courses', id: created.id, depth: 0 })
    expect(viaPayload.lessons).toEqual({ docs: expectedDocs, hasNextPage: true })

    const db = await getDb()
    for (const id of lessonIds) {
      await db.run(sql`delete from eg_lessons where id = ${id}`)
    }
  }, 20000)
})
