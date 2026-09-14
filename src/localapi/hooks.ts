/**
 * Hook-runner utilities that execute this app's REAL, already-written
 * collection/global/field hooks - `src/utilities/formatSlug.ts`,
 * `src/utilities/secretField.ts`, `src/hooks/checkEventCapacity.ts`,
 * the inline hooks in `src/collections/Pages.ts`,
 * `src/features/abTesting/collections/ABTests.ts`,
 * `src/features/courses/collections/Enrolments.ts`, and
 * `src/globals/SiteSettings.ts` - in the same order, and with the same
 * argument shapes and chaining semantics, real Payload 3.88.0 uses. Those
 * hook functions are NOT being rewritten here: they stay typed against
 * Payload's real `CollectionBeforeChangeHook`/`FieldHook`/etc. types from the
 * `payload` package (via `@/engine`'s re-exports) and are literally imported
 * and called through this module unmodified, in this module's own tests and
 * in the from-scratch create/update/find/delete pipeline a later stage
 * builds on top of this one.
 *
 * This module is intentionally NOT wired into `@/engine`/`engage.config.ts`
 * yet - same as `src/localapi/validators.ts` (stage 1a), it stands alone,
 * proven correct in isolation first.
 *
 * ---------------------------------------------------------------------------
 * WHY the runner is typed the way it is (no `import type { ... } from
 * 'payload'` anywhere in this file)
 * ---------------------------------------------------------------------------
 * The whole point of the from-scratch Local API is that it must not depend on
 * the `payload` package once the removal is complete. So this module's own
 * exported types (`CollectionDocumentHookArgs`, `BeforeChangeFieldHookArgs`,
 * etc. below) are hand-rolled mirrors of Payload's real hook-arg shapes, NOT
 * re-exports or structural aliases of them - they exist so a caller who has
 * no Payload types on hand (a mock hook in this module's own unit tests, or
 * a genuinely new from-scratch hook written in a later stage) has something
 * accurate to write against.
 *
 * The two runner functions (`runCollectionHooks`, `runFieldHook`) are each
 * generic over the exact args type the caller supplies, so they impose NO
 * type of their own on what "the hook" or "the args" look like - they just
 * need *an* array of `(args: TArgs) => TValue-ish` functions and *an* args
 * object. That is what makes a REAL Payload-typed hook function (e.g.
 * `formatSlugHook`, typed as `payload`'s real `FieldHook`) "structurally
 * callable without modification" through this file: a caller passes the real
 * hook (typed against `payload`'s real `FieldHook`/`CollectionBeforeChangeHook`
 * etc., imported from `@/engine`) together with an args object built to that
 * REAL type's shape, and the runner's generics simply adopt whatever type
 * TypeScript infers from that real hook - this file's own args types never
 * enter the picture for that call. See `tests/int/localapi-hooks.int.spec.ts`
 * for exactly this, exercising `formatSlugHook` and `checkEventCapacity`
 * (both imported straight from their real, un-modified source files) through
 * `runFieldHook`/`runCollectionHooks`.
 *
 * ---------------------------------------------------------------------------
 * Ground truth (confirmed by reading real Payload 3.88.0 source, not assumed)
 * ---------------------------------------------------------------------------
 * Hook types this app actually uses (grepped every `hooks:` block under
 * `src/`, per the stage brief): `beforeValidate`, `beforeChange`,
 * `afterChange` (collection- AND global-level), field-level `afterRead`, and
 * `afterDelete`. Every one of those is a plain, synchronous-or-async
 * "for (const hook of hooks) { ... }" loop in real Payload - there is no
 * queueing, no parallelism, and no built-in retry:
 *
 * COLLECTION-LEVEL (one call per hook per operation, chained on a single
 * value - `data` for beforeValidate/beforeChange, `doc` for
 * afterChange/afterDelete):
 *   - beforeValidate: `node_modules/payload/dist/collections/operations/create.js:106-116`
 *     (create) and `.../operations/utilities/update.js:102-116` (update) -
 *     `data = await hook({ collection, context, data, operation, originalDoc, req }) || data`
 *   - beforeChange: `create.js:121-133` / `utilities/update.js:123-135` -
 *     identical shape and chaining to beforeValidate, just called after it
 *     and before the FIELD-level beforeChange traversal.
 *   - afterChange: `create.js:289-303` / `utilities/update.js:328-341` -
 *     `result = await hook({ collection, context, data, doc: result, operation, overrideAccess, previousDoc, req }) || result`.
 *     `previousDoc` is `{}` on create (`create.js:298`, there is no prior
 *     doc) and the real `originalDoc` read before the update was applied on
 *     update (`utilities/update.js:337`, `originalDoc` computed at
 *     `utilities/update.js:38-49` via a field-level `afterRead` pass over the
 *     doc as it was BEFORE this operation's changes).
 *   - afterDelete: `collections/operations/delete.js:202-214` -
 *     `result = await hook({ id, collection, context, doc: result, req }) || result`.
 *     No `data`/`operation`/`previousDoc` - a delete has no incoming write
 *     data and only one "operation".
 *   - GLOBAL-level afterChange has the same `|| result` chaining but a
 *     different args shape (no `collection`/`operation`, a `global` field
 *     instead): `node_modules/payload/dist/globals/operations/update.js:326-340` -
 *     `result = await hook({ context, data, doc: result, global, overrideAccess, previousDoc: originalDoc, req }) || result`.
 *     `runCollectionHooks` below is generic enough to run these too (the
 *     chaining logic - "call each hook with the current value plugged into
 *     one named key of its args, keep whatever it returns unless it returns
 *     something falsy" - does not care whether that key's sibling fields are
 *     `collection`+`operation` or `global`).
 *
 *   IMPORTANT, easy to get wrong: the chain check is `|| data` / `|| result`,
 *   a plain JS OR, NOT `!== undefined`. That means a hook that returns `''`,
 *   `0`, `false`, or `null` (not just `undefined`) is ALSO treated as "kept
 *   the previous value" by real Payload - this only matters for
 *   beforeChange/afterChange hooks whose `data`/`doc` argument could itself
 *   validly BE one of those falsy things (which never happens in practice
 *   here: `data`/`doc` are always the whole document object, always
 *   truthy). None of this app's collection/global-level hooks lean on that
 *   edge case (`checkEventCapacity`, Pages' two hooks, ABTests' three,
 *   Enrolments', and SiteSettings' all either return the `data` object they
 *   were given or return nothing / a bare side-effecting value), so it does
 *   not change this app's actual behavior, but the runner reimplements the
 *   real `||` semantics exactly rather than the "cleaner-looking"
 *   `!== undefined` check field-level hooks use (see below) - conflating the
 *   two would be a real, if currently silent, behavioral deviation.
 *
 * FIELD-LEVEL (one call per hook per FIELD during the field traversal, not
 * per document - `beforeValidate`/`beforeChange` chain on `value`, one field
 * at a time):
 *   - beforeValidate: `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js:189-215` -
 *     `hookedValue = await hook({ blockData, collection, context, data, field, global, indexPath, operation, originalDoc, overrideAccess, path, previousSiblingDoc, previousValue, req, schemaPath, siblingData, siblingFields, value }); if (hookedValue !== undefined) siblingData[field.name] = hookedValue`.
 *   - beforeChange: `fields/hooks/beforeChange/promise.js:58-81` - same
 *     `hookedValue !== undefined` gate, args additionally carry
 *     `siblingDocWithLocales` (beforeChange only) and `previousValue`.
 *   - afterRead: `fields/hooks/afterRead/promise.js:146-186` - same
 *     `hookedValue !== undefined` gate, args carry read-only extras
 *     (`currentDepth`, `depth`, `draft`, `findMany`, `showHiddenFields`)
 *     instead of the write-side ones.
 *
 *   IMPORTANT, the actual deviation from what a first read of the collection-
 *   level code would lead you to guess: field-level hooks do NOT use `|| `.
 *   They use `hookedValue !== undefined ? hookedValue : (leave value alone)`.
 *   This is a real, deliberate difference from the collection-level `||`
 *   chaining above, not a simplification on this module's part - it is what
 *   lets a field-level hook validly return `''`, `0`, or `false` as an
 *   intentional new value (all three real, all falsy) without that being
 *   mistaken for "hook did nothing". `decryptSecretHook`
 *   (`src/utilities/secretField.ts`) relies on exactly this: on a decrypt
 *   failure it deliberately returns `''` (not `undefined`) to fail closed,
 *   and that empty string is meant to WIN, not be discarded in favor of the
 *   stored ciphertext - had this runner used `||` here (mirroring the
 *   collection-level semantics instead of checking the real field-level
 *   source), that hook's fail-closed behavior would have silently broken
 *   the moment a corrupt/rotated secret was decrypted. `runFieldHook` below
 *   implements the real `!== undefined` check, not `||`.
 *
 * Explicitly OUT OF SCOPE (per the stage brief, confirmed by grepping every
 * `hooks:` block under `src/` and finding zero matches for these):
 *   - `beforeOperation` / `afterOperation` - collection-level, wrap the
 *     WHOLE operation once, not per-field or chained on `data`/`doc`
 *     (`buildBeforeOperation.js` / `buildAfterOperation.js`); no collection
 *     in this app declares one.
 *   - `beforeRead` / `beforeDelete` - collection-level; `beforeDelete`'s real
 *     shape (`delete.js:105-116`, `hook({ id, collection, context, req })`,
 *     return value IGNORED - it is a pure side-effect hook, unlike
 *     `afterDelete`) is not implemented here since nothing in this app uses
 *     it, but is worth naming so a future stage does not assume it chains
 *     like `afterDelete` does.
 *   - Collection- or global-level `afterRead` - real Payload supports both
 *     (same `|| result` chaining as `afterChange`,
 *     `create.js:246-258/globals` equivalents), but this app only ever
 *     attaches `afterRead` at the FIELD level (the secret-field decrypt
 *     hooks) - grepped, zero `hooks: { afterRead: [...] }` at the top level
 *     of any collection/global config.
 *   - Locale-specific field-hook args this app never needs:
 *     `siblingDocWithLocales` (beforeChange only - relevant only once
 *     per-locale storage is modeled, which this app's `engage.config.ts`
 *     never enables: no `localization` config, confirmed by grep), and the
 *     "run the hook once per locale when `locale === 'all'`" branches in
 *     `beforeChange/promise.js` / `beforeValidate/promise.js` /
 *     `afterRead/promise.js` (each file's own `~L370-410` region) - this
 *     runner always runs a hook exactly once per call, matching every one of
 *     this app's real single-locale usages.
 *   - `req.payload.jobs`, `sendEmail`, `transactionID`, and any upload/
 *     filesystem API - re-confirmed via a fresh grep of
 *     `sendEmail|\.jobs\.|transactionID` under `src/` immediately before
 *     writing this file: the only matches are `src/features/accounts/emails.ts`,
 *     `src/features/members/emails.ts`, `src/features/forms/notify.ts`, and
 *     `src/features/email/index.ts` - none of which is a hook file, and none
 *     of which this runner or any real hook it calls touches.
 *
 * Error propagation: neither `runCollectionHooks` nor `runFieldHook` wraps
 * the hook call in a try/catch. A hook that throws (e.g. `checkEventCapacity`
 * throwing a plain `Error` once an event is at capacity) propagates straight
 * out of the `await`, aborting the `for` loop and everything after it - the
 * same as real Payload's own hook loops, which also have no per-hook
 * try/catch (see e.g. `create.js:108-116`: the `for` loop body has no `try`
 * at all; the operation-level `try/catch` several frames up in
 * `createOperation`/`updateByIDOperation` is what actually catches it, purely
 * to run `killTransaction` before rethrowing - it does not swallow anything).
 * This module builds no equivalent operation-level wrapper (that belongs to
 * the later create/update/find/delete pipeline stage), so here the throw
 * simply propagates to whatever calls `runCollectionHooks`/`runFieldHook`.
 * See `tests/int/localapi-hooks.int.spec.ts`'s "propagates a thrown error"
 * cases for both a mock hook and the real `checkEventCapacity`.
 */

/** Real Payload's own `RequestContext` (`payload/dist/index.d.ts`: `interface RequestContext { [key: string]: unknown }`) - reproduced structurally rather than imported so this module has no `payload` dependency. */
export type RequestContextLike = Record<string, unknown>

/** The two operations every collection-level `beforeValidate`/`beforeChange`/`afterChange` hook in this app's inventory ever runs under (`create.js`/`utilities/update.js` only ever pass `'create'` or `'update'` into these three hook types - `'delete'`/`'read'` only ever reach FIELD-level hooks, see `FieldHookOperation` below). */
export type CollectionHookOperation = 'create' | 'update'

/** Field-level hooks additionally run during read and delete (real `FieldHookArgs['operation']` is `'create' | 'delete' | 'read' | 'update'`, `payload/dist/fields/config/types.d.ts:48`), even though this app's own field hooks (`formatSlugHook`, `encryptSecretHook`/`decryptSecretHook`) only ever branch on it being absent or `'create'`/`'update'`. */
export type FieldHookOperation = 'create' | 'delete' | 'read' | 'update'

/**
 * Shared shape of every COLLECTION-level `beforeValidate`/`beforeChange`/
 * `afterChange`/`afterDelete` hook's args, standing in for real Payload's
 * `SanitizedCollectionConfig` (`collection`) and `PayloadRequest` (`req`)
 * with `unknown` - this module never reads either, it only forwards
 * whatever the caller hands it straight through to the real hook function.
 * Individual hook-type args below (`CollectionBeforeValidateHookArgs` etc.)
 * pick the subset of these fields real Payload actually includes for that
 * hook type, matching `CollectionOperationType`'s "which fields exist"
 * distinctions cited in the file header above.
 */
type CollectionHookArgsBase = {
  collection: unknown
  context: RequestContextLike
  req: unknown
}

export type CollectionBeforeValidateHookArgs<TData = Record<string, unknown>> = CollectionHookArgsBase & {
  data?: Partial<TData>
  operation: CollectionHookOperation
  /** `undefined` on create - real Payload passes `duplicatedFromDoc` (`{}` unless duplicating) on create and the pre-update doc on update; this module leaves that distinction to the caller. */
  originalDoc?: TData
}

export type CollectionBeforeChangeHookArgs<TData = Record<string, unknown>> = CollectionBeforeValidateHookArgs<TData> & {
  data: Partial<TData>
}

export type CollectionAfterChangeHookArgs<TData = Record<string, unknown>> = CollectionHookArgsBase & {
  data: Partial<TData>
  doc: TData
  operation: CollectionHookOperation
  overrideAccess?: boolean
  /** `{}` on create, the pre-update doc on update - see the file header's `previousDoc` note. */
  previousDoc: TData
}

export type CollectionAfterDeleteHookArgs<TData = Record<string, unknown>> = CollectionHookArgsBase & {
  id: number | string
  doc: TData
}

/** Real Payload's global `afterChange` args (`globals/config/types.d.ts:67-79`) - deliberately NOT `CollectionAfterChangeHookArgs` with fields swapped: globals have no `operation` (a global only ever has one "document") and `global` instead of `collection`. */
export type GlobalAfterChangeHookArgs<TData = Record<string, unknown>> = {
  context: RequestContextLike
  data: Partial<TData>
  doc: TData
  global: unknown
  overrideAccess?: boolean
  previousDoc: TData
  req: unknown
}

/**
 * Shared shape of every FIELD-level hook's args (mirrors real Payload's
 * `FieldHookArgs`, `payload/dist/fields/config/types.d.ts:18-84`), trimmed to
 * what this module's job needs plus every field this app's own field hooks
 * (`formatSlugHook`, `encryptSecretHook`/`decryptSecretHook`) actually read
 * (`value`, `data`) - the rest (`field`, `siblingData`, `path`, etc.) are
 * kept because a real Payload `FieldHook` requires them to be present on the
 * args object even when a given hook implementation ignores them.
 */
type FieldHookArgsBase<TSiblingData = Record<string, unknown>> = {
  blockData: Record<string, unknown> | undefined
  collection: unknown
  context: RequestContextLike
  field: unknown
  global: unknown
  indexPath: number[]
  operation?: FieldHookOperation
  overrideAccess?: boolean
  path: (number | string)[]
  req: unknown
  schemaPath: string[]
  siblingData: Partial<TSiblingData>
  siblingFields: unknown[]
}

export type BeforeValidateFieldHookArgs<TData = Record<string, unknown>, TValue = unknown, TSiblingData = Record<string, unknown>> = FieldHookArgsBase<TSiblingData> & {
  data?: Partial<TData>
  originalDoc?: TData
  previousSiblingDoc?: TSiblingData
  previousValue?: TValue
  value?: TValue
}

export type BeforeChangeFieldHookArgs<TData = Record<string, unknown>, TValue = unknown, TSiblingData = Record<string, unknown>> = BeforeValidateFieldHookArgs<TData, TValue, TSiblingData> & {
  /** beforeChange only (`fields/hooks/beforeChange/promise.js:65`) - the original, not-yet-hooked sibling data with locales still nested. This app never enables localization (see the file header's out-of-scope note), so no real hook here reads it, but it is kept for shape-fidelity. */
  siblingDocWithLocales?: Record<string, unknown>
}

export type AfterReadFieldHookArgs<TData = Record<string, unknown>, TValue = unknown, TSiblingData = Record<string, unknown>> = FieldHookArgsBase<TSiblingData> & {
  currentDepth?: number
  data?: Partial<TData>
  depth?: number
  draft?: boolean
  findMany?: boolean
  originalDoc?: TData
  showHiddenFields?: boolean
  value?: TValue
}

/* -------------------------------------------------------------------------- */
/* Collection/global-level runner                                             */
/* -------------------------------------------------------------------------- */

/**
 * Runs an array of collection- or global-level hooks IN ORDER, replicating
 * real Payload's own `for (const hook of hooks) { data = await hook(args) ||
 * data }` loop (see the file header's citations for `beforeValidate`,
 * `beforeChange`, `afterChange`, and `afterDelete` - all four use this exact
 * pattern, just chained on a different named field of `args`: `data` for the
 * first two, `doc` for the latter two).
 *
 * `key` names which field of `args` holds the running value - the same
 * object is re-spread with that field replaced before each hook call, so a
 * hook that reads sibling fields (`operation`, `originalDoc`, `previousDoc`,
 * ...) always sees the CURRENT value there, not the value as of the first
 * call. A hook may either return a new value (replacing the running value,
 * as long as it is truthy - `|| currentValue` on a falsy return keeps the
 * previous value, matching real Payload exactly, see the file header's
 * "IMPORTANT" note on `||` vs `!== undefined`) or mutate the object it was
 * handed in place and return nothing - both work here for the same reason
 * they work in real Payload: `args[key]` is a live object reference, so an
 * in-place mutation is visible to the next hook even when the hook's own
 * return value is `undefined` and gets discarded by `|| currentValue`.
 *
 * Generic over `TArgs`/`TKey` (not over any hook-args type this module
 * exports) so a caller can pass an array of hooks typed against real
 * Payload's own `CollectionBeforeChangeHook`/`CollectionAfterChangeHook`/etc.
 * (imported from `@/engine`, not from here) and TypeScript infers `TArgs`
 * from THAT real type - this function imposes no shape of its own. See the
 * file header's "WHY the runner is typed the way it is" section.
 *
 * Error propagation: no try/catch - a thrown hook aborts the loop and
 * propagates to the caller untouched (see the file header's "Error
 * propagation" section).
 */
export async function runCollectionHooks<TArgs extends Record<string, unknown>, TKey extends keyof TArgs>(
  hooks: Array<(args: TArgs) => Promise<TArgs[TKey]> | TArgs[TKey]> | undefined,
  args: TArgs,
  key: TKey,
): Promise<TArgs[TKey]> {
  let current = args[key]

  if (!hooks || hooks.length === 0) {
    return current
  }

  for (const hook of hooks) {
    const hookedValue = await hook({ ...args, [key]: current } as TArgs)
    // Real Payload's own `|| data` / `|| result` - a plain OR, not a
    // `!== undefined` check. See the file header for why that distinction
    // is deliberate and why this runner must NOT "clean it up" to match the
    // field-level check below.
    current = hookedValue || current
  }

  return current
}

/* -------------------------------------------------------------------------- */
/* Field-level runner                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Runs a SINGLE field-level hook (`beforeValidate`, `beforeChange`, or
 * `afterRead` - whichever `args` is shaped for), replicating real Payload's
 * `hookedValue = await hook(args); if (hookedValue !== undefined)
 * siblingData[field.name] = hookedValue` (see the file header's citations -
 * all three field-hook lifecycle points use this exact `!== undefined` gate,
 * NOT the collection-level `||`).
 *
 * Returns the field's resulting value: the hook's return value when it
 * returned anything other than `undefined`, otherwise `args.value` unchanged
 * - the caller (a later stage's field traversal) is responsible for writing
 * that result back onto its own `siblingData[field.name]`, the same way real
 * Payload's `promise.js` files do immediately after this exact check; this
 * module does not know about "sibling data" objects or field names, only the
 * single value being hooked.
 *
 * Generic over `TArgs`/`TValue`, not over any hook-args type this module
 * exports, for the same reason `runCollectionHooks` is - see that function's
 * doc comment and the file header's "WHY the runner is typed the way it is"
 * section. This is what lets `formatSlugHook`/`encryptSecretHook`/
 * `decryptSecretHook` (all three typed against real Payload's own
 * `FieldHook`) run through this function completely unmodified, as proven in
 * `tests/int/localapi-hooks.int.spec.ts`.
 *
 * To run more than one hook on the same field (real Payload supports a
 * `field.hooks.beforeChange` ARRAY - `fields/hooks/beforeChange/promise.js:58-60`
 * loops it), call this once per hook, threading the previous call's result
 * back in as the next call's `value`/`previousValue` - see `runFieldHooks`
 * below for that loop pre-built. No field in this app's current inventory
 * declares more than one hook of the same type on the same field (grepped
 * every `hooks:` block under a field's own config), so this is here purely
 * for forward composability, not because anything exercises it today.
 *
 * Error propagation: no try/catch - see `runCollectionHooks`'s doc comment
 * and the file header.
 */
export async function runFieldHook<TArgs extends { value?: TValue }, TValue = TArgs['value']>(
  hook: (args: TArgs) => Promise<TValue> | TValue,
  args: TArgs,
): Promise<TValue> {
  const hookedValue = await hook(args)
  return hookedValue !== undefined ? hookedValue : (args.value as TValue)
}

/**
 * Convenience loop over `runFieldHook` for a field with more than one hook
 * of the same type, threading each call's resulting value into the next
 * call's `value` (and `previousValue`, when the args shape has one - real
 * Payload's own field-hook args always carry both, see
 * `BeforeChangeFieldHookArgs`/`BeforeValidateFieldHookArgs` above) exactly
 * the way real Payload's `for (const hook of field.hooks.X)` loops do (see
 * the file header's field-level citations). Not exercised by any real hook
 * in this app today (see `runFieldHook`'s doc comment) - provided so a later
 * stage's field traversal does not have to reinvent this loop the first time
 * a field DOES declare more than one hook.
 */
export async function runFieldHooks<TArgs extends { previousValue?: TValue; value?: TValue }, TValue = TArgs['value']>(
  hooks: Array<(args: TArgs) => Promise<TValue> | TValue> | undefined,
  args: TArgs,
): Promise<TValue> {
  let current = args.value as TValue

  if (!hooks || hooks.length === 0) {
    return current
  }

  for (const hook of hooks) {
    current = await runFieldHook(hook, { ...args, previousValue: current, value: current } as TArgs)
  }

  return current
}
