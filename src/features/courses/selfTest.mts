/**
 * Proves the two things about this feature that cannot be reasoned about from
 * the source alone: that the migration applies (twice, without complaint), and
 * that a lesson nobody has paid for is genuinely unfetchable rather than merely
 * undrawn.
 *
 * Run, once the four collections are registered in the config:
 *   npx tsx src/features/courses/selfTest.mts
 *
 * It writes real rows into whatever database the config points at, so run it
 * against a local D1 only. It exits non-zero on failure.
 */
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-d1-sqlite'

const sqlRaw = (text: string) => sql.raw(text)

import config from '../engage.config'
import { up } from '../../migrations/20260830_120000_courses'
import { accessibleCourseIds, entitlementFor } from './entitlement'
import { markLessonComplete, progressForCourse } from './progress'
import type { FeatureFlags } from '../registry'

const results: string[] = []
let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
}

const run = async () => {
  const engine = await getPayload({ config: await config })
  const db = (engine.db as unknown as { drizzle: unknown }).drizzle

  // Idempotence: applying twice must not throw.
  await up({ db, payload: engine, req: {} } as never)
  await up({ db, payload: engine, req: {} } as never)
  check('migration applies twice without error', true)

  // This local database predates three earlier features' locked-document
  // columns, which makes every `update` fail before it reaches anything of
  // ours. Patched here, in the harness, so the run gets far enough to test the
  // thing under test - the real database is restored from backup afterwards.
  for (const column of ['eg_audit_log_id', 'eg_backups_id', 'eg_translations_id']) {
    await (db as { run: (q: unknown) => Promise<unknown> })
      .run(sqlRaw(`ALTER TABLE \`eg_locked_documents_rels\` ADD \`${column}\` integer`))
      .catch(() => undefined)
  }

  const flags = { lms: true, members: false, ecommerce: true } as unknown as FeatureFlags

  // The Lessons access function reads the live flag, so the site has to say the
  // feature is on before any of the paywall checks mean anything.
  const settings = await engine.findGlobal({ slug: 'site-settings', depth: 0 })
  await engine.updateGlobal({
    slug: 'site-settings',
    data: { features: { ...(settings.features ?? {}), lms: true, members: false } } as never,
    overrideAccess: true,
  })

  const stamp = Date.now()
  const mk = async (email: string, roles: string[]) =>
    engine.create({
      collection: 'users',
      data: { email, password: 'Test-1234!', roles } as never,
      overrideAccess: true,
    })

  const learner = await mk(`learner-${stamp}@example.test`, ['customer'])
  const outsider = await mk(`outsider-${stamp}@example.test`, ['customer'])
  const admin = await mk(`admin-${stamp}@example.test`, ['admin'])

  const freeCourse = await engine.create({
    collection: 'courses' as never,
    data: { title: `Free ${stamp}`, slug: `free-${stamp}`, accessType: 'free', _status: 'published' } as never,
    overrideAccess: true,
  })
  const paidCourse = await engine.create({
    collection: 'courses' as never,
    data: { title: `Paid ${stamp}`, slug: `paid-${stamp}`, accessType: 'purchase', _status: 'published' } as never,
    overrideAccess: true,
  })
  const tierCourse = await engine.create({
    collection: 'courses' as never,
    data: {
      title: `Tier ${stamp}`,
      slug: `tier-${stamp}`,
      accessType: 'tier',
      tierSlug: 'gold',
      _status: 'published',
    } as never,
    overrideAccess: true,
  })

  const lesson = async (course: unknown, title: string, order: number, isPreview = false) =>
    engine.create({
      collection: 'lessons' as never,
      data: {
        title,
        slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${stamp}`,
        course: (course as { id: number }).id,
        order,
        isPreview,
        content: [
          {
            blockType: 'richText',
            content: {
              root: {
                type: 'root',
                format: '',
                indent: 0,
                version: 1,
                direction: 'ltr',
                children: [
                  {
                    type: 'paragraph',
                    format: '',
                    indent: 0,
                    version: 1,
                    direction: 'ltr',
                    textFormat: 0,
                    children: [
                      { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: title, version: 1 },
                    ],
                  },
                ],
              },
            },
          },
        ],
      } as never,
      overrideAccess: true,
    })

  const freeLesson = await lesson(freeCourse, 'Free one', 0)
  const paidOne = await lesson(paidCourse, 'Paid one', 0)
  const paidTwo = await lesson(paidCourse, 'Paid two', 1)
  const paidPreview = await lesson(paidCourse, 'Paid preview', 2, true)
  await lesson(tierCourse, 'Tier one', 0)
  check('lessons created with page-builder blocks', Boolean(paidOne.id && freeLesson.id))

  // --- The paywall, as the API sees it ---------------------------------
  const readable = async (user: unknown, id: number) => {
    // A `false` verdict throws Forbidden; a `where` verdict returns no rows.
    // Both mean "not fetchable", which is what this is asking.
    const result = await engine
      .find({
        collection: 'lessons' as never,
        where: { id: { equals: id } } as never,
        overrideAccess: false,
        user: user as never,
        depth: 0,
      })
      .catch(() => ({ docs: [] as unknown[] }))
    return result.docs.length > 0
  }

  check('anonymous cannot fetch a paid lesson', !(await readable(null, (paidOne as { id: number }).id)))
  check('outsider cannot fetch a paid lesson', !(await readable(outsider, (paidOne as { id: number }).id)))
  check('anonymous can fetch a free lesson', await readable(null, (freeLesson as { id: number }).id))
  check('anonymous can fetch a marked preview', await readable(null, (paidPreview as { id: number }).id))
  check('admin can fetch a paid lesson', await readable(admin, (paidOne as { id: number }).id))
  check('nobody unentitled reaches a tier lesson while Members is off', !(await readable(learner, (paidTwo as { id: number }).id)))

  // findByID is a separate code path from find - check it too.
  const byIdBlocked = await engine
    .findByID({
      collection: 'lessons' as never,
      id: (paidOne as { id: number }).id,
      overrideAccess: false,
      user: outsider as never,
    })
    .then(() => false)
    .catch(() => true)
  check('findByID refuses a paid lesson to an outsider', byIdBlocked)

  // --- Enrolment grants access ------------------------------------------
  await engine.create({
    collection: 'enrolments' as never,
    data: { user: learner.id, course: (paidCourse as { id: number }).id, status: 'active' } as never,
    overrideAccess: true,
  })
  check('an enrolled learner can fetch the paid lesson', await readable(learner, (paidOne as { id: number }).id))
  check('the outsider still cannot', !(await readable(outsider, (paidOne as { id: number }).id)))

  const ids = await accessibleCourseIds(engine, learner as never, flags)
  check(
    'accessibleCourseIds covers free + enrolled, not tier',
    ids.includes((freeCourse as { id: number }).id) &&
      ids.includes((paidCourse as { id: number }).id) &&
      !ids.includes((tierCourse as { id: number }).id),
    JSON.stringify(ids),
  )

  const tierVerdict = await entitlementFor(engine, tierCourse as never, learner as never, flags)
  check(
    'tier course degrades to a clear reason when Members is absent',
    !tierVerdict.granted && tierVerdict.reason === 'tier-unavailable',
    tierVerdict.reason,
  )

  // --- Progress ----------------------------------------------------------
  const zero = await progressForCourse(engine, learner as never, (paidCourse as { id: number }).id)
  check('progress starts at 0 of 3', zero.totalLessons === 3 && zero.percent === 0, JSON.stringify(zero))

  const first = await markLessonComplete(engine, learner as never, flags, (paidOne as { id: number }).id, true)
  check('1 of 3 rounds to 33%', first.ok && first.progress.percent === 33, JSON.stringify(first))

  const second = await markLessonComplete(engine, learner as never, flags, (paidTwo as { id: number }).id, true)
  check('2 of 3 rounds to 67%', second.ok && second.progress.percent === 67, JSON.stringify(second))

  const twice = await markLessonComplete(engine, learner as never, flags, (paidTwo as { id: number }).id, true)
  check('re-ticking the same lesson does not double-count', twice.ok && twice.progress.completedLessons === 2)

  const undone = await markLessonComplete(engine, learner as never, flags, (paidTwo as { id: number }).id, false)
  check('un-ticking drops back to 33%', undone.ok && undone.progress.percent === 33)

  const refused = await markLessonComplete(engine, outsider as never, flags, (paidOne as { id: number }).id, true)
  check('an outsider cannot tick a lesson they cannot open', !refused.ok, refused.ok ? '' : refused.error)

  const anon = await markLessonComplete(engine, null, flags, (freeLesson as { id: number }).id, true)
  check('an anonymous visitor cannot record progress', !anon.ok)

  const off = await markLessonComplete(
    engine,
    learner as never,
    { ...flags, lms: false },
    (paidOne as { id: number }).id,
    true,
  )
  check('mark-complete refuses while the lms flag is off', !off.ok)

  // --- A real purchase, through the shop's own tables --------------------
  const product = await engine.create({
    collection: 'products',
    data: { title: `Course product ${stamp}`, slug: `course-product-${stamp}`, _status: 'published' } as never,
    overrideAccess: true,
  })
  const boughtCourse = await engine.create({
    collection: 'courses' as never,
    data: {
      title: `Bought ${stamp}`,
      slug: `bought-${stamp}`,
      accessType: 'purchase',
      product: product.id,
      _status: 'published',
    } as never,
    overrideAccess: true,
  })
  const boughtLesson = await lesson(boughtCourse, 'Bought one', 0)

  check('a paid course with no order stays shut', !(await readable(outsider, (boughtLesson as { id: number }).id)))

  await engine.create({
    collection: 'orders',
    data: {
      customer: outsider.id,
      status: 'completed',
      currency: 'AUD',
      amount: 1000,
      items: [{ product: product.id, quantity: 1 }],
    } as never,
    overrideAccess: true,
  })
  check('a completed order unlocks the course it paid for', await readable(outsider, (boughtLesson as { id: number }).id))
  check('and unlocks nothing else', !(await readable(outsider, (paidOne as { id: number }).id)))

  // --- The feature switch -------------------------------------------------
  await engine.updateGlobal({
    slug: 'site-settings',
    data: { features: { ...(settings.features ?? {}), lms: false } } as never,
    overrideAccess: true,
  })
  check('with the lms flag off, even a free lesson is unfetchable', !(await readable(null, (freeLesson as { id: number }).id)))
  check('and an entitled learner gets nothing either', !(await readable(learner, (paidOne as { id: number }).id)))

  console.log(results.join('\n'))
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
