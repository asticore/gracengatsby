/**
 * TEST-ONLY real-Payload config (the "oracle").
 *
 * Production no longer uses Payload at all (payload-removal-plan.md). This
 * file survives only so the parity specs under tests/int/ (`localapi-*-parity`,
 * `cms-db-*`, `api*.int.spec.ts`) can keep comparing this app's own
 * implementation against real Payload's behaviour, fed by the same collection
 * and global configs. It is reached through the `@engage-config` alias
 * (tsconfig.json) and is not imported by anything under src/. Delete it,
 * those specs, and the `payload`/`@payloadcms/*` devDependencies together when
 * the parity suite is retired.
 */
import fs from 'fs'
import path from 'path'
import { ENGINE_COLLECTION_TABLES, engageD1Adapter } from './payloadD1Adapter'
import { lexicalEditor as richTextEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'
//import { payloadTotp } from 'payload-totp'

import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Events } from '@/collections/Events'
import { Products } from '@/features/ecommerce/collections/Products'
import { EventRSVPs } from '@/collections/EventRSVPs'
import { Pages } from '@/collections/Pages'
import { PageTemplates } from '@/collections/PageTemplates'
import { Posts } from '@/collections/Posts'
import { Faqs } from '@/collections/Faqs'
import { FieldGroups } from '@/collections/FieldGroups'
import { AuditLog } from '@/features/security'
import { Forms, FormSubmissions } from '@/features/forms'
import { Backups } from '@/features/backups'
import { Translations } from '@/features/multilingual/translationsCollection'
import { MembershipTiers, Memberships } from '@/features/members'
import { Courses, Lessons, Enrolments, LessonProgress } from '@/features/courses'
import { ABTests } from '@/features/abTesting'
import { Header } from '@/globals/Header'
import { Footer } from '@/globals/Footer'
import { SiteSettings } from '@/globals/SiteSettings'
import { Integrations } from '@/globals/Integrations'
import { BlogSettings } from '@/globals/BlogSettings'
import { FaqSettings } from '@/globals/FaqSettings'
import { ShopSettings } from '@/globals/ShopSettings'
import { SeoSettings } from '@/globals/SeoSettings'
import { SpeedSettings } from '@/globals/SpeedSettings'
import { MediaSettings } from '@/globals/MediaSettings'
import { EmailSettings } from '@/globals/EmailSettings'
import { BackupSettings } from '@/globals/BackupSettings'
import { MemberSettings } from '@/globals/MemberSettings'
import { SecuritySettings } from '@/globals/SecuritySettings'
import { LanguageSettings } from '@/globals/LanguageSettings'
import { PaymentSettings } from '@/globals/PaymentSettings'
import { FormSettings } from '@/globals/FormSettings'

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

// Exported so tests/int/localapi-logger.int.spec.ts can prove
// src/localapi/logger.ts's own consoleLogger produces byte-identical JSON
// lines to this, the app's real logger - not just assert the new module's
// behavior in isolation. Still `as any` for now: swapping in
// src/localapi/logger.ts's own EngineLogger type is part of the eventual
// @/engine cutover, not this standalone stage.
export const cloudflareLogger = {
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

const config = buildConfig({
  admin: {
    user: Users.slug,
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
  // `Products` is real Payload's own collection - not routed through
  // `shopPlugin()` anymore (see the plugins array below and
  // payload-removal-plan.md's "GraphQL types for the 5 ecommerce
  // collections" / ecommerce cutover section for the full story). It stays
  // registered here, and ONLY here of the 5 ecommerce collections, for one
  // reason: `Events`/`Courses`/`Forms` have real `relationTo: 'products'`
  // fields, and real Payload's own config sanitizer throws
  // `InvalidFieldRelationship` at config-build time if a `relationTo` target
  // isn't among the registered collections - confirmed empirically before
  // removing `shopPlugin()` (see incident log) by deleting the plugin call
  // and watching `fields/config/sanitize.js`'s own relationship-validation
  // throw fire for exactly this reason. No other real (non-ecommerce)
  // collection's `relationTo` points at `orders`/`carts`/`transactions`/
  // `addresses` (checked via grep), so only `products` needs this.
  //
  // This is the EXACT SAME object `readRegistry`/REST/admin already use for
  // real day-to-day reads and writes (imported directly, no duplication) -
  // its own file header explains why that's safe to reuse here unchanged.
  // Real Payload's own REST/GraphQL resolvers for `products` still never run
  // in practice: `src/localapi/rest.ts`'s dispatcher already claims 100% of
  // `/api/products*` before real Payload's REST handlers ever see it, and
  // `src/localapi/graphql.ts`'s hybrid dispatcher does the exact same thing
  // for every GraphQL operation naming `Products`/`Product`/`createProduct`/
  // `updateProduct`/`deleteProduct` - this registration exists purely to
  // satisfy the relationship-validation check above, not to serve traffic.
  collections: [Users, Media, Events, EventRSVPs, Pages, PageTemplates, Posts, Faqs, FieldGroups, AuditLog, Forms, FormSubmissions, Backups, Translations, MembershipTiers, Memberships, Courses, Lessons, Enrolments, LessonProgress, ABTests, Products] as never,
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
  ] as never,
  editor: richTextEditor(),
  // ENGAGE_SECRET is the preferred name; PAYLOAD_SECRET is kept as a fallback
  // so deployments that already set it keep working. The engine's own CLI
  // (`migrate`, `generate:*`) still reads PAYLOAD_SECRET directly before this
  // config is ever evaluated, so that variable must remain set for those
  // commands - see .env.example and the package.json scripts.
  secret: process.env.ENGAGE_SECRET || process.env.PAYLOAD_SECRET || '',
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
