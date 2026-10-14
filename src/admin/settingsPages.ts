/**
 * Settings pages configuration for the refactored admin settings.
 *
 * Each page shows one or more global settings forms and optional link cards.
 * SETTINGS_PAGES is the single source of truth for /admin/settings/* structure.
 */

export interface SettingsSection {
  kind: 'global' | 'link'
}

export interface GlobalSection extends SettingsSection {
  kind: 'global'
  slug: string
}

export interface LinkSection extends SettingsSection {
  kind: 'link'
  label: string
  href: string
  description: string
  type: 'view' | 'collection'
}

export interface SettingsPage {
  /** Unique key for this page, used in route and registry */
  key: string
  /** URL path (e.g., /settings/site) */
  path: string
  /** Page title */
  title: string
  /** Short description */
  description: string
  /** Sections to render (globals and/or links) */
  sections: (GlobalSection | LinkSection)[]
  /** Extra card shown above the sections (a named card rendered by the settings client). */
  topCard?: 'pagespeed-worst'
}

/**
 * Picks the tab to show for a URL hash (with or without the leading '#').
 * Returns the hash's slug when it names one of `slugs`, otherwise the first slug
 * (or '' when there are none). Pure, so it can be unit tested.
 */
export function resolveActiveTab(hash: string, slugs: readonly string[]): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  let candidate = raw
  try {
    candidate = decodeURIComponent(raw)
  } catch {
    // Malformed escape sequence: fall back to the raw value.
  }
  if (candidate && slugs.includes(candidate)) return candidate
  return slugs[0] ?? ''
}

export const SETTINGS_PAGES: SettingsPage[] = [
  {
    key: 'site',
    path: '/settings/site',
    title: 'Site',
    description: 'Site name, logo, colors, fonts and basic brand settings.',
    sections: [
      { kind: 'global', slug: 'site-settings' },
      { kind: 'global', slug: 'site-pages' },
      { kind: 'global', slug: 'site-details' },
      { kind: 'global', slug: 'integrations' },
      { kind: 'link', label: 'Cookie consent', href: '/cookie-consent', description: 'Banner text, colours, preview and consent log', type: 'view' },
      { kind: 'global', slug: 'language-settings' },
      { kind: 'link', label: 'Translations', href: '/translations', description: 'Manage every translation in one table.', type: 'view' },
    ],
  },
  {
    key: 'marketing-seo',
    path: '/settings/marketing-seo',
    title: 'Marketing and SEO',
    description: 'Search engine optimization and redirects.',
    sections: [
      { kind: 'global', slug: 'seo-settings' },
      { kind: 'link', label: 'Redirects', href: '/collections/redirects', description: 'Create and manage URL redirects.', type: 'collection' },
    ],
  },
  {
    key: 'content',
    path: '/settings/content',
    title: 'Content',
    description: 'Blog, FAQ, forms and media library settings.',
    sections: [
      { kind: 'global', slug: 'blog-settings' },
      { kind: 'global', slug: 'faq-settings' },
      { kind: 'global', slug: 'form-settings' },
      { kind: 'global', slug: 'media-settings' },
      { kind: 'link', label: 'Options pages', href: '/options', description: 'Site-wide field values, such as contact details and opening hours.', type: 'view' },
    ],
  },
  {
    key: 'commerce',
    path: '/settings/commerce',
    title: 'Commerce',
    description: 'Shop, payments and membership settings.',
    sections: [
      { kind: 'link', label: 'Shop settings', href: '/shop-settings', description: 'Units, payments, shipping, invoices, gift cards, checkout and emails', type: 'view' },
      { kind: 'global', slug: 'shop-settings' },
      { kind: 'global', slug: 'payment-settings' },
      { kind: 'global', slug: 'shipping-settings' },
      { kind: 'global', slug: 'member-settings' },
    ],
  },
  {
    key: 'communication',
    path: '/settings/communication',
    title: 'Communication',
    description: 'Email provider and notification settings.',
    sections: [
      { kind: 'global', slug: 'email-settings' },
      { kind: 'global', slug: 'email-templates' },
      { kind: 'link', label: 'Email log', href: '/collections/email-log', description: 'Every email the site has sent, with a resend button.', type: 'collection' },
    ],
  },
  {
    key: 'speed',
    path: '/settings/speed',
    title: 'Speed',
    description: 'Caching and performance optimization settings.',
    topCard: 'pagespeed-worst',
    sections: [
      { kind: 'global', slug: 'speed-settings' },
    ],
  },
  {
    key: 'security',
    path: '/settings/security',
    title: 'Security',
    description: 'Password policies, 2FA and security options.',
    sections: [
      { kind: 'global', slug: 'security-settings' },
    ],
  },
  {
    key: 'data-system',
    path: '/settings/data-system',
    title: 'Data and System',
    description: 'Backups, database management and audit log.',
    sections: [
      { kind: 'global', slug: 'backup-settings' },
      { kind: 'link', label: 'Database', href: '/database', description: 'Per-feature table usage and cleanup.', type: 'view' },
      { kind: 'link', label: 'Users', href: '/collections/users', description: 'Manage admin user accounts.', type: 'collection' },
      { kind: 'link', label: 'Audit log', href: '/collections/audit-log', description: 'View a record of all admin changes.', type: 'collection' },
      { kind: 'link', label: 'Roles', href: '/roles', description: 'Manage role permissions with a matrix grid.', type: 'view' },
      { kind: 'link', label: 'Export and import', href: '/settings-transfer', description: 'Export settings, content and users, or import them from another site.', type: 'view' },
      { kind: 'link', label: 'Find and replace', href: '/find-replace', description: 'Change a word or phrase across pages, posts, products and events. Preview first.', type: 'view' },
    ],
  },
]
