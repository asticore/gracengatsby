/**
 * Server-only admin component registry: whole-screen views and the sidebar
 * nav/chrome components `engage.config.ts`'s `admin.components.*` originally
 * pointed the reference engine's generated importMap at.
 *
 * Deliberately separate from `./componentRegistry.ts` (field-level overrides
 * only) - see that file's own header for why: everything imported here
 * (directly or transitively) is free to touch the real engine/database,
 * because the ONLY consumer of this module is `./views/RootPage.tsx`, a
 * server component. Nothing in this file may be imported from a `'use
 * client'` file (`FieldRenderer.tsx` and everything under it).
 */

import { AdminNav } from '@/components/admin/nav/AdminNav'
import { ExtensionDomSafetyProvider } from '@/components/admin/ExtensionDomSafety'
import { AsticoreIcon } from '@/components/branding/AsticoreIcon'
import { AsticoreLogo } from '@/components/branding/AsticoreLogo'
import { Dashboard } from '@/views/dashboard/Dashboard'
import { SETTINGS_PAGE_VIEWS } from '@/admin/views/SettingsPageView'
import { HeaderFooterView } from '@/admin/views/HeaderFooterView'
import { TranslationsView } from '@/features/multilingual/views/TranslationsView'
import { DatabaseView } from '@/features/cleanup/DatabaseView'
import { ABResultsView } from '@/features/abTesting/components/ABResultsView'
import { VisualEditorView } from '@/views/VisualEditor'
import { RolesView } from '@/admin/views/RolesView'
import { SettingsTransferView } from '@/admin/views/SettingsTransferView'
import { FindReplaceView } from '@/admin/views/FindReplaceView'
import { SeoAuditView } from '@/admin/views/SeoAuditView'
import { ImportContentView } from '@/admin/views/ImportContentView'
import { SiteHealthView } from '@/admin/views/SiteHealthView'
import { ScheduledTasksView } from '@/admin/views/ScheduledTasksView'
import { CacheToolsView } from '@/admin/views/CacheToolsView'
import { GoogleConnectionView } from '@/admin/views/GoogleConnectionView'
import { ThemeStylesView } from '@/admin/views/ThemeStylesView'
import { EmailTestingView } from '@/admin/views/EmailTestingView'
import { EmailDesignerView } from '@/admin/views/EmailDesignerView'
import { CookieConsentView } from '@/admin/views/CookieConsentView'
import { ShopSettingsView } from '@/admin/views/ShopSettingsView'
import { StoreCreditView } from '@/admin/views/StoreCreditView'
import { ShopReportsView } from '@/admin/views/ShopReportsView'
import { DisplayCurrenciesView } from '@/admin/views/DisplayCurrenciesView'
import { AdsOverviewView, AdsReportView } from '@/features/ads/admin/AdsViews'
import { OptionsView } from '@/features/customFields/admin/OptionsView'
import { GoogleDashboardView } from '@/features/google/dashboard/GoogleDashboardView'

// Kept for parity with what `engage.config.ts`'s `admin.components` block
// still declares (Nav/providers/graphics overrides) even though nothing yet
// resolves them dynamically - AdminNav is used directly by RootLayout.tsx,
// not looked up by string, and Icon/Logo/providers have no runtime consumer
// of their own yet (a real gap, tracked in the plan doc, not something this
// registry split changes).
export { AdminNav, ExtensionDomSafetyProvider, AsticoreIcon, AsticoreLogo }

export const CUSTOM_ADMIN_VIEWS = [
  ...SETTINGS_PAGE_VIEWS,
  {
    key: 'dashboard',
    Component: Dashboard,
    path: '/',
  },
  {
    key: 'headerFooter',
    Component: HeaderFooterView,
    path: '/header-footer',
    meta: {
      title: 'Header and footer',
      description: 'Manage site header and footer content.',
    },
  },
  {
    key: 'translations',
    Component: TranslationsView,
    path: '/translations',
    meta: {
      title: 'Translations',
      description: 'Write every translation in one table.',
    },
  },
  {
    key: 'options',
    Component: OptionsView,
    path: '/options',
    meta: {
      title: 'Options pages',
      description: 'Site-wide custom field values.',
    },
  },
  {
    key: 'database',
    Component: DatabaseView,
    path: '/database',
    meta: {
      title: 'Database',
      description: 'Per-feature table usage and cleanup.',
    },
  },
  {
    key: 'abTestResults',
    Component: ABResultsView,
    path: '/ab-test-results',
    meta: {
      title: 'A/B test results',
      description: 'Per-variant visitors, conversions and confidence.',
    },
  },
  {
    key: 'visualEditor',
    Component: VisualEditorView,
    path: '/visual-editor/:mode/:slug/:id?',
    meta: {
      title: 'Visual Editor',
      description: 'Edit a page layout visually.',
    },
  },
  {
    key: 'roles',
    Component: RolesView,
    path: '/roles',
    meta: {
      title: 'Roles',
      description: 'Manage role permissions with a matrix grid.',
    },
  },
  {
    key: 'cookieConsent',
    Component: CookieConsentView,
    path: '/cookie-consent',
    meta: {
      title: 'Cookie consent',
      description: 'Customise the cookie banner, preview it and see the consent log.',
    },
  },
  {
    key: 'storeCredit',
    Component: StoreCreditView,
    path: '/store-credit',
    meta: { title: 'Store credit', description: 'Add or deduct store credit with a reason.' },
  },
  { key: 'shopReports', Component: ShopReportsView, path: '/shop-reports', meta: { title: 'Shop reports', description: 'Sales, refunds, customers, products, coupons, payments, locations, low stock and abandoned carts.' } },
  { key: 'displayCurrencies', Component: DisplayCurrenciesView, path: '/display-currencies', meta: { title: 'Display currencies', description: 'Show prices in other currencies. Shoppers always pay in the shop currency.' } },
  {
    key: 'shopSettings',
    Component: ShopSettingsView,
    path: '/shop-settings',
    meta: { title: 'Shop settings', description: 'Currency and units, payments, shipping, invoices, gift cards, checkout and emails.' },
  },
  { key: 'adsOverview', Component: AdsOverviewView, path: '/ads-overview', meta: { title: 'Ads overview', description: 'Status, placeholders and generated ads.txt lines.' } },
  { key: 'adsReport', Component: AdsReportView, path: '/ads-report', meta: { title: 'Ads report', description: 'Viewable impressions per ad unit.' } },
  { key: 'googleDashboard', Component: GoogleDashboardView, path: '/google-dashboard', meta: { title: 'Google dashboard', description: 'Search, visitors, PageSpeed and AdSense numbers from Google.' } },
  {
    key: 'settingsTransfer',
    Component: SettingsTransferView,
    path: '/settings-transfer',
    meta: {
      title: 'Export and import',
      description: 'Export settings, content and users, or import them from another site.',
    },
  },
  {
    key: 'findReplace',
    Component: FindReplaceView,
    path: '/find-replace',
    meta: {
      title: 'Find and replace',
      description: 'Change a word or phrase across pages, posts, products and events.',
    },
  },
  {
    key: 'googleConnection',
    Component: GoogleConnectionView,
    path: '/google-connection',
    meta: { title: 'Google connection', description: 'Connect Google Analytics, Search Console, Tag Manager and AdSense with your own Google Cloud client.' },
  },
  {
    key: 'themeStyles',
    Component: ThemeStylesView,
    path: '/theme-styles',
    meta: { title: 'Theming', description: 'Set the site colours, text styles, buttons and tables once and use them everywhere.' },
  },
  {
    key: 'cacheTools',
    Component: CacheToolsView,
    path: '/cache-tools',
    meta: { title: 'Cache tools', description: 'Clear the saved copies of your pages now, and switch Cloudflare development mode on or off.' },
  },
  {
    key: 'seoAudit',
    Component: SeoAuditView,
    path: '/seo-audit',
    meta: { title: 'SEO audit', description: 'Check every published page, post, product and event for SEO and readability problems.' },
  },
  {
    key: 'importContent',
    Component: ImportContentView,
    path: '/import-content',
    meta: { title: 'Import pages and posts', description: 'Bring pages and posts in from a WordPress export or a CSV file. Saved as drafts.' },
  },
  {
    key: 'emailTesting',
    Component: EmailTestingView,
    path: '/email-testing',
    meta: { title: 'Email testing', description: 'Check the email connection, send test emails and check the sending domain.' },
  },
  {
    key: 'emailDesigner',
    Component: EmailDesignerView,
    path: '/email-designer',
    meta: { title: 'Email designer', description: 'Design the look of automatic emails: logo, colours, buttons and content blocks.' },
  },
  {
    key: 'siteHealth',
    Component: SiteHealthView,
    path: '/site-health',
    meta: { title: 'Site health', description: 'Storage, scheduled job health, versions and the main site settings, with warnings.' },
  },
  {
    key: 'scheduledTasks',
    Component: ScheduledTasksView,
    path: '/scheduled-tasks',
    meta: { title: 'Scheduled tasks', description: 'Every timed job, its last result and the changes waiting to go live.' },
  },
] as const
