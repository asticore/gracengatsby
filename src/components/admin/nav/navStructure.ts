/**
 * The admin sidebar's group structure.
 *
 * The CMS engine's default nav groups entities by each collection/global's own
 * `admin.group`, which means plugin-provided collections (products, orders,
 * carts...) land in whatever group the plugin chose, and anything without a
 * group falls into generic "Collections"/"Globals" buckets. Declaring the
 * structure here instead gives one obvious place to see and change the whole
 * sidebar, and lets us group plugin collections alongside our own.
 *
 * Order matters: groups render top-to-bottom in this order, and entities
 * render in the order listed within each group. Anything not listed here
 * still shows up, under the trailing "Other" group, so a newly added
 * collection is never silently hidden from the sidebar.
 */

export type NavEntityRef = {
  slug: string
  /**
   * 'collections' links to /admin/collections/<slug>, 'globals' to
   * /admin/globals/<slug>, and 'view' to a custom screen at /admin/<href> -
   * the translations table and the database tool are screens rather than
   * documents, so they have no collection to hang off.
   */
  type: 'collections' | 'globals' | 'view'
  /** Required for type 'view': the path under /admin. */
  href?: string
  /** Required for type 'view': there is no config entity to read a label from. */
  label?: string
}

export type NavGroupDef = {
  label: string
  entities: NavEntityRef[]
}

export const NAV_STRUCTURE: NavGroupDef[] = [
  {
    label: 'Content',
    entities: [
      { slug: 'pages', type: 'collections' },
      { slug: 'posts', type: 'collections' },
      { slug: 'header-footer', type: 'view', href: '/header-footer', label: 'Header and footer' },
      { slug: 'faqs', type: 'collections' },
      { slug: 'events', type: 'collections' },
      { slug: 'event-rsvps', type: 'collections' },
      { slug: 'page-templates', type: 'collections' },
      { slug: 'forms', type: 'collections' },
      { slug: 'form-submissions', type: 'collections' },
      { slug: 'ab-tests', type: 'collections' },
      { slug: 'ab-test-results', type: 'view', href: '/ab-test-results', label: 'A/B results' },
      { slug: 'field-groups', type: 'collections' },
      { slug: 'redirects', type: 'collections' },
      { slug: 'media', type: 'collections' },
    ],
  },
  {
    label: 'Shop',
    entities: [
      { slug: 'products', type: 'collections' },
      { slug: 'orders', type: 'collections' },
      { slug: 'transactions', type: 'collections' },
      { slug: 'carts', type: 'collections' },
      { slug: 'addresses', type: 'collections' },
    ],
  },
  {
    label: 'Members',
    entities: [
      { slug: 'membership-tiers', type: 'collections' },
      { slug: 'memberships', type: 'collections' },
    ],
  },
  {
    label: 'Courses',
    entities: [
      { slug: 'courses', type: 'collections' },
      { slug: 'lessons', type: 'collections' },
      { slug: 'enrolments', type: 'collections' },
      { slug: 'lesson-progress', type: 'collections' },
    ],
  },
  {
    label: 'Settings',
    entities: [
      { slug: 'settings-site', type: 'view', href: '/settings/site', label: 'Site' },
      { slug: 'settings-marketing-seo', type: 'view', href: '/settings/marketing-seo', label: 'Marketing and SEO' },
      { slug: 'settings-content', type: 'view', href: '/settings/content', label: 'Content' },
      { slug: 'settings-commerce', type: 'view', href: '/settings/commerce', label: 'Commerce' },
      { slug: 'settings-communication', type: 'view', href: '/settings/communication', label: 'Communication' },
      { slug: 'settings-speed', type: 'view', href: '/settings/speed', label: 'Speed' },
      { slug: 'settings-security', type: 'view', href: '/settings/security', label: 'Security' },
      { slug: 'settings-data-system', type: 'view', href: '/settings/data-system', label: 'Data and System' },
    ],
  },
]

/** Entities that should not appear in the nav, including the fallback "Other" group. */
export const HIDDEN_FROM_NAV = new Set<string>([
  'backups',
  'header',
  'footer',
  'site-settings',
  'language-settings',
  'seo-settings',
  'blog-settings',
  'faq-settings',
  'form-settings',
  'media-settings',
  'shop-settings',
  'payment-settings',
  'member-settings',
  'email-settings',
  'speed-settings',
  'security-settings',
  'backup-settings',
  'database',
  'audit-log',
  'users',
  'integrations',
  'translations',
])

/** Group that catches any collection/global not named in NAV_STRUCTURE. */
export const FALLBACK_GROUP_LABEL = 'Other'
