// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite, and
// @/engage.config must be the side entering the @/engine <-> @/engage.config
// circular import.
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { describe, expect, it } from 'vitest'

import { createLesson, deleteLesson, findLessonByID, updateLesson } from '@/cms/db'

/**
 * Lessons: a sub-collection with a `join` field (course) that uses `has` (N:1
 * relationship, opposite direction from Courses' 1:N join) - see its own
 * schema in src/cms/db/collections/lessons.ts.
 */
describe('cms/db - lessons (join field with has)', () => {
  let engine: Engine
  const createdIds: number[] = []

  it('reads a lesson written by Payload: join field resolved at query time', async () => {
    engine = await getEngine()
    const courseRef = await engine.create({
      collection: 'courses',
      data: { title: 'Test course', accessType: 'free' },
    })

    const created = await engine.create({
      collection: 'lessons',
      data: { title: 'Test lesson', course: courseRef.id, orderIndex: 1 },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findLessonByID(created.id as number)
    expect(viaOurs?.id).toBe(created.id)
    expect(viaOurs?.title).toBe('Test lesson')
    expect(viaOurs?.course).toBeDefined()
  })

  it('writes a lesson Payload can read back', async () => {
    const courseRef = await engine.create({
      collection: 'courses',
      data: { title: 'Course for lesson', accessType: 'free' },
    })

    const ours = await createLesson({ title: 'Our lesson', course: courseRef.id as number, orderIndex: 1 })
    createdIds.push(ours.id)
    expect(ours.title).toBe('Our lesson')

    const viaPayload = await engine.findByID({ collection: 'lessons', id: ours.id, depth: 0 })
    expect(viaPayload.title).toBe('Our lesson')
  })

  afterAll = async () => {
    for (const id of createdIds) {
      await deleteLesson(id).catch(() => {})
    }
  }
})
