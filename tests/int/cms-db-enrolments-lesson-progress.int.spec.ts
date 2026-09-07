// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createCourse,
  createEnrolment,
  createLesson,
  createLessonProgress,
  deleteCourse,
  deleteEnrolment,
  deleteLesson,
  deleteLessonProgress,
  findEnrolmentByID,
  findLessonProgressByID,
  updateEnrolment,
  updateLessonProgress,
} from '@/cms/db'

/**
 * Phase 13: Enrolments and LessonProgress - Courses' remaining sibling
 * collections (see ../../src/cms/db/schema/index.ts's Phase 13 doc comment
 * for why neither needed new schema-generation capability). Both relate to
 * a real `users` row - `users` itself is not modeled anywhere in this data
 * layer (Users is `auth: true`, its own future proof target), so this suite
 * creates one real user through Payload's own auth `create()` purely as a
 * valid FK target, the same way earlier suites insert a bare `eg_media` row
 * as a FK target without modeling Media's own collection.
 */
describe('cms/db - enrolments & lesson-progress (proof of concept, not wired in)', () => {
  let engine: Engine
  let userId: number
  let courseId: number
  let lessonId: number
  const createdEnrolmentIds: number[] = []
  const createdProgressIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    const user = await engine.create({
      collection: 'users',
      data: { email: `phase13-${Date.now()}@example.com`, password: 'Phase13TestPassword!' },
    })
    userId = user.id as number

    const course = await createCourse({ title: `Phase 13 course ${Date.now()}`, accessType: 'free' })
    courseId = course.id

    const lesson = await createLesson({ title: 'Phase 13 lesson', course: courseId, order: 0 })
    lessonId = lesson.id
  })

  afterAll(async () => {
    for (const id of createdEnrolmentIds) await deleteEnrolment(id)
    for (const id of createdProgressIds) await deleteLessonProgress(id)
    await deleteLesson(lessonId)
    await deleteCourse(courseId)
    await engine.delete({ collection: 'users', id: userId })
  })

  it('reads an enrolment written by Payload', async () => {
    const created = await engine.create({
      collection: 'enrolments',
      data: { user: userId, course: courseId, status: 'active', source: 'manual' },
    })
    createdEnrolmentIds.push(created.id as number)

    const viaOurs = await findEnrolmentByID(created.id as number)
    expect(viaOurs?.user).toBe(userId)
    expect(viaOurs?.course).toBe(courseId)
    expect(viaOurs?.status).toBe('active')
    expect(viaOurs?.source).toBe('manual')
  })

  it('writes and updates an enrolment Payload can read back', async () => {
    const ours = await createEnrolment({ user: userId, course: courseId, status: 'active' })
    createdEnrolmentIds.push(ours.id)

    const updated = await updateEnrolment(ours.id, { status: 'completed' })
    expect(updated?.status).toBe('completed')

    const viaPayload = await engine.findByID({ collection: 'enrolments', id: ours.id })
    expect(viaPayload.status).toBe('completed')
  })

  it('reads a lesson-progress row written by Payload', async () => {
    const created = await engine.create({
      collection: 'lesson-progress',
      data: { user: userId, lesson: lessonId, course: courseId, completed: true },
    })
    createdProgressIds.push(created.id as number)

    const viaOurs = await findLessonProgressByID(created.id as number)
    expect(viaOurs?.user).toBe(userId)
    expect(viaOurs?.lesson).toBe(lessonId)
    expect(viaOurs?.course).toBe(courseId)
    expect(viaOurs?.completed).toBe(true)
  })

  it('writes and updates a lesson-progress row Payload can read back', async () => {
    const ours = await createLessonProgress({ user: userId, lesson: lessonId, course: courseId, completed: false })
    createdProgressIds.push(ours.id)

    const updated = await updateLessonProgress(ours.id, { completed: true })
    expect(updated?.completed).toBe(true)

    const viaPayload = await engine.findByID({ collection: 'lesson-progress', id: ours.id })
    expect(viaPayload.completed).toBe(true)
  })
})
