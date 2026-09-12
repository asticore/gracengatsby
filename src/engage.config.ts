import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@/engine/db'
import { richTextEditor } from '@/engine/editor'
import { buildConfig } from '@/engine'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@/engine/storage'
import { shopPlugin } from '@/engine/commerce'
import { stripeAdapter } from '@/engine/commerce/stripe'
import { countFaqs, createFaq, deleteFaq, findFaqByID, findFaqsPaginated, updateFaq } from '@/cms/db/collections/faqs'
import { countUsers, createUserAuthRow, deleteUser, findUserAuthRowsPaginated, updateUserAuthRow } from '@/cms/db/collections/users'
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

/**
 * The engine.db.ts cutover, one collection at a time.
 *
 * src/cms/db/ is our own from-scratch data layer, proven collection by
 * collection against Payload's real adapter via write-both-ways parity
 * tests (tests/int/cms-db-*.int.spec.ts) before ever touching this file.
 * Once a collection's ops are proven, it moves from "tested from the side"
 * to "actually serving the app" by adding its slug here - the adapter below
 * dispatches five methods (find/findOne/create/updateOne/deleteOne) plus
 * count to our own code for a cut-over collection's slug, and falls through
 * to the real base adapter for everything else. Every OTHER adapter method
 * (versions, drafts, joins, migrations, transactions, bulk update/delete,
 * upsert, jobs, ...) still goes to the real base adapter regardless - a
 * collection only qualifies for cutover once it needs none of those (no
 * `versions`, no `join` field pointing at it in a way that matters, no
 * bulk-select admin usage that would call updateMany/deleteMany). Faqs is
 * the first: scalar fields only, no drafts, no relationships even. The next
 * collection adds its own `if (slug === '...')` branch to each method below
 * (each one's real shape differs enough - different ops module, different
 * `defaultSort` field, whether it has drafts/relationships at all - that a
 * single shared dispatch table would just be indirection over the same
 * per-collection logic).
 *
 * Both sides read and write the exact same D1 tables with the exact same
 * schema (src/cms/db/schema/ is derived from these same collection configs
 * the real adapter also builds its schema from - see ./cms/db's own doc
 * comment), so dispatching per METHOD CALL rather than "swap the whole
 * adapter at once" is safe: a `find` routed through our code and an
 * `updateOne` on the same collection still routed through the real adapter
 * (before its slug is added here) see the same rows either way. There is no
 * split-brain risk, only a correctness risk in OUR code, which is exactly
 * what the parity tests below are for.
 *
 * Users was a deliberate holdout after Faqs (see below): Payload's own login
 * flow reads and overwrites this exact row directly (`payload.db.findOne`/
 * `updateOne` in payload/dist/auth/{operations/login,sessions}.js, not
 * through any Local API method the collection-cutover pattern usually gets
 * proven against first), so a subtly wrong `find`/`findOne`/`updateOne` here
 * would not just corrupt Users' own content - it would lock every admin out
 * of the site. Two things had to be proven before this could be wired in,
 * neither of which any earlier cutover needed:
 *
 *  - Payload's own failed-login tracking sends `{ loginAttempts: { $inc: 1 } }`
 *    to `payload.db.updateOne` (payload/dist/auth/strategies/local/
 *    incrementLoginAttempts.js) - an atomic increment, not a plain number,
 *    specifically so concurrent failed attempts can't race each other into
 *    losing an increment. ../cms/db/generic.ts's updateByID did not support
 *    this shape at all until applyAtomicIncrements was added - see its doc
 *    comment for the confirmed real-adapter mechanism this mirrors
 *    (`@payloadcms/drizzle`'s own `sql.raw(`${column} + ${n}`)`).
 *  - A real `payload.login()` had to be exercised end-to-end against THIS
 *    dispatch (not just the real base adapter, which every earlier proof-of-
 *    concept test used) through every attempt of a full lockout cycle -
 *    wrong password, wrong password again, ..., locked - to prove the
 *    increment and the eventual `lockUntil` write both land correctly and
 *    that a locked account is actually rejected. See
 *    tests/int/cms-db-users.int.spec.ts's lockout test.
 *
 * Both are now proven, so `users` is wired in below the same way Faqs is -
 * using the FULL auth-row ops (findUserAuthRowsPaginated/createUserAuthRow/
 * updateUserAuthRow from ../cms/db/collections/users.ts), never the narrow
 * UserDoc-typed ones, since Payload's own auth code needs hash/salt/
 * sessions/lockout columns round-tripped untouched on every call.
 */
const engageD1Adapter: typeof sqliteD1Adapter = (options) => {
  const base = sqliteD1Adapter(options)

  return {
    ...base,
    init: (initArgs) => {
      const adapter = base.init(initArgs)
      const execute = adapter.execute.bind(adapter)
      const baseFind = adapter.find.bind(adapter)
      const baseFindOne = adapter.findOne.bind(adapter)
      const baseCreate = adapter.create.bind(adapter)
      const baseUpdateOne = adapter.updateOne.bind(adapter)
      const baseDeleteOne = adapter.deleteOne.bind(adapter)
      const baseCount = adapter.count.bind(adapter)

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

      // Faqs' own `defaultSort: 'order'` (src/collections/Faqs.ts) has to be
      // applied here, not left to ../cms/db/where.ts's applySort - the real
      // base adapter's own `find` resolves a missing `sort` arg against the
      // collection config the SAME way (confirmed by reading
      // @payloadcms/drizzle's find.js directly: `sortArg ?? collectionConfig.defaultSort`)
      // before ever reaching its own orderBy builder, and skipping that step
      // here would silently change the admin list's default row order the
      // moment Faqs was cut over below.
      adapter.find = ((findArgs) => {
        if (findArgs.collection === 'faqs') {
          return findFaqsPaginated({
            where: findArgs.where,
            sort: findArgs.sort ?? Faqs.defaultSort,
            limit: findArgs.limit,
            page: findArgs.page,
            pagination: findArgs.pagination,
          })
        }
        // Users declares no `defaultSort` (see src/collections/Users.ts), so
        // there is nothing to fall back to beyond whatever `findArgs.sort`
        // already is - unlike Faqs, no config value needs resolving here.
        if (findArgs.collection === 'users') {
          return findUserAuthRowsPaginated({
            where: findArgs.where,
            sort: findArgs.sort,
            limit: findArgs.limit,
            page: findArgs.page,
            pagination: findArgs.pagination,
          })
        }
        return baseFind(findArgs)
      }) as typeof baseFind

      // Payload's own findByID/update-by-id/delete-by-id operations all
      // resolve the target row through `findOne` first (confirmed by reading
      // findByID.js/updateByID.js/deleteByID.js directly) - a plain `where`
      // lookup, no pagination concept, so this is `findFaqsPaginated` with
      // `limit: 1` rather than a separate code path.
      adapter.findOne = (async (findOneArgs) => {
        if (findOneArgs.collection === 'faqs') {
          const { docs } = await findFaqsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        // Payload's own login (`payload.db.findOne` by email/username, then
        // again by id to re-check lockUntil/loginAttempts after a correct
        // password - payload/dist/auth/operations/login.js) and session
        // writes (payload/dist/auth/sessions.js) both go through this exact
        // path - findUserAuthRowsPaginated returns the FULL auth row
        // (hash/salt/lockout/sessions), never the narrow UserDoc shape.
        if (findOneArgs.collection === 'users') {
          const { docs } = await findUserAuthRowsPaginated({ where: findOneArgs.where, limit: 1 })
          return docs[0] ?? null
        }
        return baseFindOne(findOneArgs)
      }) as typeof baseFindOne

      adapter.create = (createArgs) => {
        if (createArgs.collection === 'faqs') {
          return createFaq(createArgs.data as Parameters<typeof createFaq>[0]) as ReturnType<typeof baseCreate>
        }
        // Payload hashes a supplied `password` into salt/hash BEFORE calling
        // `payload.db.create` (the auth field's own beforeChange path), so
        // `createArgs.data` already carries salt/hash by the time it reaches
        // here - createUserAuthRow (unlike createUser) accepts and stores
        // them rather than silently dropping anything outside UserDoc's
        // narrower TS shape (which would have no runtime effect either way -
        // TS types don't filter object keys - but the wider type keeps this
        // callsite honest about what it actually needs to round-trip).
        if (createArgs.collection === 'users') {
          return createUserAuthRow(createArgs.data as Record<string, unknown>) as ReturnType<typeof baseCreate>
        }
        return baseCreate(createArgs)
      }

      // The real `update` operation always passes `id` directly for a plain
      // (non-bulk, non-version) update (confirmed by reading
      // collections/operations/utilities/update.js directly) - the `where`
      // branch only exists for a bulk/query-based update, which Faqs'
      // simple admin usage doesn't exercise, so it falls through to the real
      // adapter rather than being reimplemented here.
      adapter.updateOne = async (updateOneArgs) => {
        if (updateOneArgs.collection === 'faqs' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateFaq(Number(updateOneArgs.id), updateOneArgs.data)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        // Every real caller here (login's session write, incrementLoginAttempts'
        // `{ loginAttempts: { $inc: 1 } }`, resetLoginAttempts, addSessionToUser/
        // revokeSession's `updatedAt: null`) passes a plain `id`, never a
        // `where` - same as Faqs above. updateUserAuthRow -> ../cms/db/generic.ts's
        // updateByID, which now honors both of those (applyAtomicIncrements,
        // and the pre-existing `updatedAt: null` skip-touch).
        if (updateOneArgs.collection === 'users' && typeof updateOneArgs.id !== 'undefined') {
          const updated = await updateUserAuthRow(Number(updateOneArgs.id), updateOneArgs.data as Record<string, unknown>)
          return updated as Awaited<ReturnType<typeof baseUpdateOne>>
        }
        return baseUpdateOne(updateOneArgs)
      }

      // The real `deleteByID` operation always passes `where: { id: { equals } }`,
      // never a bare `id` (DeleteOneArgs has no `id` field at all - confirmed
      // against payload's own database/types.d.ts) - resolve the row the same
      // way findOne above does, snapshot it before deleting (deleteOne's own
      // return value IS the deleted document), then delete by id.
      adapter.deleteOne = async (deleteOneArgs) => {
        if (deleteOneArgs.collection === 'faqs') {
          const { docs } = await findFaqsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteFaq(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        if (deleteOneArgs.collection === 'users') {
          const { docs } = await findUserAuthRowsPaginated({ where: deleteOneArgs.where, limit: 1 })
          const doc = docs[0]
          if (!doc) return null as Awaited<ReturnType<typeof baseDeleteOne>>
          await deleteUser(doc.id)
          return doc as Awaited<ReturnType<typeof baseDeleteOne>>
        }
        return baseDeleteOne(deleteOneArgs)
      }

      adapter.count = (countArgs) => {
        if (countArgs.collection === 'faqs') {
          return countFaqs({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        if (countArgs.collection === 'users') {
          return countUsers({ where: countArgs.where }).then((totalDocs) => ({ totalDocs })) as ReturnType<typeof baseCount>
        }
        return baseCount(countArgs)
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
      // Guards document-edit views against a browser-extension DOM crash
      // (password managers injecting nodes into form fields) that otherwise
      // leaves the whole edit screen blank - see the component for the full
      // story. Wraps every admin screen; harmless everywhere else.
      providers: ['@/components/admin/ExtensionDomSafety#ExtensionDomSafetyProvider'],
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
  editor: richTextEditor(),
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
    shopPlugin({
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
              editor: richTextEditor(),
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
