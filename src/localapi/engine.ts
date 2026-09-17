/**
 * Stage 6c: a hand-rolled `Engine` interface + `createEngine()` factory -
 * this app's own from-scratch replacement for `@/engine`'s
 * `export type Engine = Payload` / `getEngine = () => getPayload(...)`.
 *
 * Still standalone - NOT wired into `@/engine` yet (that is Stage 6e, the
 * actual flip). This module assembles the five already-built, already-proven
 * `src/localapi/*` modules (Local API core, auth, logger, config, migrate)
 * plus Stage 6a's `readRegistry`/`writeRegistry` into one object satisfying
 * the interface below, dispatching every call by collection/global slug into
 * those registries - exactly mirroring what real Payload's own `getPayload()`
 * does internally, just built from this app's own pieces instead of the
 * vendor package.
 *
 * ENGINE INTERFACE SURFACE, confirmed by grepping every real call site in
 * `src/` (excluding tests) for `.find(`, `.findByID(`, `.count(`,
 * `.findGlobal(`, `.create(`, `.update(`, `.delete(`, `.updateGlobal(`,
 * `.login(`, `.resetPassword(`, `.forgotPassword(`, `.auth(`, `.logger`,
 * `.config`, `.collections`, `.db.migrate(`: every one of those thirteen
 * members has at least one real, confirmed production call site (the fullest
 * accounting to date - `updateGlobal`/`count`/`forgotPassword` were open
 * questions after Stage 6a and are now closed: `updateGlobal` at
 * `src/features/courses/selfTest.mts:55,269`, `count` at
 * `src/views/dashboard/dashboardData.ts:62`, `forgotPassword` at
 * `src/features/accounts/auth.ts:162`). No other method on a `getEngine()`
 * result has any real call site anywhere in `src/` - `delete` on a global
 * (globals have none in real Payload either), bulk operations, and
 * `autosave`/`unpublish` were already confirmed unused back in Stage 1.
 *
 * CALL SHAPE: every real call site passes EITHER a `user` sibling option
 * (`engine.count({collection, user, ...})` - well, actually none currently
 * do; they pass `req` instead) OR a pre-built `req`-like object with its own
 * `.user` (`engine.count({collection, req, overrideAccess})` at
 * `dashboardData.ts:62`), matching real Payload's own Local API convention
 * (`user` is sibling sugar; `req` is the canonical carrier). `toLocalReq`
 * below accepts either and always produces the `LocalReq` shape
 * `./access.ts`/`./operations.ts`/`./read-operations.ts` already expect,
 * with `payload` ALWAYS set to this same `Engine` instance (self-reference)
 * and `t` defaulted to an identity stub when the caller's own `req` doesn't
 * carry one - the same "always supply a real payload + t, never assume a
 * clean call" precaution `tests/int/localapi-operations-parity.int.spec.ts`
 * already established is necessary (a `CollectionConfig` object shared with
 * `engage.config.ts`'s still-running real Payload instance can carry a
 * sanitize-mutated `field.validate` that expects both, whether or not
 * *this* call path is the one that triggered the mutation).
 *
 * LOGGER: `./logger.ts`'s `consoleLogger` is used unconditionally, not
 * `cloudflareLogger`/`isProduction`-switched the way `engage.config.ts`
 * itself is - `logger.ts`'s own header already establishes `consoleLogger`
 * produces byte-identical JSON-line output to `cloudflareLogger` (proven by
 * Stage 3's parity tests), so there is no real behavioral difference to
 * switch on, and importing `engage.config.ts` from this module (to reach
 * `cloudflareLogger`) would pull this payload-free `localapi/` directory
 * into `engage.config.ts`'s own real-Payload/circular-import machinery for
 * zero observable benefit.
 *
 * `db.migrate`: real Payload's `db.migrate(args？)` accepts an OPTIONAL
 * `{migrations}` - when omitted, real Payload runs whatever migrations list
 * the db adapter was configured with at init time, which for this app is
 * every migration in `src/migrations/index.ts`'s barrel (the same list
 * `pnpm cms migrate` runs - see `./migrate.ts`'s own header). This factory's
 * `db.migrate` defaults to that same barrel when called with no `migrations`
 * argument, matching that behavior; a caller that wants a narrower list
 * (like `/api/internal-migrate`'s own `RUNNABLE_MIGRATIONS` - see Stage 6's
 * plan doc entry on that route) passes it explicitly, same as today.
 * Returns `RunMigrationsResult` (`{ran, skipped, batch}`) rather than
 * `void` the way real Payload's does - a DELIBERATE, additive deviation: no
 * real call site in this app reads `db.migrate`'s return value today (both
 * confirmed real call sites discard it), and a caller that DOES want to know
 * what ran (like a future rewrite of `/api/internal-migrate`'s own
 * before/after `payload-migrations` diffing dance - see the plan doc) can
 * now just read `result.ran` directly instead of re-querying bookkeeping
 * state, which `runMigrations` already tracked. Widening a return type from
 * `void` to something real callers can already safely ignore is not an
 * observable break.
 */
import { createHash } from 'node:crypto'

import type { Where } from './access'
import type { LocalReq } from './access'
import {
  AuthenticationError,
  forgotPassword as authForgotPassword,
  login as authLogin,
  logout as authLogout,
  refreshToken as authRefreshToken,
  resetPassword as authResetPassword,
  unlockUser as authUnlockUser,
  verifyAuth,
  type AuthDbOps,
  type AuthUserDoc,
  type AuthUserRow,
  type HeadersLike,
} from './auth'
import { buildEngineCollectionEntries, buildEngineCollectionsMap, buildEngineConfig, SHOP_PLUGIN_COLLECTION_ENTRIES, type EngineCollectionsMap, type EngineConfigShape } from './config'
import { consoleLogger, type EngineLogger } from './logger'
import { runMigrations, type Drizzle as MigrateDrizzle, type MigrationEntry, type RunMigrationsResult } from './migrate'
import { createDocument, deleteDocument, updateDocument, updateGlobalDocument } from './operations'
import { collectionConfigs, globalConfigs, readRegistry, writeRegistry } from './registry'
import type { Doc, PaginatedDocs, Sort } from './read-operations'
import { count as readCount, find as readFind, findByID as readFindByID, findGlobal as readFindGlobal } from './read-operations'

import { findUserAuthRowByID, findUserAuthRowsPaginated, updateUserAuthRow } from '@/cms/db'
import { getDb } from '@/cms/db/connect'
import { ensureMigrationsTable, type EngineDb } from '@/migrations/schema/engineBootstrap'
import { migrations as ALL_MIGRATIONS } from '@/migrations'

/** A caller's pre-built request-like object, matching real Payload's own Local API convention (see this file's header, "CALL SHAPE"). Loose (`Record<string,unknown>`-backed via `LocalReq` itself) so any real call site's own `req` object - however it got built - is accepted without this module needing to know its concrete shape. */
export type EngineReqLike = Partial<LocalReq>

type CommonOpts = {
  user?: LocalReq['user']
  req?: EngineReqLike
  overrideAccess?: boolean
}

export type Engine = {
  logger: EngineLogger
  config: EngineConfigShape
  collections: EngineCollectionsMap
  db: {
    migrate: (args?: { migrations?: MigrationEntry[] }) => Promise<RunMigrationsResult>
  }
  find: (args: CommonOpts & { collection: string; where?: Where; sort?: Sort; limit?: number; page?: number; pagination?: boolean; depth?: number; disableErrors?: boolean }) => Promise<PaginatedDocs>
  findByID: (args: CommonOpts & { collection: string; id: number; depth?: number; disableErrors?: boolean; draft?: boolean }) => Promise<Doc | null>
  count: (args: CommonOpts & { collection: string; where?: Where }) => Promise<{ totalDocs: number }>
  findGlobal: (args: CommonOpts & { slug: string; depth?: number; disableErrors?: boolean }) => Promise<Doc | null>
  create: (args: CommonOpts & { collection: string; data: Record<string, unknown>; draft?: boolean }) => Promise<Doc>
  update: (args: CommonOpts & { collection: string; id: number; data: Record<string, unknown>; draft?: boolean }) => Promise<Doc | null>
  delete: (args: CommonOpts & { collection: string; id: number }) => Promise<Doc>
  updateGlobal: (args: CommonOpts & { slug: string; data: Record<string, unknown> }) => Promise<Doc>
  login: (args: { collection: string; data: { email: string; password: string } }) => Promise<{ user: AuthUserDoc; token?: string; exp?: number }>
  resetPassword: (args: { collection: string; data: { password: string; token: string }; overrideAccess?: boolean }) => Promise<{ user: AuthUserDoc; token: string }>
  forgotPassword: (args: { collection: string; data: { email: string }; disableEmail?: boolean; expiration?: number }) => Promise<string | null>
  auth: (args: { headers: HeadersLike }) => Promise<{ user: AuthUserDoc | null }>
  logout: (args: { collection: string; headers: HeadersLike; allSessions?: boolean }) => Promise<{ message: string }>
  refreshToken: (args: { collection: string; headers: HeadersLike }) => Promise<{ exp: number; token: string; user: AuthUserDoc; setCookie: true }>
  unlock: (args: { collection: string; data: { email: string } }) => Promise<boolean>
}

/** Real Payload's own derived JWT secret (`payload/dist/index.js`): `sha256(config.secret).hex().slice(0, 32)`, NOT the raw env var - confirmed and load-bearing since Stage 2. `engage.config.ts`'s own precedence (`ENGAGE_SECRET` preferred, `PAYLOAD_SECRET` fallback, empty-string last resort) is reproduced here so a deployment that only ever set one of the two still derives the same secret real Payload would. */
function deriveSecret(): string {
  const raw = process.env.ENGAGE_SECRET || process.env.PAYLOAD_SECRET || ''
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

/** The auth-row family (`findUserAuthRowByID`/`findUserAuthRowsPaginated`/`updateUserAuthRow`) `./auth.ts` needs - a THIRD family alongside Stage 6a's plain CRUD and versioned-drafts families, deliberately excluded from `./registry.ts` (see that file's own header) since only this factory needs it. Wiring copied from the exact pattern `tests/int/localapi-auth-parity.int.spec.ts`'s own `makeRealAuthDb()` already proves correct against real Payload. */
function buildAuthDb(): AuthDbOps {
  return {
    findByEmail: async (email) => {
      const result = await findUserAuthRowsPaginated({ where: { email: { equals: email } }, limit: 1 })
      return (result.docs[0] as unknown as AuthUserRow | undefined) ?? null
    },
    findByID: (id) => findUserAuthRowByID(id),
    findByResetToken: async (token) => {
      const result = await findUserAuthRowsPaginated({
        where: { and: [{ resetPasswordToken: { equals: token } }, { resetPasswordExpiration: { greater_than: new Date().toISOString() } }] },
        limit: 1,
      })
      return (result.docs[0] as unknown as AuthUserRow | undefined) ?? null
    },
    updateByID: (id, data) => updateUserAuthRow(id, data),
  }
}

function toLocalReq(engine: Engine, opts: { user?: LocalReq['user']; req?: EngineReqLike }): LocalReq {
  const base = (opts.req ?? {}) as LocalReq
  return {
    t: (key: string) => key,
    ...base,
    payload: engine,
    user: opts.user ?? base.user ?? null,
  }
}

async function buildMigrateDb(): Promise<{ db: MigrateDrizzle; engineDb: EngineDb }> {
  const db = (await getDb()) as unknown as MigrateDrizzle
  const d1 = db.$client as D1Database
  const engineDb: EngineDb = {
    exists: async (table) => {
      const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).all()
      return (result.results?.length ?? 0) > 0
    },
    listTables: async () => {
      const result = await d1.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()
      return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
    },
    columnsOf: async (table) => {
      const result = await d1.prepare(`PRAGMA table_info(\`${table}\`)`).all()
      return ((result.results ?? []) as { name: string }[]).map((row) => row.name)
    },
    run: (statement) => d1.prepare(statement).run(),
    countRows: async (table) => {
      const result = await d1.prepare(`SELECT COUNT(*) AS n FROM \`${table}\``).all()
      return (result.results?.[0] as { n: number } | undefined)?.n ?? 0
    },
  }
  return { db, engineDb }
}

/**
 * Builds a standalone `Engine`. Synchronous - unlike real `getPayload()`,
 * nothing here needs an async init step (no schema sanitize pass, no plugin
 * execution): the registries are already-built module-level constants and
 * the secret derivation is a cheap sync hash. Callers awaiting it (matching
 * every real `await getEngine()` call site) get it back immediately -
 * awaiting a non-Promise is a no-op.
 */
export function createEngine(): Engine {
  const secret = deriveSecret()
  const authDb = buildAuthDb()

  const engine: Engine = {
    logger: consoleLogger,

    config: buildEngineConfig({ collections: collectionConfigs as never, globals: globalConfigs as never, extraCollections: SHOP_PLUGIN_COLLECTION_ENTRIES }),
    collections: buildEngineCollectionsMap(buildEngineCollectionEntries(collectionConfigs as never)),

    db: {
      migrate: async (args) => {
        const { db, engineDb } = await buildMigrateDb()
        await ensureMigrationsTable(engineDb)
        return runMigrations({
          db,
          engineDb,
          logger: consoleLogger,
          migrations: args?.migrations ?? (ALL_MIGRATIONS as unknown as MigrationEntry[]),
        })
      },
    },

    find: async (args) => {
      const { collection, where, sort, limit, page, pagination, depth, overrideAccess, disableErrors, user, req } = args
      return readFind(readRegistry, collection, { req: toLocalReq(engine, { user, req }), where, sort, limit, page, pagination, depth, overrideAccess, disableErrors })
    },
    findByID: async (args) => {
      const { collection, id, depth, overrideAccess, disableErrors, draft, user, req } = args
      return readFindByID(readRegistry, collection, id, { req: toLocalReq(engine, { user, req }), depth, overrideAccess, disableErrors, draft })
    },
    count: async (args) => {
      const { collection, where, overrideAccess, user, req } = args
      return readCount(readRegistry, collection, { req: toLocalReq(engine, { user, req }), where, overrideAccess })
    },
    findGlobal: async (args) => {
      const { slug, depth, overrideAccess, disableErrors, user, req } = args
      return readFindGlobal(readRegistry, slug, { req: toLocalReq(engine, { user, req }), depth, overrideAccess, disableErrors })
    },

    create: async (args) => {
      const { collection, data, draft, overrideAccess, user, req } = args
      const entry = readRegistry.collections[collection]
      const db = writeRegistry.collections[collection]
      if (!entry || !db) throw new Error(`createEngine().create: unknown collection "${collection}"`)
      return createDocument({ collection: entry.config, db, data, req: toLocalReq(engine, { user, req }), overrideAccess, draft })
    },
    update: async (args) => {
      const { collection, id, data, draft, overrideAccess, user, req } = args
      const entry = readRegistry.collections[collection]
      const db = writeRegistry.collections[collection]
      if (!entry || !db) throw new Error(`createEngine().update: unknown collection "${collection}"`)
      return updateDocument({ collection: entry.config, db, id, data, req: toLocalReq(engine, { user, req }), overrideAccess, draft })
    },
    delete: async (args) => {
      const { collection, id, overrideAccess, user, req } = args
      const entry = readRegistry.collections[collection]
      const db = writeRegistry.collections[collection]
      if (!entry || !db) throw new Error(`createEngine().delete: unknown collection "${collection}"`)
      return deleteDocument({ collection: entry.config, db, id, req: toLocalReq(engine, { user, req }), overrideAccess })
    },
    updateGlobal: async (args) => {
      const { slug, data, overrideAccess, user, req } = args
      const entry = readRegistry.globals[slug]
      const db = writeRegistry.globals[slug]
      if (!entry || !db) throw new Error(`createEngine().updateGlobal: unknown global "${slug}"`)
      return updateGlobalDocument({ global: entry.config, db, data, req: toLocalReq(engine, { user, req }), overrideAccess })
    },

    login: async (args) => {
      const result = await authLogin(authDb, { email: args.data.email.trim().toLowerCase(), password: args.data.password, secret }).catch((err) => {
        // Real Payload's own login rejects on a wrong password / locked
        // account too - AuthenticationError/LockedAuth are this module's
        // own error classes, re-thrown unmodified so callers that only
        // check "did it throw" (every real call site - see this file's
        // header) see identical behavior either way.
        throw err
      })
      return result
    },
    resetPassword: (args) => authResetPassword(authDb, { token: args.data.token, password: args.data.password, secret }),
    forgotPassword: (args) => authForgotPassword(authDb, { email: args.data.email.trim().toLowerCase(), expirationMs: args.expiration ?? 60 * 60 * 1000 }),
    auth: (args) => verifyAuth(authDb, { headers: args.headers, secret }),
    logout: (args) => authLogout(authDb, { headers: args.headers, secret, allSessions: args.allSessions }),
    refreshToken: (args) => authRefreshToken(authDb, { headers: args.headers, secret }),
    unlock: (args) => authUnlockUser(authDb, { email: args.data.email }),
  }

  return engine
}

export { AuthenticationError }
