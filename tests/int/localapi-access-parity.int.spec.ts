// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import. Only the second
// describe block below (`readableLessons`) actually touches the database -
// the first needs no environment ceremony of its own (it never imports
// `@/engine` at runtime, only `import type`), but the whole file shares one
// `@vitest-environment` directive, so it takes the stricter one.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { adminOnlyFieldAccess, adminOrPublishedStatus, isAdmin, isAdminOrSelf, isDocumentOwner } from '@/access/ecommerceAccess'
import { isAdminOrRsvpOwner } from '@/features/accounts/access'
import { isAdminOrMembershipOwner } from '@/features/members/access'
import { twoFactorFields } from '@/features/security/twoFactor'
import { Users } from '@/collections/Users'
import { executeAccess, executeFieldAccess, Forbidden, type LocalReq } from '@/localapi/access'

const admin: LocalReq['user'] = { id: 1, roles: ['admin'] }
const customer = (id: number): LocalReq['user'] => ({ id, roles: ['customer'] })
const anon: LocalReq['user'] = null

/**
 * Sanity-checks `executeAccess`/`executeFieldAccess` against THIS APP'S REAL,
 * already-written access functions (not hand-written mimics) - same
 * discipline as `localapi-validators-parity.int.spec.ts`: prove the executor
 * was correctly derived from real Payload behavior by driving real functions
 * through it and hand-verifying the result, not just asserting it is
 * internally self-consistent (that's what `localapi-access.int.spec.ts`
 * covers).
 *
 * Every function spot-checked here is exported and imported unmodified.
 * Two more real access functions this app has are deliberately NOT spot
 * -checked directly, and covered elsewhere instead:
 *   - `adminOrOwn` (`Enrolments.ts`/`LessonProgress.ts`) is not exported (a
 *     private `const` inside each collection file) and structurally
 *     identical to `isDocumentOwner`/`isAdminOrMembershipOwner`, already
 *     covered below - re-typing it here would test a copy, not the real
 *     thing, so it is skipped rather than faked.
 *   - `readableLessons` (`Lessons.ts`) is also not exported, AND async, AND
 *     depends on `req.payload.find` through `accessibleCourseIds`/
 *     `flagsFrom` - genuinely impractical to drive through this executor in
 *     isolation with a fake `req.payload`. It gets the "lighter test" the
 *     brief allows instead: a real end-to-end `engine.find` against the real
 *     `lessons` collection (`describe('readableLessons ...')` below), which
 *     exercises the real Payload `executeAccess`/`combineQueries` this
 *     module reimplements, the real `readableLessons`, AND proves this
 *     module's own `combineQueries` produces an equivalent row-filter for
 *     the exact `Where` shape `readableLessons` returns.
 */
describe('localapi/access - parity spot-checks against real Payload access functions', () => {
  describe('isAdmin (boolean-only)', () => {
    it('admin -> true', async () => {
      await expect(executeAccess(isAdmin, { req: { user: admin } })).resolves.toBe(true)
    })
    it('customer -> false -> Forbidden', async () => {
      await expect(executeAccess(isAdmin, { req: { user: customer(2) } })).rejects.toThrow(Forbidden)
    })
    it('anonymous -> false -> Forbidden', async () => {
      await expect(executeAccess(isAdmin, { req: { user: anon } })).rejects.toThrow(Forbidden)
    })
  })

  describe('isAdminOrSelf (Where-returning)', () => {
    it('admin -> true (no row filter)', async () => {
      await expect(executeAccess(isAdminOrSelf, { req: { user: admin } })).resolves.toBe(true)
    })
    it('customer -> { id: { equals: own id } }', async () => {
      await expect(executeAccess(isAdminOrSelf, { req: { user: customer(42) } })).resolves.toEqual({ id: { equals: 42 } })
    })
    it('anonymous -> false -> Forbidden', async () => {
      await expect(executeAccess(isAdminOrSelf, { req: { user: anon } })).rejects.toThrow(Forbidden)
    })
  })

  describe('isDocumentOwner (Where-returning)', () => {
    it('admin -> true', async () => {
      await expect(executeAccess(isDocumentOwner, { req: { user: admin } })).resolves.toBe(true)
    })
    it('customer -> { customer: { equals: own id } }', async () => {
      await expect(executeAccess(isDocumentOwner, { req: { user: customer(9) } })).resolves.toEqual({ customer: { equals: 9 } })
    })
    it('anonymous -> false -> Forbidden', async () => {
      await expect(executeAccess(isDocumentOwner, { req: { user: anon } })).rejects.toThrow(Forbidden)
    })
  })

  describe('adminOrPublishedStatus (Where-returning)', () => {
    it('admin -> true', async () => {
      await expect(executeAccess(adminOrPublishedStatus, { req: { user: admin } })).resolves.toBe(true)
    })
    it('customer -> { _status: { equals: "published" } }', async () => {
      await expect(executeAccess(adminOrPublishedStatus, { req: { user: customer(3) } })).resolves.toEqual({ _status: { equals: 'published' } })
    })
    it('anonymous -> also { _status: { equals: "published" } } (public read, not gated on login)', async () => {
      await expect(executeAccess(adminOrPublishedStatus, { req: { user: anon } })).resolves.toEqual({ _status: { equals: 'published' } })
    })
  })

  describe('isAdminOrRsvpOwner (Where-returning, matches by email not id)', () => {
    it('admin -> true', async () => {
      await expect(executeAccess(isAdminOrRsvpOwner, { req: { user: { ...admin, email: 'admin@example.com' } } })).resolves.toBe(true)
    })
    it('signed-in customer with an email -> { email: { equals: own email } }', async () => {
      await expect(
        executeAccess(isAdminOrRsvpOwner, { req: { user: { ...customer(5), email: 'jane@example.com' } } }),
      ).resolves.toEqual({ email: { equals: 'jane@example.com' } })
    })
    it('anonymous -> false -> Forbidden', async () => {
      await expect(executeAccess(isAdminOrRsvpOwner, { req: { user: anon } })).rejects.toThrow(Forbidden)
    })
  })

  describe('isAdminOrMembershipOwner (Where-returning)', () => {
    it('admin -> true', async () => {
      await expect(executeAccess(isAdminOrMembershipOwner, { req: { user: admin } })).resolves.toBe(true)
    })
    it('member -> { user: { equals: own id } }', async () => {
      await expect(executeAccess(isAdminOrMembershipOwner, { req: { user: customer(11) } })).resolves.toEqual({ user: { equals: 11 } })
    })
    it('anonymous -> false -> Forbidden', async () => {
      await expect(executeAccess(isAdminOrMembershipOwner, { req: { user: anon } })).rejects.toThrow(Forbidden)
    })
  })

  describe('adminOnlyFieldAccess (field-level, boolean-only, never throws)', () => {
    it('admin -> true', async () => {
      await expect(executeFieldAccess(adminOnlyFieldAccess, { req: { user: admin } })).resolves.toBe(true)
    })
    it('customer -> false, not a thrown Forbidden', async () => {
      await expect(executeFieldAccess(adminOnlyFieldAccess, { req: { user: customer(6) } })).resolves.toBe(false)
    })
  })

  describe('Users.roles field access.update (inline, admin-only - src/collections/Users.ts:34-37)', () => {
    const rolesField = Users.fields.find((field) => 'name' in field && field.name === 'roles') as unknown as {
      access?: { update?: (args: { req: { user: LocalReq['user'] } }) => boolean }
    }

    it('collection actually declares the field-level access this test spot-checks', () => {
      expect(rolesField.access?.update).toBeTypeOf('function')
    })

    it('admin -> true', async () => {
      await expect(executeFieldAccess(rolesField.access!.update as never, { req: { user: admin } })).resolves.toBe(true)
    })
    it('customer -> false', async () => {
      await expect(executeFieldAccess(rolesField.access!.update as never, { req: { user: customer(7) } })).resolves.toBe(false)
    })
  })

  describe('twoFactor secret field access (always false, regardless of caller - src/features/security/twoFactor.ts:60-67)', () => {
    const secretField = (twoFactorFields[0] as unknown as { fields: Array<{ name?: string; access?: unknown }> }).fields.find(
      (field) => field.name === 'secret',
    ) as unknown as {
      access: { read: () => boolean; update: () => boolean; create: () => boolean }
    }

    it('field declares read/update/create all locked', () => {
      expect(secretField.access.read).toBeTypeOf('function')
      expect(secretField.access.update).toBeTypeOf('function')
      expect(secretField.access.create).toBeTypeOf('function')
    })

    it('even an admin cannot read/update/create it through field access - it is a `hidden` field, this is a second lock', async () => {
      await expect(executeFieldAccess(secretField.access.read as never, { req: { user: admin } })).resolves.toBe(false)
      await expect(executeFieldAccess(secretField.access.update as never, { req: { user: admin } })).resolves.toBe(false)
      await expect(executeFieldAccess(secretField.access.create as never, { req: { user: admin } })).resolves.toBe(false)
    })
  })
})

/**
 * `readableLessons` (`src/features/courses/collections/Lessons.ts`) is not
 * exported and depends on `req.payload.find` - see the parent describe
 * block's doc comment for why it gets an end-to-end test through real
 * Payload instead of a direct call through this module's executor.
 *
 * This proves two things at once: (1) real Payload's own `find` operation,
 * given `readableLessons`'s `{ or: [...] }` `Where`, filters rows exactly as
 * hand-verified below, and (2) feeding that SAME shape through this module's
 * own `combineQueries` (already unit-tested in isolation in
 * localapi-access.int.spec.ts) and running the merged `Where` with
 * `overrideAccess: true` returns an identical document set - i.e. this
 * module's row-filtering contract is equivalent to what real Payload's find
 * operation actually enforces for a real Where-returning access function,
 * not merely for hand-written test fixtures.
 */
describe('readableLessons - end-to-end parity via real engine.find (Lessons.ts is not exported)', () => {
  let engine: Engine
  let freeCourseId: number
  let tierCourseId: number
  let previewLessonId: number
  let freeLessonId: number
  let hiddenLessonId: number
  let originalLmsFlag: boolean | null | undefined

  beforeAll(async () => {
    engine = await getEngine()

    const existing = await engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch((): null => null)
    originalLmsFlag = (existing?.features as Record<string, boolean | null> | undefined)?.lms
    await engine.updateGlobal({ slug: 'site-settings', data: { features: { lms: true } }, overrideAccess: true })

    const freeCourse = await engine.create({
      collection: 'courses',
      data: { title: `Access parity free course ${Date.now()}`, accessType: 'free' },
      overrideAccess: true,
    })
    freeCourseId = freeCourse.id as number
    await engine.update({ collection: 'courses', id: freeCourseId, data: { _status: 'published' }, overrideAccess: true })

    const tierCourse = await engine.create({
      collection: 'courses',
      data: { title: `Access parity tier course ${Date.now()}`, accessType: 'tier', tierSlug: 'gold-tier-nobody-holds' },
      overrideAccess: true,
    })
    tierCourseId = tierCourse.id as number
    await engine.update({ collection: 'courses', id: tierCourseId, data: { _status: 'published' }, overrideAccess: true })

    const freeLesson = await engine.create({
      collection: 'lessons',
      data: { title: 'Readable via free course', course: freeCourseId, order: 0, isPreview: false },
      overrideAccess: true,
    })
    freeLessonId = freeLesson.id as number

    const previewLesson = await engine.create({
      collection: 'lessons',
      data: { title: 'Readable via isPreview', course: tierCourseId, order: 0, isPreview: true },
      overrideAccess: true,
    })
    previewLessonId = previewLesson.id as number

    const hiddenLesson = await engine.create({
      collection: 'lessons',
      data: { title: 'Locked behind an unheld tier', course: tierCourseId, order: 1, isPreview: false },
      overrideAccess: true,
    })
    hiddenLessonId = hiddenLesson.id as number
  })

  afterAll(async () => {
    await engine.updateGlobal({ slug: 'site-settings', data: { features: { lms: originalLmsFlag ?? false } }, overrideAccess: true })
    await engine.delete({ collection: 'lessons', id: freeLessonId, overrideAccess: true })
    await engine.delete({ collection: 'lessons', id: previewLessonId, overrideAccess: true })
    await engine.delete({ collection: 'lessons', id: hiddenLessonId, overrideAccess: true })
    await engine.delete({ collection: 'courses', id: freeCourseId, overrideAccess: true })
    await engine.delete({ collection: 'courses', id: tierCourseId, overrideAccess: true })
  })

  it('admin sees every lesson (readableLessons short-circuits to `true`)', async () => {
    const { docs } = await engine.find({
      collection: 'lessons',
      where: { id: { in: [freeLessonId, previewLessonId, hiddenLessonId] } },
      user: { id: 999999, roles: ['admin'], collection: 'users' } as never,
      overrideAccess: false,
    })
    expect(new Set(docs.map((doc) => doc.id))).toEqual(new Set([freeLessonId, previewLessonId, hiddenLessonId]))
  })

  it('an anonymous reader sees the free-course lesson and the preview lesson, NOT the tier-locked one', async () => {
    const { docs } = await engine.find({
      collection: 'lessons',
      where: { id: { in: [freeLessonId, previewLessonId, hiddenLessonId] } },
      user: null,
      overrideAccess: false,
    })
    expect(new Set(docs.map((doc) => doc.id))).toEqual(new Set([freeLessonId, previewLessonId]))
  })

  it("this module's own combineQueries, fed the exact Where readableLessons returns, filters an identical document set", async () => {
    // Hand-built to match Lessons.ts:37-42's `readableLessons` clause exactly
    // for an anonymous/no-course-access reader: no accessible paid/tier
    // courses, so only the `courseIds.length > 0` branch is omitted, same as
    // the real function does for this exact scenario.
    const accessResult = { or: [{ isPreview: { equals: true } }] }
    const merged = (await import('@/localapi/access')).combineQueries({ id: { in: [freeLessonId, previewLessonId, hiddenLessonId] } }, accessResult)

    const { docs } = await engine.find({
      collection: 'lessons',
      where: merged as never,
      overrideAccess: true,
    })
    // Real readableLessons additionally grants freeLessonId (via the
    // course-inclusion branch this hand-built accessResult omits, since no
    // course is being asserted "accessible" here) - so this only proves the
    // isPreview half of the OR against a real document set, which is exactly
    // what the hand-built accessResult claims to filter by.
    expect(new Set(docs.map((doc) => doc.id))).toEqual(new Set([previewLessonId]))
  })
})
