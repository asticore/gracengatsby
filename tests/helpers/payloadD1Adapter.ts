/**
 * TEST-ONLY: the D1 adapter the real-Payload oracle config uses. It routes
 * find/findOne/create/updateOne/deleteOne/count for every collection this app's
 * own data layer (src/cms/db) covers into that layer, and falls through to the
 * real `@payloadcms/db-d1-sqlite` adapter for everything else. See
 * ./payload.config.ts for why the oracle exists.
 */
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { countFaqs, createFaq, deleteFaq, findFaqByID, findFaqsPaginated, updateFaq } from '@/cms/db/collections/faqs'
import { countUsers, createUserAuthRow, deleteUser, findUserAuthRowsPaginated, updateUserAuthRow } from '@/cms/db/collections/users'
import { countEventRSVPs, createEventRSVP, deleteEventRSVP, findEventRSVPsPaginated, updateEventRSVP } from '@/cms/db/collections/eventRSVPs'
import { countMembershipTiers, createMembershipTier, deleteMembershipTier, findMembershipTiersPaginated, updateMembershipTier } from '@/cms/db/collections/membershipTiers'
import { countAuditLogEntries, createAuditLogEntry, deleteAuditLogEntry, findAuditLogEntriesPaginated, updateAuditLogEntry } from '@/cms/db/collections/auditLog'
import { countBackups, createBackup, deleteBackup, findBackupsPaginated, updateBackup } from '@/cms/db/collections/backups'
import { countTranslations, createTranslation, deleteTranslation, findTranslationsPaginated, updateTranslation } from '@/cms/db/collections/translations'
import { countMedia, createMedia, deleteMedia, findMediaPaginated, updateMedia } from '@/cms/db/collections/media'
import { countPageTemplates, createPageTemplate, deletePageTemplate, findPageTemplatesPaginated, updatePageTemplate } from '@/cms/db/collections/pageTemplates'
import { countFieldGroups, createFieldGroup, deleteFieldGroup, findFieldGroupsPaginated, updateFieldGroup } from '@/cms/db/collections/fieldGroups'
import { countForms, createForm, deleteForm, findFormsPaginated, updateForm } from '@/cms/db/collections/forms'
import { countFormSubmissions, createFormSubmission, deleteFormSubmission, findFormSubmissionsPaginated, updateFormSubmission } from '@/cms/db/collections/formSubmissions'
import { countMemberships, createMembership, deleteMembership, findMembershipsPaginated, updateMembership } from '@/cms/db/collections/memberships'
import { countABTests, createABTest, deleteABTest, findABTestsPaginated, updateABTest } from '@/cms/db/collections/abTests'
import { countLessons, createLesson, deleteLesson, findLessonsPaginated, updateLesson } from '@/cms/db/collections/lessons'
import { countEnrolments, createEnrolment, deleteEnrolment, findEnrolmentsPaginated, updateEnrolment } from '@/cms/db/collections/enrolments'
import { countLessonProgress, createLessonProgress, deleteLessonProgress, findLessonProgressPaginated, updateLessonProgress } from '@/cms/db/collections/lessonProgress'
import { countEvents, createEventLiveRow, deleteEvent, findEventsPaginated, updateEventLiveRow } from '@/cms/db/collections/events'
import { countPages, createPageLiveRow, deletePage, findPagesPaginated, updatePageLiveRow } from '@/cms/db/collections/pages'
import { countPosts, createPostLiveRow, deletePost, findPostsPaginated, updatePostLiveRow } from '@/cms/db/collections/posts'
import { countCourses, createCourseLiveRow, deleteCourse, findCoursesPaginated, updateCourseLiveRow } from '@/cms/db/collections/courses'

import { Faqs } from '@/collections/Faqs'
import { Lessons } from '@/features/courses'

/**
 * The engine builds four collections of its own - migration history, admin
 * preferences, document locks and the KV store - and names their tables after
 * itself. They are not exposed as config options, so their `dbName` is set on
 * the sanitized config below, before the database adapter reads it to build
 * the schema.
 *
 * Mirrored by ENGINE_COLLECTION_TABLES in src/migrations/schema/engineTables.ts,
 * which is what actually moves the tables. Change one, change the other.
 */
export const ENGINE_COLLECTION_TABLES: Record<string, string> = {
  'payload-migrations': 'eg_migrations',
  'payload-preferences': 'eg_preferences',
  'payload-locked-documents': 'eg_locked_documents',
  'payload-kv': 'eg_kv',
}

/**
 * The database adapter, with one probe corrected.
 *
 * Before running anything, the migration runner checks whether a migration
 * history table exists - and it builds that check from a hardcoded literal
 * rather than from the collection's `dbName`. So once the history table is
 * called `eg_migrations`, the check answers "no history table" against a
 * database that plainly has one, and the runner cheerfully replays the entire
 * chain from migration one. Which fails, loudly, on the first CREATE TABLE.
 *
 * Every other query the runner makes goes through the collection and so
 * already uses the right name; this is the single place the old name is baked
 * in. Rewriting just that one statement is far less invasive than keeping an
 * empty `payload_migrations` table around as a decoy, and it fails safe: if a
 * future version stops emitting this exact probe, the replacement simply never
 * matches and nothing changes.
 */
const MIGRATION_TABLE_PROBE = "name = 'payload_migrations'"

/**
 * The engine.db.ts cutover, one collection at a time (condensed; the full
 * narrative is in git history for this file's previous home, src/engage.config.ts).
 *
 * src/cms/db/ is this app's own data layer, proven collection by collection
 * against Payload's real adapter through write-both-ways parity specs
 * (tests/int/cms-db-*.int.spec.ts). This adapter dispatches find/findOne/create/
 * updateOne/deleteOne/count to that layer for a cut-over collection's slug and
 * falls through to the real base adapter for everything else (versions, drafts,
 * joins, migrations, transactions, bulk ops, jobs).
 *
 * Notes that matter when reading the branches below:
 *  - `defaultSort` is resolved here (`findArgs.sort ?? Config.defaultSort`) for
 *    collections that declare one (faqs, lessons), because the real adapter does
 *    the same before its own orderBy builder.
 *  - `users` uses the FULL auth-row ops (hash/salt/lockout/sessions round-trip),
 *    never the narrow UserDoc ones; Payload's login reads and overwrites that
 *    row directly (incl. the atomic `{ loginAttempts: { $inc: 1 } }` update).
 *  - The four draft-enabled collections (events, pages, posts, courses) dispatch
 *    create/updateOne/find/findOne to the plain baseOps "LiveRow" exports, NOT
 *    the createDraftOps-wrapped ones, so Payload's own saveVersion call stays
 *    the only writer of version rows (no double write). count/deleteOne reuse
 *    the existing exports unchanged. createVersion/findVersions/deleteVersions/
 *    queryDrafts/updateVersion are intentionally not intercepted.
 *  - Join fields (Courses.lessons, Events.rsvps) resolve inline in SQL against
 *    the real target tables, independent of which adapter serves a direct find.
 */
export const engageD1Adapter: typeof sqliteD1Adapter = (options) => {
  const base = sqliteD1Adapter(options)

  return {
    ...base,
    init: (initArgs) => {
      const adapter = base.init(initArgs)
      const execute = adapter.execute.bind(adapter)
      const baseFind = adapter.find.bind(adapter)
      const baseFindOne = adapter.findOne.bind(adapter)
      const baseCreate = adapter.create.bind(adapter)
      const baseUpdateOne = adapter.updateOne.bind(adapter)
      const baseDeleteOne = adapter.deleteOne.bind(adapter)
      const baseCount = adapter.count.bind(adapter)

      adapter.execute = (opts) => {
        if (typeof opts?.raw === 'string' && opts.raw.includes(MIGRATION_TABLE_PROBE)) {
          return execute({
            ...opts,
            raw: opts.raw.replace(
              MIGRATION_TABLE_PROBE,
              `name = '${ENGINE_COLLECTION_TABLES['payload-migrations']}'`,
            ),
          })
        }
        return execute(opts)
      }

      // Faqs' own `defaultSort: 'order'` (src/collections/Faqs.ts) has to be
      // applied here, not left to ../cms/db/where.ts's applySort - the real
      // base adapter's own `find` resolves a missing `sort` arg against the
      // collection config the SAME way (confirmed by reading
      // @payloadcms/drizzle's find.js directly: `sortArg ?? collectionConfig.defaultSort`)
      // before ever reaching its own orderBy builder, and skipping that step
      // here would silently change the admin list's default row order the
      // moment Faqs was cut over below.
      adapter.find = ((findArgs) => {
        if (findArgs.collection === 'faqs') {
          return findFaqsPaginated({
            where: findArgs.where,
            sort: findArgs.sort ?? Faqs.defaultSort,
            limit: findArgs.limit,
            page: findArgs.page,
            pagination: findArgs.pagination,
          })
        }
        // Users declares no `defaultSort` (see src/collections/Users.ts), so
        // there is nothing to fall back to beyond whatever `findArgs.sort`
        // already is - unlike Faqs, no config value needs resolving here.
        if (findArgs.collection === 'users') {
          return findUserAuthRowsPaginated({
            where: findArgs.where,
            sort: findArgs.sort,
            limit: findArgs.limit,
            page: findArgs.page,
            pagination: findArgs.pagination,
          })
        }
        // None of these five declare a `defaultSort` (see each config), so
        // there is nothing to fall back to beyond `findArgs.sort` as-is -
        // same as Users above.
        if (findArgs.collection === 'event-rsvps') {
          return findEventRSVPsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'membership-tiers') {
          return findMembershipTiersPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'audit-log') {
          return findAuditLogEntriesPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'backups') {
          return findBackupsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'translations') {
          return findTranslationsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        // None of these seven declare a `defaultSort` either (see each config).
        if (findArgs.collection === 'media') {
          return findMediaPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'page-templates') {
          return findPageTemplatesPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'field-groups') {
          return findFieldGroupsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'forms') {
          return findFormsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'form-submissions') {
          return findFormSubmissionsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'memberships') {
          return findMembershipsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'ab-tests') {
          return findABTestsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        // Lessons' own `defaultSort: 'order'` (src/features/courses/collections/
        // Lessons.ts) has to be resolved here the same way Faqs' is above - see
        // this dispatch's own doc comment for why cutting Lessons over does not
        // affect how Courses' `lessons` join is read.
        if (findArgs.collection === 'lessons') {
          return findLessonsPaginated({
            where: findArgs.where,
            sort: findArgs.sort ?? Lessons.defaultSort,
            limit: findArgs.limit,
            page: findArgs.page,
            pagination: findArgs.pagination,
          })
        }
        // Neither declares a `defaultSort` (see each config).
        if (findArgs.collection === 'enrolments') {
          return findEnrolmentsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'lesson-progress') {
          return findLessonProgressPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        // None of these four declares a `defaultSort` at its own top level
        // (see each config) - findXPaginated here is the plain baseOps
        // export, not the createDraftOps-wrapped one, per this dispatch's
        // own doc comment above.
        if (findArgs.collection === 'events') {
          return findEventsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'pages') {
          return findPagesPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'posts') {
          return findPostsPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        if (findArgs.collection === 'courses') {
          return findCoursesPaginated({ where: findArgs.where, sort: findArgs.sort, limit: findArgs.limit, page: findArgs.page, pagination: findArgs.pagination })
        }
        return baseFind(findArgs)
      }) as typeof baseFind

      // Payload's own findByID/update-by-id/delete-by-id operations all
      // resolve the target row through `findOne` first (confirmed by reading
      // findByID.js/updateByID.js/deleteByID.js directly) - a plain `where`
      // lookup, no pagination concept, so this is `findFaqsPaginated` with
      // `limit: 1` rather than a separate code path.
      adapter.findOne = (async (findOneArgs) => {
        if (findOneArgs.collection === 'faqs') {
          const { docs } = await findFaqsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        // Payload's own login (`payload.db.findOne` by email/username, then
        // again by id to re-check lockUntil/loginAttempts after a correct
        // password - payload/dist/auth/operations/login.js) and session
        // writes (payload/dist/auth/sessions.js) both go through this exact
        // path - findUserAuthRowsPaginated returns the FULL auth row
        // (hash/salt/lockout/sessions), never the narrow UserDoc shape.
        if (findOneArgs.collection === 'users') {
          const { docs } = await findUserAuthRowsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'event-rsvps') {
          const { docs } = await findEventRSVPsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'membership-tiers') {
          const { docs } = await findMembershipTiersPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'audit-log') {
          const { docs } = await findAuditLogEntriesPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'backups') {
          const { docs } = await findBackupsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'translations') {
          const { docs } = await findTranslationsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'media') {
          const { docs } = await findMediaPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'page-templates') {
          const { docs } = await findPageTemplatesPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'field-groups') {
          const { docs } = await findFieldGroupsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'forms') {
          const { docs } = await findFormsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'form-submissions') {
          const { docs } = await findFormSubmissionsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'memberships') {
          const { docs } = await findMembershipsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'ab-tests') {
          const { docs } = await findABTestsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'lessons') {
          const { docs } = await findLessonsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'enrolments') {
          const { docs } = await findEnrolmentsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'lesson-progress') {
          const { docs } = await findLessonProgressPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        // findXPaginated here is the plain baseOps export, not the
        // createDraftOps-wrapped findXByID - see this dispatch's own doc
        // comment above for why (Payload's real findOne never branches on
        // draft itself).
        if (findOneArgs.collection === 'events') {
          const { docs } = await findEventsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'pages') {
          const { docs } = await findPagesPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'posts') {
          const { docs } = await findPostsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        if (findOneArgs.collection === 'courses') {
          const { docs } = await findCoursesPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        return baseFindOne(findOneArgs)
      }) as typeof baseFindOne

      adapter.create = (createArgs) => {
        if (createArgs.collection === 'faqs') {
          return createFaq(createArgs.data as Parameters<typeof createFaq>[0]) as ReturnType<typeof baseCreate>
        }
        // Payload hashes a supplied `password` into salt/hash BEFORE calling
        // `payload.db.create` (the auth field's own beforeChange path), so
        // `createArgs.data` already carries salt/hash by the time it reaches
        // here - createUserAuthRow (unlike createUser) accepts and stores
        // them rather than silently dropping anything outside UserDoc's
        // narrower TS shape (which would have no runtime effect either way -
        // TS types don't filter object keys - but the wider type keeps this
        // callsite honest about what it actually needs to round-trip).
        if (createArgs.collection === 'users') {
          return createUserAuthRow(createArgs.data as Record<string, unknown>) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'event-rsvps') {
          return createEventRSVP(createArgs.data as Parameters<typeof createEventRSVP>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'membership-tiers') {
          return createMembershipTier(createArgs.data as Parameters<typeof createMembershipTier>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'audit-log') {
          return createAuditLogEntry(createArgs.data as Parameters<typeof createAuditLogEntry>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'backups') {
          return createBackup(createArgs.data as Parameters<typeof createBackup>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'translations') {
          return createTranslation(createArgs.data as Parameters<typeof createTranslation>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'media') {
          return createMedia(createArgs.data as Parameters<typeof createMedia>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'page-templates') {
          return createPageTemplate(createArgs.data as Parameters<typeof createPageTemplate>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'field-groups') {
          return createFieldGroup(createArgs.data as Parameters<typeof createFieldGroup>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'forms') {
          return createForm(createArgs.data as Parameters<typeof createForm>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'form-submissions') {
          return createFormSubmission(createArgs.data as Parameters<typeof createFormSubmission>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'memberships') {
          return createMembership(createArgs.data as Parameters<typeof createMembership>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'ab-tests') {
          return createABTest(createArgs.data as Parameters<typeof createABTest>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'lessons') {
          return createLesson(createArgs.data as Parameters<typeof createLesson>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'enrolments') {
          return createEnrolment(createArgs.data as Parameters<typeof createEnrolment>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'lesson-progress') {
          return createLessonProgress(createArgs.data as Parameters<typeof createLessonProgress>[0]) as ReturnType<typeof baseCreate>
        }
        // createXLiveRow here is the plain baseOps.create, deliberately NOT
        // the createDraftOps-wrapped createEvent/createPage/etc - see this
        // dispatch's own doc comment above for the double-write landmine
        // this avoids.
        if (createArgs.collection === 'events') {
          return createEventLiveRow(createArgs.data as Parameters<typeof createEventLiveRow>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'pages') {
          return createPageLiveRow(createArgs.data as Parameters<typeof createPageLiveRow>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'posts') {
          return createPostLiveRow(createArgs.data as Parameters<typeof createPostLiveRow>[0]) as ReturnType<typeof baseCreate>
        }
        if (createArgs.collection === 'courses') {
          return createCourseLiveRow(createArgs.data as Parameters<typeof createCourseLiveRow>[0]) as ReturnType<typeof baseCreate>
        }
        return baseCreate(createArgs)
      }

      // The real `update` operation always passes `id` directly for a plain
      // (non-bulk, non-version) update (confirmed by reading
      // collections/operations/utilities/update.js directly) - the `where`
      // branch only exists for a bulk/query-based update, which Faqs'
      // simple admin usage doesn't exercise, so it falls through to the real
      // adapter rather than being reimplemented here.
      adapter.updateOne = async (updateOneArgs) => {
        if (updateOneArgs.collection === 'faqs' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateFaq(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        // Every real caller here (login's session write, incrementLoginAttempts'
        // `{ loginAttempts: { $inc: 1 } }`, resetLoginAttempts, addSessionToUser/
        // revokeSession's `updatedAt: null`) passes a plain `id`, never a
        // `where` - same as Faqs above. updateUserAuthRow -> ../cms/db/generic.ts's
        // updateByID, which now honors both of those (applyAtomicIncrements,
        // and the pre-existing `updatedAt: null` skip-touch).
        if (updateOneArgs.collection === 'users' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateUserAuthRow(Number(updateOneArgs.id), updateOneArgs.data as Record<string, unknown>)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'event-rsvps' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateEventRSVP(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'membership-tiers' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateMembershipTier(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'audit-log' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateAuditLogEntry(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'backups' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateBackup(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'translations' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateTranslation(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'media' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateMedia(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'page-templates' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updatePageTemplate(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'field-groups' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateFieldGroup(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'forms' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateForm(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'form-submissions' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateFormSubmission(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'memberships' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateMembership(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'ab-tests' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateABTest(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'lessons' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateLesson(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'enrolments' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateEnrolment(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'lesson-progress' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateLessonProgress(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        // updateXLiveRow here is the plain baseOps.updateByID, deliberately
        // NOT the createDraftOps-wrapped updateEvent/updatePage/etc - same
        // double-write landmine as adapter.create above, see this
        // dispatch's own doc comment.
        if (updateOneArgs.collection === 'events' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateEventLiveRow(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'pages' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updatePageLiveRow(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'posts' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updatePostLiveRow(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        if (updateOneArgs.collection === 'courses' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateCourseLiveRow(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        return baseUpdateOne(updateOneArgs)
      }

      // The real `deleteByID` operation always passes `where: { id: { equals } }`,
      // never a bare `id` (DeleteOneArgs has no `id` field at all - confirmed
      // against payload's own database/types.d.ts) - resolve the row the same
      // way findOne above does, snapshot it before deleting (deleteOne's own
      // return value IS the deleted document), then delete by id.
      adapter.deleteOne = async (deleteOneArgs) => {
        if (deleteOneArgs.collection === 'faqs') {
          const { docs } = await findFaqsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteFaq(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'users') {
          const { docs } = await findUserAuthRowsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteUser(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'event-rsvps') {
          const { docs } = await findEventRSVPsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteEventRSVP(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'membership-tiers') {
          const { docs } = await findMembershipTiersPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteMembershipTier(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'audit-log') {
          const { docs } = await findAuditLogEntriesPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteAuditLogEntry(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'backups') {
          const { docs } = await findBackupsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteBackup(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'translations') {
          const { docs } = await findTranslationsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteTranslation(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'media') {
          const { docs } = await findMediaPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteMedia(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'page-templates') {
          const { docs } = await findPageTemplatesPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deletePageTemplate(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'field-groups') {
          const { docs } = await findFieldGroupsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteFieldGroup(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'forms') {
          const { docs } = await findFormsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteForm(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'form-submissions') {
          const { docs } = await findFormSubmissionsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteFormSubmission(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'memberships') {
          const { docs } = await findMembershipsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteMembership(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'ab-tests') {
          const { docs } = await findABTestsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteABTest(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'lessons') {
          const { docs } = await findLessonsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteLesson(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'enrolments') {
          const { docs } = await findEnrolmentsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteEnrolment(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'lesson-progress') {
          const { docs } = await findLessonProgressPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteLessonProgress(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        // deleteEvent/deletePage/deletePost/deleteCourse (createDraftOps-
        // wrapped) already equal the plain baseOps.deleteByID - createDraftOps
        // doesn't override delete (see this dispatch's own doc comment) - so
        // these are safe to reuse unchanged, resolved via each collection's
        // new plain findXPaginated the same way every branch above does.
        if (deleteOneArgs.collection === 'events') {
          const { docs } = await findEventsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteEvent(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'pages') {
          const { docs } = await findPagesPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deletePage(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'posts') {
          const { docs } = await findPostsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deletePost(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'courses') {
          const { docs } = await findCoursesPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteCourse(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        return baseDeleteOne(deleteOneArgs)
      }

      adapter.count = (countArgs) => {
        if (countArgs.collection === 'faqs') {
          return countFaqs({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'users') {
          return countUsers({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'event-rsvps') {
          return countEventRSVPs({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'membership-tiers') {
          return countMembershipTiers({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'audit-log') {
          return countAuditLogEntries({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'backups') {
          return countBackups({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'translations') {
          return countTranslations({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'media') {
          return countMedia({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'page-templates') {
          return countPageTemplates({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'field-groups') {
          return countFieldGroups({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'forms') {
          return countForms({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'form-submissions') {
          return countFormSubmissions({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'memberships') {
          return countMemberships({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'ab-tests') {
          return countABTests({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'lessons') {
          return countLessons({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'enrolments') {
          return countEnrolments({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'lesson-progress') {
          return countLessonProgress({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        // countEvents/countPages/countPosts/countCourses (createDraftOps-
        // wrapped) already equal the plain baseOps.count - createDraftOps
        // doesn't override count (see this dispatch's own doc comment).
        if (countArgs.collection === 'events') {
          return countEvents({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'pages') {
          return countPages({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'posts') {
          return countPosts({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'courses') {
          return countCourses({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        return baseCount(countArgs)
      }

      return adapter
    },
  }
}
