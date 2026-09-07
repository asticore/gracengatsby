// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createCourse, createLesson, deleteCourse, deleteFaq, deleteLesson, findLessonByID, updateLesson } from '@/cms/db'
import { getDb } from '@/cms/db/connect'

/**
 * Phase 11: Lessons built out as a full live collection (no versions - see
 * ../../src/cms/db/schema/index.ts's Phase 11 doc comment for why). Mirrors
 * cms-db-page-templates.int.spec.ts's shape (same page-builder block library,
 * same hasMany-inside-a-block fields: Faq's `faqs`, Gallery's `images`),
 * plus a plain array field (`resources`, MembershipTiers' `benefits`
 * mechanism) and a required single-target relationship column (`course`,
 * EventRSVPs'/Courses' own `event`/`product`/`coverImage` mechanism).
 */
describe('cms/db - lessons (proof of concept, not wired in)', () => {
  let engine: Engine
  let courseId: number
  let faq1Id: number
  let faq2Id: number
  let media1Id: number
  let media2Id: number
  const createdLessonIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()

    const course = await createCourse({ title: `Lessons phase course ${Date.now()}`, accessType: 'free' })
    courseId = course.id

    const faq1 = await engine.create({ collection: 'faqs', data: { question: 'Q1', answer: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'A1', version: 1 }], version: 1 }], direction: null, format: '', indent: 0, version: 1 } } } })
    const faq2 = await engine.create({ collection: 'faqs', data: { question: 'Q2', answer: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'A2', version: 1 }], version: 1 }], direction: null, format: '', indent: 0, version: 1 } } } })
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
    for (const id of createdLessonIds) {
      await deleteLesson(id)
    }
    await deleteCourse(courseId)
    await deleteFaq(faq1Id)
    await deleteFaq(faq2Id)
    const db = await getDb()
    await db.run(sql`delete from eg_media where id in (${media1Id}, ${media2Id})`)
  })

  it('reads a lesson written by Payload: required course FK, resources array, mixed block order', async () => {
    const created = await engine.create({
      collection: 'lessons',
      data: {
        title: 'Parity lesson A',
        course: courseId,
        order: 0,
        resources: [{ label: 'Worksheet', file: media1Id }],
        content: [
          { blockType: 'hero', heading: 'Welcome', backgroundImage: media1Id },
          { blockType: 'faq', heading: 'FAQs', source: 'manual', faqs: [faq1Id, faq2Id] },
        ],
      },
    })
    createdLessonIds.push(created.id as number)

    const viaOurs = await findLessonByID(created.id as number)
    expect(viaOurs?.course).toBe(courseId)
    expect(viaOurs?.resources).toEqual([{ id: expect.any(String), label: 'Worksheet', file: media1Id }])
    expect(viaOurs?.content).toHaveLength(2)

    const [hero, faq] = viaOurs!.content!
    expect(hero.blockType).toBe('hero')
    expect(hero.heading).toBe('Welcome')
    expect(hero.backgroundImage).toBe(media1Id)

    expect(faq.blockType).toBe('faq')
    expect(faq.faqs).toEqual([faq1Id, faq2Id])
  })

  it('writes a lesson (hasMany upload inside a block, resources array) Payload can read back, in order', async () => {
    const ours = await createLesson({
      title: 'Written by clone adapter',
      course: courseId,
      order: 1,
      resources: [
        { label: 'Slides', file: media1Id },
        { label: 'Handout', file: media2Id },
      ] as never,
      content: [
        { blockType: 'gallery', heading: 'Gallery', images: [media1Id, media2Id] } as never,
        { blockType: 'faq', heading: 'More FAQs', source: 'manual', faqs: [faq2Id] } as never,
      ],
    })
    createdLessonIds.push(ours.id)
    expect(ours.resources?.map((r) => r.label)).toEqual(['Slides', 'Handout'])
    expect(ours.content?.map((b) => b.blockType)).toEqual(['gallery', 'faq'])
    expect(ours.content?.[0].images).toEqual([media1Id, media2Id])

    const viaPayload = await engine.findByID({ collection: 'lessons', id: ours.id, depth: 0 })
    expect((viaPayload.resources as { label: string }[]).map((r) => r.label)).toEqual(['Slides', 'Handout'])
    const payloadBlocks = viaPayload.content as { blockType: string; images?: number[]; faqs?: number[] }[]
    expect(payloadBlocks.map((b) => b.blockType)).toEqual(['gallery', 'faq'])
    expect(payloadBlocks[0].images).toEqual([media1Id, media2Id])
    expect(payloadBlocks[1].faqs).toEqual([faq2Id])
  })

  it('replaces content blocks and resources wholesale on update', async () => {
    const created = await createLesson({
      title: 'Temp',
      course: courseId,
      order: 2,
      resources: [{ label: 'Original', file: media1Id }] as never,
      content: [{ blockType: 'faq', heading: 'Original', source: 'manual', faqs: [faq1Id] } as never],
    })
    createdLessonIds.push(created.id)

    const updated = await updateLesson(created.id, {
      resources: [{ label: 'Replaced', file: media2Id }] as never,
      content: [
        { blockType: 'hero', heading: 'Replaced hero' } as never,
        { blockType: 'faq', heading: 'Replaced faq', source: 'manual', faqs: [faq2Id] } as never,
      ],
    })
    expect(updated?.resources?.map((r) => r.label)).toEqual(['Replaced'])
    expect(updated?.content?.map((b) => b.blockType)).toEqual(['hero', 'faq'])
    expect(updated?.content?.[1].faqs).toEqual([faq2Id])

    const viaPayload = await engine.findByID({ collection: 'lessons', id: created.id, depth: 0 })
    expect((viaPayload.resources as { label: string }[]).map((r) => r.label)).toEqual(['Replaced'])
    const payloadBlocks = viaPayload.content as { blockType: string; faqs?: number[] }[]
    expect(payloadBlocks.map((b) => b.blockType)).toEqual(['hero', 'faq'])
    expect(payloadBlocks[1].faqs).toEqual([faq2Id])
  })

  it('cascades resources rows, block rows and rels rows on delete', async () => {
    const created = await createLesson({
      title: 'To delete',
      course: courseId,
      order: 3,
      resources: [{ label: 'Gone soon', file: media1Id }] as never,
      content: [{ blockType: 'faq', heading: 'Gone soon', source: 'manual', faqs: [faq1Id] } as never],
    })

    const deleted = await deleteLesson(created.id)
    expect(deleted).toBe(true)

    const afterDelete = await findLessonByID(created.id)
    expect(afterDelete).toBeNull()

    const db = await getDb()
    const resourceRows = await db.run(sql`select count(*) as n from eg_lessons_resources where _parent_id = ${created.id}`)
    // A blocks field's child tables are always "<dbName>_blocks_<blockSlug>" -
    // a fixed "blocks" segment, not the field's own name (see
    // ../../src/cms/db/schema/generate.ts's generateBlockTables). Lessons'
    // field is named "content", so the real table is eg_lessons_blocks_faq,
    // not eg_lessons_content_faq - same convention Posts' "layout" field
    // already relies on for eg_posts_blocks_hero.
    const blockRows = await db.run(sql`select count(*) as n from eg_lessons_blocks_faq where _parent_id = ${created.id}`)
    const relsRows = await db.run(sql`select count(*) as n from eg_lessons_rels where parent_id = ${created.id}`)
    expect((resourceRows.results as { n: number }[])[0].n).toBe(0)
    expect((blockRows.results as { n: number }[])[0].n).toBe(0)
    expect((relsRows.results as { n: number }[])[0].n).toBe(0)
  })
})
