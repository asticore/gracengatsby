// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { createCourse, createCourseVersion, deleteCourse, findCourseByID, findLatestCourseVersion, updateCourse } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * Phase 10: Courses brought in from zero - see ../../src/cms/db/index.ts's
 * Phase 10 doc comment for why this needed no new schema-generation
 * capability (every field type Courses uses was already proven by an
 * earlier collection). This suite mirrors cms-db-events.int.spec.ts's shape
 * (group field + join field + versions), the closest existing proof target,
 * since Courses' `seo` group and `lessons` join are the same mechanisms as
 * Events' `location` group and `rsvps` join.
 *
 * Note: Payload's own `engine.update()`/`engine.delete()` on this local dev
 * D1 hits a pre-existing, unrelated schema-drift bug in its own
 * checkDocumentLockStatus path (see cms-db-events.int.spec.ts's own note) -
 * so the "update" and cleanup paths below go through this module's own
 * updateCourse/raw SQL instead.
 */
describe('cms/db - courses (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  afterAll(async () => {
    const db = await getDb()
    for (const id of createdIds) {
      await db.run(sql`delete from _eg_courses_v where parent_id = ${id}`)
      await deleteCourse(id)
    }
  })

  it('reads a course written by Payload: nested seo group, empty join field', async () => {
    engine = await getEngine()
    const created = await engine.create({
      collection: 'courses',
      data: {
        title: 'Parity course A',
        accessType: 'free',
        seo: { metaTitle: 'A meta title', noIndex: true },
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findCourseByID(created.id as number)
    expect(viaOurs?.title).toBe('Parity course A')
    expect(viaOurs?.seo).toEqual({ metaTitle: 'A meta title', metaDescription: null, ogImage: null, noIndex: true })
    expect(viaOurs?._status).toBe((created as { _status?: string })._status)
    expect(viaOurs?.lessons).toEqual({ docs: [], hasNextPage: false })
  })

  it('writes a course (seo group) Payload can read back', async () => {
    const ours = await createCourse({
      title: 'Written by clone adapter',
      accessType: 'purchase',
      seo: { metaTitle: 'Clone title', noIndex: false },
    })
    createdIds.push(ours.id)
    expect(ours.seo).toEqual({ metaTitle: 'Clone title', metaDescription: null, ogImage: null, noIndex: false })

    const viaPayload = await engine.findByID({ collection: 'courses', id: ours.id, depth: 0 })
    expect(viaPayload.seo).toEqual({ metaTitle: 'Clone title', metaDescription: null, ogImage: null, noIndex: false })
  })

  it('replaces group fields wholesale on update', async () => {
    const created = await createCourse({ title: 'Temp', accessType: 'free', seo: { metaTitle: 'Original' } })
    createdIds.push(created.id)

    const updated = await updateCourse(created.id, { seo: { metaTitle: 'Replaced', noIndex: true } })
    expect(updated?.seo).toEqual({ metaTitle: 'Replaced', metaDescription: null, ogImage: null, noIndex: true })

    const viaPayload = await engine.findByID({ collection: 'courses', id: created.id, depth: 0 })
    expect(viaPayload.seo).toEqual({ metaTitle: 'Replaced', metaDescription: null, ogImage: null, noIndex: true })
  })

  it('reads the version row Payload created on write, seo group included', async () => {
    const created = await engine.create({
      collection: 'courses',
      data: { title: 'Versioned course', accessType: 'free', seo: { metaTitle: 'Version meta' } },
    })
    createdIds.push(created.id as number)

    const ourVersion = await findLatestCourseVersion(created.id as number)
    expect(ourVersion?.title).toBe('Versioned course')
    // noIndex has defaultValue: false in seoFields, so it's false (not null) when omitted.
    expect(ourVersion?.seo).toEqual({ metaTitle: 'Version meta', metaDescription: null, ogImage: null, noIndex: false })
    expect(ourVersion?.latest).toBe(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({ collection: 'courses', where: { parent: { equals: created.id } } })
    expect(payloadVersions.docs[0].version.title).toBe('Versioned course')
    expect(payloadVersions.docs[0].version.seo).toEqual({ metaTitle: 'Version meta', metaDescription: null, ogImage: null, noIndex: false })
  })

  it('writes a version row Payload can read back', async () => {
    const created = await createCourse({ title: 'Has a version added', accessType: 'free' })
    createdIds.push(created.id)

    await createCourseVersion(created.id, { title: 'Written by clone adapter', seo: { metaTitle: 'Clone version' } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadVersions = await (engine as any).findVersions({ collection: 'courses', where: { parent: { equals: created.id } }, sort: '-createdAt' })
    expect(payloadVersions.docs[0].version.title).toBe('Written by clone adapter')
    // createCourseVersion writes the version row directly (bypassing createCollectionOps' defaultValue-filling), so an omitted noIndex stays null here rather than getting seoFields' defaultValue: false.
    expect(payloadVersions.docs[0].version.seo).toEqual({ metaTitle: 'Clone version', metaDescription: null, ogImage: null, noIndex: null })
  })

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
  })
})
