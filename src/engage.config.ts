import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { stripeAdapter } from '@payloadcms/plugin-ecommerce/payments/stripe'
//import { payloadTotp } from 'payload-totp'
import {
  isAdmin,
  adminOnlyFieldAccess,
  isAuthenticated,
  isCustomer,
  adminOrPublishedStatus,
  isDocumentOwner,
} from './access/ecommerceAccess'
import { AUD } from './lib/currencies'
import { formatSlugHook } from './utilities/formatSlug'
import { pageBuilderBlocks } from './blocks'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Events } from './collections/Events'
import { EventRSVPs } from './collections/EventRSVPs'
import { Pages } from './collections/Pages'
import { PageTemplates } from './collections/PageTemplates'
import { Posts } from './collections/Posts'
import { Faqs } from './collections/Faqs'
import { FieldGroups } from './collections/FieldGroups'
import { AuditLog } from './features/security'
import { Forms, FormSubmissions } from './features/forms'
import { Backups } from './features/backups'
import { Translations } from './features/multilingual/translationsCollection'
import { MembershipTiers, Memberships } from './features/members'
import { membershipWebhooks } from './features/members/webhooks'
import { Courses, Lessons, Enrolments, LessonProgress } from './features/courses'
import { ABTests } from './features/abTesting'
import { Header } from './globals/Header'
import { Footer } from './globals/Footer'
import { SiteSettings } from './globals/SiteSettings'
import { Integrations } from './globals/Integrations'
import { BlogSettings } from './globals/BlogSettings'
import { FaqSettings } from './globals/FaqSettings'
import { ShopSettings } from './globals/ShopSettings'
import { SeoSettings } from './globals/SeoSettings'
import { SpeedSettings } from './globals/SpeedSettings'
import { MediaSettings } from './globals/MediaSettings'
import { EmailSettings } from './globals/EmailSettings'
import { BackupSettings } from './globals/BackupSettings'
import { MemberSettings } from './globals/MemberSettings'
import { SecuritySettings } from './globals/SecuritySettings'
import { LanguageSettings } from './globals/LanguageSettings'
import { PaymentSettings } from './globals/PaymentSettings'
import { FormSettings } from './globals/FormSettings'
import { seoFields } from './fields/seo'
import { customFieldsField } from './fields/customFields'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

// Detects a CLI invocation by matching the CMS engine's own bin path. The
// 'payload' segment here is the npm package directory name, not a label.
const isCLI = process.argv.some((value) => realpath(value).endsWith(path.join('payload', 'bin.js')))
const isProduction = process.env.NODE_ENV === 'production'

const createLog =
  (level: string, fn: typeof console.log) => (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      fn(JSON.stringify({ level, msg: objOrMsg }))
    } else {
      fn(JSON.stringify({ level, ...objOrMsg, msg: msg ?? (objOrMsg as { msg?: string }).msg }))
    }
  }

const cloudflareLogger = {
  level: process.env.ENGAGE_LOG_LEVEL || 'info',
  trace: createLog('trace', console.debug),
  debug: createLog('debug', console.debug),
  info: createLog('info', console.log),
  warn: createLog('warn', console.warn),
  error: createLog('error', console.error),
  fatal: createLog('fatal', console.error),
  silent: () => {},
} as any // Swap to the engine's logger type once it is exported

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

/**
 * The engine builds four collections of its own - migration history, admin
 * preferences, document locks and the KV store - and names their tables after
 * itself. They are not exposed as config options, so their `dbName` is set on
 * the sanitized config below, before the database adapter reads it to build
 * the schema.
 *
 * Mirrored by ENGINE_COLLECTION_TABLES in src/migrations/schema/engineTables.ts,
 * which is what actually moves the tables. Change one, change the other.
 */
const ENGINE_COLLECTION_TABLES: Record<string, string> = {
  'payload-migrations': 'eg_migrations',
  'payload-preferences': 'eg_preferences',
  'payload-locked-documents': 'eg_locked_documents',
  'payload-kv': 'eg_kv',
}

/**
 * The database adapter, with one probe corrected.
 *
 * Before running anything, the migration runner checks whether a migration
 * history table exists - and it builds that check from a hardcoded literal
 * rather than from the collection's `dbName`. So once the history table is
 * called `eg_migrations`, the check answers "no history table" against a
 * database that plainly has one, and the runner cheerfully replays the entire
 * chain from migration one. Which fails, loudly, on the first CREATE TABLE.
 *
 * Every other query the runner makes goes through the collection and so
 * already uses the right name; this is the single place the old name is baked
 * in. Rewriting just that one statement is far less invasive than keeping an
 * empty `payload_migrations` table around as a decoy, and it fails safe: if a
 * future version stops emitting this exact probe, the replacement simply never
 * matches and nothing changes.
 */
const MIGRATION_TABLE_PROBE = "name = 'payload_migrations'"

const engageD1Adapter: typeof sqliteD1Adapter = (options) => {
  const base = sqliteD1Adapter(options)

  return {
    ...base,
    init: (initArgs) => {
      const adapter = base.init(initArgs)
      const execute = adapter.execute.bind(adapter)

      adapter.execute = (opts) => {
        if (typeof opts?.raw === 'string' && opts.raw.includes(MIGRATION_TABLE_PROBE)) {
          return execute({
            ...opts,
            raw: opts.raw.replace(
              MIGRATION_TABLE_PROBE,
              `name = '${ENGINE_COLLECTION_TABLES['payload-migrations']}'`,
            ),
          })
        }
        return execute(opts)
      }

      return adapter
    },
  }
}

const config = buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
      // The CMS engine's import-map generator otherwise only looks for a route
      // group literally named `(payload)`. Ours is `(engage)`, so point the
      // generator at the real file rather than renaming the folder back.
      importMapFile: path.resolve(dirname, 'app/(engage)/admin/importMap.js'),
    },
    // Browser-tab identity for the whole portal. Every field here is set
    // explicitly: the CMS engine ships its own product name, description and
    // favicon as the defaults, and anything left unset falls back to those.
    // `icons` in particular must be provided or the engine's own favicon is
    // served from its UI package.
    meta: {
      title: 'Content Portal',
      titleSuffix: ' - Asticore Engage',
      description:
        'Asticore Engage - the content portal for the Grace & Gatsby website: pages, shop, events, posts and site settings.',
      keywords: 'Asticore Engage, Grace & Gatsby, content portal',
      icons: {
        icon: [{ rel: 'icon', type: 'image/svg+xml', url: '/asticore-icon.svg' }],
        shortcut: ['/asticore-icon.svg'],
        apple: [{ url: '/asticore-icon.svg' }],
      },
      openGraph: {
        siteName: 'Asticore Engage',
        title: 'Content Portal',
        description:
          'Asticore Engage - the content portal for the Grace & Gatsby website.',
      },
    },
    // 'all' exposes the Light / Dark / Auto choice in the account menu. Auto
    // sets no data-theme attribute, which is what lets the prefers-color-scheme
    // block in custom.css follow the operating system.
    theme: 'all',
    components: {
      graphics: {
        Icon: '@/components/branding/AsticoreIcon#AsticoreIcon',
        Logo: '@/components/branding/AsticoreLogo#AsticoreLogo',
      },
      // Custom sidebar: groups every collection/global under Content / Shop /
      // Settings (see navStructure.ts) and starts each group collapsed. The
      // Asticore teaser button is rendered inside it, so it no longer needs an
      // afterNavLinks entry.
      Nav: '@/components/admin/nav/AdminNav#AdminNav',
      views: {
        // Replaces the engine's default card grid. See views/dashboard for
        // what it does differently and why.
        dashboard: {
          Component: '@/views/dashboard/Dashboard#Dashboard',
        },
        translations: {
          Component: '@/features/multilingual/views/TranslationsView#TranslationsView',
          path: '/translations',
          meta: {
            title: 'Translations',
            description: 'Write every translation in one table.',
          },
        },
        database: {
          Component: '@/features/cleanup/DatabaseView#DatabaseView',
          path: '/database',
          meta: {
            title: 'Database',
            description: 'Per-feature table usage and cleanup.',
          },
        },
        abTestResults: {
          Component: '@/features/abTesting/components/ABResultsView#ABResultsView',
          path: '/ab-test-results',
          meta: {
            title: 'A/B test results',
            description: 'Per-variant visitors, conversions and confidence.',
          },
        },
        visualEditor: {
          Component: '@/views/VisualEditor#VisualEditorView',
          path: '/visual-editor/:mode/:slug/:id?',
          // Custom views fall back to the engine's own product name for their
          // tab title unless they set one, so this is set explicitly.
          meta: {
            title: 'Visual Editor',
            description: 'Edit a page layout visually.',
          },
        },
      },
    },
  },
  collections: [Users, Media, Events, EventRSVPs, Pages, PageTemplates, Posts, Faqs, FieldGroups, AuditLog, Forms, FormSubmissions, Backups, Translations, MembershipTiers, Memberships, Courses, Lessons, Enrolments, LessonProgress, ABTests],
  globals: [
    Header,
    Footer,
    SiteSettings,
    Integrations,
    BlogSettings,
    FaqSettings,
    ShopSettings,
    SeoSettings,
    SpeedSettings,
    MediaSettings,
    EmailSettings,
    BackupSettings,
    MemberSettings,
    SecuritySettings,
    LanguageSettings,
    PaymentSettings,
    FormSettings,
  ],
  editor: lexicalEditor(),
  // ENGAGE_SECRET is the preferred name; PAYLOAD_SECRET is kept as a fallback
  // so deployments that already set it keep working. The engine's own CLI
  // (`migrate`, `generate:*`) still reads PAYLOAD_SECRET directly before this
  // config is ever evaluated, so that variable must remain set for those
  // commands - see .env.example and the package.json scripts.
  secret: process.env.ENGAGE_SECRET || process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'engage-types.ts'),
  },
  db: engageD1Adapter({
    binding: cloudflare.env.D1,
    // Schema changes here go through migrations, always - production has no
    // other route, since the CLI cannot reach the real D1 from CI (see the
    // note on the binding in wrangler.jsonc). Leaving dev push on meant local
    // ran a different mechanism from production, which is exactly where the
    // eg_ rename came unstuck: push saw the renamed tables, decided columns
    // and indexes needed creating, and either prompted for input no one could
    // give or collided with what was already there. Off, dev matches
    // production: run `payload migrate` after changing the schema.
    push: false,
  }),
  logger: isProduction ? cloudflareLogger : undefined,
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: { media: true },
    }),
    ecommercePlugin({
      customers: { slug: 'users' },
      currencies: {
        defaultCurrency: 'AUD',
        supportedCurrencies: [AUD],
      },
      products: {
        // Keep the storefront simple for now - variants (size/colour) can be
        // switched on later without losing any existing product data.
        variants: false,
        productsCollectionOverride: ({ defaultCollection }) => ({
          ...defaultCollection,
          dbName: 'eg_products',
          admin: {
            ...defaultCollection.admin,
            useAsTitle: 'title',
            defaultColumns: ['title', 'category', 'priceInAUD', 'inventory', '_status'],
            components: {
              edit: {
                beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
              },
            },
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
            },
            {
              name: 'slug',
              type: 'text',
              unique: true,
              admin: {
                position: 'sidebar',
                description: 'Auto-fills from the title as you type - edit it here to override.',
                components: {
                  Field: '@/fields/slug/SlugComponent#SlugComponent',
                },
              },
              hooks: {
                beforeValidate: [formatSlugHook('title')],
              },
            },
            {
              name: 'category',
              type: 'select',
              options: [
                { label: 'Apparel', value: 'apparel' },
                { label: 'Accessories', value: 'accessories' },
                { label: 'Jewellery', value: 'jewellery' },
                { label: 'Homeware', value: 'homeware' },
                { label: 'Gifting', value: 'gifting' },
              ],
              admin: { position: 'sidebar' },
            },
            {
              name: 'shortDescription',
              type: 'textarea',
              admin: {
                description: 'Shown on product listing cards.',
              },
            },
            {
              name: 'description',
              type: 'richText',
              editor: lexicalEditor(),
            },
            {
              name: 'images',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
            },
            {
              name: 'faqs',
              type: 'relationship',
              relationTo: 'faqs',
              hasMany: true,
              admin: {
                position: 'sidebar',
                description: 'Shown in a FAQ section on the product page.',
              },
            },
            {
              name: 'layout',
              type: 'blocks',
              labels: { singular: 'Section', plural: 'Sections' },
              blocks: pageBuilderBlocks,
              admin: {
                description: 'Extra visually-editable sections shown below the product details (FAQs, galleries, etc).',
                initCollapsed: true,
              },
            },
            seoFields,
            customFieldsField,
            ...defaultCollection.fields,
          ],
        }),
      },
      // The remaining shop collections are created by the ecommerce plugin
      // rather than by us, so their table names can only be set through the
      // per-collection override hooks the plugin exposes. Each one spreads the
      // plugin's own default collection untouched and only adds `dbName`.
      // Passing an object here (instead of `true`) still enables the
      // collection - the plugin treats any truthy value as enabled.
      carts: {
        allowGuestCarts: true,
        cartsCollectionOverride: ({ defaultCollection }) => ({
          ...defaultCollection,
          dbName: 'eg_carts',
        }),
      },
      orders: {
        ordersCollectionOverride: ({ defaultCollection }) => ({
          ...defaultCollection,
          dbName: 'eg_orders',
        }),
      },
      transactions: {
        transactionsCollectionOverride: ({ defaultCollection }) => ({
          ...defaultCollection,
          dbName: 'eg_transactions',
        }),
      },
      addresses: {
        addressesCollectionOverride: ({ defaultCollection }) => ({
          ...defaultCollection,
          dbName: 'eg_addresses',
        }),
      },
      access: {
        isAdmin,
        adminOnlyFieldAccess,
        isAuthenticated,
        isCustomer,
        adminOrPublishedStatus,
        isDocumentOwner,
      },
      payments: {
        paymentMethods: [
          stripeAdapter({
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
            secretKey: process.env.STRIPE_SECRET_KEY || '',
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            webhooks: membershipWebhooks,
          }),
        ],
      },
    }),
    //payloadTotp({
    //  collection: 'users',
    //}),
  ],
})

export default config.then((sanitized) => {
  // Runs once, at module load, before the adapter's `init` walks
  // `config.collections` to build the schema - so setting `dbName` here has
  // exactly the same effect as setting it on a collection we own.
  for (const collection of sanitized.collections) {
    const dbName = ENGINE_COLLECTION_TABLES[collection.slug]
    if (dbName) {
      collection.dbName = dbName
    }
  }
  return sanitized
})

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction,
      } satisfies GetPlatformProxyOptions),
  )
}
