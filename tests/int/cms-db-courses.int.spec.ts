// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
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
describe('cms/db - courses (wired into engageD1Adapter)', () => {
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

  it('cuts over cleanly: engine.find/create/update/delete for courses go through our own adapter', async () => {
    const marker = `adaptercutover-${Date.now()}`
    const a = await engine.create({ collection: 'courses', data: { title: `${marker}-a`, accessType: 'free' } })
    createdIds.push(a.id as number)

    // engine.find -> adapter.find -> findCoursesPaginated (plain baseOps, not createDraftOps-wrapped).
    const listed = await engine.find({ collection: 'courses', where: { title: { like: marker } }, limit: 10 })
    expect(listed.docs.map((d) => d.id)).toEqual([a.id])
    expect(listed.totalDocs).toBe(1)

    // engine.update (by id, non-draft) -> adapter.updateOne -> updateCourseLiveRow, publishing straight to the live row.
    const updated = await engine.update({ collection: 'courses', id: a.id, data: { title: `${marker}-updated`, _status: 'published' } })
    expect(updated.title).toBe(`${marker}-updated`)
    const reread = await findCourseByID(a.id as number)
    expect(reread?.title).toBe(`${marker}-updated`)

    // engine.delete (by id) -> adapter.deleteOne (resolves id via findCoursesPaginated) -> deleteCourse.
    const deletedDoc = await engine.delete({ collection: 'courses', id: a.id })
    expect(deletedDoc.title).toBe(`${marker}-updated`)
    expect(await findCourseByID(a.id as number)).toBeNull()

    // deleteCourse doesn't touch _eg_courses_v - clean up this id's version
    // row(s) directly since it's being removed from createdIds below.
    const db = await getDb()
    await db.run(sql`delete from _eg_courses_v where parent_id = ${a.id}`)
    createdIds.splice(createdIds.indexOf(a.id as number), 1)
  })
})
