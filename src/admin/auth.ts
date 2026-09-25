import { cache } from 'react'
import { headers } from 'next/headers'
import type { Engine, SanitizedCollectionConfig, SanitizedGlobalConfig, TypedUser } from '@/engine'
import { getEngine } from '@/lib/engine'
import { readRegistry } from '@/localapi/registry'
import { buildEngineCollectionEntries } from '@/localapi/config'
import { readFeatureFlags, resolveEntityGroups, type EntityPermissions, type ResolvedGroup, type VisibleEntitiesLike } from '@/components/admin/shared/resolveEntities'

/**
 * `engine.config.collections`/`.globals` (the `Engine` interface's public
 * config surface) are deliberately narrow - `src/localapi/config.ts`'s own
 * header confirms it: `buildEngineConfig` only ever kept the fields its
 * pre-Stage-11 callers actually read (`slug`/`admin.group`/`labels`/`auth`),
 * with NO `fields`, NO `access.create`, and NO `admin.hidden`/`useAsTitle`/
 * `defaultColumns` - those were never needed before this admin rebuild.
 *
 * `readRegistry.collections[slug].config`/`.globals[slug].config`, by
 * contrast, are typed narrowly (`ReadEntityConfig`, `./read-operations.ts`)
 * but ARE, at runtime, the exact same real config object this app's authors
 * wrote (`src/collections/*.ts` etc, passed into `readEntry()` untouched -
 * confirmed by reading `./registry.ts` directly: `readEntry(Faqs, ...)` etc,
 * TS structural typing just allows the wider real object to satisfy the
 * narrower parameter type). That makes `readRegistry` - not `engine.config` -
 * the one place this admin can get a slug's real `fields`/`access`/`admin`/
 * `labels`, for EVERY one of the 26 collections/17 globals it needs to
 * (including the 5 ecommerce-plugin collections, which `engine.config`
 * itself only carries a hardcoded label-only stub for - see `./config.ts`'s
 * `SHOP_PLUGIN_COLLECTION_ENTRIES`).
 */
/**
 * Three of this app's real collection configs (`events`, `media`, `users`)
 * declare no `labels` of their own at all - real Payload auto-derives one
 * from the slug at sanitize time, and `src/localapi/config.ts`'s own
 * `buildEngineCollectionEntries`/`AUTO_LABELS_BY_SLUG` already reproduce
 * those exact three real values (confirmed live against `getEngine()` - see
 * that file's header). Reused here rather than re-hardcoded, so a nav
 * label/ListView heading/EditView heading for one of those three shows
 * "Users"/"Media"/"Events" instead of falling back to the raw slug.
 */
function withResolvedLabels(config: SanitizedCollectionConfig): SanitizedCollectionConfig {
  const [resolved] = buildEngineCollectionEntries([config as never])
  return resolved?.labels ? ({ ...config, labels: resolved.labels } as SanitizedCollectionConfig) : config
}

function allCollectionConfigs(): SanitizedCollectionConfig[] {
  return Object.values(readRegistry.collections).map((entry) => withResolvedLabels(entry.config as unknown as SanitizedCollectionConfig))
}

function allGlobalConfigs(): SanitizedGlobalConfig[] {
  return Object.values(readRegistry.globals).map((entry) => entry.config as unknown as SanitizedGlobalConfig)
}

/**
 * Who's asking, and what they may see - the one place Stage 11's admin
 * figures this out, called by RootLayout and every view (List/Edit/GlobalEdit)
 * before it reads or writes anything.
 *
 * SECURITY NOTE: `users` is this app's configured admin auth collection
 * (`engage.config.ts`'s `admin.user`), but it is NOT admin-only as a
 * collection - the shop plugin maps every storefront customer onto it too
 * (see `src/collections/Users.ts`'s own header comment). A valid
 * `engine.auth()` session therefore means "some users-collection row is
 * signed in", not "an admin is signed in". `isAdminUser` below is the
 * separate, mandatory gate for "may this person load the admin panel AT ALL"
 * - every admin page must check it before rendering anything, not just rely
 * on per-collection `access.read` (a customer's `access.read` on most
 * collections is simply undefined/open by this app's own convention, see
 * `evaluateAccess`'s default-open comment - that governs API responses, not
 * who gets to see the panel in the first place).
 */

export function isAdminUser(user: unknown): boolean {
  return Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
}

function isHidden(hidden: unknown, user: unknown): boolean {
  if (typeof hidden === 'function') {
    try {
      return Boolean((hidden as (args: { user: unknown }) => boolean)({ user }))
    } catch {
      return false
    }
  }
  return Boolean(hidden)
}

/**
 * Evaluates a collection/global's own real `access.read`/`access.create`
 * function (a plain predicate, e.g. `isAdmin`/`isAdminOrSelf` from
 * `@/access/ecommerceAccess`) against the signed-in user - the SAME functions
 * real Payload would call, so behavior matches exactly.
 *
 * No access function set defaults to open (`true`), matching this app's own
 * convention of collections that omit `access.read` entirely (e.g. most of
 * `src/collections/*.ts`) intending public/any-signed-in-user read. This is
 * safe here specifically because every admin PAGE is already gated by
 * `isAdminUser` above - by the time this runs, the caller is a confirmed
 * admin, so "open" only ever means "open to an admin", never to the public.
 * A function returning a `Where` object (partial/row-filtered access, real
 * Payload's own convention) counts as readable for nav/menu purposes, same as
 * a plain `true`.
 */
function evaluateAccess(fn: unknown, user: unknown): boolean {
  if (typeof fn !== 'function') return true
  try {
    const result = (fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } })
    return result !== false && result !== undefined && result !== null
  } catch {
    return false
  }
}

export type AdminContext = {
  engine: Engine
  i18n: { language: string; t: (key: string) => string }
  isAdmin: boolean
  permissions: EntityPermissions
  user: TypedUser | null
  visibleEntities: VisibleEntitiesLike
}

/**
 * Everything a Stage 11 admin page needs to decide what to show and whether
 * it may. Wrapped in React's `cache()` (same dedup convention
 * `resolveEntities.ts`'s own `readFeatureFlags` already uses) since
 * RootLayout, RootPage, and whichever view they render (ListView/EditView/
 * GlobalEditView all call this independently too - see their own doc
 * comments) end up calling this once each per request; `cache()` collapses
 * those into the one real `engine.auth()`/config pass per render.
 */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: await headers() }).catch(() => ({ user: null as unknown }))

  const collections = allCollectionConfigs()
  const globals = allGlobalConfigs()

  const visibleEntities: VisibleEntitiesLike = {
    collections: collections.filter((c) => !isHidden(c.admin?.hidden, user)).map((c) => c.slug),
    globals: globals.filter((g) => !isHidden(g.admin?.hidden, user)).map((g) => g.slug),
  }

  const permissions: EntityPermissions = { collections: {}, globals: {} }
  for (const collection of collections) {
    permissions.collections![collection.slug] = {
      create: evaluateAccess(collection.access?.create, user),
      read: evaluateAccess(collection.access?.read, user),
    }
  }
  for (const global of globals) {
    permissions.globals![global.slug] = { read: evaluateAccess(global.access?.read, user) }
  }

  return {
    engine,
    i18n: { language: 'en', t: (key: string) => key },
    isAdmin: isAdminUser(user),
    permissions,
    user: user as TypedUser | null,
    visibleEntities,
  }
})

export function getCollectionConfig(engine: Engine, slug: string): SanitizedCollectionConfig | undefined {
  void engine // kept for call-site symmetry with getGlobalConfig/future engine-scoped lookups; the real config comes from readRegistry - see this file's header.
  const entry = readRegistry.collections[slug]
  return entry ? withResolvedLabels(entry.config as unknown as SanitizedCollectionConfig) : undefined
}

export function getGlobalConfig(engine: Engine, slug: string): SanitizedGlobalConfig | undefined {
  void engine
  const entry = readRegistry.globals[slug]
  return entry ? (entry.config as unknown as SanitizedGlobalConfig) : undefined
}

/** Convenience wrapper for RootLayout/the nav - same computation `AdminNav.tsx` already does inline, centralized here so RootLayout doesn't duplicate it. */
export async function resolveNavGroups(context: AdminContext): Promise<ResolvedGroup[]> {
  const flags = await readFeatureFlags(context.engine)
  return resolveEntityGroups({
    engine: context.engine,
    flags,
    i18n: context.i18n,
    permissions: context.permissions,
    visibleEntities: context.visibleEntities,
  })
}
