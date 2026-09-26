/**
 * From-scratch reimplementation of Payload 3.88.0's Local API WRITE
 * operations - `create`, `update` (single-ID only), `delete` (single-ID
 * only), and `updateGlobal` - built on top of this app's already-proven
 * `src/localapi/{validators,access,hooks}.ts` (stages 1a/1b/1c) and the
 * already-cut-over `src/cms/db` data layer, so this app's eventual Payload
 * removal (see the `payload-removal-plan.md` project doc) has a write
 * pipeline that makes the exact same access/validation/hook/draft decisions
 * real Payload's `create.js` / `utilities/update.js` / `updateByID.js` /
 * `deleteByID.js` / `globals/operations/update.js` make today, for the
 * single-ID-only shape this app actually uses (confirmed by investigation:
 * this app never calls a bulk, `where`-based `update`/`delete` - every real
 * call site passes a concrete `id`).
 *
 * Like `validators.ts`/`access.ts`/`hooks.ts` before it, this module is
 * intentionally NOT wired into `@/engine`/`engage.config.ts` yet - it stands
 * alone, exercised only by its own tests
 * (`tests/int/localapi-operations.int.spec.ts`,
 * `tests/int/localapi-operations-parity.int.spec.ts`), so it can be proven
 * correct against real Payload behavior AND real `src/cms/db` behavior before
 * anything is cut over.
 *
 * ---------------------------------------------------------------------------
 * How this module is structured
 * ---------------------------------------------------------------------------
 * Four public pipeline functions - `createDocument`, `updateDocument`,
 * `deleteDocument`, `updateGlobalDocument` - each a straight-line port of one
 * real Payload operation's real step order (cited stage by stage below, with
 * real source line numbers, not paraphrased from memory). Each takes:
 *   - a `collection`/`global` config object shaped like `CollectionConfigLike`/
 *     `GlobalConfigLike` below - loose, structural types a real
 *     `CollectionConfig`/`GlobalConfig` (from `@/engine`, still Payload-typed -
 *     see the design-constraints note at the bottom of this header) is
 *     assignable to, the same "hand-rolled mirror, not an import" contract
 *     `access.ts`'s `AccessFn`/`LocalReq` and `hooks.ts`'s hook-arg types
 *     already establish;
 *   - a `db` object shaped like `CollectionDbOps`/`GlobalDbOps` - the tiny
 *     slice of a `src/cms/db/collections/*.ts` file's exports
 *     (`create`/`updateByID`/`deleteByID`/`findByID`, or a global's
 *     `find`/`update`) this pipeline actually calls. Composed on top of, not
 *     reimplemented - see "Why a `db` parameter, not a hardcoded registry"
 *     below.
 *
 * Internally, three field-traversal functions - `traverseBeforeValidate`,
 * `traverseBeforeChange`, `traverseAfterRead` - each a direct port of real
 * Payload's own `fields/hooks/{beforeValidate,beforeChange,afterRead}/
 * {index,promise,traverseFields}.js` trio (three separate real files per
 * stage, not one shared engine - this module keeps that same three-way split
 * rather than collapsing it into one generic walker, both because the three
 * stages genuinely do different things per field (defaults+hooks+field-access
 * vs hooks+validation+skip-cascade vs hooks+field-read-access) and because it
 * makes each function directly comparable to the one real file it mirrors).
 * Recurse into `array`/`blocks`/`group`/`row`/`collapsible` fields the same
 * way real Payload's own `traverseFields`/`promise` pair does for each stage
 * (see each function's own doc comment for the exact real citations); `join`
 * fields are always skipped (real Payload never writes through one either -
 * confirmed by `db/index.ts`'s own Phase 8 note, and validators.ts already
 * treats `join` as carrying no validation of its own).
 *
 * Field VALIDATION (this app's 13 in-scope types from `validators.ts`) is
 * NOT a separate step from the field-level `beforeChange` hook - real Payload
 * runs both, per field, inside the SAME traversal
 * (`fields/hooks/beforeChange/promise.js:58-100`: hook first, then
 * `if (!skipValidationFromHere && field.validate) { ... }` immediately
 * after) - see "Deviation 1" below for why this is NOT what the stage brief
 * originally assumed.
 *
 * ---------------------------------------------------------------------------
 * Real Payload step order, cited (this is what each pipeline function ports)
 * ---------------------------------------------------------------------------
 * CREATE (`payload/dist/collections/operations/create.js`):
 *   access (`create.js:70-75`, `executeAccess({data,req}, collectionConfig.access.create)`)
 *   -> beforeValidate-FIELDS (`create.js:95-104`, the whole-collection field
 *      traversal, BEFORE the collection-level hooks - see Deviation 1)
 *   -> beforeValidate-COLLECTION (`create.js:108-119`, `data = await hook(...) || data`)
 *   -> beforeChange-COLLECTION (`create.js:123-134`, same `|| data` chaining)
 *   -> beforeChange-FIELDS (`create.js:138-149` - hooks+validation+storage
 *      transform per field, throws `ValidationError` if any field failed)
 *   -> DB create (`create.js:194-198`, `payload.db.create(...)`)
 *   -> saveVersion (`create.js:214-226` - already fully handled INSIDE
 *      `src/cms/db`'s `createDraftOps.create`, not reimplemented here - see
 *      "Draft/publish policy" below)
 *   -> afterRead-FIELDS (`create.js:246-260`, BEFORE afterChange - see
 *      Deviation 2)
 *   -> afterChange-FIELDS (`create.js:278-287`)
 *   -> afterChange-COLLECTION (`create.js:291-304`, `previousDoc: {}`)
 *   -> return.
 *   (Out of scope, confirmed unused by this app: `beforeOperation`/
 *   `afterOperation` (no collection declares one - see `hooks.ts`'s own
 *   out-of-scope list), file uploads/`generateFileData`/auth-collection
 *   register/verify branches (`duplicateFromID` is likewise never used - this
 *   app's create() call sites never pass it, so `originalDoc`/`duplicatedFromDoc`
 *   is always `{}` here, matching create.js's own `{}` default when no
 *   `duplicateFromID` is given).)
 *
 * UPDATE, single-ID (`updateByID.js` + its `utilities/update.js` helper -
 * confirmed by reading BOTH files, not just the outer operation):
 *   access (`updateByID.js:42-46`, may resolve to a `Where`, not just a
 *      boolean - see "Where-shaped access results" below)
 *   -> fetch original doc (`updateByID.js:73-94`, via a `combineQueries`'d
 *      `findOne` in real Payload; this module uses the `db` parameter's own
 *      `findByID` instead - see "Why a `db` parameter" below - then checks
 *      the fetched doc against the access `Where` itself, since `findByID`
 *      cannot take an arbitrary `where`)
 *   -> `updateDocument` (`utilities/update.js`, called from `updateByID.js:115-137`):
 *      beforeValidate-FIELDS (`utilities/update.js:90-100`, using the
 *        REAL `originalDoc`, not `{}` - unlike create)
 *      -> beforeValidate-COLLECTION (`utilities/update.js:104-115`)
 *      -> beforeChange-COLLECTION (`utilities/update.js:125-136`)
 *      -> beforeChange-FIELDS (`utilities/update.js:140-162`)
 *      -> DB update (`utilities/update.js:256-262`, `payload.db.updateOne`,
 *         skipped entirely when saving a draft - see "Draft/publish policy")
 *      -> saveVersion (`utilities/update.js:267-281` - handled inside
 *         `createDraftOps.updateByID`)
 *      -> afterRead-FIELDS (`utilities/update.js:285-299`)
 *      -> afterChange-FIELDS (`utilities/update.js:317-326`)
 *      -> afterChange-COLLECTION (`utilities/update.js:330-343`,
 *         `previousDoc: originalDoc` - the doc AS FETCHED before this update,
 *         confirmed via `originalDoc = await afterRead({doc: docWithLocales,
 *         ...})` at `utilities/update.js:44-56`, computed BEFORE any of this
 *         update's own beforeValidate/beforeChange mutations touch `data`)
 *   -> return.
 *
 * DELETE, single-ID (`deleteByID.js`):
 *   access (`deleteByID.js:36-39`, may resolve to a `Where` - same handling
 *      as update)
 *   -> (real Payload also runs `beforeDelete` - collection-level, side-effect
 *      only, return value ignored - here BEFORE fetching the doc,
 *      `deleteByID.js:44-53`; this app declares zero `beforeDelete` hooks
 *      anywhere - grepped, confirmed - so it is cited for completeness but
 *      not implemented, matching `hooks.ts`'s own stated scope)
 *   -> fetch doc (`deleteByID.js:57-79`)
 *   -> DB delete (`deleteByID.js:127-136`, `payload.db.deleteOne` - returns
 *      the deleted DOC in real Payload; `src/cms/db`'s own `deleteByID`
 *      returns a bare `boolean` instead - see "Adaptation: delete's return
 *      shape" below for how this module bridges that gap)
 *   -> afterRead-FIELDS (`deleteByID.js:160-174`, BEFORE afterDelete - same
 *      "afterRead runs before the after-hook" pattern as create/update, see
 *      Deviation 2)
 *   -> afterDelete-COLLECTION (`deleteByID.js:192-202`, `hook({id, collection,
 *      context, doc: result, req}) || result` - no `data`/`operation`, per
 *      `hooks.ts`'s own `CollectionAfterDeleteHookArgs`)
 *   -> return.
 *
 * UPDATE-GLOBAL (`globals/operations/update.js`):
 *   access (`update.js:49-52`)
 *   -> fetch existing global row + compute `originalDoc` via a full
 *      afterRead pass (`update.js:60-88` - BEFORE beforeValidate even runs,
 *      unlike a collection update where `originalDoc` is computed inside the
 *      shared `updateDocument` helper at roughly the same pipeline position -
 *      functionally equivalent timing either way: always before this
 *      update's own data mutations)
 *   -> beforeValidate-FIELDS (`update.js:101-110`)
 *   -> beforeValidate-GLOBAL (`update.js:114-125` - see Deviation 3: globals'
 *      beforeValidate/beforeChange hook args carry `overrideAccess`, a
 *      collection's own do NOT)
 *   -> beforeChange-GLOBAL (`update.js:129-140`)
 *   -> beforeChange-FIELDS (`update.js:144-156`)
 *   -> DB upsert (`update.js:225-246` - `src/cms/db`'s own `createGlobalOps`
 *      already folds create-or-update into one `update()` call - see
 *      `generic.ts`'s own doc comment - so this module calls that single
 *      function, matching real Payload's OWN observation that
 *      `createGlobal` is only ever reached from `updateGlobal`'s own
 *      fallback in practice)
 *   -> saveVersion (`update.js:250-270` - NOT relevant here: no global in
 *      this app declares `versions` - grepped `src/globals/*.ts`, confirmed -
 *      so this branch is real-Payload-only dead code for this app and is not
 *      reimplemented)
 *   -> afterRead-FIELDS (`update.js:283-297`)
 *   -> afterChange-FIELDS (`update.js:315-324`)
 *   -> afterChange-GLOBAL (`update.js:328-340`, `previousDoc: originalDoc`)
 *   -> return.
 *
 * ---------------------------------------------------------------------------
 * Deviations from the stage brief's ASSUMED step order, confirmed by reading
 * real source directly (not paraphrase) - flagged the same way stages
 * 1a/1b/1c each flagged their own 1-2 genuine surprises
 * ---------------------------------------------------------------------------
 * DEVIATION 1 - field-level `beforeValidate` runs BEFORE collection-level
 * `beforeValidate`, not after. The brief's assumed order was "beforeValidate
 * hooks (collection-level) -> field-level beforeValidate hooks -> field
 * validation". Real Payload's create.js runs the WHOLE field-level
 * beforeValidate traversal first (`create.js:95-104`), and only THEN the
 * collection-level `beforeValidate` hooks (`create.js:108-119`) - confirmed
 * identically in `utilities/update.js:90-115`. Separately, field VALIDATION
 * is not its own step at all: it happens per-field, immediately after that
 * field's own beforeChange hook, inside the beforeChange traversal
 * (`fields/hooks/beforeChange/promise.js:58-100`) - there is no standalone
 * "validate all fields" pass between beforeValidate and beforeChange the way
 * the brief's phrasing implied. This module's `traverseBeforeValidate` runs
 * first, then collection beforeValidate hooks, then collection beforeChange
 * hooks, then `traverseBeforeChange` (hooks+validate interleaved per field),
 * matching the real order exactly.
 *
 * DEVIATION 2 - `afterRead` (fields, this app's only real use being
 * `decryptSecretHook`) runs BEFORE `afterChange`/`afterDelete`, not after.
 * The brief's assumed order was "afterChange hooks (collection-level) ->
 * field-level afterRead hooks". Real Payload runs afterRead-fields
 * immediately after the DB write/saveVersion, then afterChange-fields, then
 * afterChange-collection (`create.js:246-304`; `utilities/update.js:285-343`;
 * for delete, afterRead at `deleteByID.js:160-174` then afterDelete at
 * `deleteByID.js:192-202`). This matters in principle - a collection-level
 * `afterChange`/`afterDelete` hook that reads a secret-encrypted field off
 * `doc` would see the DECRYPTED value, not the ciphertext, because afterRead
 * already ran - though it changes no observable behavior for this app today
 * (no collection/global with both a secret field AND a collection-level
 * afterChange hook that reads it exists in this app's real config - grepped).
 * Implemented in the real order anyway, since "the order doesn't matter YET"
 * is not the same claim as "the order is right".
 *
 * DEVIATION 3 - a GLOBAL's `beforeValidate`/`beforeChange` hooks receive
 * `overrideAccess` in their args; a COLLECTION's do not. `hooks.ts`'s own
 * `CollectionBeforeValidateHookArgs`/`CollectionBeforeChangeHookArgs` types
 * (correctly, for collections) omit `overrideAccess` - confirmed against
 * `create.js:108-119`/`123-134` and `utilities/update.js:104-115`/`125-136`,
 * neither of which passes it. But `globals/operations/update.js:114-125`
 * (beforeValidate) and `:129-140` (beforeChange) both DO include
 * `overrideAccess` in the hook-call object. `hooks.ts`'s file header only
 * called out the afterChange args-shape difference between collections and
 * globals - this beforeValidate/beforeChange asymmetry was not previously
 * documented anywhere in this codebase. This module's `updateGlobalDocument`
 * builds its own plain hook-args object literals (not `hooks.ts`'s exported
 * `CollectionBeforeValidateHookArgs`/`CollectionBeforeChangeHookArgs` types,
 * which are correct for collections but would be missing a real field for
 * globals) so it can include `overrideAccess` faithfully for globals while
 * `createDocument`/`updateDocument` correctly omit it for collections.
 *
 * ---------------------------------------------------------------------------
 * Adaptations for this app's real `src/cms/db` shapes (not deviations from
 * Payload - deviations from a generic adapter this app doesn't have)
 * ---------------------------------------------------------------------------
 * WHY A `db` PARAMETER, NOT A HARDCODED REGISTRY - `src/cms/db` exposes each
 * collection's create/update/delete/find as its OWN differently-named,
 * differently-typed functions (`createFaq`/`updateFaq`/..., `createEvent`/
 * `updateEvent`/... - see `src/cms/db/index.ts`'s barrel), not a single
 * generic `payload.db.create({collection, data})` dispatcher the way real
 * Payload's adapter is. Rather than hardcode a slug->functions map for all
 * ~21 collections/~16 globals inside this module (which would make this
 * module both enormous and constantly out of date as `src/cms/db` grows),
 * every pipeline function here takes a small `db: CollectionDbOps<TDoc>` (or
 * `GlobalDbOps<TDoc>`) object as a parameter - literally
 * `{ create: createFaq, updateByID: updateFaq, deleteByID: deleteFaq,
 * findByID: findFaqByID }` at a real call site (see the parity test file).
 * This mirrors the same "generic engine, caller supplies the real
 * collection-specific pieces" shape `hooks.ts`'s `runCollectionHooks`/
 * `runFieldHook` already establish for hooks, and `executeAccess`/
 * `executeFieldAccess` establish for access functions - this module is the
 * one gluing those three together with real DB I/O, not a fourth
 * general-purpose abstraction layered on top of them.
 *
 * ADAPTATION: DELETE'S RETURN SHAPE - real Payload's `payload.db.deleteOne`
 * returns the deleted DOCUMENT (`deleteByID.js:127-136`,
 * `let result = await req.payload.db.deleteOne(...)`, and `result` is what
 * `afterRead`/`afterDelete` run against). `src/cms/db/generic.ts`'s own
 * `deleteByID(id): Promise<boolean>` (confirmed reading the source directly -
 * `generic.ts:1158-1166`, `return result.length > 0`) returns only whether a
 * row was deleted, not the row itself - there was never a need for the doc's
 * shape once Drizzle's own `.delete().returning({id: idColumn})` only asked
 * for the id. `deleteDocument` below bridges this the same way real
 * Payload's OWN two-step read-then-delete already implies is safe: fetch the
 * doc via `db.findByID(id)` BEFORE calling `db.deleteByID(id)` (which this
 * module already has to do anyway, to run the access/Where check and to hand
 * `afterRead`/`afterDelete` something to operate on), and treat that
 * pre-deletion snapshot as the "doc" afterRead/afterDelete hooks mutate and
 * this function returns - functionally identical to what real Payload's
 * `docToDelete` variable already captures at `deleteByID.js:68-73` for
 * exactly the same reason (it needs the doc's shape for the NotFound/Forbidden
 * check before the actual delete happens).
 *
 * UNIQUE-FIELD ENFORCEMENT (stage brief point 5) - investigated, not
 * invented, and CORRECTED after live testing contradicted the first-pass
 * static read below. Real Payload enforces a field's `unique: true` as a DB
 * constraint violation caught AFTER a failed insert/update
 * (`@payloadcms/drizzle`'s `handleUpsertError`, watching for
 * `SQLITE_CONSTRAINT_UNIQUE`), never as a pre-check - this module follows the
 * same policy: no pre-check anywhere in `createDocument`/`updateDocument`,
 * only the post-hoc translator below.
 *
 * `src/cms/db`'s CURRENT schema-generation SOURCE (`src/cms/db/schema/generate.ts`,
 * grepped for `unique`/`UNIQUE` - zero matches) and every raw migration file
 * under `src/migrations/sql/*.sql` (also grepped - zero matches) confirm that
 * generator does not itself emit a SQL `UNIQUE` constraint for any column
 * today, for any field, including the ones that declare `unique: true` in
 * their Payload config (Events.slug, Posts.slug, Courses.slug,
 * MembershipTiers.slug). A static read of that source alone would conclude
 * uniqueness is unenforced end-to-end - but the LIVE dev D1 database does
 * NOT match that source today: calling `createEvent` twice with the same
 * `slug` against the real dev D1 (see
 * `tests/int/localapi-operations-parity.int.spec.ts`'s Events describe block)
 * throws a genuine
 * `D1_ERROR: UNIQUE constraint failed: eg_events.slug: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)`
 * from SQLite itself. The two facts are both true at once because a SQLite
 * table's constraints are baked in at `CREATE TABLE`/`CREATE UNIQUE INDEX`
 * time and persist in the on-disk database file regardless of what the
 * schema-generation source later drifts to - `eg_events`'s live table
 * predates (or was created by an intermediate version of) today's
 * `generate.ts` and still carries a real unique index on `slug` that current
 * `generate.ts` no longer knows how to reproduce for a freshly-created table.
 * This is a genuine drift between the live schema and the current
 * schema-generation source, not something this operations layer invents or
 * papers over: `uniqueConstraintErrorToValidationError` below is the SHAPING
 * half of the brief's ask, unconditionally correct regardless of which side
 * of that drift a given column is on - a caller that wraps a
 * `db.create`/`db.updateByID` call in a try/catch can hand any error message
 * it catches to this function, and if that message looks like a SQLite
 * unique-constraint violation (`SQLITE_CONSTRAINT_UNIQUE`, or the
 * `UNIQUE constraint failed` wording SQLite/D1 actually produce), it comes
 * back as a `ValidationError` shaped exactly like a real Payload field
 * validation error would be. Concretely, TODAY: `eg_events.slug` already
 * round-trips through this translator correctly (load-bearing, not a no-op);
 * a fresh column whose live table was created purely from today's
 * `generate.ts` (no legacy index) would still accept a duplicate silently,
 * exactly as before - the gap in `generate.ts` itself (teaching it to emit
 * `UNIQUE` for `field.unique === true` on newly-created tables, and
 * reconciling existing tables that lack it) is real but is schema-generation
 * work, out of scope for this stage. See
 * `tests/int/localapi-operations-parity.int.spec.ts`'s Events "unique: true"
 * case for the confirming, currently-passing proof against the live
 * database.
 *
 * WHERE-SHAPED ACCESS RESULTS ON UPDATE/DELETE - real Payload's
 * `access.update`/`access.delete` can return a `Where` (not just a boolean),
 * and real Payload folds that into the SAME query used to fetch the
 * document, so a doc that exists but fails the `Where` throws `Forbidden`,
 * while a doc that plain doesn't exist throws `NotFound`
 * (`updateByID.js:86-94`, `deleteByID.js:74-79`). `src/cms/db`'s
 * `findByID(id)` cannot accept an arbitrary `where` filter, so this module
 * fetches by id alone and then evaluates the access `Where` against the
 * fetched doc in memory via `matchesWhere` below - deliberately narrow (only
 * `equals`/`not_equals`/`in`, plus `and`/`or` composition), because grepping
 * EVERY real `access.update`/`access.delete` function this app's config
 * actually wires up (`src/access/ecommerceAccess.ts`,
 * every feature's own `access.ts`, every collection's own inline access) found
 * exactly ONE that ever returns a `Where` on a write path at all:
 * `isAdminOrSelf` on `Users.access.update`, which only ever produces
 * `{ id: { equals: req.user.id } }`. `matchesWhere` is not a general query
 * engine (one already exists, for READS, in `src/cms/db/where.ts` - not
 * reusable here since it builds a Drizzle SQL condition, not an in-memory JS
 * predicate) - it is exactly as capable as this app's real write-access
 * functions require, documented rather than silently narrowed.
 *
 * ---------------------------------------------------------------------------
 * Draft/publish policy (stage brief point 8 - no autosave/unpublish anywhere
 * in this app, confirmed by investigation)
 * ---------------------------------------------------------------------------
 * `createDocument`/`updateDocument` accept a plain `draft?: boolean` and do
 * exactly two things with it, matching real Payload's own `isSavingDraft`
 * gate (`create.js:49`, `utilities/update.js:29`) minus the
 * locale-publishing/autosave/unpublish branches this app never exercises:
 *   1. Stamp `data._status = 'draft'` before running any hook/validation,
 *      when `draft` is true AND the collection declares `versions.drafts`
 *      (so hooks/validators see the same `_status` real Payload would have
 *      them see).
 *   2. Skip field VALIDATION entirely for the whole document when saving a
 *      draft, unless the collection opts into `versions.drafts.validate:
 *      true` (`hasDraftValidationEnabled` in real Payload's
 *      `utilities/getVersionsConfig.js` - grepped every collection here,
 *      none sets it, so this is always a full skip in practice today, same
 *      as real Payload's own behavior for this app's config) - this is what
 *      lets a draft save go through with required fields still blank.
 * The actual DB-level draft/publish WRITE policy (skip the live row on a
 * draft update, always version-snapshot, etc.) already lives entirely inside
 * `src/cms/db/generic.ts`'s `createDraftOps` (see that function's own,
 * already-proven doc comment) - this module calls `db.create(data)` /
 * `db.updateByID(id, data, { draft })` and trusts `createDraftOps` to do the
 * right thing, exactly per this stage's brief ("already handled inside
 * `createDraftOps`, don't reimplement").
 *
 * ---------------------------------------------------------------------------
 * Design constraints (same as 1a/1b/1c)
 * ---------------------------------------------------------------------------
 * No `import ... from 'payload'` anywhere in this file. `CollectionConfigLike`/
 * `GlobalConfigLike`/`FieldConfigLike` are hand-rolled structural mirrors a
 * real `CollectionConfig`/`GlobalConfig`/`Field` (from `@/engine`, still
 * Payload-typed today - those configs are NOT being rewritten, only driven at
 * runtime by new infrastructure, same as every prior stage) is assignable to,
 * not imports or aliases of Payload's own types. `overrideAccess: true` (used
 * pervasively by this app's own internal hook code, e.g. Pages' hooks calling
 * `req.payload.find`/`update`) skips the access-check step entirely in every
 * pipeline function here, matching real Payload exactly (`create.js:70`,
 * `updateByID.js:42`, `deleteByID.js:36`, `globals/operations/update.js:49` -
 * every one of them guards the `executeAccess` call with
 * `if (!overrideAccess)`). `disableErrors` is deliberately NOT threaded
 * through any function here: `access.ts`'s own doc comments already establish
 * it is a READ-path-only real Payload option (`find`/`findByID`'s own
 * short-circuit-to-empty-result behavior) - none of `create.js`/
 * `updateByID.js`/`deleteByID.js`/`globals/operations/update.js`'s own
 * `executeAccess` calls ever pass it (confirmed reading all four call sites
 * directly), so inventing support for it on a write path here would be
 * adding something real Payload itself does not have.
 */

import type { LexicalEditorLike, SelectOption, ValidateFieldOptions, ValidatorFn } from './validators'
import { getDefaultValidator } from './validators'

import type { AccessFn, AccessResult, FieldAccessFn, LocalReq, Where } from './access'
import { executeAccess, executeFieldAccess, Forbidden } from './access'

import type { CollectionHookOperation, RequestContextLike } from './hooks'
import { runCollectionHooks, runFieldHooks } from './hooks'

import { hashPassword } from './auth'

export { Forbidden } from './access'

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/** One field's validation failure, as accumulated by `traverseBeforeChange` across the WHOLE document before throwing - real Payload aggregates every field's error into one `ValidationError` (`fields/hooks/beforeChange/index.js`'s own `errors: []` array, pushed to per-field at `promise.js:130-153`, thrown once after the full traversal completes at `index.js`'s own `if (errors.length > 0) throw ...`), not fail-fast on the first bad field. */
export type ValidationFieldError = { path: string; message: string }

/** Stands in for real Payload's `ValidationError` (`payload/dist/errors/ValidationError.js`) for the same reason `access.ts`'s `Forbidden` stands in for real Payload's `Forbidden` - no `payload` import, no i18n `t()` lookup (this app never configured a second admin-UI locale, same finding every prior stage made for its own errors). */
export class ValidationError extends Error {
  errors: ValidationFieldError[]
  constructor(errors: ValidationFieldError[]) {
    super(`The following field${errors.length === 1 ? ' is' : 's are'} invalid: ${errors.map((e) => `${e.path} (${e.message})`).join('; ')}`)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

/** Stands in for real Payload's `NotFound` (`payload/dist/errors/NotFound.js`) - same no-import, no-i18n reasoning as `ValidationError` above. */
export class NotFound extends Error {
  constructor(message = 'Not Found.') {
    super(message)
    this.name = 'NotFound'
  }
}

/* -------------------------------------------------------------------------- */
/* Field/collection/global config shapes this module reads at runtime         */
/* -------------------------------------------------------------------------- */

/**
 * A hand-rolled structural mirror of the subset of a real Payload `Field`
 * this module's field traversal reads - a real `text`/`array`/`blocks`/
 * `group`/`row`/`collapsible`/`join`/etc. field (from `src/collections/*.ts`,
 * still typed against `@/engine`'s real `Field` union) is assignable to this
 * type without modification, the same "real config, new infrastructure"
 * contract `validators.ts`'s `ValidateFieldOptions` and `hooks.ts`'s
 * `FieldHookArgsBase` already establish. Deliberately loose (`hooks`/`access`
 * entries typed `any` rather than real Payload's own `FieldHook`/`FieldAccess`
 * generics) so this module never has to know which of the 13 in-scope field
 * types' many differently-shaped real hook signatures it's holding - it just
 * forwards whatever real, unmodified hook function a field's config supplies
 * straight into `runFieldHooks`/`executeFieldAccess`, same as `hooks.ts`'s own
 * "generic runner, caller supplies the real typed hook" pattern.
 *
 * Real Payload's `tabs` field type is NOT modeled here (no field in this
 * app's config declares one - grepped every `type: 'tabs'`/`type: 'tab'`
 * literal under `src/`, zero matches) - a `tabs` field would silently be
 * treated as an unrecognized, non-data-affecting field type by the traversal
 * functions below (skipped, not crashed on), which is a real, documented gap
 * rather than a false "supported" claim.
 */
export type FieldConfigLike = {
  name?: string
  type: string
  label?: unknown
  fields?: FieldConfigLike[]
  /** `blocks` fields only. This app never uses the newer `blockReferences` shorthand (confirmed by `validators.ts`'s own file header grep) - only the plain `blocks: Block[]` array form is read here. */
  blocks?: Array<{ slug: string; fields: FieldConfigLike[] }>
  required?: boolean
  hasMany?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  minRows?: number
  maxRows?: number
  /** `select` fields only in this app (confirmed by `validators.ts`'s own file header grep - the 13 in-scope types never include `radio`), typed `unknown[]` rather than `SelectOption[]` because real Payload's generic `Option` type (shared across `select`/`radio`) allows a React-component `label`, which `SelectOption.label: string` correctly rejects for THIS module's own `select` validator but would make a real `RadioField` (present elsewhere in this app's configs, just never read as a `select` field here) fail assignability to this type. Cast to `SelectOption[]` at the one call site that reads it (`visitBeforeChangeField`). */
  options?: unknown[]
  /** Typed `unknown` rather than `string` (unlike `validators.ts`'s own `ValidateFieldOptions.relationTo`, which this app's real fields always satisfy) because a real Payload `Field`'s `relationTo` type is `string | string[]` (the polymorphic-`relationTo` shape this app never actually uses, per `validators.ts`'s own file header grep, but which the TYPE still allows) - cast to `string | undefined` at the one call site that reads it. */
  relationTo?: unknown
  /** A real Payload `defaultValue` is either a plain value or `(args) => value | Promise<value>` - both forms are used across this app's real collections/globals. */
  defaultValue?: unknown
  /** A field's own custom validator, when a field declares one instead of relying on `getDefaultValidator(field.type)`'s type-default behavior - real Payload always prefers a field's own `field.validate` over the type default (`fields/hooks/beforeChange/promise.js:139-141`, `field.validate` is looked up directly, never falls back). Typed `unknown` rather than `ValidatorFn` deliberately - real Payload's own per-field-type `validate` signatures (`ArrayFieldValidation`, `TextFieldValidation`, ...) each narrow `value` to that field type's own shape, which is NOT assignable to `ValidatorFn`'s `value: unknown` under `strictFunctionTypes` (contravariance) - cast at the one call site that reads it (`visitBeforeChangeField`) instead of fighting that here. */
  validate?: unknown
  /** `richText` only - see `validators.ts`'s `LexicalEditorLike` doc comment. */
  /** Typed `unknown` rather than `LexicalEditorLike` - a real, sanitized `RichTextField.editor` (`@payloadcms/richtext-lexical`'s `lexicalEditor()` output) has a MUCH richer `validate(value, options)` signature than `validators.ts`'s own deliberately-narrow `LexicalEditorLike`/`ValidateFieldOptions` (see that module's file header: this stage never wires a real editor through, by design), so the two are not structurally assignable. Cast to `LexicalEditorLike | undefined` at the one call site that reads it - `validators.ts`'s own `richText` validator already degrades gracefully (a minimal required-only check) when the cast object doesn't actually behave like one, so this is a safe, honest narrowing, not a silent behavior change. */
  editor?: unknown
  hooks?: {
    beforeValidate?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
    beforeChange?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
    afterRead?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
  }
  access?: {
    create?: FieldAccessFn
    read?: FieldAccessFn
    update?: FieldAccessFn
  }
  admin?: {
    /** Real Payload's own `Condition` type takes a third-arg options object with several more properties (`blockData`, `operation`, `path`) than this module ever supplies at the one call site that invokes it (`visitBeforeChangeField` below, which only ever needs `user` - no real `admin.condition` in this app's config reads anything else, confirmed by reading every `condition:` callback under `src/` while building this module's field-hook inventory). Typed with a rest-args signature rather than fighting real `Condition<any,any>`'s exact third-arg shape under `strictFunctionTypes`. */
    condition?: (...args: any[]) => boolean // eslint-disable-line @typescript-eslint/no-explicit-any -- see comment above
  }
}

/** Structural mirror of a real `CollectionConfig`'s `access`/`hooks`/`fields`/`versions` - the only parts this module's pipeline reads. Every other real `CollectionConfig` property (`admin`, `labels`, `dbName`, ...) is simply ignored - TypeScript's normal structural typing lets an object with MORE properties than a target type declares be assigned to it (a real config is always assignable here without stripping anything), which is also why this type deliberately does NOT intersect with a trailing `Record<string, unknown>` the way `LocalReq` does: doing so would additionally require every real property's own TYPE to be assignable to `unknown` under TypeScript's index-signature check, and at least one real field type (`JoinField`, an interface with no index signature of its own) fails that check even though it's perfectly assignable to this type on its own. */
export type CollectionConfigLike = {
  slug: string
  fields: FieldConfigLike[]
  access?: {
    create?: AccessFn
    read?: AccessFn
    update?: AccessFn
    delete?: AccessFn
  }
  hooks?: {
    beforeValidate?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
    beforeChange?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
    afterChange?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
    afterDelete?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
  }
  /** Only `versions.drafts` (boolean or `{validate?: boolean}`) is read - see "Draft/publish policy" in the file header. */
  /** Real Payload's own `versions` is `boolean | IncomingCollectionVersions` - a bare `false` (this app's non-drafts collections' real, sanitized shape) is a valid value that carries no `.drafts` property at all, so `boolean |` must be included here too even though this module's own `hasDraftsEnabled`/`hasDraftValidationEnabled` helpers only ever read the object form's `.drafts`. */
  versions?: boolean | { drafts?: boolean | { validate?: boolean } }
  /** Real Payload's own `auth` is `boolean | IncomingAuthType` - only truthiness is read here, by `hashIncomingPassword` below (What's left #6's fix: hashing a `users`-style collection's plain `password` field into `salt`/`hash`). */
  auth?: boolean | Record<string, unknown>
}

/** Structural mirror of a real `GlobalConfig` - no `create`/`delete` access (globals have neither operation), `hooks.afterDelete` likewise absent. */
export type GlobalConfigLike = {
  slug: string
  fields: FieldConfigLike[]
  access?: {
    read?: AccessFn
    update?: AccessFn
  }
  hooks?: {
    beforeValidate?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
    beforeChange?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
    afterChange?: Array<(args: any) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any -- real hook-arg shapes differ per hook type; forwarded unmodified, see AccessFn in access.ts
  }
}

/**
 * The slice of a `src/cms/db/collections/*.ts` file's own exports this
 * pipeline calls - literally `{ create: createFaq, updateByID: updateFaq,
 * deleteByID: deleteFaq, findByID: findFaqByID }` at a real call site. See
 * the file header's "Why a `db` parameter, not a hardcoded registry".
 *
 * `updateByID`'s `{ draft }` opt and `create`'s lack of one exactly mirror
 * `createDraftOps`' own real signatures (`generic.ts:1223-1279`) - a
 * non-drafts collection's plain `createCollectionOps` functions are still
 * assignable here since `updateByID(id, data)` (no third arg) is a valid
 * call of `updateByID(id, data, opts?)`.
 */
export type CollectionDbOps<TDoc extends { id: number }> = {
  create: (data: Record<string, unknown>) => Promise<TDoc>
  updateByID: (id: number, data: Record<string, unknown>, opts?: { draft?: boolean }) => Promise<TDoc | null>
  deleteByID: (id: number) => Promise<boolean>
  findByID: (id: number, opts?: { draft?: boolean }) => Promise<TDoc | null>
}

/** The slice of a `src/cms/db/globals/*.ts` file's own exports `updateGlobalDocument` calls - `createGlobalOps`' `find`/`update` (`generic.ts:1328` onward - a global upsert, see that function's own doc comment for why there is no separate `create`). */
export type GlobalDbOps<TDoc> = {
  find: () => Promise<TDoc | null>
  update: (data: Record<string, unknown>) => Promise<TDoc>
}

/* -------------------------------------------------------------------------- */
/* matchesWhere - narrow, documented in-memory access-result matcher          */
/* -------------------------------------------------------------------------- */

/**
 * Evaluates whether `doc` satisfies a `Where` clause an access function
 * returned, entirely in memory (no DB round trip) - see the file header's
 * "Where-shaped access results on update/delete" for why this exists and why
 * it only needs to support `equals`/`not_equals`/`in` plus `and`/`or`
 * composition: that is the complete vocabulary of every real write-access
 * function this app's config wires up to `update`/`delete` (grepped, exactly
 * one - `isAdminOrSelf` on `Users.access.update` - ever returns a `Where` on
 * a write path at all, and it only ever produces `{id: {equals}}`). NOT a
 * general Payload `Where` engine - `src/cms/db/where.ts` already is one, for
 * reads, against Drizzle's SQL builder, which isn't reusable for matching a
 * plain JS object in memory.
 */
export function matchesWhere(doc: Record<string, unknown>, where: Where): boolean {
  if (Array.isArray(where.and)) return where.and.every((clause) => matchesWhere(doc, clause))
  if (Array.isArray(where.or)) return where.or.some((clause) => matchesWhere(doc, clause))
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'and' || field === 'or') return true
    if (!condition || typeof condition !== 'object') return true
    const cond = condition as Record<string, unknown>
    if ('equals' in cond) return doc[field] === cond.equals
    if ('not_equals' in cond) return doc[field] !== cond.not_equals
    if ('in' in cond && Array.isArray(cond.in)) return (cond.in as unknown[]).includes(doc[field])
    // Any other operator (this app's real write-access functions never
    // produce one) is treated as "matches" rather than silently denying
    // access on an operator this narrow matcher doesn't understand.
    return true
  })
}

/* -------------------------------------------------------------------------- */
/* Unique-constraint shaping (see file header point 5)                        */
/* -------------------------------------------------------------------------- */

/**
 * Translates a caught DB error into a Payload-shaped `ValidationError` when
 * (and only when) it looks like a SQLite/D1 unique-constraint violation - see
 * the file header's "Unique-field enforcement" section for the full, verified
 * picture: this is NOT a no-op today. `eg_events.slug`'s live table already
 * carries a real unique index (a legacy artifact `generate.ts`'s current
 * source no longer knows how to reproduce), so this translator is already
 * load-bearing for that column; a column whose live table was created purely
 * from today's `generate.ts` has no such index yet and would not error at
 * all, so this function's job for THAT case remains dormant until
 * `generate.ts` is taught to emit `UNIQUE` for `field.unique === true`.
 * Returns the translated `ValidationError`, or `undefined` when `error`
 * doesn't match (so a caller can `throw translated ?? error`, never
 * swallowing an unrelated error).
 */
export function uniqueConstraintErrorToValidationError(error: unknown, fieldName?: string): ValidationError | undefined {
  // The actual SQLite/D1 wording is buried on `.cause` (drizzle's own
  // `DrizzleQueryError` wraps the driver error) / `.cause.cause` (the
  // Cloudflare D1 driver wraps SQLite's own error in turn) - the top-level
  // `.message` is only drizzle's generic "Failed query: insert into ..."
  // text, confirmed against a real duplicate-`eg_events.slug` insert. Walk
  // a few `.cause` levels so this works whether `error` is the raw
  // DrizzleQueryError (this app's `src/cms/db` never unwraps it) or an
  // already-unwrapped Error someone else re-threw.
  let message = ''
  let current: unknown = error
  for (let i = 0; i < 5 && current; i++) {
    if (current instanceof Error) message += `${current.message}\n`
    current = current instanceof Error ? (current as { cause?: unknown }).cause : undefined
  }
  if (!message) message = String(error)
  if (!/SQLITE_CONSTRAINT_UNIQUE|UNIQUE constraint failed/i.test(message)) return undefined
  // SQLite/D1's own wording is `UNIQUE constraint failed: <table>.<column>` -
  // pull the column name out when the caller didn't already know which field
  // it was (createDocument/updateDocument below don't - a collection can
  // have more than one `unique: true` field), falling back to a generic
  // label only when the message doesn't match that shape.
  const extracted = /UNIQUE constraint failed:\s*\w+\.(\w+)/i.exec(message)?.[1]
  return new ValidationError([{ path: fieldName ?? extracted ?? 'value', message: 'This value must be unique.' }])
}

/* -------------------------------------------------------------------------- */
/* Field defaults - real Payload's getFallbackValue                           */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors real Payload's `getFallbackValue`
 * (`fields/hooks/beforeValidate/getFallbackValue.js`) exactly: an EXISTING
 * value on the original/sibling doc wins over `field.defaultValue` - this is
 * what makes a partial UPDATE correctly treat an omitted-from-`data` required
 * field as "still has its old value" (via `siblingDoc`, the real previous
 * doc) rather than "missing", while a CREATE (where `siblingDoc` is `{}`)
 * falls straight through to `defaultValue`. `defaultValue` as a function
 * receives `{req, user}` - real Payload's own `getDefaultValue.js` passes
 * `{req, user, locale}` but this app never configures localization (see
 * `hooks.ts`'s own out-of-scope note), so `locale` is omitted here.
 */
async function resolveFieldDefault(field: FieldConfigLike, siblingDoc: Record<string, unknown>, req: LocalReq): Promise<unknown> {
  const name = field.name
  if (!name) return undefined
  if (siblingDoc[name] !== undefined) return siblingDoc[name]
  if (field.defaultValue === undefined) return undefined
  return typeof field.defaultValue === 'function' ? await (field.defaultValue as (args: { req: unknown; user: unknown }) => unknown)({ req, user: req.user }) : field.defaultValue
}

/* -------------------------------------------------------------------------- */
/* traverseBeforeValidate - mirrors fields/hooks/beforeValidate/{index,promise,traverseFields}.js */
/* -------------------------------------------------------------------------- */

type TraverseCtx = {
  /** The WHOLE top-level `data` object, unchanged across the entire traversal - real hook args always receive this, not the current field's own nested `siblingData` (`promise.js`'s own `data` param, threaded down unmodified through every recursive call). */
  data: Record<string, unknown>
  doc: Record<string, unknown>
  collection: unknown
  global: unknown
  context: RequestContextLike
  operation: CollectionHookOperation
  overrideAccess: boolean
  req: LocalReq
}

/**
 * Per real Payload's own doc comment on `beforeValidate/index.js` ("Sanitize
 * incoming data / Execute field hooks / Execute field access control / Merge
 * original document data into incoming data / Compute default values for
 * undefined fields"), minus the type-coercion "Sanitize incoming data" step
 * (out of scope - this app's Local API callers already send well-typed
 * values; `validators.ts`'s own file header makes the same "no
 * `req`/i18n-plumbing round trips this app doesn't need" call for validation,
 * and coercion is the same class of admin-UI-submission-shape concern).
 * Per-field order (`promise.js:22-236`): default-if-undefined -> field hooks
 * -> field access control (strips the field if denied) -> default-if-STILL-
 * undefined (the second fallback catches a field a denied access check just
 * deleted). Recurses into `array`/`blocks`/`group`/`row`/`collapsible`
 * exactly as `promise.js`'s own `switch(field.type)` does (`row`/`collapsible`
 * share the parent's own `siblingData` - no nesting; `group` nests into
 * `siblingData[field.name]`, creating `{}` if absent - `promise.js`'s
 * `group` case, not shown in this file's earlier excerpt but structurally
 * identical to the `beforeChange` version already read directly). `join`
 * fields are always skipped (never written).
 */
async function traverseBeforeValidate(fields: FieldConfigLike[], siblingData: Record<string, unknown>, siblingDoc: Record<string, unknown>, path: (string | number)[], ctx: TraverseCtx): Promise<void> {
  for (const field of fields) {
    if (field.type === 'join') continue

    if (field.type === 'row' || field.type === 'collapsible') {
      await traverseBeforeValidate(field.fields ?? [], siblingData, siblingDoc, path, ctx)
      continue
    }

    const name = field.name
    const hasName = typeof name === 'string'

    if (field.type === 'group') {
      if (hasName && typeof siblingData[name] !== 'object') siblingData[name] = {}
      const nestedData = hasName ? (siblingData[name] as Record<string, unknown>) : siblingData
      const nestedDoc = hasName && typeof siblingDoc[name] === 'object' ? (siblingDoc[name] as Record<string, unknown>) : hasName ? {} : siblingDoc
      if (hasName) await visitBeforeValidateField(field, name, siblingData, siblingDoc, [...path, name], ctx)
      await traverseBeforeValidate(field.fields ?? [], nestedData, nestedDoc, hasName ? [...path, name] : path, ctx)
      continue
    }

    if (!hasName) continue

    await visitBeforeValidateField(field, name, siblingData, siblingDoc, [...path, name], ctx)

    if (field.type === 'array') {
      const rows = Array.isArray(siblingData[name]) ? (siblingData[name] as Record<string, unknown>[]) : []
      const docRows = Array.isArray(siblingDoc[name]) ? (siblingDoc[name] as Record<string, unknown>[]) : []
      for (let i = 0; i < rows.length; i++) {
        await traverseBeforeValidate(field.fields ?? [], rows[i], docRows[i] ?? {}, [...path, name, i], ctx)
      }
    } else if (field.type === 'blocks') {
      const rows = Array.isArray(siblingData[name]) ? (siblingData[name] as Record<string, unknown>[]) : []
      const docRows = Array.isArray(siblingDoc[name]) ? (siblingDoc[name] as Record<string, unknown>[]) : []
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const blockConfig = (field.blocks ?? []).find((b) => b.slug === row?.blockType)
        if (blockConfig) await traverseBeforeValidate(blockConfig.fields, row, docRows[i] ?? {}, [...path, name, i], ctx)
      }
    }
  }
}

async function visitBeforeValidateField(
  field: FieldConfigLike,
  name: string,
  siblingData: Record<string, unknown>,
  siblingDoc: Record<string, unknown>,
  path: (string | number)[],
  ctx: TraverseCtx,
): Promise<void> {
  const { data, doc, collection, global, context, operation, overrideAccess, req } = ctx

  if (siblingData[name] === undefined) {
    siblingData[name] = await resolveFieldDefault(field, siblingDoc, req)
  }

  const hooks = field.hooks?.beforeValidate
  if (hooks && hooks.length) {
    siblingData[name] = await runFieldHooks(hooks as unknown as Array<(args: Record<string, unknown>) => unknown>, {
      blockData: undefined,
      collection,
      context,
      data,
      field,
      global,
      indexPath: [],
      operation,
      originalDoc: doc,
      overrideAccess,
      path,
      previousSiblingDoc: siblingDoc,
      previousValue: siblingDoc[name],
      req,
      schemaPath: path,
      siblingData,
      siblingDocWithLocales: {},
      siblingFields: [],
      value: siblingData[name],
    } as unknown as Record<string, unknown>)
  }

  // Execute field access control - real Payload only checks 'create'/'update'
  // here (beforeValidate's own `operation` type), never 'read'.
  const accessFn = operation === 'create' ? field.access?.create : field.access?.update
  if (accessFn && !overrideAccess) {
    const allowed = await executeFieldAccess(accessFn, { req, data, doc, siblingData, blockData: undefined })
    if (!allowed) delete siblingData[name]
  }

  if (siblingData[name] === undefined) {
    siblingData[name] = await resolveFieldDefault(field, siblingDoc, req)
  }
}

/* -------------------------------------------------------------------------- */
/* traverseBeforeChange - mirrors fields/hooks/beforeChange/{index,promise,traverseFields}.js */
/* -------------------------------------------------------------------------- */

type BeforeChangeCtx = TraverseCtx & {
  /** `docWithLocales` in real Payload - this app never enables localization (see `hooks.ts`'s out-of-scope note), so it is always the same as `doc` here; kept as its own field for shape-fidelity with `BeforeChangeFieldHookArgs.siblingDocWithLocales`. */
  docWithLocales: Record<string, unknown>
  /** Root skip-validation flag - `true` for the whole document when saving a draft on a collection without `versions.drafts.validate: true` (see the file header's "Draft/publish policy"). Combined per-field with `!passesCondition` and threaded down to children exactly like real Payload's own `skipValidationFromHere` (`promise.js:38-50`). */
  skipValidation: boolean
  errors: ValidationFieldError[]
}

/**
 * Per-field order, mirroring `fields/hooks/beforeChange/promise.js:22-237`
 * exactly: run `admin.condition` -> execute field beforeChange hooks -> (if
 * neither this field nor an ancestor was skipped) validate via
 * `field.validate ?? getDefaultValidator(field.type)`, pushing a string
 * result onto `errors` rather than throwing immediately (real Payload
 * collects every field's error before throwing ONE `ValidationError` - see
 * `index.js`). Returns the effective skip flag for this field so array/blocks
 * row recursion and group recursion can propagate it to children exactly the
 * way real Payload's own `skipValidationFromHere` argument does.
 *
 * `jsonError` (validators.ts's `json` validator's own documented flag) is set
 * here, matching real Payload's own inline `try { JSON.parse(...) } catch`
 * immediately before calling the field's validator (`promise.js:87-94`) -
 * this module does not parse JSON anywhere else, same as `validators.ts`'s
 * own `json` validator never does.
 */
async function traverseBeforeChange(fields: FieldConfigLike[], siblingData: Record<string, unknown>, siblingDoc: Record<string, unknown>, path: (string | number)[], ctx: BeforeChangeCtx): Promise<void> {
  for (const field of fields) {
    if (field.type === 'join') continue

    if (field.type === 'row' || field.type === 'collapsible') {
      await traverseBeforeChange(field.fields ?? [], siblingData, siblingDoc, path, ctx)
      continue
    }

    const name = field.name
    const hasName = typeof name === 'string'

    if (field.type === 'group') {
      if (hasName && typeof siblingData[name] !== 'object') siblingData[name] = {}
      const nestedData = hasName ? (siblingData[name] as Record<string, unknown>) : siblingData
      const nestedDoc = hasName && typeof siblingDoc[name] === 'object' ? (siblingDoc[name] as Record<string, unknown>) : hasName ? {} : siblingDoc
      let skip = ctx.skipValidation
      if (hasName) skip = await visitBeforeChangeField(field, name, siblingData, siblingDoc, [...path, name], ctx)
      await traverseBeforeChange(field.fields ?? [], nestedData, nestedDoc, hasName ? [...path, name] : path, { ...ctx, skipValidation: skip })
      continue
    }

    if (!hasName) continue

    const skip = await visitBeforeChangeField(field, name, siblingData, siblingDoc, [...path, name], ctx)

    if (field.type === 'array') {
      const rows = Array.isArray(siblingData[name]) ? (siblingData[name] as Record<string, unknown>[]) : []
      const docRows = Array.isArray(siblingDoc[name]) ? (siblingDoc[name] as Record<string, unknown>[]) : []
      for (let i = 0; i < rows.length; i++) {
        await traverseBeforeChange(field.fields ?? [], rows[i], docRows[i] ?? {}, [...path, name, i], { ...ctx, skipValidation: skip })
      }
    } else if (field.type === 'blocks') {
      const rows = Array.isArray(siblingData[name]) ? (siblingData[name] as Record<string, unknown>[]) : []
      const docRows = Array.isArray(siblingDoc[name]) ? (siblingDoc[name] as Record<string, unknown>[]) : []
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const blockConfig = (field.blocks ?? []).find((b) => b.slug === row?.blockType)
        if (blockConfig) await traverseBeforeChange(blockConfig.fields, row, docRows[i] ?? {}, [...path, name, i], { ...ctx, skipValidation: skip })
      }
    }
  }
}

async function visitBeforeChangeField(
  field: FieldConfigLike,
  name: string,
  siblingData: Record<string, unknown>,
  siblingDoc: Record<string, unknown>,
  path: (string | number)[],
  ctx: BeforeChangeCtx,
): Promise<boolean> {
  const { data, doc, docWithLocales, collection, global, context, operation, req, skipValidation, errors } = ctx

  const passesCondition = field.admin?.condition ? Boolean(field.admin.condition(data, siblingData, { user: req.user })) : true
  const effectiveSkip = skipValidation || !passesCondition

  const hooks = field.hooks?.beforeChange
  if (hooks && hooks.length) {
    siblingData[name] = await runFieldHooks(hooks as unknown as Array<(args: Record<string, unknown>) => unknown>, {
      blockData: undefined,
      collection,
      context,
      data,
      field,
      global,
      indexPath: [],
      operation,
      originalDoc: doc,
      path,
      previousSiblingDoc: siblingDoc,
      previousValue: siblingDoc[name],
      req,
      schemaPath: path,
      siblingData,
      siblingDocWithLocales: docWithLocales,
      siblingFields: [],
      value: siblingData[name],
    } as unknown as Record<string, unknown>)
  }

  if (!effectiveSkip) {
    // `relationship`/`upload` are forced onto THIS app's own `getDefaultValidator`,
    // never `field.validate` - found live 2026-09-26 (payload-removal-plan.md
    // "What's left" #10): `src/engage.config.ts` still assembles config via real
    // Payload's `buildConfig`, whose sanitizer auto-attaches ITS OWN default
    // validator onto every field's `.validate` (not just fields with a real,
    // author-written custom validator - grepped every `relationship`/`upload`
    // field literal under `src/`, zero declare their own `validate`). That real
    // validator fails against this app's minimal `req` (no real ID-type/collection
    // registry context), producing a garbled non-app error
    // ("...invalid relationships: 3 0") and blocking every full-validation
    // publish of a document with a relationship/upload value set - drafts
    // (skipValidation) were unaffected, which is why Phase 2's own verification
    // missed it. `validators.ts`'s own `relationshipOrUpload` reimplementation is
    // confirmed correct by inspection (traced `isValidID(3, 'number')` by hand),
    // so it's forced here rather than fixing/bypassing real Payload's own
    // validator. Every OTHER field type still prefers `field.validate` first,
    // matching real Payload's own precedence - unaffected, and no other type
    // has shown this failure mode.
    const validateFn =
      field.type === 'relationship' || field.type === 'upload'
        ? getDefaultValidator(field.type)
        : (field.validate as ValidatorFn | undefined) ?? getDefaultValidator(field.type)
    if (validateFn) {
      let jsonError: string | undefined
      if (field.type === 'json' && typeof siblingData[name] === 'string') {
        try {
          JSON.parse(siblingData[name] as string)
        } catch {
          jsonError = 'Invalid JSON.'
        }
      }
      const options: ValidateFieldOptions & { req: LocalReq } = {
        required: field.required,
        hasMany: field.hasMany,
        min: field.min,
        max: field.max,
        minLength: field.minLength,
        maxLength: field.maxLength,
        minRows: field.minRows,
        maxRows: field.maxRows,
        options: field.options as SelectOption[] | undefined,
        relationTo: field.relationTo as string | undefined,
        // This app's real ID type - see `validators.ts`'s own `IDType` doc comment.
        idType: 'number',
        jsonError,
        editor: field.editor as LexicalEditorLike | undefined,
        // `validators.ts`'s own `getDefaultValidator` functions never read
        // `req` (see that module's file header - this stage never wires a
        // real engine through to field validators, by design). It is
        // included here ONLY because `field.validate` can be a REAL
        // Payload-injected default validator (`fields/config/sanitize.js`'s
        // `defaultValidate`, assigned onto every field real Payload
        // sanitizes) rather than this module's own `getDefaultValidator` -
        // that real function destructures `req.payload`/`req.t` directly in
        // its own parameter list and crashes without them. Forwarding the
        // same `req` this pipeline was given all the way down mirrors real
        // Payload's own `beforeChange/promise.js:97-114`, which always
        // passes `req` to `validateFn`.
        req,
      }
      const result = await validateFn(siblingData[name], options)
      if (typeof result === 'string') {
        errors.push({ path: path.join('.'), message: result })
      }
    }
  }

  return effectiveSkip
}

/* -------------------------------------------------------------------------- */
/* traverseAfterRead - mirrors fields/hooks/afterRead/{index,promise}.js,     */
/* trimmed to what this app uses (field hooks + field read-access)           */
/* -------------------------------------------------------------------------- */

type AfterReadCtx = {
  doc: Record<string, unknown>
  collection: unknown
  global: unknown
  context: RequestContextLike
  req: LocalReq
  overrideAccess: boolean
}

/**
 * This app's ONLY real field-level `afterRead` hook is `decryptSecretHook`
 * (`src/utilities/secretField.ts`, wired onto e.g. Integrations'
 * `claudeApiKey` - see the file header). Real Payload's `afterRead` also
 * does locale-flattening, hidden-field stripping, and relationship
 * population (`afterRead/index.js`'s own doc comment lists all five steps) -
 * none of which this app's data layer needs: no localization, no
 * `admin.hidden` fields declaring a runtime-conditional hide relevant to a
 * write pipeline's return value, and `src/cms/db` never resolves nested
 * related documents for ANY relationship field (confirmed by `db/index.ts`'s
 * own Phase 8 note) - so what's left, and what this function implements, is
 * exactly the two steps `access.ts`'s own `executeFieldAccess` doc comment
 * calls out for the read side: field hooks, then field READ access control
 * (strips the field if denied) - real order confirmed by
 * `fields/hooks/afterRead/promise.js:188-236`, hooks before access.
 */
async function traverseAfterRead(fields: FieldConfigLike[], siblingDoc: Record<string, unknown>, path: (string | number)[], ctx: AfterReadCtx): Promise<void> {
  for (const field of fields) {
    if (field.type === 'join') continue

    if (field.type === 'row' || field.type === 'collapsible') {
      await traverseAfterRead(field.fields ?? [], siblingDoc, path, ctx)
      continue
    }

    const name = field.name
    const hasName = typeof name === 'string'

    if (field.type === 'group') {
      const nested = hasName && typeof siblingDoc[name] === 'object' ? (siblingDoc[name] as Record<string, unknown>) : hasName ? {} : siblingDoc
      if (hasName) await visitAfterReadField(field, name, siblingDoc, path, ctx)
      await traverseAfterRead(field.fields ?? [], nested, hasName ? [...path, name] : path, ctx)
      continue
    }

    if (!hasName) continue

    await visitAfterReadField(field, name, siblingDoc, path, ctx)

    if (field.type === 'array') {
      const rows = Array.isArray(siblingDoc[name]) ? (siblingDoc[name] as Record<string, unknown>[]) : []
      for (let i = 0; i < rows.length; i++) {
        await traverseAfterRead(field.fields ?? [], rows[i], [...path, name, i], ctx)
      }
    } else if (field.type === 'blocks') {
      const rows = Array.isArray(siblingDoc[name]) ? (siblingDoc[name] as Record<string, unknown>[]) : []
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const blockConfig = (field.blocks ?? []).find((b) => b.slug === row?.blockType)
        if (blockConfig) await traverseAfterRead(blockConfig.fields, row, [...path, name, i], ctx)
      }
    }
  }
}

async function visitAfterReadField(field: FieldConfigLike, name: string, siblingDoc: Record<string, unknown>, path: (string | number)[], ctx: AfterReadCtx): Promise<void> {
  const { doc, collection, global, context, req, overrideAccess } = ctx

  const hooks = field.hooks?.afterRead
  if (hooks && hooks.length) {
    siblingDoc[name] = await runFieldHooks(hooks as unknown as Array<(args: Record<string, unknown>) => unknown>, {
      blockData: undefined,
      collection,
      context,
      currentDepth: 1,
      data: doc,
      depth: 0,
      draft: undefined,
      field,
      findMany: false,
      global,
      indexPath: [],
      originalDoc: doc,
      overrideAccess,
      path,
      req,
      schemaPath: path,
      showHiddenFields: false,
      siblingData: siblingDoc,
      siblingFields: [],
      value: siblingDoc[name],
    } as unknown as Record<string, unknown>)
  }

  const readAccess = field.access?.read
  if (readAccess && !overrideAccess) {
    const allowed = await executeFieldAccess(readAccess, { req, data: doc, doc, siblingData: siblingDoc, blockData: undefined })
    if (!allowed) delete siblingDoc[name]
  }
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Real `beforeChange/index.js` deep-copies incoming data before traversing (`deepCopyObjectSimple(incomingData)`) so the beforeChange field traversal's in-place mutations never alias the caller's own `data` object or the beforeValidate stage's already-mutated copy. This app's write data is always plain JSON-shaped values (no functions, no `Date` instances - dates are ISO strings throughout, per `validators.ts`'s own `date` validator), so a JSON round-trip is a faithful, dependency-free stand-in for Payload's own simple deep-copy utility. */
function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

function hasDraftsEnabled(collection: CollectionConfigLike): boolean {
  const versions = collection.versions
  return typeof versions === 'object' ? Boolean(versions.drafts) : false
}

function hasDraftValidationEnabled(collection: CollectionConfigLike): boolean {
  const versions = collection.versions
  const drafts = typeof versions === 'object' ? versions.drafts : undefined
  return typeof drafts === 'object' && drafts.validate === true
}

/**
 * Fixes What's-left #6: this module never hashed a `users`-style (`auth:
 * true`) collection's plain `password` field - `engine.create`/REST
 * `POST /api/users` with `{password: '...'}` wrote no working credentials,
 * since `password` isn't a real schema field (only `email` plus the implicit
 * auth columns `salt`/`hash`/etc are - see `src/cms/db/schema/generate.ts`'s
 * header) and there was never a step that turned it into `salt`/`hash`.
 *
 * Mirrors real Payload's own auth plugin: on a create with a `password`
 * string present, or an update that includes a new `password` string, hash
 * it with this app's own `hashPassword` (`./auth.ts` - PBKDF2-HMAC-SHA256,
 * same primitive `verifyPassword`/the password-reset flow already use) and
 * write `salt`/`hash` instead. A `password` key present but not a non-empty
 * string (or an update that doesn't touch `password` at all) is left alone -
 * never overwrite an existing salt/hash with nothing.
 *
 * Called on `resultData` as the LAST step before the DB write (both
 * `createDocument` and `updateDocument`), not up front on raw incoming
 * `data` - see those call sites' own comments for why: real Payload's
 * sanitizer injects implicit `email`/`salt`/`hash`/`resetPasswordToken`/
 * `lockUntil`/`sessions`/etc Field objects into an `auth: true` collection's
 * `collection.fields` (confirmed live 2026-09-26 by dumping
 * `collection.fields` inside this pipeline - NOT the bare `[roles]` this
 * module's own narrower `CollectionConfigLike` type made it look like), and
 * ordinary field-level access enforcement in `traverseBeforeValidate`/
 * `traverseBeforeChange` strips any client-supplied `salt`/`hash` set any
 * earlier than this. `password` itself is never a declared field even on the
 * real sanitized config, so it safely rides along untouched through every
 * pass before this function finally consumes it.
 */
function hashIncomingPassword(collection: CollectionConfigLike, data: Record<string, unknown>): Record<string, unknown> {
  if (!collection.auth || !('password' in data)) return data
  const { password, ...rest } = data
  if (typeof password !== 'string' || password.length === 0) return rest
  const { salt, hash } = hashPassword(password)
  return { ...rest, salt, hash }
}

/* -------------------------------------------------------------------------- */
/* createDocument                                                             */
/* -------------------------------------------------------------------------- */

export type CreateDocumentArgs<TDoc extends { id: number }> = {
  collection: CollectionConfigLike
  db: CollectionDbOps<TDoc>
  data: Record<string, unknown>
  req: LocalReq
  /** Skips the access-check step entirely, matching real Payload (`create.js:70`) - used pervasively by this app's own internal hook/server code. */
  overrideAccess?: boolean
  /** Only meaningful when `collection.versions.drafts` is set - see the file header's "Draft/publish policy". */
  draft?: boolean
}

/** See the file header's "CREATE" section for the full real-Payload step-order citation this ports. */
export async function createDocument<TDoc extends { id: number }>(args: CreateDocumentArgs<TDoc>): Promise<TDoc> {
  const { collection, db, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  // Access
  if (!overrideAccess) {
    await executeAccess(collection.access?.create, { data: args.data, req })
  }

  // This app's create() call sites never pass Payload's own `duplicateFromID`
  // option (grepped `src/`, no matches) - `originalDoc`/`duplicatedFromDoc`
  // is therefore always `{}`, matching create.js's own default.
  const originalDoc: Record<string, unknown> = {}

  let data: Record<string, unknown> = { ...args.data }

  const draftsEnabled = hasDraftsEnabled(collection)
  const isSavingDraft = Boolean(args.draft) && draftsEnabled
  if (isSavingDraft) data._status = 'draft'

  // beforeValidate - Fields (BEFORE beforeValidate - Collection, see Deviation 1)
  await traverseBeforeValidate(collection.fields, data, originalDoc, [], {
    data,
    doc: originalDoc,
    collection,
    global: null,
    context,
    operation: 'create',
    overrideAccess,
    req,
  })

  // beforeValidate - Collection
  data = (await runCollectionHooks(collection.hooks?.beforeValidate as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined, { collection, context, data, operation: 'create', originalDoc, req } as unknown as Record<string, unknown>, 'data')) as Record<
    string,
    unknown
  >

  // beforeChange - Collection
  data = (await runCollectionHooks(collection.hooks?.beforeChange as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined, { collection, context, data, operation: 'create', originalDoc, req } as unknown as Record<string, unknown>, 'data')) as Record<
    string,
    unknown
  >

  // beforeChange - Fields (+ validation)
  let resultData = deepClone(data)
  const errors: ValidationFieldError[] = []
  await traverseBeforeChange(collection.fields, resultData, originalDoc, [], {
    data,
    doc: originalDoc,
    docWithLocales: originalDoc,
    collection,
    global: null,
    context,
    operation: 'create',
    overrideAccess,
    req,
    skipValidation: isSavingDraft && !hasDraftValidationEnabled(collection),
    errors,
  })
  if (errors.length > 0) throw new ValidationError(errors)

  // Password hashing (What's left #6) - deliberately AFTER every field-level
  // pass above, not before: `salt`/`hash` (and the other implicit auth
  // columns real Payload's sanitizer injects into `collection.fields` for an
  // `auth: true` collection - `resetPasswordToken`, `lockUntil`, `sessions`,
  // etc, confirmed live 2026-09-26 via debug logging, NOT the empty `[roles]`
  // this module's own narrower `CollectionConfigLike` type suggested) carry
  // real Payload's own restrictive field-level `access` - normal
  // traverseBeforeValidate/traverseBeforeChange field-access enforcement
  // (`if (!allowed) delete siblingData[name]`) strips any client-supplied
  // `salt`/`hash` before this line ever runs, exactly the security property
  // real Payload wants for these columns (never settable through the
  // ordinary fields-access path). Real Payload's own create.js sidesteps
  // this the same way: it sets `data.hash`/`data.salt` directly in the
  // operation's own code, bypassing the fields system entirely - mirrored
  // here by hashing on `resultData` (the fully-traversed clone) as the very
  // last step before the DB write, so nothing after this can strip it again.
  // `password` is never a declared field (confirmed - collection.fields has
  // no `password` entry even on the real sanitized config), so it rides
  // along untouched through every pass above and is only consumed here.
  resultData = hashIncomingPassword(collection, resultData)

  // DB create - draft-aware via `db` (createDraftOps.create always writes the
  // live row AND a mirroring version row; a non-drafts collection's plain
  // create() just writes the one row - see the file header). Wrapped so a
  // real SQLite/D1 unique-constraint violation (load-bearing for
  // `eg_events.slug` today - see the file header's "Unique-field
  // enforcement" section) surfaces as a `ValidationError`, matching real
  // Payload's own `handleUpsertError`, instead of a raw DB error escaping.
  let created: TDoc
  try {
    created = await db.create(resultData)
  } catch (error) {
    throw uniqueConstraintErrorToValidationError(error) ?? error
  }

  // afterRead - Fields (BEFORE afterChange, see Deviation 2)
  const resultDoc: Record<string, unknown> = { ...created }
  await traverseAfterRead(collection.fields, resultDoc, [], { doc: resultDoc, collection, global: null, context, req, overrideAccess })

  // afterChange - Collection (previousDoc: {} on create)
  const finalDoc = (await runCollectionHooks(
    collection.hooks?.afterChange as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { collection, context, data, doc: resultDoc, operation: 'create', overrideAccess, previousDoc: {}, req } as unknown as Record<string, unknown>,
    'doc',
  )) as TDoc

  return finalDoc
}

/* -------------------------------------------------------------------------- */
/* updateDocument                                                             */
/* -------------------------------------------------------------------------- */

export type UpdateDocumentArgs<TDoc extends { id: number }> = {
  collection: CollectionConfigLike
  db: CollectionDbOps<TDoc>
  id: number
  data: Record<string, unknown>
  req: LocalReq
  overrideAccess?: boolean
  draft?: boolean
}

/** See the file header's "UPDATE, single-ID" section for the full real-Payload step-order citation this ports. */
export async function updateDocument<TDoc extends { id: number }>(args: UpdateDocumentArgs<TDoc>): Promise<TDoc> {
  const { collection, db, id, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  // Access - may resolve to a Where (see the file header's "Where-shaped access results")
  const accessResult: AccessResult = overrideAccess ? true : await executeAccess(collection.access?.update, { id, data: args.data, req })

  // Fetch original doc (real Payload does this via a combineQueries'd findOne
  // BEFORE running any hook - `updateByID.js:73-94` - so this module does too)
  const original = await db.findByID(id)
  if (!original) throw new NotFound()

  const originalDoc = original as unknown as Record<string, unknown>

  if (typeof accessResult === 'object' && !matchesWhere(originalDoc, accessResult)) {
    // A doc exists but the access Where excludes it - Forbidden, not NotFound
    // (`updateByID.js:89-91`'s own `hasWherePolicy` branch).
    throw new Forbidden()
  }

  let data: Record<string, unknown> = { ...args.data }

  const draftsEnabled = hasDraftsEnabled(collection)
  const isSavingDraft = Boolean(args.draft) && draftsEnabled && data._status !== 'published'
  if (isSavingDraft) data._status = 'draft'

  // beforeValidate - Fields (using the REAL originalDoc, unlike create)
  await traverseBeforeValidate(collection.fields, data, originalDoc, [], {
    data,
    doc: originalDoc,
    collection,
    global: null,
    context,
    operation: 'update',
    overrideAccess,
    req,
  })

  // beforeValidate - Collection
  data = (await runCollectionHooks(collection.hooks?.beforeValidate as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined, { collection, context, data, operation: 'update', originalDoc, req } as unknown as Record<string, unknown>, 'data')) as Record<
    string,
    unknown
  >

  // beforeChange - Collection
  data = (await runCollectionHooks(collection.hooks?.beforeChange as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined, { collection, context, data, operation: 'update', originalDoc, req } as unknown as Record<string, unknown>, 'data')) as Record<
    string,
    unknown
  >

  // beforeChange - Fields (+ validation)
  let resultData = deepClone(data)
  const errors: ValidationFieldError[] = []
  await traverseBeforeChange(collection.fields, resultData, originalDoc, [], {
    data,
    doc: originalDoc,
    docWithLocales: originalDoc,
    collection,
    global: null,
    context,
    operation: 'update',
    overrideAccess,
    req,
    skipValidation: isSavingDraft && !hasDraftValidationEnabled(collection),
    errors,
  })
  if (errors.length > 0) throw new ValidationError(errors)

  // Password hashing (What's left #6) - see createDocument's own comment on
  // this exact placement for why it must run AFTER every field-level pass
  // (real Payload's field-level access strips a client-supplied `salt`/
  // `hash` otherwise) and only touch `resultData` here.
  resultData = hashIncomingPassword(collection, resultData)

  // DB update - draft-aware (createDraftOps.updateByID skips the live write
  // entirely when `draft: true`, per that function's own doc comment).
  // Wrapped for the same unique-constraint reason as createDocument's
  // db.create call above.
  let updated: TDoc | null
  try {
    updated = await db.updateByID(id, resultData, { draft: args.draft })
  } catch (error) {
    throw uniqueConstraintErrorToValidationError(error) ?? error
  }
  if (!updated) throw new NotFound()

  // afterRead - Fields (BEFORE afterChange, see Deviation 2)
  const resultDoc: Record<string, unknown> = { ...updated }
  await traverseAfterRead(collection.fields, resultDoc, [], { doc: resultDoc, collection, global: null, context, req, overrideAccess })

  // afterChange - Collection (previousDoc: the doc as fetched BEFORE this update)
  const finalDoc = (await runCollectionHooks(
    collection.hooks?.afterChange as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { collection, context, data, doc: resultDoc, operation: 'update', overrideAccess, previousDoc: originalDoc, req } as unknown as Record<string, unknown>,
    'doc',
  )) as TDoc

  return finalDoc
}

/* -------------------------------------------------------------------------- */
/* deleteDocument                                                             */
/* -------------------------------------------------------------------------- */

export type DeleteDocumentArgs<TDoc extends { id: number }> = {
  collection: CollectionConfigLike
  db: CollectionDbOps<TDoc>
  id: number
  req: LocalReq
  overrideAccess?: boolean
}

/** See the file header's "DELETE, single-ID" section, including "Adaptation: delete's return shape". */
export async function deleteDocument<TDoc extends { id: number }>(args: DeleteDocumentArgs<TDoc>): Promise<TDoc> {
  const { collection, db, id, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  const accessResult: AccessResult = overrideAccess ? true : await executeAccess(collection.access?.delete, { id, req })

  // This app declares zero `beforeDelete` hooks anywhere (grepped) - real
  // Payload's own beforeDelete step (`deleteByID.js:44-53`) is a pure
  // side-effecting no-op for this app's entire config, so it is cited in the
  // file header but not implemented here.

  const doc = await db.findByID(id)
  if (!doc) throw new NotFound()

  const docRecord = doc as unknown as Record<string, unknown>

  if (typeof accessResult === 'object' && !matchesWhere(docRecord, accessResult)) {
    throw new Forbidden()
  }

  const deleted = await db.deleteByID(id)
  if (!deleted) throw new NotFound()

  // afterRead - Fields (BEFORE afterDelete, see Deviation 2) - operates on
  // the pre-deletion snapshot, per "Adaptation: delete's return shape".
  const resultDoc: Record<string, unknown> = { ...docRecord }
  await traverseAfterRead(collection.fields, resultDoc, [], { doc: resultDoc, collection, global: null, context, req, overrideAccess })

  // afterDelete - Collection (no `data`/`operation` - see hooks.ts's own CollectionAfterDeleteHookArgs)
  const finalDoc = (await runCollectionHooks(
    collection.hooks?.afterDelete as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { id, collection, context, doc: resultDoc, req } as unknown as Record<string, unknown>,
    'doc',
  )) as TDoc

  return finalDoc
}

/* -------------------------------------------------------------------------- */
/* updateGlobalDocument                                                       */
/* -------------------------------------------------------------------------- */

export type UpdateGlobalDocumentArgs<TDoc> = {
  global: GlobalConfigLike
  db: GlobalDbOps<TDoc>
  data: Record<string, unknown>
  req: LocalReq
  overrideAccess?: boolean
}

/** See the file header's "UPDATE-GLOBAL" section, including Deviation 3 (globals' beforeValidate/beforeChange hooks receive `overrideAccess`, a collection's own do not). */
export async function updateGlobalDocument<TDoc>(args: UpdateGlobalDocumentArgs<TDoc>): Promise<TDoc> {
  const { global, db, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  // Globals in this app never use a Where-returning access.update (grepped -
  // every real global's `access.update` is `isAdmin`, boolean-only, unlike
  // Users' collection-level `isAdminOrSelf`) - matching real Payload, whose
  // own global update() never merges the access result into a query at all
  // (`globals/operations/update.js:49-56`'s `query` variable exists only to
  // re-fetch, never to gate a Forbidden/NotFound decision the way a
  // collection update's `combineQueries` does) - so unlike `updateDocument`,
  // no `matchesWhere` check runs here. `executeAccess` itself already threw
  // `Forbidden` above for a bare `false`.
  if (!overrideAccess) {
    await executeAccess(global.access?.update, { data: args.data, req })
  }

  const existing = (await db.find()) as Record<string, unknown> | null
  const originalDoc: Record<string, unknown> = existing ? { ...existing } : {}

  let data: Record<string, unknown> = { ...args.data }

  // beforeValidate - Fields
  await traverseBeforeValidate(global.fields, data, originalDoc, [], {
    data,
    doc: originalDoc,
    collection: null,
    global,
    context,
    operation: 'update',
    overrideAccess,
    req,
  })

  // beforeValidate - Global (includes overrideAccess - Deviation 3)
  data = (await runCollectionHooks(
    global.hooks?.beforeValidate as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { context, data, global, originalDoc, overrideAccess, req } as unknown as Record<string, unknown>,
    'data',
  )) as Record<string, unknown>

  // beforeChange - Global (includes overrideAccess - Deviation 3)
  data = (await runCollectionHooks(
    global.hooks?.beforeChange as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { context, data, global, originalDoc, overrideAccess, req } as unknown as Record<string, unknown>,
    'data',
  )) as Record<string, unknown>

  // beforeChange - Fields (+ validation). No draft concept for globals in
  // this app (grepped every `src/globals/*.ts` for `versions` - zero
  // matches), so `skipValidation` is always false here.
  const resultData = deepClone(data)
  const errors: ValidationFieldError[] = []
  await traverseBeforeChange(global.fields, resultData, originalDoc, [], {
    data,
    doc: originalDoc,
    docWithLocales: originalDoc,
    collection: null,
    global,
    context,
    operation: 'update',
    overrideAccess,
    req,
    skipValidation: false,
    errors,
  })
  if (errors.length > 0) throw new ValidationError(errors)

  // DB upsert
  const updated = (await db.update(resultData)) as Record<string, unknown>

  // afterRead - Fields
  const resultDoc: Record<string, unknown> = { ...updated }
  await traverseAfterRead(global.fields, resultDoc, [], { doc: resultDoc, collection: null, global, context, req, overrideAccess })

  // afterChange - Global (previousDoc: originalDoc)
  const finalDoc = (await runCollectionHooks(
    global.hooks?.afterChange as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { context, data, doc: resultDoc, global, overrideAccess, previousDoc: originalDoc, req } as unknown as Record<string, unknown>,
    'doc',
  )) as TDoc

  return finalDoc
}
