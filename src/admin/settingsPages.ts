import { collectionRoute } from '@/admin/adminPaths'
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
    title: 'General',
    description: 'Site name, logo, colors, fonts and basic brand settings.',
    sections: [
      { kind: 'global', slug: 'site-settings' },
      { kind: 'global', slug: 'site-pages' },
      { kind: 'global', slug: 'site-details' },
      { kind: 'global', slug: 'integrations' },
      { kind: 'link', label: 'Cookie consent', href: '/cookie-consent', description: 'Banner text, colours, preview and consent log', type: 'view' },
      { kind: 'link', label: 'Google connection', href: '/google-connection', description: 'Connect Google Analytics, Search Console, Tag Manager and AdSense with your own Google Cloud client.', type: 'view' },
      { kind: 'link', label: 'Theming', href: '/theme-styles', description: 'Colours, text, buttons, tables, forms, layout and presets, set once for the whole site.', type: 'view' },
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
      { kind: 'link', label: 'Redirects', href: collectionRoute('redirects'), description: 'Create and manage URL redirects.', type: 'collection' },
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
      { kind: 'link', label: 'Display currencies', href: '/display-currencies', description: 'Show prices in other currencies. Shoppers always pay in the shop currency.', type: 'view' },
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
      {
        kind: 'link',
        label: 'Email and text connections',
        href: '/settings/site#integrations',
        description: 'Email and text providers are connected on the Integrations page. Keys are never shown here.',
        type: 'view',
      },
      { kind: 'global', slug: 'email-settings' },
      {
        kind: 'link',
        label: 'Email design',
        href: '/email-designer',
        description: 'Lay out the look of emails: logo, colours, buttons and content blocks.',
        type: 'view',
      },
      { kind: 'global', slug: 'email-brand' },
      { kind: 'global', slug: 'email-templates' },
      { kind: 'global', slug: 'email-schedule' },
      {
        kind: 'link',
        label: 'Abandoned cart emails',
        href: '/shop-settings',
        description: 'Sent to shoppers who leave items in their cart. Their delays are set under Shop settings > Emails.',
        type: 'view',
      },
      {
        kind: 'link',
        label: 'Email testing',
        href: '/email-testing',
        description: 'Check the email connection, send test copies of each email and check the sending domain.',
        type: 'view',
      },
      { kind: 'link', label: 'Email log', href: collectionRoute('email-log'), description: 'Every email the site has sent, with a resend button.', type: 'collection' },
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
      { kind: 'link', label: 'Cache tools', href: '/cache-tools', description: 'Clear saved page copies now, and switch Cloudflare development mode on or off.', type: 'view' },
    ],
  },
  {
    key: 'security',
    path: '/settings/security',
    title: 'Security',
    description: 'Password policies, 2FA and security options.',
    sections: [
      { kind: 'global', slug: 'security-settings' },
      { kind: 'link', label: 'Two-step sign-in', href: '/security/two-factor', description: 'Set up an authenticator app and backup codes for your own account.', type: 'view' },
      { kind: 'link', label: 'Signed-in devices', href: '/security/sessions', description: 'See where your account is signed in, sign out a device, or sign out an account you manage.', type: 'view' },
      { kind: 'link', label: 'Passkeys', href: '/security/passkeys', description: 'Register a passkey on your own account, and see whether the site allows passkeys for admins.', type: 'view' },
      { kind: 'link', label: 'API keys', href: '/security/api-keys', description: 'Create and revoke keys for scripts that call the site API. Admins see and revoke every key.', type: 'view' },
      { kind: 'link', label: 'Sign in as customer', href: '/security/impersonation', description: 'Admins: open a customer account for a short time, with a reason. Every start and stop is recorded in the history here.', type: 'view' },
      { kind: 'link', label: 'Organizations', href: '/security/organizations', description: 'Admins: every customer organization with its member count, and delete one. Switch the feature on above.', type: 'view' },
      { kind: 'link', label: 'Password groups', href: '/security/password-groups', description: 'Shared passwords that protect many pages, posts, products and events. Create, rotate or delete a group and see which content uses it.', type: 'view' },
      { kind: 'link', label: 'Security audit', href: '/security/audit', description: 'Admins: every sign-in, failed attempt, lockout and account security change, newest first, filterable by event or account.', type: 'view' },
      { kind: 'link', label: 'Connected accounts', href: '/security/social', description: 'Connect or disconnect Google, GitHub and other sign-in providers on your own account. Provider setup is above in Security > Social login.', type: 'view' },
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
      { kind: 'link', label: 'Site health', href: '/site-health', description: 'Storage, scheduled job health, versions and warnings.', type: 'view' },
      { kind: 'link', label: 'Scheduled tasks', href: '/scheduled-tasks', description: 'Every timed job, its last result and what is waiting to go live.', type: 'view' },
      { kind: 'link', label: 'Users', href: collectionRoute('users'), description: 'Manage admin user accounts.', type: 'collection' },
      { kind: 'link', label: 'Audit log', href: collectionRoute('audit-log'), description: 'View a record of all admin changes.', type: 'collection' },
      { kind: 'link', label: 'Error log', href: collectionRoute('error-log'), description: 'Errors the site ran into, with repeats counted once.', type: 'collection' },
      { kind: 'link', label: 'Roles', href: '/roles', description: 'Manage role permissions with a matrix grid.', type: 'view' },
      { kind: 'link', label: 'Export and import', href: '/settings-transfer', description: 'Export settings, content and users, or import them from another site.', type: 'view' },
      { kind: 'link', label: 'Find and replace', href: '/find-replace', description: 'Change a word or phrase across pages, posts, products and events. Preview first.', type: 'view' },
      { kind: 'link', label: 'Import pages and posts', href: '/import-content', description: 'Bring content in from a WordPress export or a CSV file. Imported items are saved as drafts.', type: 'view' },
    ],
  },
]
