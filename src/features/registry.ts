/**
 * The single source of truth for every optional feature in the portal.
 *
 * One entry per feature describes: what it is called, which collections and
 * globals belong to it, and which database tables it owns. Everything else in
 * the system reads from here rather than hard-coding feature names:
 *
 *   - Site Settings renders one toggle per entry (see featureToggleField).
 *   - The admin sidebar hides a feature's collections/globals when it is off.
 *   - The storefront routes 404 when their feature is off.
 *   - The database cleanup tool uses `tables` to purge a disabled feature's
 *     data on request.
 *
 * Adding a feature means adding one entry here and nothing else structural.
 *
 * `tables` deliberately lists the BASE table names only. The cleanup tool
 * expands each into its real family at runtime - the CMS engine's SQLite adapter also
 * generates `<table>_rels`, `_<table>_v`, `<table>_locales` and one
 * `<table>_blocks_<block>` child per block type - because that expansion
 * changes as blocks are added and would rot if it were written out by hand.
 */

export type FeatureKey =
  | 'ecommerce'
  | 'events'
  | 'blog'
  | 'faq'
  | 'forms'
  | 'seo'
  | 'speed'
  | 'media'
  | 'email'
  | 'backups'
  | 'members'
  | 'abTesting'
  | 'security'
  | 'multilingual'
  | 'accounts'
  | 'lms'

export type FeatureDef = {
  key: FeatureKey
  label: string
  /** Shown under the toggle in Site Settings. */
  description: string
  /** Default state for a brand-new install. */
  defaultEnabled: boolean
  /** Collections hidden from the sidebar while this feature is off. */
  collections: string[]
  /** Globals hidden from the sidebar while this feature is off. */
  globals: string[]
  /** Base tables owned by this feature, for the database cleanup tool. */
  tables: string[]
  /**
   * True when the feature is wired end-to-end. False means the settings screen
   * exists and saves, but the behaviour behind it is still being built - the
   * toggle says so plainly rather than pretending to do something.
   */
  implemented: boolean
}

export const FEATURES: FeatureDef[] = [
  {
    key: 'ecommerce',
    label: 'Shop',
    description: 'Products, cart, checkout and orders.',
    defaultEnabled: true,
    collections: ['products', 'orders', 'transactions', 'carts', 'addresses'],
    globals: ['shop-settings'],
    tables: ['products', 'orders', 'transactions', 'carts', 'addresses'],
    implemented: true,
  },
  {
    key: 'events',
    label: 'Events',
    description: 'Events calendar and RSVPs.',
    defaultEnabled: true,
    collections: ['events', 'event-rsvps'],
    globals: [],
    tables: ['events', 'event_rsvps'],
    implemented: true,
  },
  {
    key: 'blog',
    label: 'Blog',
    description: 'Posts and the blog archive page.',
    defaultEnabled: false,
    collections: ['posts'],
    globals: ['blog-settings'],
    tables: ['posts'],
    implemented: true,
  },
  {
    key: 'faq',
    label: 'FAQs',
    description: 'Standalone FAQ / knowledge base page.',
    defaultEnabled: false,
    collections: ['faqs'],
    globals: ['faq-settings'],
    tables: ['faqs'],
    implemented: true,
  },
  {
    key: 'forms',
    label: 'Forms',
    description: 'Build forms and embed them as blocks. Supports submissions, calculations and payments.',
    defaultEnabled: false,
    collections: ['forms', 'form-submissions'],
    globals: [],
    tables: ['forms', 'form_submissions'],
    implemented: true,
  },
  {
    key: 'seo',
    label: 'SEO & Analytics',
    description: 'Site-wide and per-page SEO, plus analytics and tag manager embedding.',
    defaultEnabled: true,
    collections: ['redirects'],
    globals: ['seo-settings'],
    tables: ['redirects'],
    implemented: true,
  },
  {
    key: 'speed',
    label: 'Speed',
    description: 'Caching, asset optimisation and script-loading controls.',
    defaultEnabled: false,
    collections: [],
    globals: ['speed-settings'],
    tables: [],
    implemented: true,
  },
  {
    key: 'media',
    label: 'Media optimisation',
    description: 'Image compression, resizing and modern formats via Cloudflare.',
    defaultEnabled: false,
    collections: [],
    globals: ['media-settings'],
    tables: [],
    implemented: true,
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Choose the provider used to send transactional email.',
    defaultEnabled: false,
    collections: [],
    globals: ['email-settings'],
    tables: [],
    implemented: true,
  },
  {
    key: 'backups',
    label: 'Backups',
    description: 'Scheduled or manual backups to an external destination.',
    defaultEnabled: false,
    collections: ['backups'],
    globals: ['backup-settings'],
    tables: ['backups'],
    implemented: true,
  },
  {
    key: 'members',
    label: 'Members',
    description: 'Membership tiers, gated content and subscriptions.',
    defaultEnabled: false,
    collections: ['membership-tiers', 'memberships'],
    globals: ['member-settings'],
    tables: ['membership_tiers', 'memberships'],
    implemented: true,
  },
  {
    key: 'abTesting',
    label: 'A/B testing',
    description: 'Test variants of a template or block and track which performs better.',
    defaultEnabled: false,
    collections: ['ab-tests'],
    globals: [],
    tables: ['ab_tests'],
    implemented: true,
  },
  {
    key: 'security',
    label: 'Security',
    description: 'Login protection, headers, rate limiting and an audit log.',
    defaultEnabled: true,
    collections: ['membership-tiers', 'memberships'],
    globals: ['security-settings'],
    tables: ['membership_tiers', 'memberships'],
    implemented: true,
  },
  {
    key: 'multilingual',
    label: 'Multilingual',
    description: 'Translate content into additional languages.',
    defaultEnabled: false,
    collections: ['translations'],
    globals: ['language-settings'],
    tables: ['translations'],
    implemented: true,
  },
  {
    key: 'accounts',
    label: 'Customer accounts',
    description: 'Let visitors register and manage their own account.',
    defaultEnabled: false,
    collections: [],
    globals: [],
    tables: ['ab_tests', 'ab_events', 'ab_stats'],
    implemented: true,
  },
  {
    key: 'lms',
    label: 'Courses',
    description: 'Course content and student progress.',
    defaultEnabled: false,
    collections: ['courses', 'lessons', 'enrolments', 'lesson-progress'],
    globals: [],
    tables: ['courses', 'lessons', 'enrolments', 'lesson_progress'],
    implemented: true,
  },
]

export const FEATURE_MAP: Record<FeatureKey, FeatureDef> = Object.fromEntries(
  FEATURES.map((feature) => [feature.key, feature]),
) as Record<FeatureKey, FeatureDef>

export type FeatureFlags = Record<FeatureKey, boolean>

export const DEFAULT_FLAGS: FeatureFlags = Object.fromEntries(
  FEATURES.map((feature) => [feature.key, feature.defaultEnabled]),
) as FeatureFlags

/** Collections that only exist while their owning feature is enabled. */
export function collectionsForFeature(key: FeatureKey): string[] {
  return FEATURE_MAP[key]?.collections ?? []
}

/**
 * Reverse index: which feature owns a given collection/global slug.
 * Anything not owned by a feature is always visible.
 */
export const OWNER_OF_COLLECTION: Record<string, FeatureKey> = {}
export const OWNER_OF_GLOBAL: Record<string, FeatureKey> = {}

for (const feature of FEATURES) {
  for (const slug of feature.collections) OWNER_OF_COLLECTION[slug] = feature.key
  for (const slug of feature.globals) OWNER_OF_GLOBAL[slug] = feature.key
}

/** True when a collection should be visible given the current flags. */
export function isCollectionEnabled(slug: string, flags: FeatureFlags): boolean {
  const owner = OWNER_OF_COLLECTION[slug]
  return owner ? Boolean(flags[owner]) : true
}

/** True when a global should be visible given the current flags. */
export function isGlobalEnabled(slug: string, flags: FeatureFlags): boolean {
  const owner = OWNER_OF_GLOBAL[slug]
  return owner ? Boolean(flags[owner]) : true
}
