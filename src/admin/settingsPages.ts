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
}

export const SETTINGS_PAGES: SettingsPage[] = [
  {
    key: 'site',
    path: '/settings/site',
    title: 'Site',
    description: 'Site name, logo, colors, fonts and basic brand settings.',
    sections: [
      { kind: 'global', slug: 'site-settings' },
      { kind: 'global', slug: 'integrations' },
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
    ],
  },
  {
    key: 'commerce',
    path: '/settings/commerce',
    title: 'Commerce',
    description: 'Shop, payments and membership settings.',
    sections: [
      { kind: 'global', slug: 'shop-settings' },
      { kind: 'global', slug: 'payment-settings' },
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
    ],
  },
  {
    key: 'speed',
    path: '/settings/speed',
    title: 'Speed',
    description: 'Caching and performance optimization settings.',
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
    ],
  },
]
