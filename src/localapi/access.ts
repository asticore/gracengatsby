/**
 * Access-control executor, reimplemented from Payload 3.88.0's real
 * `node_modules/payload/dist/auth/executeAccess.js`,
 * `node_modules/payload/dist/database/combineQueries.js` and
 * `node_modules/payload/dist/auth/types.js` (`hasWhereAccessResult`), so this
 * app's eventual from-scratch Local API (stage 1b, following
 * `src/localapi/validators.ts`'s stage 1a - see the `payload-removal-plan.md`
 * project doc for the full sequence) makes the exact same allow/deny/filter
 * decisions Payload's create/find/findByID/update/delete operations make
 * today, for the ~8 collection-level access functions this app actually
 * wrote that return a `Where` clause instead of a boolean (`adminOrPublishedStatus`,
 * `isAdminOrSelf`, `isDocumentOwner` in `src/access/ecommerceAccess.ts`;
 * `isAdminOrRsvpOwner` in `src/features/accounts/access.ts`;
 * `isAdminOrMembershipOwner` in `src/features/members/access.ts`; the local
 * `adminOrOwn` in `src/features/courses/collections/Enrolments.ts` and
 * `LessonProgress.ts`; the async, `req.payload.find`-backed `readableLessons`
 * in `Lessons.ts`), plus the field-level access this app puts on
 * `Users.roles` and a long list of admin-only Settings-global fields
 * (`adminOnlyFieldAccess` in `ecommerceAccess.ts`, and one inline `() =>
 * false` field lock in `src/features/security/twoFactor.ts`).
 *
 * None of this app's OWN access functions are rewritten here - they stay
 * typed against Payload's real `Access`/`FieldAccess` (re-exported by
 * `@/engine`) and are called through this module unmodified (a later,
 * separate stage repoints their `import type { Access } from 'payload'` to
 * this module's own types; see `AccessFn`'s doc comment for why that repoint
 * needs no change to the functions themselves). Only the EXECUTOR - the code
 * that decides what a falsy/truthy/object return means, and how a `Where`
 * result gets merged with an operation's own query - is new.
 *
 * This module is intentionally NOT wired into `@/engine`/`engage.config.ts`
 * yet, same as `validators.ts` - it stands alone, exercised only by its own
 * tests, so it can be proven correct against real Payload behavior in
 * isolation first.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors real Payload's `Where` (`payload/dist/types/index.d.ts:106-112`)
 * exactly: an object whose keys are either a field path mapped to an
 * operator object (`WhereField`, e.g. `{ equals: 1 }`), or the two reserved
 * boolean-logic keys `and`/`or`, each an array of nested `Where` clauses.
 * Real Payload types `WhereField`'s operator values as `JsonValue` (itself
 * `JsonArray | JsonObject | unknown`, which collapses to `unknown`) - kept as
 * `unknown` here too, rather than narrowed to this app's actual operators
 * (`equals`, `in`, ...), so real `Where` values built by this app's existing
 * access functions (still typed against Payload's real `Where` via
 * `@/engine`) stay assignable into this type without modification.
 */
export type Where = {
  [key: string]: Where[] | Record<string, unknown>
  and?: Where[]
  or?: Where[]
}

/**
 * Mirrors real Payload's `AccessResult` (`config/types.d.ts:231`): `true`
 * means unrestricted access, a `Where` narrows which rows are visible/
 * writable, and (only relevant with `disableErrors`, see `executeAccess`)
 * `false` means no access at all.
 */
export type AccessResult = boolean | Where

/**
 * Mirrors real Payload's `Access<TData>` (`config/types.d.ts:252`), whose
 * args are `AccessArgs<TData>` (`config/types.d.ts:232-245`): `id`, `data`,
 * `isReadingStaticFile` and a required `req`.
 *
 * `req` is typed as `any` here, not as a hand-rolled "local request" shape,
 * and that is deliberate rather than lazy: real Payload's `AccessArgs.req`
 * is `PayloadRequest`, a type with ~15 unrelated required properties
 * (`i18n`, `payloadDataLoader`, `transactionID`, the inherited `URL` fields,
 * ...) that none of this app's access functions touch. For this app's
 * EXISTING access functions (still typed against Payload's real `Access`
 * from `@/engine`) to remain assignable to `AccessFn` without modification,
 * this type's `req` must be a type real `PayloadRequest` is assignable to -
 * and empirically (checked with `tsc` against this repo's real
 * `strict`/`strictFunctionTypes` settings), `any` is the only type that
 * clears that bar without reproducing Payload-internal types this module
 * has no business knowing about. A rich, narrower `req` shape (even with a
 * catch-all index signature) fails with "missing properties from type
 * PayloadRequest: headers, context, i18n, payload, and 13 more" - the
 * missing-property check is on NAMED required properties, which an index
 * signature does not supply. See `LocalReq` below for the shape this
 * module's OWN callers should actually use when building the `req` object.
 *
 * `id`/`data` are typed against this app's real ID type (`number` - see
 * `IDType`'s doc comment in `validators.ts` for why), confirmed by `tsc`
 * against this app's real, generated `Access` type (`DefaultDocumentIDType`
 * resolves to `number`, not `string | number`, for this app's sqlite
 * adapter).
 */
export type AccessFn<TData = unknown> = (args: {
  id?: number
  data?: TData
  isReadingStaticFile?: boolean
  req: any // eslint-disable-line @typescript-eslint/no-explicit-any -- see doc comment above
}) => AccessResult | Promise<AccessResult>

/**
 * The request shape THIS module's own callers build and pass to
 * `executeAccess`/`executeFieldAccess`. Loose and additive (an index
 * signature alongside the one property every access function in this app
 * actually reads) rather than a `PayloadRequest` mirror, because nothing in
 * this app's real access functions needs more than `req.user` to make its
 * decision - `isAdmin`, `isAdminOrSelf`, `isDocumentOwner`,
 * `adminOrPublishedStatus`, `isAdminOrRsvpOwner`, `isAdminOrMembershipOwner`,
 * `adminOnlyFieldAccess`, `Users.roles`'s inline field access, and the local
 * `adminOrOwn` in Enrolments/LessonProgress all read `req.user` and nothing
 * else. The one exception is `Lessons.ts`'s `readableLessons`, which also
 * calls `req.payload.find` (via `accessibleCourseIds`/`flagsFrom`) - that is
 * exactly why this type is additive rather than closed: a caller with a real
 * engine client can hand it through as `req.payload` and the index signature
 * accepts it without this module needing to know its shape (`@/engine` is
 * not wired in here - see the file header).
 */
export type LocalReq = {
  user?: { id: number; roles?: string[] | null; email?: string | null } | null
} & Record<string, unknown>

/**
 * Mirrors real Payload's `FieldAccess<TData, TSiblingData>`
 * (`fields/config/types.d.ts:110`), whose args are `FieldAccessArgs`
 * (`fields/config/types.d.ts:86-109`). Boolean-only return - see
 * `executeFieldAccess`'s doc comment for why field-level access never gets a
 * `Where`-merge contract. `req` is `any` for the same reason as `AccessFn`.
 */
export type FieldAccessFn<TData = unknown, TSiblingData = unknown> = (args: {
  id?: number
  data?: Partial<TData>
  doc?: TData
  siblingData?: Partial<TSiblingData>
  blockData?: unknown
  req: any // eslint-disable-line @typescript-eslint/no-explicit-any -- see AccessFn's doc comment
}) => boolean | Promise<boolean>

/* -------------------------------------------------------------------------- */
/* Forbidden                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Stands in for real Payload's `Forbidden` (`payload/dist/errors/Forbidden.js`),
 * which this module deliberately does not import - see `validators.ts`'s file
 * header for the same rule applied to its own errors, and the top of this
 * file for why nothing here names the `payload` package. Real `Forbidden`
 * takes `req.t` and produces an i18n-translated message
 * (`t('error:notAllowedToPerformAction')`); this app never configured a
 * second admin-UI locale (grepped `engage.config.ts`, no matches - same
 * finding `validators.ts` made for its own error strings), so a fixed
 * English message is all this needs.
 */
export class Forbidden extends Error {
  constructor(message = 'You are not allowed to perform this action.') {
    super(message)
    this.name = 'Forbidden'
  }
}

/* -------------------------------------------------------------------------- */
/* combineQueries                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors real Payload's `hasWhereAccessResult`
 * (`payload/dist/auth/types.js:1-3`) exactly: an `AccessResult` narrows to a
 * `Where` when it is truthy AND an object - which excludes both `false` and
 * `true` (a `boolean` is never `typeof ... === 'object'`), leaving only an
 * actual `Where` clause.
 */
const hasWhereAccessResult = (result: AccessResult | undefined): result is Where => Boolean(result) && typeof result === 'object'

/**
 * Mirrors real Payload's `combineQueries`
 * (`payload/dist/database/combineQueries.js`) exactly, including its
 * asymmetric contract - this is NOT "merge two Where clauses", it is
 * "merge an operation's own `where` with one access-control result":
 *
 * - `where` (first argument) is taken at face value and wrapped as-is into
 *   the `and` array - its own top-level `and`/`or` keys are never unwrapped
 *   or flattened, just nested one level deeper.
 * - `access` (second argument) is only pushed into `and` when
 *   `hasWhereAccessResult` says it is an actual `Where` object - a bare
 *   `true`/`false` contributes nothing (real Payload's own callers
 *   (`find.js`, `findByID.js`, `updateByID.js`, `deleteByID.js`) only ever
 *   reach this function with `access` already resolved to `true` or a
 *   `Where` - a falsy `AccessResult` either already threw in `executeAccess`
 *   or, under `disableErrors`, short-circuits the caller before
 *   `combineQueries` runs at all - but the type stays `AccessResult` here
 *   for parity with the real signature).
 * - `!where && !access` is the ONLY case that returns `{}` instead of
 *   `{ and: [...] }` - notably, `where: undefined` with `access: true`
 *   returns `{ and: [] }` (an empty `and` array), not `{}`, because `true`
 *   fails the `!where && !access` check (`!true` is `false`) but also fails
 *   `hasWhereAccessResult` (so nothing gets pushed). This looks like an
 *   odd middle case but is exactly what real Payload produces, and this
 *   module's job is decision-parity, not tidying up the edge case.
 */
export function combineQueries(where: Where | undefined, access: AccessResult | undefined): Where {
  if (!where && !access) return {}
  const and: Where[] = where ? [where] : []
  if (hasWhereAccessResult(access)) and.push(access)
  return { and }
}

/* -------------------------------------------------------------------------- */
/* executeAccess                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors real Payload's `executeAccess`
 * (`payload/dist/auth/executeAccess.js`) exactly:
 *
 * 1. No access function configured on the collection (`accessFn` is
 *    `undefined`) - this is Payload's own default (`payload/dist/auth/
 *    defaultAccess.js`: `({ req: { user } }) => Boolean(user)`), inlined
 *    directly in `executeAccess.js` rather than applied at sanitize time
 *    (confirmed: `collections/config/sanitize.js` never assigns a default
 *    into `access.read`/etc., so `collectionConfig.access.read` genuinely
 *    stays `undefined` when a collection never configures it, and this
 *    branch is what actually runs): allow (return `true`) when `req.user`
 *    is truthy, otherwise deny.
 * 2. An access function IS configured - call it and branch on the result:
 *    - Truthy (`true` or a `Where` object) - return it as-is. A `Where`
 *      result is NOT itself thrown or rejected; it is real Payload's
 *      row-filtering contract, returned for the caller to merge with
 *      `combineQueries`.
 *    - Falsy (`false`, or a genuinely broken access function returning
 *      `undefined`/`null`/`0`/`''`) - throw `Forbidden`, UNLESS
 *      `disableErrors` is set, in which case the falsy value is returned
 *      as-is instead (real `find`/`findByID` use this: `disableErrors:
 *      true` turns "no access" into an empty result set rather than a
 *      thrown error - see `collections/operations/find.js:48-63` and
 *      `findByID.js:39-46`, both of which check `accessResult === false`
 *      immediately after this call and short-circuit to an empty/`null`
 *      result. Nothing in this app's own code passes `disableErrors` yet
 *      (grepped `src/`, no matches) - it is implemented anyway because it
 *      is cheap, load-bearing for those two real operations, and part of
 *      this executor's decision-parity contract, not something to leave a
 *      gap for).
 *
 * `isReadingStaticFile` is accepted and threaded through unchanged (real
 * Payload uses it for upload-collection static-file access checks via
 * `uploads/checkFileAccess.js`) even though nothing in this app's own access
 * functions reads it (grepped `src/`, no matches) - it is part of the real
 * `AccessArgs` contract this executor promises to reproduce, and costs
 * nothing to default to `false` and pass along.
 */
export async function executeAccess<TData = unknown>(
  accessFn: AccessFn<TData> | undefined,
  args: {
    req: LocalReq
    id?: number
    data?: TData
    isReadingStaticFile?: boolean
    disableErrors?: boolean
  },
): Promise<AccessResult> {
  const { req, id, data, isReadingStaticFile = false, disableErrors = false } = args

  if (accessFn) {
    const resolvedConstraint = await accessFn({ id, data, isReadingStaticFile, req })
    if (!resolvedConstraint) {
      if (!disableErrors) throw new Forbidden()
    }
    return resolvedConstraint
  }

  if (req.user) return true
  if (!disableErrors) throw new Forbidden()
  return false
}

/* -------------------------------------------------------------------------- */
/* executeFieldAccess                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Field-level access has a genuinely different, simpler contract than
 * collection-level access - confirmed by reading the two real call sites,
 * not assumed:
 *
 * - `fields/hooks/beforeValidate/promise.js:216-226` calls
 *   `field.access[operation]({ id, blockData, data, doc, req, siblingData })`
 *   for `create`/`update`, and `fields/hooks/afterRead/promise.js:225-236`
 *   calls `field.access.read({ id, blockData, data: doc, doc, req,
 *   siblingData })` for reads.
 * - Both sites do the SAME thing with a falsy result: `delete
 *   siblingData[field.name]` (afterRead also sets `allowDefaultValue =
 *   false` so a stripped field doesn't get its `defaultValue` backfilled).
 *   Neither site throws, neither site merges a `Where`, and neither site
 *   even checks for an object return - the real `FieldAccess` type return is
 *   `boolean | Promise<boolean>` (`fields/config/types.d.ts:110`), full stop.
 *   A field is either included/writable or silently stripped; there is no
 *   row-filtering concept at the field level because a field access check
 *   never changes which DOCUMENTS come back, only which of a document's OWN
 *   fields are visible/settable.
 * - No access configured on a field (`field.access` or `field.access[op]`
 *   missing) - both call sites gate on `field.access && field.access[op]`
 *   before calling anything, so a field with no `access` config is simply
 *   never checked - fully readable/writable by default, unlike the
 *   collection-level default (which requires being logged in). This
 *   executor mirrors that: no configured function means `true`, not "deny
 *   the anonymous caller".
 *
 * So this executor does not throw, does not know about `Where`, and just
 * returns the boolean the caller (a later stage's read/write pipeline)
 * should use to decide whether to keep or strip the field's value.
 */
export async function executeFieldAccess<TData = unknown, TSiblingData = unknown>(
  accessFn: FieldAccessFn<TData, TSiblingData> | undefined,
  args: {
    req: LocalReq
    id?: number
    data?: Partial<TData>
    doc?: TData
    siblingData?: Partial<TSiblingData>
    blockData?: unknown
  },
): Promise<boolean> {
  if (!accessFn) return true
  const { req, id, data, doc, siblingData, blockData } = args
  return Boolean(await accessFn({ id, data, doc, siblingData, blockData, req }))
}
