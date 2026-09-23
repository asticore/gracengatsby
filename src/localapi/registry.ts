/**
 * Stage 6a: the full slug -> {config, db-ops} wiring for all 21 real
 * collections and 17 real globals, assembled from the SAME real config
 * objects (`src/collections/*`, `src/globals/*`, `src/features/*`) and the
 * SAME real `src/cms/db` functions the existing Stage 1 parity tests
 * (`tests/int/localapi-read-operations-parity.int.spec.ts`,
 * `tests/int/localapi-operations-parity.int.spec.ts`) already prove correct
 * for a 5-7-entity subset - nothing here is a rewritten stand-in, this is
 * the same pattern generalized to every entity.
 *
 * Two registries:
 * - `readRegistry` (`ReadRegistry` from `./read-operations.ts`) - covers
 *   `find`/`findByID`/`count`/`findGlobal`.
 * - `writeRegistry` - covers `create`/`update`/`delete`/`updateGlobal`.
 *   `./operations.ts` deliberately does NOT own a registry itself (see that
 *   file's header, "Why a `db` parameter, not a hardcoded registry") - each
 *   `createDocument`/`updateDocument`/etc. call takes its `db: CollectionDbOps`
 *   directly, by design, so a future `createEngine()` (Stage 6c) needs
 *   somewhere to look up which `CollectionDbOps`/`GlobalDbOps` object to hand
 *   it for a given slug. This module is that lookup table - it does not
 *   change `operations.ts`'s own design, it's the caller `operations.ts`
 *   already expected to exist.
 *
 * SLUG NAMING, confirmed by reading every config file directly (not
 * assumed): the real Payload collection/global `slug:` values are
 * kebab-case (`'event-rsvps'`, `'page-templates'`, `'payment-settings'`,
 * ...) - the SAME strings every real `engine.find({collection: '...'})` /
 * `engine.findGlobal({slug: '...'})` call site in this app already uses.
 * The `src/cms/db` layer's own internal file/function names are camelCase
 * (`eventRSVPs`, `pageTemplates`, ...) - a completely different naming
 * convention for the same entities, used only for that layer's own
 * table/module identifiers. Both registries below are keyed by the real
 * kebab-case slug, matching every existing call site and every existing
 * parity test's registry keys (e.g. `'payment-settings'`, not
 * `paymentSettings`) - never the db-layer's internal camelCase name.
 *
 * VERSIONED COLLECTIONS (events, pages, posts, courses): each of these
 * collections' db file exports TWO families of ops - the plain
 * `create{X}`/`update{X}`/`find{X}ByID`/`delete{X}` names (built from
 * `createDraftOps(baseOps, versionsOps, ...)` - confirmed by reading
 * `src/cms/db/collections/events.ts` directly) which already implement this
 * app's real draft/publish policy end to end, and a second
 * `create{X}LiveRow`/`update{X}LiveRow` family (raw `baseOps`, bypassing
 * version bookkeeping entirely) used elsewhere for direct live-row writes.
 * Both registries below use ONLY the first (plain-named, `createDraftOps`-
 * backed) family - the `LiveRow` variants are a different, narrower tool
 * for a different job and are not part of this general CRUD surface.
 *
 * `users`' db file additionally exports a THIRD family
 * (`findUserAuthRowByID`/`updateUserAuthRow`/`createUserAuthRow`) used by
 * Stage 2's `auth.ts` for the auth-specific row shape - also not used here;
 * this registry's `users` entry uses the same plain
 * `create/update/find/deleteUser` family every other collection uses.
 *
 * TYPE-ERASURE NOTE: `CollectionDbOps<TDoc>` is generic per real doc type
 * (`FaqDoc`, `EventDoc`, ...), but a single `Record<string, CollectionDbOps<...>>`
 * needs one fixed type parameter for every entry. Real `create{X}` functions
 * take a narrower `data` parameter than `CollectionDbOps`'s
 * `(data: Record<string, unknown>) => ...` (contravariant position - unlike
 * the read side's covariant return types, which are directly assignable
 * with no cast per `ReadEntityConfig`'s/`CollectionReadEntry`'s own doc
 * comments), so each collection's ops object is cast at the boundary with
 * `as unknown as CollectionDbOps<AnyDoc>` - the same "real functions, cast
 * where a shared map needs one erased type" pattern already used throughout
 * this removal project (e.g. `localapi-migrate-fresh-install.int.spec.ts`'s
 * `REAL_MIGRATIONS` cast).
 */
import { ABTests } from '@/features/abTesting/collections/ABTests'
import { Courses } from '@/features/courses/collections/Courses'
import { Enrolments } from '@/features/courses/collections/Enrolments'
import { LessonProgress } from '@/features/courses/collections/LessonProgress'
import { Lessons } from '@/features/courses/collections/Lessons'
import { MembershipTiers } from '@/features/members/collections/MembershipTiers'
import { Memberships } from '@/features/members/collections/Memberships'
import { FormSubmissions } from '@/features/forms/collections/FormSubmissions'
import { Forms } from '@/features/forms/collections/Forms'
import { AuditLog } from '@/features/security/auditLogCollection'
import { Translations } from '@/features/multilingual/translationsCollection'
import { Backups } from '@/features/backups/collection'

import { EventRSVPs } from '@/collections/EventRSVPs'
import { Events } from '@/collections/Events'
import { Faqs } from '@/collections/Faqs'
import { FieldGroups } from '@/collections/FieldGroups'
import { Media } from '@/collections/Media'
import { PageTemplates } from '@/collections/PageTemplates'
import { Pages } from '@/collections/Pages'
import { Posts } from '@/collections/Posts'
import { Users } from '@/collections/Users'

import { Addresses } from '@/features/ecommerce/collections/Addresses'
import { Carts } from '@/features/ecommerce/collections/Carts'
import { Orders } from '@/features/ecommerce/collections/Orders'
import { Products } from '@/features/ecommerce/collections/Products'
import { Transactions } from '@/features/ecommerce/collections/Transactions'

import { BackupSettings } from '@/globals/BackupSettings'
import { BlogSettings } from '@/globals/BlogSettings'
import { EmailSettings } from '@/globals/EmailSettings'
import { FaqSettings } from '@/globals/FaqSettings'
import { Footer } from '@/globals/Footer'
import { FormSettings } from '@/globals/FormSettings'
import { Header } from '@/globals/Header'
import { Integrations } from '@/globals/Integrations'
import { LanguageSettings } from '@/globals/LanguageSettings'
import { MediaSettings } from '@/globals/MediaSettings'
import { MemberSettings } from '@/globals/MemberSettings'
import { PaymentSettings } from '@/globals/PaymentSettings'
import { SecuritySettings } from '@/globals/SecuritySettings'
import { SeoSettings } from '@/globals/SeoSettings'
import { ShopSettings } from '@/globals/ShopSettings'
import { SiteSettings } from '@/globals/SiteSettings'
import { SpeedSettings } from '@/globals/SpeedSettings'

import {
  countABTests,
  countAddresses,
  countAuditLogEntries,
  countBackups,
  countCarts,
  countCourses,
  countEnrolments,
  countEventRSVPs,
  countEvents,
  countFaqs,
  countFieldGroups,
  countFormSubmissions,
  countForms,
  countLessonProgress,
  countLessons,
  countMedia,
  countMembershipTiers,
  countMemberships,
  countOrders,
  countPageTemplates,
  countPages,
  countPosts,
  countProducts,
  countTransactions,
  countTranslations,
  countUsers,
  createABTest,
  createAddress,
  createAuditLogEntry,
  createBackup,
  createCart,
  createCourse,
  createEnrolment,
  createEvent,
  createEventRSVP,
  createFaq,
  createFieldGroup,
  createForm,
  createFormSubmission,
  createLesson,
  createLessonProgress,
  createMedia,
  createMembership,
  createMembershipTier,
  createOrder,
  createPage,
  createPageTemplate,
  createPost,
  createProduct,
  createTransaction,
  createTranslation,
  createUser,
  deleteABTest,
  deleteAddress,
  deleteAuditLogEntry,
  deleteBackup,
  deleteCart,
  deleteCourse,
  deleteEnrolment,
  deleteEvent,
  deleteEventRSVP,
  deleteFaq,
  deleteFieldGroup,
  deleteForm,
  deleteFormSubmission,
  deleteLesson,
  deleteLessonProgress,
  deleteMedia,
  deleteMembership,
  deleteMembershipTier,
  deleteOrder,
  deletePage,
  deletePageTemplate,
  deletePost,
  deleteProduct,
  deleteTransaction,
  deleteTranslation,
  deleteUser,
  findABTestByID,
  findABTestsPaginated,
  findAddressByID,
  findAddressesPaginated,
  findAuditLogEntriesPaginated,
  findAuditLogEntryByID,
  findBackupByID,
  findBackupsPaginated,
  findBackupSettings,
  findBlogSettings,
  findCartByID,
  findCartsPaginated,
  findCourseByID,
  findCoursesPaginated,
  findEmailSettings,
  findEnrolmentByID,
  findEnrolmentsPaginated,
  findEventByID,
  findEventRSVPByID,
  findEventRSVPsPaginated,
  findEventsPaginated,
  findFaqByID,
  findFaqsPaginated,
  findFaqSettings,
  findFieldGroupByID,
  findFieldGroupsPaginated,
  findFormByID,
  findFormsPaginated,
  findFormSettings,
  findFormSubmissionByID,
  findFormSubmissionsPaginated,
  findFooter,
  findHeader,
  findIntegrations,
  findLanguageSettings,
  findLessonByID,
  findLessonProgressByID,
  findLessonProgressPaginated,
  findLessonsPaginated,
  findMediaByID,
  findMediaPaginated,
  findMediaSettings,
  findMemberSettings,
  findMembershipByID,
  findMembershipsPaginated,
  findMembershipTierByID,
  findMembershipTiersPaginated,
  findOrderByID,
  findOrdersPaginated,
  findPageByID,
  findPagesPaginated,
  findPageTemplateByID,
  findPageTemplatesPaginated,
  findPaymentSettings,
  findPostByID,
  findPostsPaginated,
  findProductByID,
  findProductsPaginated,
  findSecuritySettings,
  findSeoSettings,
  findShopSettings,
  findSiteSettings,
  findSpeedSettings,
  findTransactionByID,
  findTransactionsPaginated,
  findTranslationByID,
  findTranslationsPaginated,
  findUserByID,
  findUsersPaginated,
  updateABTest,
  updateAddress,
  updateAuditLogEntry,
  updateBackup,
  updateBackupSettings,
  updateBlogSettings,
  updateCart,
  updateCourse,
  updateEmailSettings,
  updateEnrolment,
  updateEvent,
  updateEventRSVP,
  updateFaq,
  updateFaqSettings,
  updateFieldGroup,
  updateFooter,
  updateForm,
  updateFormSettings,
  updateFormSubmission,
  updateHeader,
  updateIntegrations,
  updateLanguageSettings,
  updateLesson,
  updateLessonProgress,
  updateMedia,
  updateMediaSettings,
  updateMembership,
  updateMemberSettings,
  updateMembershipTier,
  updateOrder,
  updatePage,
  updatePageTemplate,
  updatePaymentSettings,
  updatePost,
  updateProduct,
  updateSecuritySettings,
  updateSeoSettings,
  updateShopSettings,
  updateSiteSettings,
  updateSpeedSettings,
  updateTransaction,
  updateTranslation,
  updateUser,
} from '@/cms/db'

import type { CollectionDbOps, GlobalDbOps } from './operations'
import type { CollectionReadEntry, GlobalReadEntry, ReadRegistry } from './read-operations'

/** Type-erased doc shape every `CollectionDbOps`/`GlobalDbOps` map entry is cast to - see this file's header "TYPE-ERASURE NOTE". */
export type AnyDoc = Record<string, unknown> & { id: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- real create/updateByID params are narrower per-collection types (e.g. `{question: string, answer: unknown} & Partial<Omit<FaqDoc,...>>`); `any` here is a deliberate contravariance workaround so one shared, type-erased map can hold all 21 collections' real ops functions unmodified - see this file's header "TYPE-ERASURE NOTE". The outer `CollectionDbOps<AnyDoc>` cast on the return is what actually re-establishes a checked type for every caller of this map.
function collectionOps(
  create: (data: any) => Promise<any>,
  updateByID: (id: number, data: any, opts?: { draft?: boolean }) => Promise<any>,
  deleteByID: (id: number) => Promise<boolean>,
  findByID: (id: number, opts?: { draft?: boolean }) => Promise<any>,
): CollectionDbOps<AnyDoc> {
  return { create, updateByID, deleteByID, findByID } as unknown as CollectionDbOps<AnyDoc>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same contravariance workaround as collectionOps above, for globals' narrower per-entity `update` param types.
function globalOps(find: () => Promise<any>, update: (data: any) => Promise<any>): GlobalDbOps<AnyDoc> {
  return { find, update } as unknown as GlobalDbOps<AnyDoc>
}

/**
 * Write-side registry (`create`/`update`/`delete`/`updateGlobal`) - see this
 * file's header for why `./operations.ts` itself owns no such table.
 */
export const writeRegistry: {
  collections: Record<string, CollectionDbOps<AnyDoc>>
  globals: Record<string, GlobalDbOps<AnyDoc>>
} = {
  collections: {
    faqs: collectionOps(createFaq, updateFaq, deleteFaq, findFaqByID),
    'event-rsvps': collectionOps(createEventRSVP, updateEventRSVP, deleteEventRSVP, findEventRSVPByID),
    'membership-tiers': collectionOps(createMembershipTier, updateMembershipTier, deleteMembershipTier, findMembershipTierByID),
    'audit-log': collectionOps(createAuditLogEntry, updateAuditLogEntry, deleteAuditLogEntry, findAuditLogEntryByID),
    backups: collectionOps(createBackup, updateBackup, deleteBackup, findBackupByID),
    translations: collectionOps(createTranslation, updateTranslation, deleteTranslation, findTranslationByID),
    'field-groups': collectionOps(createFieldGroup, updateFieldGroup, deleteFieldGroup, findFieldGroupByID),
    'form-submissions': collectionOps(createFormSubmission, updateFormSubmission, deleteFormSubmission, findFormSubmissionByID),
    'ab-tests': collectionOps(createABTest, updateABTest, deleteABTest, findABTestByID),
    media: collectionOps(createMedia, updateMedia, deleteMedia, findMediaByID),
    memberships: collectionOps(createMembership, updateMembership, deleteMembership, findMembershipByID),
    'page-templates': collectionOps(createPageTemplate, updatePageTemplate, deletePageTemplate, findPageTemplateByID),
    forms: collectionOps(createForm, updateForm, deleteForm, findFormByID),
    enrolments: collectionOps(createEnrolment, updateEnrolment, deleteEnrolment, findEnrolmentByID),
    lessons: collectionOps(createLesson, updateLesson, deleteLesson, findLessonByID),
    'lesson-progress': collectionOps(createLessonProgress, updateLessonProgress, deleteLessonProgress, findLessonProgressByID),
    pages: collectionOps(createPage, updatePage, deletePage, findPageByID),
    events: collectionOps(createEvent, updateEvent, deleteEvent, findEventByID),
    courses: collectionOps(createCourse, updateCourse, deleteCourse, findCourseByID),
    posts: collectionOps(createPost, updatePost, deletePost, findPostByID),
    users: collectionOps(createUser, updateUser, deleteUser, findUserByID),
    addresses: collectionOps(createAddress, updateAddress, deleteAddress, findAddressByID),
    carts: collectionOps(createCart, updateCart, deleteCart, findCartByID),
    orders: collectionOps(createOrder, updateOrder, deleteOrder, findOrderByID),
    products: collectionOps(createProduct, updateProduct, deleteProduct, findProductByID),
    transactions: collectionOps(createTransaction, updateTransaction, deleteTransaction, findTransactionByID),
  },
  globals: {
    'faq-settings': globalOps(findFaqSettings, updateFaqSettings),
    'blog-settings': globalOps(findBlogSettings, updateBlogSettings),
    integrations: globalOps(findIntegrations, updateIntegrations),
    'payment-settings': globalOps(findPaymentSettings, updatePaymentSettings),
    'form-settings': globalOps(findFormSettings, updateFormSettings),
    'site-settings': globalOps(findSiteSettings, updateSiteSettings),
    'member-settings': globalOps(findMemberSettings, updateMemberSettings),
    'email-settings': globalOps(findEmailSettings, updateEmailSettings),
    'shop-settings': globalOps(findShopSettings, updateShopSettings),
    'security-settings': globalOps(findSecuritySettings, updateSecuritySettings),
    header: globalOps(findHeader, updateHeader),
    footer: globalOps(findFooter, updateFooter),
    'backup-settings': globalOps(findBackupSettings, updateBackupSettings),
    'language-settings': globalOps(findLanguageSettings, updateLanguageSettings),
    'seo-settings': globalOps(findSeoSettings, updateSeoSettings),
    'speed-settings': globalOps(findSpeedSettings, updateSpeedSettings),
    'media-settings': globalOps(findMediaSettings, updateMediaSettings),
  },
}

function readEntry(config: CollectionReadEntry['config'], findPaginated: CollectionReadEntry['findPaginated'], findByID: CollectionReadEntry['findByID'], count: CollectionReadEntry['count']): CollectionReadEntry {
  return { config, findPaginated, findByID, count }
}

function globalReadEntry(config: GlobalReadEntry['config'], find: GlobalReadEntry['find']): GlobalReadEntry {
  return { config, find }
}

/** Read-side registry (`find`/`findByID`/`count`/`findGlobal`) - see this file's header. */
export const readRegistry: ReadRegistry = {
  collections: {
    faqs: readEntry(Faqs, findFaqsPaginated, findFaqByID, countFaqs),
    'event-rsvps': readEntry(EventRSVPs, findEventRSVPsPaginated, findEventRSVPByID, countEventRSVPs),
    'membership-tiers': readEntry(MembershipTiers, findMembershipTiersPaginated, findMembershipTierByID, countMembershipTiers),
    'audit-log': readEntry(AuditLog, findAuditLogEntriesPaginated, findAuditLogEntryByID, countAuditLogEntries),
    backups: readEntry(Backups, findBackupsPaginated, findBackupByID, countBackups),
    translations: readEntry(Translations, findTranslationsPaginated, findTranslationByID, countTranslations),
    'field-groups': readEntry(FieldGroups, findFieldGroupsPaginated, findFieldGroupByID, countFieldGroups),
    'form-submissions': readEntry(FormSubmissions, findFormSubmissionsPaginated, findFormSubmissionByID, countFormSubmissions),
    'ab-tests': readEntry(ABTests, findABTestsPaginated, findABTestByID, countABTests),
    media: readEntry(Media, findMediaPaginated, findMediaByID, countMedia),
    memberships: readEntry(Memberships, findMembershipsPaginated, findMembershipByID, countMemberships),
    'page-templates': readEntry(PageTemplates, findPageTemplatesPaginated, findPageTemplateByID, countPageTemplates),
    forms: readEntry(Forms, findFormsPaginated, findFormByID, countForms),
    enrolments: readEntry(Enrolments, findEnrolmentsPaginated, findEnrolmentByID, countEnrolments),
    lessons: readEntry(Lessons, findLessonsPaginated, findLessonByID, countLessons),
    'lesson-progress': readEntry(LessonProgress, findLessonProgressPaginated, findLessonProgressByID, countLessonProgress),
    pages: readEntry(Pages, findPagesPaginated, findPageByID, countPages),
    events: readEntry(Events, findEventsPaginated, findEventByID, countEvents),
    courses: readEntry(Courses, findCoursesPaginated, findCourseByID, countCourses),
    posts: readEntry(Posts, findPostsPaginated, findPostByID, countPosts),
    users: readEntry(Users, findUsersPaginated, findUserByID, countUsers),
    addresses: readEntry(Addresses, findAddressesPaginated, findAddressByID, countAddresses),
    carts: readEntry(Carts, findCartsPaginated, findCartByID, countCarts),
    orders: readEntry(Orders, findOrdersPaginated, findOrderByID, countOrders),
    products: readEntry(Products, findProductsPaginated, findProductByID, countProducts),
    transactions: readEntry(Transactions, findTransactionsPaginated, findTransactionByID, countTransactions),
  },
  globals: {
    'faq-settings': globalReadEntry(FaqSettings, findFaqSettings),
    'blog-settings': globalReadEntry(BlogSettings, findBlogSettings),
    integrations: globalReadEntry(Integrations, findIntegrations),
    'payment-settings': globalReadEntry(PaymentSettings, findPaymentSettings),
    'form-settings': globalReadEntry(FormSettings, findFormSettings),
    'site-settings': globalReadEntry(SiteSettings, findSiteSettings),
    'member-settings': globalReadEntry(MemberSettings, findMemberSettings),
    'email-settings': globalReadEntry(EmailSettings, findEmailSettings),
    'shop-settings': globalReadEntry(ShopSettings, findShopSettings),
    'security-settings': globalReadEntry(SecuritySettings, findSecuritySettings),
    header: globalReadEntry(Header, findHeader),
    footer: globalReadEntry(Footer, findFooter),
    'backup-settings': globalReadEntry(BackupSettings, findBackupSettings),
    'language-settings': globalReadEntry(LanguageSettings, findLanguageSettings),
    'seo-settings': globalReadEntry(SeoSettings, findSeoSettings),
    'speed-settings': globalReadEntry(SpeedSettings, findSpeedSettings),
    'media-settings': globalReadEntry(MediaSettings, findMediaSettings),
  },
}

/**
 * The same 21 real collection / 17 real global config objects above, as
 * flat arrays - for Stage 6c's `createEngine()` (`./engine.ts`), which needs
 * to hand them to `./config.ts`'s `buildEngineConfig`/`buildEngineCollectionEntries`
 * (Stage 4) to build `.config`/`.collections`. Exported from here rather
 * than re-imported a second time in `engine.ts`, so there is exactly one
 * place that lists "the 21 collections"/"the 17 globals" for this app - the
 * same single-source-of-truth reasoning the registries above already follow.
 */
export const collectionConfigs = [Faqs, EventRSVPs, MembershipTiers, AuditLog, Backups, Translations, FieldGroups, FormSubmissions, ABTests, Media, Memberships, PageTemplates, Forms, Enrolments, Lessons, LessonProgress, Pages, Events, Courses, Posts, Users]

export const globalConfigs = [FaqSettings, BlogSettings, Integrations, PaymentSettings, FormSettings, SiteSettings, MemberSettings, EmailSettings, ShopSettings, SecuritySettings, Header, Footer, BackupSettings, LanguageSettings, SeoSettings, SpeedSettings, MediaSettings]
