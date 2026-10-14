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
 * assumed): the the reference engine collection/global `slug:` values are
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
import { FormDrafts } from '@/features/forms/collections/FormDrafts'
import { FormSubmissions } from '@/features/forms/collections/FormSubmissions'
import { Forms } from '@/features/forms/collections/Forms'
import { AuditLog } from '@/features/security/auditLogCollection'
import { EmailLog } from '@/collections/EmailLog'
import { ErrorLog } from '@/collections/ErrorLog'
import { Translations } from '@/features/multilingual/translationsCollection'
import { Backups } from '@/features/backups/collection'

import { EventRSVPs } from '@/collections/EventRSVPs'
import { Events } from '@/collections/Events'
import { Faqs } from '@/collections/Faqs'
import { FieldGroups } from '@/collections/FieldGroups'
import { Media } from '@/collections/Media'
import { PageTemplates } from '@/collections/PageTemplates'
import { ReusableSections } from '@/collections/ReusableSections'
import { Pages } from '@/collections/Pages'
import { LockedDocuments } from '@/collections/LockedDocuments'
import { Preferences } from '@/collections/Preferences'
import { Posts } from '@/collections/Posts'
import { Users } from '@/collections/Users'
import { applyImplicitAuthFields } from './sanitize'

import { Addresses } from '@/features/ecommerce/collections/Addresses'
import { Carts } from '@/features/ecommerce/collections/Carts'
import { Orders } from '@/features/ecommerce/collections/Orders'
import { Products } from '@/features/ecommerce/collections/Products'
import { Transactions } from '@/features/ecommerce/collections/Transactions'
import { Redirects } from '@/features/redirects/collection'
import { ShippingZones } from '@/features/ecommerce/collections/ShippingZones'
import { TaxRates } from '@/features/ecommerce/collections/TaxRates'
import { Coupons } from '@/features/ecommerce/collections/Coupons'
import { OrderRefunds } from '@/features/ecommerce/collections/OrderRefunds'
import {
  countShippingZones,
  createShippingZone,
  deleteShippingZone,
  findShippingZoneByID,
  findShippingZonesPaginated,
  updateShippingZone,
  countTaxRates,
  createTaxRate,
  deleteTaxRate,
  findTaxRateByID,
  findTaxRatesPaginated,
  updateTaxRate,
  countCoupons,
  createCoupon,
  deleteCoupon,
  findCouponByID,
  findCouponsPaginated,
  updateCoupon,
  countOrderRefunds,
  createOrderRefund,
  deleteOrderRefund,
  findOrderRefundByID,
  findOrderRefundsPaginated,
  updateOrderRefund,
} from '@/cms/db'
import { CreditLedger } from '@/features/ecommerce/collections/CreditLedger'
import { ShippingManifests } from '@/features/ecommerce/collections/ShippingManifests'
import {
  countShippingManifests,
  createShippingManifest,
  deleteShippingManifest,
  findShippingManifestByID,
  findShippingManifestsPaginated,
  updateShippingManifest,
} from '@/cms/db'
import { GiftCards } from '@/features/ecommerce/collections/GiftCards'
import { StoreCredits } from '@/features/ecommerce/collections/StoreCredits'
import {
  countCreditLedgerEntries,
  countGiftCards,
  countStoreCredits,
  createCreditLedgerEntry,
  createGiftCard,
  createStoreCredit,
  deleteCreditLedgerEntry,
  deleteGiftCard,
  deleteStoreCredit,
  findCreditLedgerEntriesPaginated,
  findCreditLedgerEntryByID,
  findGiftCardByID,
  findGiftCardsPaginated,
  findStoreCreditByID,
  findStoreCreditsPaginated,
  updateCreditLedgerEntry,
  updateGiftCard,
  updateStoreCredit,
} from '@/cms/db'
import { ProductAttributes } from '@/features/ecommerce/collections/ProductAttributes'
import { ProductReviews } from '@/features/ecommerce/collections/ProductReviews'
import { StockSubscriptions } from '@/features/ecommerce/collections/StockSubscriptions'
import { ShippingClasses } from '@/features/ecommerce/collections/ShippingClasses'
import {
  countStockSubscriptions,
  createStockSubscription,
  deleteStockSubscription,
  findStockSubscriptionByID,
  findStockSubscriptionsPaginated,
  updateStockSubscription,
} from '@/cms/db'
import {
  countProductAttributes,
  countProductReviews,
  countShippingClasses,
  createProductAttribute,
  createProductReview,
  createShippingClass,
  deleteProductAttribute,
  deleteProductReview,
  deleteShippingClass,
  findProductAttributeByID,
  findProductAttributesPaginated,
  findProductReviewByID,
  findProductReviewsPaginated,
  findShippingClassByID,
  findShippingClassesPaginated,
  updateProductAttribute,
  updateProductReview,
  updateShippingClass,
} from '@/cms/db'
import { AdPlacements } from '@/features/ads/collections/AdPlacements'
import { AdUnits } from '@/features/ads/collections/AdUnits'
import { AdSettings } from '@/features/ads/settings'
import { countAdPlacements, countAdUnits, createAdPlacement, createAdUnit, deleteAdPlacement, deleteAdUnit, findAdPlacementByID, findAdPlacementsPaginated, findAdSettings, findAdUnitByID, findAdUnitsPaginated, updateAdPlacement, updateAdSettings, updateAdUnit } from '@/cms/db/collections/ads'
import { ReviewEvents } from '@/features/approval/collection'
import { ApprovalWorkflows } from '@/features/approval/workflowCollection'
import { Roles } from '@/collections/Roles'
import { DataViews } from '@/features/dataViews/collections/DataViews'
import { countDataViews, createDataView, deleteDataView, findDataViewByID, findDataViewsPaginated, updateDataView } from '@/cms/db/collections/dataViews'

import { BackupSettings } from '@/globals/BackupSettings'
import { BlogSettings } from '@/globals/BlogSettings'
import { EmailSettings } from '@/globals/EmailSettings'
import { EmailTemplates } from '@/globals/EmailTemplates'
import { EmailBrand } from '@/globals/EmailBrand'
import { EmailSchedule } from '@/globals/EmailSchedule'
import { FaqSettings } from '@/globals/FaqSettings'
import { Footer } from '@/globals/Footer'
import { FormSettings } from '@/globals/FormSettings'
import { Header } from '@/globals/Header'
import { Integrations } from '@/globals/Integrations'
import { LanguageSettings } from '@/globals/LanguageSettings'
import { MediaSettings } from '@/globals/MediaSettings'
import { MemberSettings } from '@/globals/MemberSettings'
import { PaymentSettings } from '@/globals/PaymentSettings'
import { ShippingSettings } from '@/globals/ShippingSettings'
import { SecuritySettings } from '@/globals/SecuritySettings'
import { SeoSettings } from '@/globals/SeoSettings'
import { ShopSettings } from '@/globals/ShopSettings'
import { ShopExtraSettings } from '@/globals/ShopExtraSettings'
import { SitePages } from '@/globals/SitePages'
import { SiteDetails } from '@/globals/SiteDetails'
import { SiteSettings } from '@/globals/SiteSettings'
import { SpeedSettings } from '@/globals/SpeedSettings'

import {
  countABTests,
  countAddresses,
  countAuditLogEntries,
  countEmailLogEntries,
  countErrorLogEntries,
  countBackups,
  countCarts,
  countCourses,
  countEnrolments,
  countEventRSVPs,
  countEvents,
  countFaqs,
  countFieldGroups,
  countFormDrafts,
  countFormSubmissions,
  countForms,
  countLessonProgress,
  countLessons,
  countLockedDocuments,
  countMedia,
  countMembershipTiers,
  countMemberships,
  countOrders,
  countPageTemplates,
  countReusableSections,
  countPages,
  countPosts,
  countPreferences,
  countProducts,
  countRedirects,
  countApprovalWorkflows,
  countReviewEvents,
  countRoles,
  countTransactions,
  countTranslations,
  countUsers,
  createABTest,
  createAddress,
  createAuditLogEntry,
  createEmailLogEntry,
  createErrorLogEntry,
  createBackup,
  createCart,
  createCourse,
  createEnrolment,
  createEvent,
  createEventRSVP,
  createFaq,
  createFieldGroup,
  createForm,
  createFormDraft,
  createFormSubmission,
  createLesson,
  createLessonProgress,
  createLockedDocument,
  createMedia,
  createMembership,
  createMembershipTier,
  createOrder,
  createPage,
  createPageTemplate,
  createReusableSection,
  createPost,
  createPreference,
  createProduct,
  createRedirect,
  createApprovalWorkflow,
  createReviewEvent,
  createRole,
  createTransaction,
  createTranslation,
  createUser,
  deleteABTest,
  deleteAddress,
  deleteAuditLogEntry,
  deleteEmailLogEntry,
  deleteErrorLogEntry,
  deleteBackup,
  deleteCart,
  deleteCourse,
  deleteEnrolment,
  deleteEvent,
  deleteEventRSVP,
  deleteFaq,
  deleteFieldGroup,
  deleteForm,
  deleteFormDraft,
  deleteFormSubmission,
  deleteLesson,
  deleteLessonProgress,
  deleteLockedDocument,
  deleteMedia,
  deleteMembership,
  deleteMembershipTier,
  deleteOrder,
  deletePage,
  deletePageTemplate,
  deleteReusableSection,
  deletePost,
  deletePreference,
  deleteProduct,
  deleteRedirect,
  deleteApprovalWorkflow,
  deleteReviewEvent,
  deleteRole,
  deleteTransaction,
  deleteTranslation,
  deleteUser,
  findABTestByID,
  findABTestsPaginated,
  findAddressByID,
  findAddressesPaginated,
  findAuditLogEntriesPaginated,
  findEmailLogEntriesPaginated,
  findAuditLogEntryByID,
  findEmailLogEntryByID,
  findErrorLogEntriesPaginated,
  findErrorLogEntryByID,
  findBackupByID,
  findBackupsPaginated,
  findBackupSettings,
  findBlogSettings,
  findCartByID,
  findCartsPaginated,
  findCourseByID,
  findCoursesPaginated,
  findEmailSettings,
  findEmailTemplates,
  findEmailBrand,
  findEmailSchedule,
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
  findFormDraftByID,
  findFormDraftsPaginated,
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
  findLockedDocumentByID,
  findLockedDocumentsPaginated,
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
  findReusableSectionByID,
  findReusableSectionsPaginated,
  findPaymentSettings,
  findShippingSettings,
  updateShippingSettings,
  findPostByID,
  findPostsPaginated,
  findPreferenceByID,
  findPreferencesPaginated,
  findProductByID,
  findProductsPaginated,
  findRedirectByID,
  findRedirectsPaginated,
  findApprovalWorkflowByID,
  findApprovalWorkflowsPaginated,
  findReviewEventByID,
  findReviewEventsPaginated,
  findRoleByID,
  findRolesPaginated,
  findSecuritySettings,
  findSitePages,
  findSeoSettings,
  findShopExtraSettings,
  findShopSettings,
  findSiteDetails,
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
  updateEmailLogEntry,
  updateErrorLogEntry,
  updateBackup,
  updateBackupSettings,
  updateBlogSettings,
  updateCart,
  updateCourse,
  updateEmailSettings,
  updateEmailTemplates,
  updateEmailBrand,
  updateEmailSchedule,
  updateEnrolment,
  updateEvent,
  updateEventRSVP,
  updateFaq,
  updateFaqSettings,
  updateFieldGroup,
  updateFooter,
  updateForm,
  updateFormSettings,
  updateFormDraft,
  updateFormSubmission,
  updateHeader,
  updateIntegrations,
  updateLanguageSettings,
  updateLesson,
  updateLessonProgress,
  updateLockedDocument,
  updateMedia,
  updateMediaSettings,
  updateMembership,
  updateMemberSettings,
  updateMembershipTier,
  updateOrder,
  updatePage,
  updatePageTemplate,
  updateReusableSection,
  updatePaymentSettings,
  updatePost,
  updatePreference,
  updateProduct,
  updateRedirect,
  updateApprovalWorkflow,
  updateReviewEvent,
  updateRole,
  updateSecuritySettings,
  updateSitePages,
  updateSeoSettings,
  updateShopExtraSettings,
  updateShopSettings,
  updateSiteDetails,
  updateSiteSettings,
  updateSpeedSettings,
  updateTransaction,
  updateTranslation,
  updateUser,
  findPostVersionByID,
  findPostVersions,
  findPageVersionByID,
  findPageVersions,
  findEventVersionByID,
  findEventVersions,
  findCourseVersionByID,
  findCourseVersions,
  findProductVersionByID,
  findProductVersions,
} from '@/cms/db'
import type { CollectionDbOps, GlobalDbOps } from './operations'
import type { CollectionReadEntry, GlobalReadEntry, ReadRegistry } from './read-operations'

/** Type-erased doc shape every `CollectionDbOps`/`GlobalDbOps` map entry is cast to - see this file's header "TYPE-ERASURE NOTE". */
export type AnyDoc = Record<string, unknown> & { id: number }

 
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
    'email-log': collectionOps(createEmailLogEntry, updateEmailLogEntry, deleteEmailLogEntry, findEmailLogEntryByID),
    'error-log': collectionOps(createErrorLogEntry, updateErrorLogEntry, deleteErrorLogEntry, findErrorLogEntryByID),
    backups: collectionOps(createBackup, updateBackup, deleteBackup, findBackupByID),
    translations: collectionOps(createTranslation, updateTranslation, deleteTranslation, findTranslationByID),
    'field-groups': collectionOps(createFieldGroup, updateFieldGroup, deleteFieldGroup, findFieldGroupByID),
    'form-submissions': collectionOps(createFormSubmission, updateFormSubmission, deleteFormSubmission, findFormSubmissionByID),
    'form-drafts': collectionOps(createFormDraft, updateFormDraft, deleteFormDraft, findFormDraftByID),
    'ab-tests': collectionOps(createABTest, updateABTest, deleteABTest, findABTestByID),
    media: collectionOps(createMedia, updateMedia, deleteMedia, findMediaByID),
    memberships: collectionOps(createMembership, updateMembership, deleteMembership, findMembershipByID),
    'page-templates': collectionOps(createPageTemplate, updatePageTemplate, deletePageTemplate, findPageTemplateByID),
    'reusable-sections': collectionOps(createReusableSection, updateReusableSection, deleteReusableSection, findReusableSectionByID),
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
    'preferences': collectionOps(createPreference, updatePreference, deletePreference, findPreferenceByID),
    redirects: collectionOps(createRedirect, updateRedirect, deleteRedirect, findRedirectByID),
    'shipping-zones': collectionOps(createShippingZone, updateShippingZone, deleteShippingZone, findShippingZoneByID),
    'tax-rates': collectionOps(createTaxRate, updateTaxRate, deleteTaxRate, findTaxRateByID),
    'coupons': collectionOps(createCoupon, updateCoupon, deleteCoupon, findCouponByID),
    'order-refunds': collectionOps(createOrderRefund, updateOrderRefund, deleteOrderRefund, findOrderRefundByID),
    'product-attributes': collectionOps(createProductAttribute, updateProductAttribute, deleteProductAttribute, findProductAttributeByID),
    'shipping-classes': collectionOps(createShippingClass, updateShippingClass, deleteShippingClass, findShippingClassByID),
    'product-reviews': collectionOps(createProductReview, updateProductReview, deleteProductReview, findProductReviewByID),
    'stock-subscriptions': collectionOps(createStockSubscription, updateStockSubscription, deleteStockSubscription, findStockSubscriptionByID),
    'shipping-manifests': collectionOps(createShippingManifest, updateShippingManifest, deleteShippingManifest, findShippingManifestByID),
    'gift-cards': collectionOps(createGiftCard, updateGiftCard, deleteGiftCard, findGiftCardByID),
    'store-credits': collectionOps(createStoreCredit, updateStoreCredit, deleteStoreCredit, findStoreCreditByID),
    'credit-ledger': collectionOps(createCreditLedgerEntry, updateCreditLedgerEntry, deleteCreditLedgerEntry, findCreditLedgerEntryByID),
    'ad-units': collectionOps(createAdUnit as never, updateAdUnit as never, deleteAdUnit, findAdUnitByID as never),
    'ad-placements': collectionOps(createAdPlacement as never, updateAdPlacement as never, deleteAdPlacement, findAdPlacementByID as never),
    'review-events': collectionOps(createReviewEvent, updateReviewEvent, deleteReviewEvent, findReviewEventByID),
    'approval-workflows': collectionOps(createApprovalWorkflow, updateApprovalWorkflow, deleteApprovalWorkflow, findApprovalWorkflowByID),
    roles: collectionOps(createRole, updateRole, deleteRole, findRoleByID),
    'data-views': collectionOps(createDataView as never, updateDataView as never, deleteDataView, findDataViewByID as never),
    'locked-documents': collectionOps(createLockedDocument, updateLockedDocument, deleteLockedDocument, findLockedDocumentByID),
  },
  globals: {
    'faq-settings': globalOps(findFaqSettings, updateFaqSettings),
    'blog-settings': globalOps(findBlogSettings, updateBlogSettings),
    'site-pages': globalOps(findSitePages, updateSitePages),
    integrations: globalOps(findIntegrations, updateIntegrations),
    'payment-settings': globalOps(findPaymentSettings, updatePaymentSettings),
    'shipping-settings': globalOps(findShippingSettings, updateShippingSettings),
    'form-settings': globalOps(findFormSettings, updateFormSettings),
    'site-settings': globalOps(findSiteSettings, updateSiteSettings),
    'site-details': globalOps(findSiteDetails, updateSiteDetails),
    'member-settings': globalOps(findMemberSettings, updateMemberSettings),
    'email-settings': globalOps(findEmailSettings, updateEmailSettings),
    'email-templates': globalOps(findEmailTemplates, updateEmailTemplates),
    'email-brand': globalOps(findEmailBrand, updateEmailBrand),
    'email-schedule': globalOps(findEmailSchedule, updateEmailSchedule),
    'shop-settings': globalOps(findShopSettings, updateShopSettings),
    'shop-extra-settings': globalOps(findShopExtraSettings, updateShopExtraSettings),
    'security-settings': globalOps(findSecuritySettings, updateSecuritySettings),
    header: globalOps(findHeader, updateHeader),
    footer: globalOps(findFooter, updateFooter),
    'backup-settings': globalOps(findBackupSettings, updateBackupSettings),
    'language-settings': globalOps(findLanguageSettings, updateLanguageSettings),
    'seo-settings': globalOps(findSeoSettings, updateSeoSettings),
    'ad-settings': globalOps(findAdSettings as never, updateAdSettings as never),
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
    'email-log': readEntry(EmailLog, findEmailLogEntriesPaginated, findEmailLogEntryByID, countEmailLogEntries),
    'error-log': readEntry(ErrorLog, findErrorLogEntriesPaginated, findErrorLogEntryByID, countErrorLogEntries),
    backups: readEntry(Backups, findBackupsPaginated, findBackupByID, countBackups),
    translations: readEntry(Translations, findTranslationsPaginated, findTranslationByID, countTranslations),
    'field-groups': readEntry(FieldGroups, findFieldGroupsPaginated, findFieldGroupByID, countFieldGroups),
    'form-submissions': readEntry(FormSubmissions, findFormSubmissionsPaginated, findFormSubmissionByID, countFormSubmissions),
    'form-drafts': readEntry(FormDrafts, findFormDraftsPaginated, findFormDraftByID, countFormDrafts),
    'ab-tests': readEntry(ABTests, findABTestsPaginated, findABTestByID, countABTests),
    media: readEntry(Media, findMediaPaginated, findMediaByID, countMedia),
    memberships: readEntry(Memberships, findMembershipsPaginated, findMembershipByID, countMemberships),
    'page-templates': readEntry(PageTemplates, findPageTemplatesPaginated, findPageTemplateByID, countPageTemplates),
    'reusable-sections': readEntry(ReusableSections, findReusableSectionsPaginated, findReusableSectionByID, countReusableSections),
    forms: readEntry(Forms, findFormsPaginated, findFormByID, countForms),
    enrolments: readEntry(Enrolments, findEnrolmentsPaginated, findEnrolmentByID, countEnrolments),
    lessons: readEntry(Lessons, findLessonsPaginated, findLessonByID, countLessons),
    'lesson-progress': readEntry(LessonProgress, findLessonProgressPaginated, findLessonProgressByID, countLessonProgress),
    pages: readEntry(Pages, findPagesPaginated, findPageByID, countPages),
    events: readEntry(Events, findEventsPaginated, findEventByID, countEvents),
    courses: readEntry(Courses, findCoursesPaginated, findCourseByID, countCourses),
    posts: readEntry(Posts, findPostsPaginated, findPostByID, countPosts),
    users: readEntry(applyImplicitAuthFields(Users), findUsersPaginated, findUserByID, countUsers),
    addresses: readEntry(Addresses, findAddressesPaginated, findAddressByID, countAddresses),
    carts: readEntry(Carts, findCartsPaginated, findCartByID, countCarts),
    orders: readEntry(Orders, findOrdersPaginated, findOrderByID, countOrders),
    products: readEntry(Products, findProductsPaginated, findProductByID, countProducts),
    transactions: readEntry(Transactions, findTransactionsPaginated, findTransactionByID, countTransactions),
    'preferences': readEntry(Preferences, findPreferencesPaginated, findPreferenceByID, countPreferences),
    redirects: readEntry(Redirects, findRedirectsPaginated, findRedirectByID, countRedirects),
    'shipping-zones': readEntry(ShippingZones, findShippingZonesPaginated, findShippingZoneByID, countShippingZones),
    'tax-rates': readEntry(TaxRates, findTaxRatesPaginated, findTaxRateByID, countTaxRates),
    'coupons': readEntry(Coupons, findCouponsPaginated, findCouponByID, countCoupons),
    'order-refunds': readEntry(OrderRefunds, findOrderRefundsPaginated, findOrderRefundByID, countOrderRefunds),
    'product-attributes': readEntry(ProductAttributes, findProductAttributesPaginated, findProductAttributeByID, countProductAttributes),
    'shipping-classes': readEntry(ShippingClasses, findShippingClassesPaginated, findShippingClassByID, countShippingClasses),
    'product-reviews': readEntry(ProductReviews, findProductReviewsPaginated, findProductReviewByID, countProductReviews),
    'stock-subscriptions': readEntry(StockSubscriptions, findStockSubscriptionsPaginated, findStockSubscriptionByID, countStockSubscriptions),
    'shipping-manifests': readEntry(ShippingManifests, findShippingManifestsPaginated, findShippingManifestByID, countShippingManifests),
    'gift-cards': readEntry(GiftCards, findGiftCardsPaginated, findGiftCardByID, countGiftCards),
    'store-credits': readEntry(StoreCredits, findStoreCreditsPaginated, findStoreCreditByID, countStoreCredits),
    'credit-ledger': readEntry(CreditLedger, findCreditLedgerEntriesPaginated, findCreditLedgerEntryByID, countCreditLedgerEntries),
    'ad-units': readEntry(AdUnits, findAdUnitsPaginated as never, findAdUnitByID as never, countAdUnits),
    'ad-placements': readEntry(AdPlacements, findAdPlacementsPaginated as never, findAdPlacementByID as never, countAdPlacements),
    'review-events': readEntry(ReviewEvents, findReviewEventsPaginated, findReviewEventByID, countReviewEvents),
    'approval-workflows': readEntry(ApprovalWorkflows, findApprovalWorkflowsPaginated, findApprovalWorkflowByID, countApprovalWorkflows),
    roles: readEntry(Roles, findRolesPaginated, findRoleByID, countRoles),
    'data-views': readEntry(DataViews, findDataViewsPaginated as never, findDataViewByID as never, countDataViews),
    'locked-documents': readEntry(LockedDocuments, findLockedDocumentsPaginated, findLockedDocumentByID, countLockedDocuments),
  },
  globals: {
    'faq-settings': globalReadEntry(FaqSettings, findFaqSettings),
    'blog-settings': globalReadEntry(BlogSettings, findBlogSettings),
    integrations: globalReadEntry(Integrations, findIntegrations),
    'payment-settings': globalReadEntry(PaymentSettings, findPaymentSettings),
    'shipping-settings': globalReadEntry(ShippingSettings, findShippingSettings),
    'form-settings': globalReadEntry(FormSettings, findFormSettings),
    'site-settings': globalReadEntry(SiteSettings, findSiteSettings),
    'site-pages': globalReadEntry(SitePages, findSitePages),
    'site-details': globalReadEntry(SiteDetails, findSiteDetails),
    'member-settings': globalReadEntry(MemberSettings, findMemberSettings),
    'email-settings': globalReadEntry(EmailSettings, findEmailSettings),
    'email-templates': globalReadEntry(EmailTemplates, findEmailTemplates),
    'email-brand': globalReadEntry(EmailBrand, findEmailBrand),
    'email-schedule': globalReadEntry(EmailSchedule, findEmailSchedule),
    'shop-settings': globalReadEntry(ShopSettings, findShopSettings),
    'shop-extra-settings': globalReadEntry(ShopExtraSettings, findShopExtraSettings),
    'security-settings': globalReadEntry(SecuritySettings, findSecuritySettings),
    header: globalReadEntry(Header, findHeader),
    footer: globalReadEntry(Footer, findFooter),
    'backup-settings': globalReadEntry(BackupSettings, findBackupSettings),
    'language-settings': globalReadEntry(LanguageSettings, findLanguageSettings),
    'seo-settings': globalReadEntry(SeoSettings, findSeoSettings),
    'speed-settings': globalReadEntry(SpeedSettings, findSpeedSettings),
    'media-settings': globalReadEntry(MediaSettings, findMediaSettings),
    'ad-settings': globalReadEntry(AdSettings, findAdSettings as never),
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
/**
 * Versions read-side registry (Stage 7) - one entry per collection that
 * declares `versions.drafts` (posts, pages, events, courses, products), backing
 * `GET /api/<collection>/versions` and `GET/POST /api/<collection>/versions/:id`
 * in `./rest.ts`. `findAll` is `createVersionsOps.findAllByParentID` (one
 * parent's versions, newest first), `findByID` is the version row's OWN id.
 * Kept separate from `readRegistry`/`writeRegistry` because only rest.ts needs
 * it. A plain mutable object so unit tests can `vi.spyOn` individual entries.
 */
export type VersionsRegistryEntry = {
  findAll: (parentId: number) => Promise<Array<Record<string, unknown>>>
  findByID: (versionId: number) => Promise<Record<string, unknown> | null>
}
export const versionsRegistry: Record<string, VersionsRegistryEntry> = {
  posts: { findAll: findPostVersions as unknown as VersionsRegistryEntry['findAll'], findByID: findPostVersionByID as unknown as VersionsRegistryEntry['findByID'] },
  pages: { findAll: findPageVersions as unknown as VersionsRegistryEntry['findAll'], findByID: findPageVersionByID as unknown as VersionsRegistryEntry['findByID'] },
  events: { findAll: findEventVersions as unknown as VersionsRegistryEntry['findAll'], findByID: findEventVersionByID as unknown as VersionsRegistryEntry['findByID'] },
  courses: { findAll: findCourseVersions as unknown as VersionsRegistryEntry['findAll'], findByID: findCourseVersionByID as unknown as VersionsRegistryEntry['findByID'] },
  products: { findAll: findProductVersions as unknown as VersionsRegistryEntry['findAll'], findByID: findProductVersionByID as unknown as VersionsRegistryEntry['findByID'] },
}

export const collectionConfigs = [Faqs, EventRSVPs, MembershipTiers, AuditLog, EmailLog, ErrorLog, Backups, Translations, FieldGroups, FormSubmissions, ABTests, Media, Memberships, PageTemplates, ReusableSections, Forms, Enrolments, Lessons, LessonProgress, Pages, Events, Courses, Posts, Users, Redirects, ShippingZones, TaxRates, Coupons, OrderRefunds, ProductAttributes, ShippingClasses, ProductReviews, StockSubscriptions, GiftCards, StoreCredits, CreditLedger, ShippingManifests, ReviewEvents, ApprovalWorkflows, Roles, AdUnits, AdPlacements, DataViews, FormDrafts]

export const globalConfigs = [FaqSettings, BlogSettings, Integrations, PaymentSettings, ShippingSettings, FormSettings, SiteSettings, MemberSettings, EmailSettings, EmailTemplates, EmailBrand, EmailSchedule,ShopSettings, ShopExtraSettings, SiteDetails, SitePages, SecuritySettings,Header, Footer, BackupSettings, LanguageSettings, SeoSettings, SpeedSettings, MediaSettings, AdSettings]
