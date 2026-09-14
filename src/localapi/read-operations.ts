/**
 * Read operations - reimplemented from Payload 3.88.0's real Local API
 * `find`/`findByID`/`count` (`node_modules/payload/dist/collections/operations/
 * {find,findByID,count}.js` + their `local/*.js` wrappers) and globals'
 * `findOne` (`node_modules/payload/dist/globals/operations/{findOne,local/
 * findOne}.js`), composing stage 1a-1c (`./validators.ts` is NOT used here -
 * validation is a write-side concern, see its own file header) on top of the
 * already-proven `src/cms/db` read functions, per the Local API core stage of
 * the payload-removal plan (project doc `payload-removal-plan.md`).
 *
 * This module does not know about any PARTICULAR collection. Like
 * `./access.ts` and `./hooks.ts` it is a pure executor: a caller builds a
 * `ReadRegistry` (collection/global slug -> real config + the matching
 * `src/cms/db` read functions) and this module's `find`/`findByID`/`count`/
 * `findGlobal` run the real step order against whatever is in it. That is
 * what lets it stand alone and be parity-tested against 3-4 representative
 * collections now, without every one of this app's 21 collections/17 globals
 * needing to be wired up before it can be proven correct - the full registry
 * is assembled later, when this module is wired into `@/engine`.
 *
 * Like every module in this directory, nothing here imports from the
 * `payload` package - every type is hand-rolled (or reused from `./access.ts`/
 * `./hooks.ts`, this module's own siblings, which is fine) so this module has
 * zero build-time dependency on the vendor package. This app's real
 * collection/global configs (`src/collections/*.ts`, `src/globals/*.ts`,
 * still typed against real Payload's `CollectionConfig`/`GlobalConfig` via
 * `@/engine`) are passed in as plain data at runtime and read structurally -
 * the same accommodation `./access.ts`'s `AccessFn`/`req: any` already proved
 * out for `Access`/`FieldAccess` functions; see `ReadFieldConfig`'s doc
 * comment for why the shape here is loose enough for them to be assignable
 * without modification.
 *
 * ---------------------------------------------------------------------------
 * GROUND TRUTH, confirmed by reading real Payload 3.88.0 source directly
 * ---------------------------------------------------------------------------
 *
 * 1. `overrideAccess` defaults to `true` in the LOCAL API, not `false`.
 *    Confirmed in `collections/operations/local/find.js`, `local/findByID.js`,
 *    `local/count.js`, and `globals/operations/local/findOne.js`: every one
 *    destructures `overrideAccess = true` from the caller's options before
 *    calling its own operation function. This is why `src/hooks/
 *    checkEventCapacity.ts` (this app's own hook, unmodified) can call
 *    `req.payload.findByID({ id, collection: 'events', req })` and
 *    `req.payload.find({ collection: 'event-rsvps', where, limit: 0, req })`
 *    with NO `overrideAccess` at all and still read every row regardless of
 *    `adminOrPublishedStatus` - it is relying on this default, not on an
 *    explicit flag the task brief's shorthand summary implied it passed. This
 *    module reproduces that default exactly (`overrideAccess = true` on
 *    `find`/`findByID`/`count`/`findGlobal` alike), which is also why an
 *    access-controlled read anywhere in this app's OWN code (self-service
 *    account pages, dashboards, the calendar view - all of which explicitly
 *    pass `overrideAccess: false`, confirmed by grep) must say so explicitly.
 *
 * 2. `disableErrors` is NOT hardcoded to `true` inside `find`/`findByID`/
 *    `count`'s own operation functions - it is a caller-supplied option
 *    (`local/findByID.js`/`local/count.js` default it to `false`; `local/
 *    find.js` doesn't default it at all, leaving it `undefined`, equally
 *    falsy). This is a confirmed, deliberate correction to `./access.ts`'s own
 *    file-header phrasing (`"real find/findByID use this: disableErrors:
 *    true"`), which describes what happens ONCE `disableErrors` is true
 *    (a denied access short-circuits to empty/null instead of throwing,
 *    exactly as documented there) but does not itself default to true for a
 *    plain, unqualified `find`/`findByID` call - reading
 *    `collections/operations/findByID.js` line by line shows `accessResult
 *    === false` is only ever reachable when `executeAccess` was called WITH
 *    `disableErrors: true` (otherwise `executeAccess` itself already threw
 *    `Forbidden` before returning). So: with `overrideAccess: false` and no
 *    `disableErrors`, a denied `find`/`findByID`/`count`/`findGlobal` call
 *    THROWS (`Forbidden` for a collection, same class here since findOne's own
 *    `NotFound`-throwing branch is genuinely unreachable dead code in real
 *    Payload for the same reason - see `findGlobal`'s doc comment) exactly
 *    like every other access-controlled operation; passing `disableErrors:
 *    true` is what turns that into an empty/`null` result. This module
 *    exposes `disableErrors` as a caller option (default `false`) rather than
 *    forcing it, matching the real contract.
 *
 * 3. Population (`depth`) ALWAYS uses `disableErrors: true` internally,
 *    regardless of the outer call's own setting - confirmed in
 *    `collections/dataloader.js`'s `batchAndLoadDocs`, which is what every
 *    relationship/upload/join field's population resolves through: `await
 *    payload.find({ ..., disableErrors: true, overrideAccess: Boolean(
 *    overrideAccess), pagination: false, ... })`. A related document that
 *    can't be read (deleted, or genuinely access-denied) never throws and
 *    aborts the outer read - it just leaves the raw id in place (see
 *    `relationshipPopulationPromise.js`: `if (!relationshipValue) {
 *    relationshipValue = id }` - "ids are visible regardless of access
 *    controls"). `populateOne` below reproduces exactly this: hardcoded
 *    `disableErrors: true` for every population fetch, independent of the
 *    top-level call's own `disableErrors`.
 *
 * 4. Field-level access is ALSO skipped by `overrideAccess`, not just the
 *    collection/global-level check - confirmed in `fields/hooks/afterRead/
 *    promise.js`: `const canReadField = overrideAccess ? true :
 *    await field.access.read(...)`. `overrideAccess` is threaded into field
 *    traversal here for exactly that reason (see `traverseField`).
 *
 * 5. `find`'s own step order (`collections/operations/find.js`): resolve
 *    access (skipped entirely under `overrideAccess`) -> on denial (only
 *    possible with `disableErrors: true`) return the exact empty
 *    `PaginatedDocs` shape at find.js:53-63 -> `combineQueries(where,
 *    accessResult)` -> the DB query (sort/limit/page/pagination) -> per-doc
 *    field-level `afterRead` hooks + field access (`fields/hooks/afterRead/
 *    index.js`'s `afterRead`, called with `findMany: true`) -> collection-level
 *    `afterRead` hooks (SKIPPED here - see the file-header note on
 *    collection/global-level `afterRead` in `./hooks.ts`: this app declares
 *    zero of these, re-confirmed by a fresh grep before writing this file) ->
 *    return. `findByID` (`findByID.js`) is the same shape, singular: access
 *    resolved with `id` in the args, `where: { id: { equals: id } }` merged
 *    via `combineQueries` (see `findByIDInternal`'s doc comment for why this
 *    module checks that merge IN MEMORY rather than pushing it into the DB
 *    query), `findMany: false`. A doc that doesn't exist by that merged
 *    criteria (a genuinely bad id, OR one the access-Where filtered out)
 *    THROWS `NotFound` by default, same as a denied access throwing
 *    `Forbidden` - only `disableErrors: true` turns either into a plain
 *    `null` return (see `findByIDInternal`'s own doc comment - confirmed by
 *    reading `findByID.js` line by line, not assumed). `count.js` mirrors
 *    `find`'s access step exactly, denial returns `{ totalDocs: 0 }`
 *    (count.js:29-33), no field-level anything (a count never touches field
 *    data). `globals/operations/findOne.js` has the same access shape as
 *    `findByID` but with no `id` (a global is a singleton) - see
 *    `findGlobal`'s doc comment for its own specifics.
 *
 * 6. Draft resolution: `find` never supports listing drafts in this app - not
 *    a limitation this module introduces, but an existing, already-documented
 *    gap in `src/cms/db/generic.ts`'s own `createDraftOps`/`db/index.ts`
 *    ("findMany does not support a `draft` flag ... nothing in this app
 *    queries a LIST of drafts today"), re-confirmed by grepping every
 *    `.find({` call site in `src/` for a `draft` option (none). So `find`'s
 *    own args deliberately have NO `draft` field - passing one would silently
 *    do nothing, which is worse than not offering it. `findByID` DOES support
 *    `draft` (threaded straight through to the registry's own `findByID`,
 *    whose `createDraftOps` wrapping already resolves live-vs-latest-version
 *    for the 4 versioned collections - see `db/index.ts`'s Phase 9 notes).
 *    `count` has no draft concept either (`baseOps.count`, always the live
 *    table - `createDraftOps` never overrides it).
 */

import type { AccessFn, AccessResult, FieldAccessFn, LocalReq, Where } from './access'
import { combineQueries, executeAccess, executeFieldAccess } from './access'
import type { AfterReadFieldHookArgs } from './hooks'
import { runFieldHook } from './hooks'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** Real Payload's `Sort` (`config/types.d.ts`) is `string | string[]` - a bare field name sorts ascending, a `-`-prefixed one descending. Re-declared here (not imported) for the same zero-`payload`-dependency reason as everything else in this file. */
export type Sort = string | string[]

/**
 * The subset of a real Payload `Field`'s shape this module's generic field
 * traversal (`traverseFields`) needs, trimmed to exactly what this app's
 * fields use (per `./validators.ts`'s own confirmed field-type inventory,
 * plus `group`/`row` - the two pure-layout/structural types that inventory
 * explicitly named as carrying no validation of their own, but which very
 * much carry hooks/access/nested-fields here): `name`, `type`, `hasMany`,
 * `relationTo` (relationship/upload), `collection` (join), `fields` (group/
 * row/array), `blocks` (blocks), `defaultValue`, `hooks.afterRead`, and
 * `access.read`.
 *
 * `tabs`/`collapsible` are deliberately NOT modeled - confirmed by a fresh
 * grep immediately before writing this file (`grep -rl "type: 'tabs'"` /
 * `"type: 'collapsible'"` under `src/`, zero matches for either) - this app
 * uses only `group` (19 files) and `row` (28 files) as its structural field
 * types, both handled by `traverseField`'s `case 'group'`/`case 'row'`.
 *
 * Every property is optional and loosely typed (`unknown`-flavoured where a
 * real Payload field's own type would be a big discriminated union) so that
 * this app's REAL `Field[]` arrays (`Events.fields`, `PaymentSettings.fields`,
 * ...; still typed against Payload's real `Field` via `@/engine`, entirely
 * unmodified) are structurally assignable to `ReadFieldConfig[]` without any
 * cast at the registry boundary - the same reasoning `./access.ts`'s
 * `AccessFn`/`req: any` doc comment already worked through for `Access`/
 * `FieldAccess` functions, applied here to the field config itself.
 */
export type ReadFieldConfig = {
  name?: string
  type: string
  hasMany?: boolean
  /** relationship/upload only. This app never configures a polymorphic `relationTo: [...]` array (confirmed by `./validators.ts`'s own grep, re-checked here) - always a single collection slug string. A polymorphic value (an array, or a stored `{ relationTo, value }` shape) is deliberately NOT populated by `traverseField` - see its doc comment. */
  relationTo?: string | string[]
  /** join fields only - the target collection whose own relationship/hasMany field this join resolves against. Same single-slug-only assumption as `relationTo`. */
  collection?: string | string[]
  /** group/row/array's own subfields. */
  fields?: ReadFieldConfig[]
  /** blocks' own per-block-type field lists, keyed by `slug` (matching the stored `blockType` on each item). */
  blocks?: { slug: string; fields: ReadFieldConfig[] }[]
  defaultValue?: unknown
  access?: { read?: FieldAccessFn }
  /**
   * `args: any`, not `args: AfterReadFieldHookArgs` - deliberately, for the
   * exact reason `./access.ts`'s `AccessFn`/`FieldAccessFn` type their own
   * `req` as `any` rather than a rich shape (see that module's doc comment
   * on `AccessFn`): real Payload's own `FieldHook`'s args type
   * (`FieldHookArgs`) requires a CONCRETE, non-optional `collection:
   * SanitizedCollectionConfig` - checked directly with `tsc` against this
   * app's real `strict`/`strictFunctionTypes` settings, a hook typed with
   * this module's own `AfterReadFieldHookArgs` (whose `collection` is
   * `unknown`, from `./hooks.ts`'s `FieldHookArgsBase`) fails function-
   * parameter contravariance against it ("Type '{}' is missing ... from type
   * 'SanitizedCollectionConfig'"), which would make every one of this app's
   * REAL field configs (`Field[]`, still typed against Payload's real
   * `Field` via `@/engine`) fail to structurally satisfy `ReadFieldConfig`
   * at the registry boundary - exactly the assignability `ReadFieldConfig`'s
   * own doc comment promises. `any` is the only type that clears that bar
   * without reproducing Payload-internal types this module has no business
   * knowing about, same conclusion `AccessFn` already reached. The actual
   * object this module calls a hook with (`traverseField`) is still built to
   * `./hooks.ts`'s real `AfterReadFieldHookArgs` shape - only the STATIC
   * type here is loosened, not the runtime call.
   */
  hooks?: { afterRead?: Array<(args: any) => unknown> } // eslint-disable-line @typescript-eslint/no-explicit-any -- see doc comment above
}

/** The subset of a real Payload `CollectionConfig`/`GlobalConfig` this module needs: its own `slug`, `fields`, and `access.read` - loose for the same reason as `ReadFieldConfig`. */
export type ReadEntityConfig = {
  slug: string
  fields: ReadFieldConfig[]
  access?: { read?: AccessFn }
}

/**
 * Stands in for real Payload's `NotFound` (`payload/dist/errors/NotFound.js`)
 * for the ONE place this module needs it - see `findByIDInternal`'s doc
 * comment. Kept distinct from `./access.ts`'s `Forbidden` (a different real
 * error class in real Payload too) even though both currently carry a fixed
 * English message for the same reason `Forbidden` does - no second admin-UI
 * locale configured (see that class's own doc comment).
 */
export class NotFound extends Error {
  constructor(message = 'Not Found.') {
    super(message)
    this.name = 'NotFound'
  }
}

export type Doc = Record<string, unknown> & { id: number }

/** Real Payload's `PaginatedDocs<T>` (`database/types.d.ts`) - every field this app's own `.find({...})` call sites are confirmed (by grep) to actually destructure off a result, plus the handful more that cost nothing to include for parity. */
export type PaginatedDocs<T = Doc> = {
  docs: T[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
  pagingCounter: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
}

/**
 * One collection's read surface for this module: its real config (for access/
 * field traversal) plus the exact `src/cms/db` functions a collection's own
 * ops file already exports - `find{X}Paginated`/`find{X}ByID`/`count{X}` (see
 * e.g. `src/cms/db/collections/events.ts`). A non-drafts collection's
 * `findByID` (e.g. `findFaqByID: (id: number) => Promise<FaqDoc | null>`) is
 * structurally assignable here even though it doesn't declare the `opts`
 * parameter at all - a JS function silently ignores an extra call argument it
 * never named, and TypeScript's own function-type assignability rules allow a
 * function with FEWER parameters to satisfy a type expecting more.
 */
export type CollectionReadEntry = {
  config: ReadEntityConfig
  findPaginated: (args: { where?: Where; sort?: Sort; limit?: number; page?: number; pagination?: boolean }) => Promise<PaginatedDocs>
  findByID: (id: number, opts?: { draft?: boolean }) => Promise<Doc | null>
  count: (args?: { where?: Where }) => Promise<number>
}

/** One global's read surface - `src/cms/db/generic.ts`'s `createGlobalOps` only ever exposes a bare `find()` (no `where`, no `id` - a global is one row, see `findGlobal`'s doc comment), matching every one of this app's real globals. */
export type GlobalReadEntry = {
  config: ReadEntityConfig
  find: () => Promise<Doc | null>
}

/** Slug -> read-entry maps this module's four operations dispatch through. A caller builds one covering only the collections/globals it needs (a handful for a parity test, eventually all 21/17 once this module is wired into `@/engine`) - this module itself has no fixed inventory of collections. */
export type ReadRegistry = {
  collections: Record<string, CollectionReadEntry>
  globals: Record<string, GlobalReadEntry>
}

/** Real Payload's own hardcoded defaults (`config/defaults.js`: `defaultDepth: 2`, `maxDepth: 10`) - this app's `engage.config.ts` never overrides either (confirmed by grep), so both apply unmodified here. */
const DEFAULT_DEPTH = 2
const MAX_DEPTH = 10

export type ReadOptions = {
  req: LocalReq
  /** Default `true` - see the file header's point 1. */
  overrideAccess?: boolean
  /** Default `false` - see the file header's point 2. */
  disableErrors?: boolean
  /** Default `2`, capped at `10` - see the constants above. */
  depth?: number
}

export type FindArgs = ReadOptions & {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}

export type FindByIDArgs = ReadOptions & {
  /** Versioned collections only (Events/Pages/Posts/Courses) - threaded straight through to the registry entry's own `findByID`, which already resolves live-vs-latest-version (`src/cms/db/generic.ts`'s `createDraftOps`). A non-drafts collection's `findByID` simply ignores it. */
  draft?: boolean
}

export type CountArgs = ReadOptions & { where?: Where }

export type FindGlobalArgs = ReadOptions

/* -------------------------------------------------------------------------- */
/* In-memory Where matching (findByID's access-merge only - see its doc comment) */
/* -------------------------------------------------------------------------- */

/**
 * Evaluates a `Where` clause against an already-fetched document IN MEMORY,
 * rather than translating it to SQL - `src/cms/db/generic.ts`'s
 * `createCollectionOps`/`createDraftOps`' `findByID` takes a bare `id` and
 * nothing else (no `where` parameter to push a merged access-filter into,
 * unlike `findPaginated`, which does accept one and uses `src/cms/db/
 * where.ts`'s real SQL-building `buildWhere` for it). Since `findByID` fetches
 * at most one already-identified row, checking "does the access-control
 * `Where` this collection's access function produced also match THIS row" in
 * memory is behaviourally equivalent to pushing it into the query, for the
 * single-row case `findByIDInternal` uses this for.
 *
 * Deliberately narrow, same spirit as `buildWhere`'s own scoping note:
 * `equals`/`not_equals`/`in`/`not_in`/`exists` plus `and`/`or` is every
 * operator this app's actual Where-returning access functions
 * (`adminOrPublishedStatus`, `isAdminOrSelf`, `isDocumentOwner`,
 * `isAdminOrRsvpOwner`, `isAdminOrMembershipOwner`, the local `adminOrOwn`s)
 * are confirmed (by reading every one directly) to ever produce - a single
 * top-level `{ field: { equals: value } }`. Anything else throws rather than
 * silently matching the wrong thing.
 */
function matchesWhere(doc: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'and' && Array.isArray(value)) return (value as Where[]).every((w) => matchesWhere(doc, w))
    if (key === 'or' && Array.isArray(value)) return (value as Where[]).length === 0 || (value as Where[]).some((w) => matchesWhere(doc, w))

    const operators = value as Record<string, unknown>
    return Object.entries(operators).every(([operator, operand]) => {
      const fieldValue = doc[key]
      switch (operator) {
        case 'equals':
          return fieldValue === operand
        case 'not_equals':
          return fieldValue !== operand
        case 'in':
          return Array.isArray(operand) && operand.includes(fieldValue)
        case 'not_in':
          return Array.isArray(operand) && !operand.includes(fieldValue)
        case 'exists':
          return operand ? fieldValue !== null && fieldValue !== undefined : fieldValue === null || fieldValue === undefined
        default:
          throw new Error(`matchesWhere: operator "${operator}" is not implemented - this in-memory matcher only covers what this app's real access functions produce (see its doc comment).`)
      }
    })
  })
}

/** `access.ts`'s own `hasWhereAccessResult`, re-derived here (not exported by that module) - `true` narrows out (nothing to check), `false` never reaches this point (both `find`/`findByID`/`count`/`findGlobal` already short-circuit on a denied access before this would run). */
function isWhereResult(access: AccessResult): access is Where {
  return Boolean(access) && typeof access === 'object'
}

/* -------------------------------------------------------------------------- */
/* Field traversal - afterRead hooks + field access + depth population        */
/* -------------------------------------------------------------------------- */

type TraverseCtx = {
  req: LocalReq
  overrideAccess: boolean
  depth: number
  currentDepth: number
  draft?: boolean
  findMany: boolean
  registry: ReadRegistry
  /**
   * Memoizes one call's population fetches by `"<slug>:<id>"`, NOT real
   * Payload's per-request `dataloader` (which batches every id needing
   * population within one (collection, depth, ...) combination into a
   * single extra `find`, see the file header's point 3) - this is a plain
   * per-id result cache, so populating the SAME related document from two
   * different fields (a post's `author` and its `tags` both pointing partly
   * at the same user, say) fetches it once and reuses the result, rather
   * than either re-fetching it or (a real bug an earlier version of this
   * module had) treating the second reference as "already handled" and
   * leaving it as a raw, unpopulated id. Cycle safety (A relates to B
   * relates back to A) needs no separate guard: `currentDepth <= depth`
   * already bounds every recursive `populateOne` call, so a cycle simply
   * stops populating once `depth` is exhausted, the same way real Payload's
   * own `depth` bound does.
   */
  populateCache: Map<string, Promise<unknown>>
}

/**
 * Populates one relationship/upload/join value - the from-scratch, deliberately
 * SCOPED counterpart to real Payload's `relationshipPopulationPromise.js` +
 * `collections/dataloader.js`. Real Payload batches every id needing
 * population in one request into one extra `find` per (collection, depth,
 * ...) combination via a dataloader; this recurses through this module's own
 * `findByIDInternal` per id instead - correct, not batched. Scoped to what
 * this app's real fields need (per `./validators.ts`'s own confirmed finding,
 * re-used here: no field in this app declares a polymorphic `relationTo`), so
 * `targetSlug` is always a single collection slug, never resolved per-item
 * from a stored `{ relationTo, value }` shape.
 *
 * `disableErrors: true` is HARDCODED here regardless of the outer call's own
 * setting - see the file header's point 3 for why that is real Payload
 * behaviour, not a shortcut. A target collection missing from the caller's
 * `registry` (this module has no fixed collection inventory - see
 * `ReadRegistry`'s doc comment), a not-found id, or a genuinely
 * access-denied related document all fall back to the raw id/doc-reference
 * unchanged, matching real Payload's own "ids are visible regardless of
 * access controls" fallback.
 */
async function populateOne(targetSlug: string, idOrDoc: unknown, ctx: TraverseCtx): Promise<unknown> {
  if (idOrDoc === null || idOrDoc === undefined) return idOrDoc
  const rawId = typeof idOrDoc === 'object' ? (idOrDoc as { id?: unknown }).id : idOrDoc
  if (typeof rawId !== 'number' && typeof rawId !== 'string') return idOrDoc
  const id = Number(rawId)
  if (!Number.isFinite(id)) return idOrDoc

  const entry = ctx.registry.collections[targetSlug]
  if (!entry) return idOrDoc

  const cacheKey = `${targetSlug}:${id}`
  let populated = ctx.populateCache.get(cacheKey)
  if (!populated) {
    populated = findByIDInternal(entry, id, {
      ...ctx,
      disableErrors: true,
      currentDepth: ctx.currentDepth + 1,
    })
    ctx.populateCache.set(cacheKey, populated)
  }
  return (await populated) ?? idOrDoc
}

/**
 * Runs one field's real `afterRead` step order (`fields/hooks/afterRead/
 * promise.js`, confirmed by reading it directly, not assumed):
 *
 *   1. Sanitize: an empty `group` field defaults its value to `{}` (so a
 *      hook/nested field on an as-yet-unwritten group has something to write
 *      into - `promise.js`'s own `case 'group'` branch, BEFORE hooks run).
 *   2. Field-level `hooks.afterRead`, chained via `./hooks.ts`'s
 *      `runFieldHook` (`!== undefined` semantics, NOT the collection-level
 *      `||` - see that module's own file header for why the distinction is
 *      load-bearing for `decryptSecretHook`'s fail-closed `''`).
 *   3. Field-level `access.read`, via `./access.ts`'s `executeFieldAccess` -
 *      SKIPPED entirely when `overrideAccess` (file header point 4), deletes
 *      the field from `siblingData` on a `false` result. Returns immediately
 *      after (nothing left to populate/recurse into on a deleted field).
 *   4. `defaultValue` backfill when still `undefined` after the above (real
 *      Payload's own "Set defaultValue on the field for globals being
 *      returned without being first created" step) - function defaults are
 *      out of scope, same as `src/cms/db/generic.ts`'s own create-path
 *      handling (a function default is a per-request computed value, a
 *      write-time concern, not a read-time one).
 *   5. `depth` population for `relationship`/`upload`/`join` fields (see
 *      `populateOne`).
 *   6. Recurse into nested structures (`group`/`row`/`array`/`blocks`).
 */
async function traverseField(field: ReadFieldConfig, siblingData: Record<string, unknown>, doc: Record<string, unknown>, ctx: TraverseCtx): Promise<void> {
  const name = field.name

  if (field.type === 'group' && name && siblingData[name] === undefined) {
    siblingData[name] = {}
  }

  if (name) {
    if (field.hooks?.afterRead?.length) {
      for (const hook of field.hooks.afterRead) {
        const hookArgs: AfterReadFieldHookArgs = {
          blockData: undefined,
          collection: null,
          context: {},
          currentDepth: ctx.currentDepth,
          data: doc,
          depth: ctx.depth,
          draft: ctx.draft,
          field,
          findMany: ctx.findMany,
          global: null,
          indexPath: [],
          operation: 'read',
          originalDoc: doc,
          overrideAccess: ctx.overrideAccess,
          path: [],
          req: ctx.req,
          schemaPath: [],
          showHiddenFields: false,
          siblingData,
          siblingFields: [],
          value: siblingData[name],
        }
        siblingData[name] = await runFieldHook(hook, hookArgs)
      }
    }

    if (field.access?.read) {
      const allowed = ctx.overrideAccess
        ? true
        : await executeFieldAccess(field.access.read, {
            id: doc.id as number | undefined,
            data: doc,
            doc,
            req: ctx.req,
            siblingData,
          })
      if (!allowed) {
        delete siblingData[name]
        return
      }
    }

    if (siblingData[name] === undefined && field.defaultValue !== undefined && typeof field.defaultValue !== 'function') {
      siblingData[name] = field.defaultValue
    }

    if (ctx.depth > 0 && ctx.currentDepth <= ctx.depth) {
      if ((field.type === 'relationship' || field.type === 'upload') && typeof field.relationTo === 'string') {
        const targetSlug = field.relationTo
        const value = siblingData[name]
        if (field.hasMany && Array.isArray(value)) {
          siblingData[name] = await Promise.all(value.map((item) => populateOne(targetSlug, item, ctx)))
        } else if (value !== undefined && value !== null) {
          siblingData[name] = await populateOne(targetSlug, value, ctx)
        }
      } else if (field.type === 'join' && typeof field.collection === 'string') {
        const targetSlug = field.collection
        const joinValue = siblingData[name] as { docs?: unknown[]; hasNextPage?: boolean } | undefined
        if (joinValue && Array.isArray(joinValue.docs)) {
          joinValue.docs = await Promise.all(joinValue.docs.map((item) => populateOne(targetSlug, item, ctx)))
        }
      }
    }
  }

  switch (field.type) {
    case 'group': {
      const groupValue = name ? (siblingData[name] as Record<string, unknown>) : siblingData
      if (field.fields?.length && groupValue) await traverseFields(field.fields, groupValue, doc, ctx)
      break
    }
    case 'row': {
      // Purely structural - no name of its own, its own subfields land
      // directly in the same `siblingData` object (confirmed: this app's
      // real db layer never wraps a `row`'s subfields in anything, they sit
      // flat alongside their siblings - see src/cms/db/index.ts's Phase 5
      // "row/collapsible flattening" note).
      if (field.fields?.length) await traverseFields(field.fields, siblingData, doc, ctx)
      break
    }
    case 'array': {
      if (name && field.fields?.length) {
        const items = (siblingData[name] as Record<string, unknown>[] | undefined) ?? []
        for (const item of items) await traverseFields(field.fields, item, doc, ctx)
      }
      break
    }
    case 'blocks': {
      if (name && field.blocks?.length) {
        const items = (siblingData[name] as (Record<string, unknown> & { blockType?: string })[] | undefined) ?? []
        for (const item of items) {
          const blockDef = field.blocks.find((b) => b.slug === item.blockType)
          if (blockDef) await traverseFields(blockDef.fields, item, doc, ctx)
        }
      }
      break
    }
    default:
      break
  }
}

async function traverseFields(fields: ReadFieldConfig[], siblingData: Record<string, unknown>, doc: Record<string, unknown>, ctx: TraverseCtx): Promise<void> {
  for (const field of fields) {
    await traverseField(field, siblingData, doc, ctx)
  }
}

/* -------------------------------------------------------------------------- */
/* findByID                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Shared by the public `findByID` and `populateOne` (population is, in real
 * Payload, exactly a nested `find`/`findByID` call - see the file header's
 * point 3). Real step order (`collections/operations/findByID.js`,
 * confirmed):
 *
 *   1. `overrideAccess ? true : executeAccess(accessFn, { req, id, disableErrors })`.
 *   2. `accessResult === false` -> return `null` (only reachable with
 *      `disableErrors: true` - see the file header's point 2).
 *   3. `combineQueries({ id: { equals: id } }, accessResult)` - real Payload
 *      pushes this INTO the database query. This module's registry `findByID`
 *      takes a bare `id` with no `where` to push a merge into (see
 *      `matchesWhere`'s doc comment for why), so instead: fetch by `id` first,
 *      then check the fetched doc against `accessResult` IN MEMORY when it is
 *      a genuine `Where` (not a bare `true`) - a denied match returns `null`,
 *      identical outcome to a SQL query that excluded the row.
 *   4. Field-level `afterRead` hooks + field access + population
 *      (`traverseFields`, `findMany: false`).
 */
async function findByIDInternal(entry: CollectionReadEntry, id: number, ctx: Omit<TraverseCtx, 'currentDepth'> & { currentDepth: number; disableErrors: boolean }): Promise<Doc | null> {
  const accessResult: AccessResult = ctx.overrideAccess ? true : await executeAccess(entry.config.access?.read, { req: ctx.req, id, disableErrors: ctx.disableErrors })
  if (accessResult === false) return null

  const rawDoc = await entry.findByID(id, { draft: ctx.draft })
  const matchesAccess = rawDoc !== null && (!isWhereResult(accessResult) || matchesWhere(rawDoc, accessResult))

  // Confirmed by reading `collections/operations/findByID.js` line by line
  // (not assumed): `if (!docFromDB && !args.data) { if (!disableErrors) {
  // throw new NotFound(req.t) } return null }`. This fires whether the doc
  // is missing because the id genuinely doesn't exist OR because the
  // access-merged `where` filtered it out - real Payload does not
  // distinguish "wrong id" from "exists but you can't see it", both throw
  // `NotFound` by default. This is easy to miss (most read APIs return
  // `null` for a missing document) but is what real Payload's own Local API
  // does for a plain, unqualified `findByID` call with no `disableErrors` -
  // only `disableErrors: true` turns it into a `null` return, same switch as
  // the access-denial case above.
  if (!matchesAccess) {
    if (!ctx.disableErrors) throw new NotFound()
    return null
  }

  const doc: Doc = { ...(rawDoc as Doc) }
  await traverseFields(entry.config.fields, doc, doc, { ...ctx, findMany: false })
  return doc
}

export async function findByID(registry: ReadRegistry, collection: string, id: number, args: FindByIDArgs): Promise<Doc | null> {
  const entry = registry.collections[collection]
  if (!entry) throw new Error(`findByID: unknown collection "${collection}" in this call's registry.`)

  const { req, overrideAccess = true, disableErrors = false, depth = DEFAULT_DEPTH, draft } = args
  return findByIDInternal(entry, id, {
    req,
    overrideAccess,
    disableErrors,
    depth: Math.min(depth, MAX_DEPTH),
    currentDepth: 1,
    draft,
    findMany: false,
    registry,
    populateCache: new Map(),
  })
}

/* -------------------------------------------------------------------------- */
/* find                                                                        */
/* -------------------------------------------------------------------------- */

export async function find(registry: ReadRegistry, collection: string, args: FindArgs): Promise<PaginatedDocs> {
  const entry = registry.collections[collection]
  if (!entry) throw new Error(`find: unknown collection "${collection}" in this call's registry.`)

  const { req, overrideAccess = true, disableErrors = false, depth = DEFAULT_DEPTH, where, sort, limit, page, pagination } = args
  const cappedDepth = Math.min(depth, MAX_DEPTH)

  let accessResult: AccessResult = true
  if (!overrideAccess) {
    accessResult = await executeAccess(entry.config.access?.read, { req, disableErrors })
    if (accessResult === false) {
      // Exact shape of real Payload's own denied-with-disableErrors empty
      // result (find.js:53-63) - including `limit` echoing the caller's own
      // RAW `limit` argument (possibly `undefined`), not a sanitized default;
      // that is genuinely what real Payload returns here, not an oversight.
      return {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: limit as number,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 0,
        totalPages: 1,
      }
    }
  }

  const fullWhere = combineQueries(where, accessResult)
  const result = await entry.findPaginated({ where: fullWhere, sort, limit, page, pagination })

  const docs = await Promise.all(
    result.docs.map(async (rawDoc) => {
      const doc: Doc = { ...rawDoc }
      await traverseFields(entry.config.fields, doc, doc, {
        req,
        overrideAccess,
        depth: cappedDepth,
        currentDepth: 1,
        findMany: true,
        registry,
        populateCache: new Map(),
      })
      return doc
    }),
  )

  return { ...result, docs }
}

/* -------------------------------------------------------------------------- */
/* count                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors `count.js` exactly (confirmed by reading it directly): same access
 * shape as `find`, denial (only under `disableErrors: true`) returns `{
 * totalDocs: 0 }` (count.js:29-33) verbatim - no other fields, unlike find's
 * richer empty-result shape. No field-level anything - a count never
 * materialises field data, so there is nothing for `traverseFields` to do
 * here. `where`-merge pushes down into the database query exactly like
 * `find` does (the registry's own `count` DOES accept a `where`, unlike
 * `findByID` - see `matchesWhere`'s doc comment for the one place that
 * isn't true).
 */
export async function count(registry: ReadRegistry, collection: string, args: CountArgs): Promise<{ totalDocs: number }> {
  const entry = registry.collections[collection]
  if (!entry) throw new Error(`count: unknown collection "${collection}" in this call's registry.`)

  const { req, overrideAccess = true, disableErrors = false, where } = args

  let accessResult: AccessResult = true
  if (!overrideAccess) {
    accessResult = await executeAccess(entry.config.access?.read, { req, disableErrors })
    if (accessResult === false) return { totalDocs: 0 }
  }

  const fullWhere = combineQueries(where, accessResult)
  const totalDocs = await entry.count({ where: fullWhere })
  return { totalDocs }
}

/* -------------------------------------------------------------------------- */
/* findGlobal                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors `globals/operations/findOne.js` (confirmed by reading it directly):
 * same access shape as `findByID` but with no `id` (a global has no
 * "which one" - `AccessArgs` for a global read never carries one, matching
 * real Payload's own `globalConfig.access.read` signature, which is why
 * `./access.ts`'s `executeAccess` call below omits `id` entirely). A denied
 * access with `disableErrors: true` returns `null` - the real code ALSO has
 * an `if (!disableErrors) throw new NotFound(req.t)` branch immediately
 * after, but reading it closely shows that branch is unreachable in
 * practice: `accessResult === false` can only be true when `executeAccess`
 * was itself called with `disableErrors: true` (otherwise `executeAccess`
 * already threw `Forbidden` before `findOne.js` ever sees a return value) -
 * so a denied read without `disableErrors` throws `Forbidden` here too (via
 * `executeAccess`, propagating naturally), never the dead `NotFound` branch.
 *
 * No `Where`-merge: `src/cms/db/generic.ts`'s `createGlobalOps.find()` takes
 * no `where` parameter at all (a global is always exactly one row, `SELECT *
 * ... LIMIT 1`, real Payload's own real adapter confirmed to do the same -
 * see that file's Phase 18 note), and every one of this app's 17 real
 * globals is confirmed (by grep, `./access.ts`'s own investigation and a
 * fresh check here) to use a boolean-only read access function (`() => true`
 * or `isAdmin`) - never a `Where`-returning one. So unlike `find`/`findByID`,
 * this module does not attempt to reconcile a `Where`-shaped `accessResult`
 * against a global's row - there is nothing in this app's real config that
 * would ever produce one, and nowhere to push it if one existed.
 *
 * When no row has ever been written for this global yet, `entry.find()`
 * returns `null` (no default-populated stand-in row) - this module returns
 * `{}` in that case, matching real Payload's own `docFromDB ?? {}`
 * fallback, then runs the SAME field traversal over it so any field
 * `defaultValue`s still get filled in (see `traverseField`'s doc comment).
 */
export async function findGlobal(registry: ReadRegistry, slug: string, args: FindGlobalArgs): Promise<Doc | null> {
  const entry = registry.globals[slug]
  if (!entry) throw new Error(`findGlobal: unknown global "${slug}" in this call's registry.`)

  const { req, overrideAccess = true, disableErrors = false, depth = DEFAULT_DEPTH } = args
  const cappedDepth = Math.min(depth, MAX_DEPTH)

  if (!overrideAccess) {
    const accessResult = await executeAccess(entry.config.access?.read, { req, disableErrors })
    if (accessResult === false) return null
  }

  const rawDoc = await entry.find()
  // `id: 0` is a synthetic placeholder for the "global has never been
  // written" branch only - none of this app's real globals are ever queried
  // in that state (every one is seeded before first read), so this value is
  // never actually observed; it exists purely so `Doc`'s `id: number`
  // requirement is satisfied without inventing a richer "maybe no id" type
  // for a case nothing here exercises.
  const doc: Doc = rawDoc ? { ...rawDoc } : ({ id: 0 } as Doc)
  await traverseFields(entry.config.fields, doc, doc, {
    req,
    overrideAccess,
    depth: cappedDepth,
    currentDepth: 1,
    findMany: false,
    registry,
    populateCache: new Map(),
  })
  return doc
}
