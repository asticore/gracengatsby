/**
 * Getting-started checklist items grouped by category.
 * Pure list definition with no state computation.
 */

export type GettingStartedItem = {
  id: string
  category: string
  title: string
  help: string
  href: string
}

export const GETTING_STARTED_ITEMS: GettingStartedItem[] = [
  // Site basics
  {
    id: 'site-name-logo',
    category: 'Site basics',
    title: 'Site name and logo',
    help: 'Add your site name and logo in General settings.',
    href: '/admin/settings/site',
  },
  {
    id: 'header',
    category: 'Site basics',
    title: 'Header',
    help: 'Customize the navigation header in Header/Footer settings.',
    href: '/admin/header-footer',
  },
  {
    id: 'footer',
    category: 'Site basics',
    title: 'Footer',
    help: 'Set up links and content in the footer in Header/Footer settings.',
    href: '/admin/header-footer',
  },
  {
    id: 'social-links',
    category: 'Site basics',
    title: 'Social links',
    help: 'Add your social media profiles in General settings.',
    href: '/admin/settings/site',
  },

  // Content
  {
    id: 'first-page',
    category: 'Content',
    title: 'First page published',
    help: 'Create and publish at least one page to get started.',
    href: '/admin/collections/pages',
  },
  {
    id: 'seo-basics',
    category: 'Content',
    title: 'SEO basics',
    help: 'Add page titles and descriptions in the SEO tab when editing pages.',
    href: '/admin/settings/marketing-seo',
  },

  // Connect services
  {
    id: 'connect-google',
    category: 'Connect services',
    title: 'Connect Google',
    help: 'Add GA4, GTM, or Search Console codes in Marketing & SEO settings.',
    href: '/admin/settings/marketing-seo',
  },

  // Communication
  {
    id: 'email-provider',
    category: 'Communication',
    title: 'Email provider',
    help: 'Configure your email service for forms and notifications.',
    href: '/admin/settings/communication',
  },

  // Shop
  {
    id: 'payments',
    category: 'Shop',
    title: 'Payments',
    help: 'Set up Stripe or PayPal in Commerce settings.',
    href: '/admin/settings/commerce',
  },

  // Security
  {
    id: 'security',
    category: 'Security',
    title: 'Security hardening',
    help: 'Enable 2FA and review access controls in Security settings.',
    href: '/admin/settings/security',
  },
  {
    id: 'backups-enabled',
    category: 'Security',
    title: 'Backups enabled',
    help: 'Enable automatic backups in Data & System settings.',
    href: '/admin/settings/data-system',
  },

  // Go live
  {
    id: 'custom-domain',
    category: 'Go live',
    title: 'Custom domain on HTTPS',
    help: 'Configure your custom domain and enable HTTPS.',
    href: '/admin/settings/site',
  },
  {
    id: 'redirects',
    category: 'Go live',
    title: 'Redirects set up',
    help: 'Create redirects for old URLs in Content settings.',
    href: '/admin/settings/content',
  },
]
