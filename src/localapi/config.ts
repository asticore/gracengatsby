/**
 * From-scratch reimplementation of the Local API's `.config`/`.collections`
 * surface - the second of the four remaining `@/engine` shims scoped in
 * payload-removal-plan.md's "Full-removal cutover prerequisites" section
 * (logger done; this is config/collections; db.migrate remains the big one).
 *
 * Grepped every real `engine.config`/`payload?.config`/`req.payload.config`/
 * `engine.collections` call site in `src/` directly. Every one reads only:
 *
 *   - `.config.routes.admin` / `.config.routes.api` (admin-URL building)
 *   - `.config.serverURL` (translations API base URL)
 *   - `.config.collections[i].slug` / `.admin.group` / `.labels.plural` /
 *     `.labels.singular` (admin nav + dashboard grouping,
 *     src/components/admin/shared/resolveEntities.ts)
 *   - `.config.globals[i].slug` / `.admin.group` / `.label` (same)
 *   - `.collections[slug].config.auth` (src/features/members/signup.ts's
 *     canVerifyEmail, and src/features/courses/entitlement.ts's mere
 *     existence check)
 *
 * Never anything else - no field arrays, no access/hooks, no endpoints, no
 * i18n/localization/upload/jobs config. `EngineConfigShape`/
 * `EngineCollectionsMap` below are hand-rolled to that real, narrow surface
 * only, matching this directory's rule of never importing the `payload`
 * package to describe a shape already reimplemented by hand.
 *
 * WHAT THIS MODULE COVERS, CONFIRMED AGAINST A LIVE `getEngine()`
 *
 * Real Payload's sanitizer does two things this module has to reproduce
 * exactly, both confirmed by reading `payload/dist/collections/config/
 * sanitize.js` and `defaults.js` directly rather than assumed:
 *
 *  1. A collection with no explicit `labels` gets one auto-generated from its
 *     slug (`formatLabels`, via the `pluralize` npm package's irregular-word
 *     rules) - `sanitized.labels = { plural: sanitized.labels?.plural ||
 *     defaultLabels.plural, singular: ... }`. Grepped every one of this app's
 *     21 own collection configs directly: 18 declare `labels` explicitly;
 *     exactly THREE do not (`events`, `media`, `users`) and hit this path.
 *     Reimplementing `pluralize`'s full dictionary/inflection rules to derive
 *     three fixed, known strings would be a large, error-prone undertaking
 *     for no real benefit, so the three real values - computed once via
 *     payload's own real `pluralize` dependency and confirmed against a live
 *     `getEngine()` (`{events: 'Events'/'Event', media: 'Media'/'Media',
 *     users: 'Users'/'User'}`) - are hardcoded in `AUTO_LABELS_BY_SLUG`
 *     below. A slug that reaches `resolveCollectionLabels` with neither
 *     explicit labels nor an entry there throws, rather than silently
 *     falling back to the raw slug the way `resolveLabel`'s own UI-side
 *     fallback would - a newly added label-less collection should fail this
 *     module's own build loudly, not ship a silently wrong sidebar label.
 *
 *  2. `auth: true` (a bare boolean) expands to a full sanitized auth-config
 *     object (`addDefaultsToAuthConfig`,
 *     `payload/dist/collections/config/defaults.js`) - this app's ONE
 *     `auth: true` collection is `users` (confirmed bare boolean, no
 *     overrides - `src/collections/Users.ts`). The four defaulted values
 *     that matter (`maxLoginAttempts`, `lockTime`, `tokenExpiration`,
 *     `useSessions`) are the exact same real Payload defaults
 *     `src/localapi/auth.ts`'s Stage 2 module already confirmed and exports
 *     as `MAX_LOGIN_ATTEMPTS`/`LOCK_TIME_MS`/`TOKEN_EXPIRATION_SECONDS`/
 *     `USE_SESSIONS` - reused here rather than re-declared, so the two
 *     modules can never silently drift apart. `verify` defaults to `false`
 *     (this app's `users` collection never sets it), which is why
 *     `signup.ts`'s `canVerifyEmail` returns `false` today regardless of
 *     whether this module leaves `auth` as a raw boolean or expands it -
 *     expanding it is still done, for fidelity with what a real cutover's
 *     `engine.collections.users.config.auth` must actually look like.
 *
 * A CONFIRMED, NOT-YET-COVERED GAP (documented per this project's standing
 * discipline of surfacing real gaps rather than inventing around them):
 * this app's OWN 21 collections + 17 globals are not the only entries in
 * real `engine.config.collections` - the ecommerce `shopPlugin` (see
 * `engage.config.ts`'s `plugins:` array) injects 5 more collections
 * (`products`, `carts`, `orders`, `transactions`, `addresses`) that
 * `NAV_STRUCTURE`'s "Shop" group references by slug, and real Payload itself
 * always adds 4 internal bookkeeping collections (`payload-migrations`,
 * `payload-preferences`, `payload-locked-documents`, `payload-kv` - slugs
 * unchanged even though their TABLES are renamed to `eg_*`, confirmed live:
 * `engine.config.collections.length` is 30, not this app's own 21).
 * `resolveEntityGroups` iterates every entry in `.config.collections`
 * regardless, filtering by `visibleEntities`/`NAV_STRUCTURE`, so a faithful
 * cutover needs the 5 shop ones present (the 4 internal ones are never
 * referenced by `NAV_STRUCTURE` and can be omitted with no observable
 * difference). Confirmed directly against a live `getEngine()` that all 5
 * shop collections' `labels.plural`/`.singular` are LabelFunctions, not
 * plain strings (`@payloadcms/plugin-ecommerce`'s own
 * `createProductsCollection.js` etc: `plural: ({ t }) => t('plugin-
 * ecommerce:products')`, an i18n-translated label, confirmed by reading the
 * plugin's real source directly). Reproducing the actual function reference
 * would be pointless (this module's job is matching observable behavior, not
 * object identity) and pulling in the plugin's i18n machinery just to
 * evaluate ten translation keys is disproportionate to what `resolveLabel`
 * actually needs - a resolved STRING. So `SHOP_PLUGIN_COLLECTION_ENTRIES`
 * hardcodes the plain-string English translations directly (confirmed
 * against the plugin's own `translations/languages/en.js`: `products` ->
 * "Products"/"Product", `carts` -> "Carts"/"Cart", `orders` ->
 * "Orders"/"Order", `transactions` -> "Transactions"/"Transaction",
 * `addresses` -> "Addresses"/"Address") - `resolveLabel`'s own string branch
 * returns a plain string unchanged, so this produces the exact same
 * rendered admin-nav text as calling the real function would, for the one
 * locale (English) this app actually ships. The full ecommerce plugin (its
 * real field definitions, access, hooks, and any non-English i18n) stays
 * explicitly out of scope, same as the plan doc's "Remaining areas" item 7 -
 * only this thin, English-only slice is needed here.
 */

import { LOCK_TIME_MS, MAX_LOGIN_ATTEMPTS, TOKEN_EXPIRATION_SECONDS, USE_SESSIONS } from './auth'

/** Matches real Payload's `StaticLabel | LabelFunction` - this app's own configs never use the function form, but pass it through unevaluated same as `resolveEntityGroups`'s own `resolveLabel` does. */
export type LabelValue = string | Record<string, string> | ((args: { t: (key: never) => string; i18n?: unknown }) => unknown)

export type EngineRoutes = {
  admin: string
  api: string
}

/** Real Payload's `addDefaultsToAuthConfig` output shape - only the fields this app ever reads (`signup.ts`'s `auth.verify`) plus the rest for fidelity. */
export type EngineCollectionAuthConfig = {
  cookies: { sameSite: string; secure: boolean }
  forgotPassword: Record<string, unknown>
  lockTime: number
  loginWithUsername: false
  maxLoginAttempts: number
  tokenExpiration: number
  useSessions: boolean
  verify: false | Record<string, unknown>
  strategies: unknown[]
}

export type EngineCollectionEntry = {
  slug: string
  admin?: { group?: false | string | Record<string, string> }
  labels: { plural?: LabelValue; singular?: LabelValue }
  auth?: EngineCollectionAuthConfig
}

export type EngineGlobalEntry = {
  slug: string
  admin?: { group?: false | string | Record<string, string> }
  label: LabelValue
}

export type EngineConfigShape = {
  routes: EngineRoutes
  serverURL: string
  collections: EngineCollectionEntry[]
  globals: EngineGlobalEntry[]
}

/** Real Payload's `payload.collections[slug].config` is the SAME sanitized object referenced in `config.collections` - not a separate build - so this is keyed straight off `EngineCollectionEntry`. */
export type EngineCollectionsMap = Record<string, { config: EngineCollectionEntry }>

/** This app never overrides `routes`/`serverURL` in its `buildConfig()` call (confirmed by reading `engage.config.ts` directly) - these are real Payload's own sanitize-time defaults (`payload/dist/config/defaults.js`), confirmed live against `getEngine()`. */
export const DEFAULT_ROUTES: EngineRoutes = { admin: '/admin', api: '/api' }
export const DEFAULT_SERVER_URL = ''

/** See this file's header comment - the only 3 of this app's 21 collections with no explicit `labels`, real values confirmed live against `getEngine()`. */
const AUTO_LABELS_BY_SLUG: Record<string, { plural: string; singular: string }> = {
  events: { plural: 'Events', singular: 'Event' },
  media: { plural: 'Media', singular: 'Media' },
  users: { plural: 'Users', singular: 'User' },
}

/** See this file's header comment - the ecommerce plugin's own 5 injected collections, thin-shape only, confirmed against the plugin's real source + English translations. */
export const SHOP_PLUGIN_COLLECTION_ENTRIES: EngineCollectionEntry[] = [
  { slug: 'products', admin: { group: 'Ecommerce' }, labels: { plural: 'Products', singular: 'Product' } },
  { slug: 'carts', admin: { group: 'Ecommerce' }, labels: { plural: 'Carts', singular: 'Cart' } },
  { slug: 'orders', admin: { group: 'Ecommerce' }, labels: { plural: 'Orders', singular: 'Order' } },
  { slug: 'transactions', admin: { group: 'Ecommerce' }, labels: { plural: 'Transactions', singular: 'Transaction' } },
  { slug: 'addresses', admin: { group: 'Ecommerce' }, labels: { plural: 'Addresses', singular: 'Address' } },
]

/** The raw, pre-sanitize auth shape a real `CollectionConfig.auth` may take - `verify`/`loginWithUsername` accept `true` here (real Payload's own input type), unlike `EngineCollectionAuthConfig`'s already-sanitized output shape below. */
export type RawCollectionAuthConfig = {
  cookies?: { sameSite?: string; secure?: boolean }
  forgotPassword?: Record<string, unknown>
  lockTime?: number
  loginWithUsername?: boolean | Record<string, unknown>
  maxLoginAttempts?: number
  tokenExpiration?: number
  useSessions?: boolean
  verify?: boolean | Record<string, unknown>
  strategies?: unknown[]
}

export type CollectionConfigLike = {
  slug: string
  admin?: { group?: false | string | Record<string, string> }
  labels?: { plural?: LabelValue; singular?: LabelValue }
  auth?: boolean | RawCollectionAuthConfig
}

export type GlobalConfigLike = {
  slug: string
  admin?: { group?: false | string | Record<string, string> }
  label?: LabelValue
}

function resolveCollectionLabels(collection: CollectionConfigLike): { plural?: LabelValue; singular?: LabelValue } {
  if (collection.labels?.plural && collection.labels?.singular) {
    return { plural: collection.labels.plural, singular: collection.labels.singular }
  }
  const fallback = AUTO_LABELS_BY_SLUG[collection.slug]
  if (!fallback) {
    throw new Error(
      `src/localapi/config.ts has no auto-label fallback for collection "${collection.slug}" (it declares no ` +
        'explicit labels). Add explicit `labels` to its config, or add its real, Payload-computed plural/singular ' +
        "to AUTO_LABELS_BY_SLUG (compute it the same way this file's header comment describes, then confirm " +
        'against a live getEngine() before hardcoding it).',
    )
  }
  return { plural: collection.labels?.plural ?? fallback.plural, singular: collection.labels?.singular ?? fallback.singular }
}

/** Reproduces real Payload's `auth: true` -> full sanitized auth-config object expansion - see this file's header comment. */
function resolveCollectionAuth(collection: CollectionConfigLike): EngineCollectionAuthConfig | undefined {
  if (!collection.auth) return undefined
  const raw = typeof collection.auth === 'boolean' ? {} : collection.auth
  return {
    cookies: { sameSite: 'Lax', secure: false, ...(raw.cookies as object | undefined) },
    forgotPassword: raw.forgotPassword ?? {},
    lockTime: raw.lockTime ?? LOCK_TIME_MS,
    loginWithUsername: false,
    maxLoginAttempts: raw.maxLoginAttempts ?? MAX_LOGIN_ATTEMPTS,
    tokenExpiration: raw.tokenExpiration ?? TOKEN_EXPIRATION_SECONDS,
    useSessions: raw.useSessions ?? USE_SESSIONS,
    verify: raw.verify === true ? {} : (raw.verify ?? false),
    strategies: (raw as { strategies?: unknown[] }).strategies ?? [],
  }
}

export function buildEngineCollectionEntries(collections: CollectionConfigLike[]): EngineCollectionEntry[] {
  return collections.map((collection) => ({
    slug: collection.slug,
    admin: collection.admin,
    labels: resolveCollectionLabels(collection),
    auth: resolveCollectionAuth(collection),
  }))
}

export function buildEngineGlobalEntries(globals: GlobalConfigLike[]): EngineGlobalEntry[] {
  return globals.map((global) => {
    if (!global.label) {
      throw new Error(
        `src/localapi/config.ts: global "${global.slug}" declares no \`label\` - every one of this app's 17 ` +
          "globals does today (confirmed by grep). Add one rather than guessing real Payload's toWords(slug) " +
          'fallback, which this module does not reproduce.',
      )
    }
    return { slug: global.slug, admin: global.admin, label: global.label }
  })
}

export function buildEngineCollectionsMap(collectionEntries: EngineCollectionEntry[]): EngineCollectionsMap {
  return Object.fromEntries(collectionEntries.map((entry) => [entry.slug, { config: entry }]))
}

/**
 * Assembles the full `.config` shape this app's real `.config` call sites
 * read. Callers pass this app's own 21 collections/17 globals (raw,
 * unbuilt config objects - `resolveCollectionLabels`/`resolveCollectionAuth`
 * run on these); `extraCollections` takes already-built `EngineCollectionEntry`
 * values appended straight to the output with no further processing - this
 * is where `SHOP_PLUGIN_COLLECTION_ENTRIES` goes (its `labels: {}` has no
 * plural/singular to resolve, so running it back through
 * `resolveCollectionLabels` would incorrectly hit the "no auto-label
 * fallback" throw meant for a genuinely unrecognised, unbuilt slug).
 */
export function buildEngineConfig(args: {
  collections: CollectionConfigLike[]
  globals: GlobalConfigLike[]
  extraCollections?: EngineCollectionEntry[]
  routes?: Partial<EngineRoutes>
  serverURL?: string
}): EngineConfigShape {
  return {
    routes: { ...DEFAULT_ROUTES, ...args.routes },
    serverURL: args.serverURL ?? DEFAULT_SERVER_URL,
    collections: [...buildEngineCollectionEntries(args.collections), ...(args.extraCollections ?? [])],
    globals: buildEngineGlobalEntries(args.globals),
  }
}
