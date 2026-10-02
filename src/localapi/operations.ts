/**
 * From-scratch reimplementation of the original engine 3.88.0's Local API WRITE
 * operations - `create`, `update` (single-ID only), `delete` (single-ID
 * only), and `updateGlobal` - built on top of this app's already-proven
 * `src/localapi/{validators,access,hooks}.ts` (stages 1a/1b/1c) and the
 * already-cut-over `src/cms/db` data layer, so this app's eventual the original engine
 * removal (see the `the plan doc` project doc) has a write
 * pipeline that makes the exact same access/validation/hook/draft decisions
 * the reference engine's `create.js` / `utilities/update.js` / `updateByID.js` /
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
 * correct against the reference engine behavior AND real `src/cms/db` behavior before
 * anything is cut over.
 *
 * ---------------------------------------------------------------------------
 * How this module is structured
 * ---------------------------------------------------------------------------
 * Four public pipeline functions - `createDocument`, `updateDocument`,
 * `deleteDocument`, `updateGlobalDocument` - each a straight-line port of one
 * the reference engine operation's real step order (cited stage by stage below, with
 * real source line numbers, not paraphrased from memory). Each takes:
 *   - a `collection`/`global` config object shaped like `CollectionConfigLike`/
 *     `GlobalConfigLike` below - loose, structural types a real
 *     `CollectionConfig`/`GlobalConfig` (from `@/engine`, still vendor-typed -
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
 * The original engine's own `fields/hooks/{beforeValidate,beforeChange,afterRead}/
 * {index,promise,traverseFields}.js` trio (three separate real files per
 * stage, not one shared engine - this module keeps that same three-way split
 * rather than collapsing it into one generic walker, both because the three
 * stages genuinely do different things per field (defaults+hooks+field-access
 * vs hooks+validation+skip-cascade vs hooks+field-read-access) and because it
 * makes each function directly comparable to the one real file it mirrors).
 * Recurse into `array`/`blocks`/`group`/`row`/`collapsible` fields the same
 * way the reference engine's own `traverseFields`/`promise` pair does for each stage
 * (see each function's own doc comment for the exact real citations); `join`
 * fields are always skipped (the reference engine never writes through one either -
 * confirmed by `db/index.ts`'s own Phase 8 note, and validators.ts already
 * treats `join` as carrying no validation of its own).
 *
 * Field VALIDATION (this app's 13 in-scope types from `validators.ts`) is
 * NOT a separate step from the field-level `beforeChange` hook - the reference engine
 * runs both, per field, inside the SAME traversal
 * (`fields/hooks/beforeChange/promise.js:58-100`: hook first, then
 * `if (!skipValidationFromHere && field.validate) { ... }` immediately
 * after) - see "Deviation 1" below for why this is NOT what the stage brief
 * originally assumed.
 *
 * ---------------------------------------------------------------------------
 * The reference engine step order, cited (this is what each pipeline function ports)
 * ---------------------------------------------------------------------------
 * CREATE (the vendor source):
 *   access (`create.js:70-75`, `executeAccess({data,req}, collectionConfig.access.create)`)
 *   -> beforeValidate-FIELDS (`create.js:95-104`, the whole-collection field
 *      traversal, BEFORE the collection-level hooks - see Deviation 1)
 *   -> beforeValidate-COLLECTION (`create.js:108-119`, `data = await hook(...) || data`)
 *   -> beforeChange-COLLECTION (`create.js:123-134`, same `|| data` chaining)
 *   -> beforeChange-FIELDS (`create.js:138-149` - hooks+validation+storage
 *      transform per field, throws `ValidationError` if any field failed)
 *   -> DB create (`create.js:194-198`, `engine.db.create(...)`)
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
 *      `findOne` in the reference engine; this module uses the `db` parameter's own
 *      `findByID` instead - see "Why a `db` parameter" below - then checks
 *      the fetched doc against the access `Where` itself, since `findByID`
 *      cannot take an arbitrary `where`)
 *   -> `updateDocument` (`utilities/update.js`, called from `updateByID.js:115-137`):
 *      beforeValidate-FIELDS (`utilities/update.js:90-100`, using the
 *        REAL `originalDoc`, not `{}` - unlike create)
 *      -> beforeValidate-COLLECTION (`utilities/update.js:104-115`)
 *      -> beforeChange-COLLECTION (`utilities/update.js:125-136`)
 *      -> beforeChange-FIELDS (`utilities/update.js:140-162`)
 *      -> DB update (`utilities/update.js:256-262`, `engine.db.updateOne`,
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
 *   -> (the reference engine also runs `beforeDelete` - collection-level, side-effect
 *      only, return value ignored - here BEFORE fetching the doc,
 *      `deleteByID.js:44-53`; this app declares zero `beforeDelete` hooks
 *      anywhere - grepped, confirmed - so it is cited for completeness but
 *      not implemented, matching `hooks.ts`'s own stated scope)
 *   -> fetch doc (`deleteByID.js:57-79`)
 *   -> DB delete (`deleteByID.js:127-136`, `engine.db.deleteOne` - returns
 *      the deleted DOC in the reference engine; `src/cms/db`'s own `deleteByID`
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
 *      function, matching the reference engine's OWN observation that
 *      `createGlobal` is only ever reached from `updateGlobal`'s own
 *      fallback in practice)
 *   -> saveVersion (`update.js:250-270` - NOT relevant here: no global in
 *      this app declares `versions` - grepped `src/globals/*.ts`, confirmed -
 *      so this branch is reference-engine-only dead code for this app and is not
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
 * validation". The reference engine's create.js runs the WHOLE field-level
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
 * field-level afterRead hooks". The reference engine runs afterRead-fields
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
 * The original engine - deviations from a generic adapter this app doesn't have)
 * ---------------------------------------------------------------------------
 * WHY A `db` PARAMETER, NOT A HARDCODED REGISTRY - `src/cms/db` exposes each
 * collection's create/update/delete/find as its OWN differently-named,
 * differently-typed functions (`createFaq`/`updateFaq`/..., `createEvent`/
 * `updateEvent`/... - see `src/cms/db/index.ts`'s barrel), not a single
 * generic `engine.db.create({collection, data})` dispatcher the way real
 * The original engine's adapter is. Rather than hardcode a slug->functions map for all
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
 * ADAPTATION: DELETE'S RETURN SHAPE - the reference engine's `engine.db.deleteOne`
 * returns the deleted DOCUMENT (`deleteByID.js:127-136`,
 * `let result = await req.engine.db.deleteOne(...)`, and `result` is what
 * `afterRead`/`afterDelete` run against). `src/cms/db/generic.ts`'s own
 * `deleteByID(id): Promise<boolean>` (confirmed reading the source directly -
 * `generic.ts:1158-1166`, `return result.length > 0`) returns only whether a
 * row was deleted, not the row itself - there was never a need for the doc's
 * shape once Drizzle's own `.delete().returning({id: idColumn})` only asked
 * for the id. `deleteDocument` below bridges this the same way real
 * The original engine's OWN two-step read-then-delete already implies is safe: fetch the
 * doc via `db.findByID(id)` BEFORE calling `db.deleteByID(id)` (which this
 * module already has to do anyway, to run the access/Where check and to hand
 * `afterRead`/`afterDelete` something to operate on), and treat that
 * pre-deletion snapshot as the "doc" afterRead/afterDelete hooks mutate and
 * this function returns - functionally identical to what the reference engine's
 * `docToDelete` variable already captures at `deleteByID.js:68-73` for
 * exactly the same reason (it needs the doc's shape for the NotFound/Forbidden
 * check before the actual delete happens).
 *
 * UNIQUE-FIELD ENFORCEMENT (stage brief point 5) - investigated, not
 * invented, and CORRECTED after live testing contradicted the first-pass
 * static read below. The reference engine enforces a field's `unique: true` as a DB
 * constraint violation caught AFTER a failed insert/update
 * (`the vendor package`'s `handleUpsertError`, watching for
 * `SQLITE_CONSTRAINT_UNIQUE`), never as a pre-check - this module follows the
 * same policy: no pre-check anywhere in `createDocument`/`updateDocument`,
 * only the post-hoc translator below.
 *
 * `src/cms/db`'s CURRENT schema-generation SOURCE (`src/cms/db/schema/generate.ts`,
 * grepped for `unique`/`UNIQUE` - zero matches) and every raw migration file
 * under `src/migrations/sql/*.sql` (also grepped - zero matches) confirm that
 * generator does not itself emit a SQL `UNIQUE` constraint for any column
 * today, for any field, including the ones that declare `unique: true` in
 * their the original engine config (Events.slug, Posts.slug, Courses.slug,
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