/**
 * The CMS's own data layer: schema generation (./schema/generate.ts), generic
 * find/create/update/delete/count with child tables for arrays, blocks,
 * hasMany relationships, select hasMany and joins (./generic.ts), versions and
 * drafts (createVersionsOps, createDraftOps), upload and auth columns.
 *
 * Each collection's own file in ./collections is a factory call plus the types
 * callers see. The long phase-by-phase design notes that used to live in this
 * comment are in git history (commit b4ad583 and earlier).
 *
 * See src/engine/index.ts for the seam and the rules that govern it.
 */

export * from './collections/faqs'
export * from './collections/redirects'
export * from './collections/media'
export * from './collections/eventRSVPs'
export * from './collections/membershipTiers'
export * from './collections/pageTemplates'
export * from './collections/events'
export * from './collections/pages'
export * from './collections/posts'
export * from './collections/courses'
export * from './collections/lessons'
export * from './collections/enrolments'
export * from './collections/lessonProgress'
export * from './collections/users'
export * from './collections/auditLog'
export * from './collections/backups'
export * from './collections/translations'
export * from './collections/memberships'
export * from './collections/formSubmissions'
export * from './collections/abTests'
export * from './collections/fieldGroups'
export * from './collections/forms'
export * from './collections/preferences'
export * from './collections/lockedDocuments'
export * from './globals/faqSettings'
export * from './globals/blogSettings'
export * from './globals/shopSettings'
export * from './globals/siteSettings'
export * from './globals/memberSettings'
export * from './globals/securitySettings'
export * from './globals/integrations'
export * from './globals/emailSettings'
export * from './globals/paymentSettings'
export * from './globals/formSettings'
export * from './globals/header'
export * from './globals/footer'
export * from './globals/languageSettings'
export * from './globals/seoSettings'
export * from './globals/speedSettings'
export * from './globals/mediaSettings'
export * from './globals/backupSettings'
export * from './collections/addresses'
export * from './collections/carts'
export * from './collections/orders'
export * from './collections/transactions'
export * from './collections/products'
export * from './collections/roles'
