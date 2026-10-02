/**
 * Write operations for the Local API: `createDocument`, `updateDocument`
 * (single id), `deleteDocument` (single id) and `updateGlobalDocument`, built on
 * `src/localapi/{validators,access,hooks}.ts` and the `src/cms/db` data layer.
 * Each is a straight-line port of the reference engine's operation order.
 *
 * (The original, much longer header comment with line-by-line citations of the
 * reference engine is in git history for this file. The essentials follow.)
 *
 * Step order
 * ----------
 * CREATE: access -> beforeValidate FIELDS -> beforeValidate COLLECTION ->
 *   beforeChange COLLECTION -> beforeChange FIELDS (hooks + validation, throws
 *   one `ValidationError` with every failing field) -> password hashing -> DB
 *   create (version snapshot handled inside `src/cms/db` `createDraftOps`) ->
 *   afterRead FIELDS -> afterChange COLLECTION (`previousDoc: {}`).
 * UPDATE (single id): access (may resolve to a `Where`) -> fetch original doc ->
 *   same field/collection hook order as create, using the real original doc ->
 *   password hashing -> DB update (draft-aware) -> afterRead FIELDS ->
 *   afterChange COLLECTION (`previousDoc` = the doc as fetched).
 * DELETE (single id): access -> fetch doc -> DB delete -> afterRead FIELDS ->
 *   afterDelete COLLECTION. `src/cms/db` returns only a boolean from delete, so
 *   the pre-deletion snapshot is what afterRead/afterDelete run against.
 * UPDATE GLOBAL: access -> fetch existing -> beforeValidate FIELDS ->
 *   beforeValidate GLOBAL -> beforeChange GLOBAL -> beforeChange FIELDS ->
 *   DB upsert -> afterRead FIELDS -> afterChange GLOBAL. Globals' beforeValidate
 *   and beforeChange hooks receive `overrideAccess`; a collection's do not.
 *
 * Notes
 * -----
 * - Field-level beforeValidate runs BEFORE collection-level beforeValidate, and
 *   field validation is not a separate pass: it runs per field right after that
 *   field's own beforeChange hook, inside the beforeChange traversal.
 * - afterRead (field hooks, e.g. secret decryption) runs BEFORE afterChange and
 *   afterDelete.
 * - Each function takes a small `db` object (`create`/`updateByID`/`deleteByID`/
 *   `findByID`, or a global's `find`/`update`) instead of a hardcoded registry,
 *   because `src/cms/db` exposes differently named functions per collection.
 * - Unique fields: there is no pre-check. A SQLite/D1 unique-constraint error
 *   from the DB call is translated by `uniqueConstraintErrorToValidationError`
 *   into a `ValidationError`.
 * - `Where`-shaped access results on update/delete are evaluated in memory by
 *   `matchesWhere` (only `equals`, `not_equals`, `in`, `and`, `or`, which is all
 *   this app's write-access functions ever return).
 * - Draft policy: `draft: true` on a collection with `versions.drafts` stamps
 *   `_status = 'draft'` and skips field validation for the whole document unless
 *   `versions.drafts.validate` is true. The DB-level draft/publish write policy
 *   lives in `src/cms/db/generic.ts` `createDraftOps`.
 * - `overrideAccess: true` skips the access check, as in the reference engine.
 *   `disableErrors` is read-path only and is not threaded through here.
 * - Field validators receive `data` (the whole document being saved), `id` (the
 *   original document's id on update) and `siblingData`, so a custom validator
 *   such as the page slug uniqueness check can exclude the document itself.
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

/** One field's validation failure. Every field's error is collected across the whole document before one `ValidationError` is thrown. */
export type ValidationFieldError = { path: string; message: string }

/** Stands in for the reference engine's `ValidationError` (no engine import, no i18n lookup). */
export class ValidationError extends Error {
  errors: ValidationFieldError[]
  constructor(errors: ValidationFieldError[]) {
    super(`The following field${errors.length === 1 ? ' is' : 's are'} invalid: ${errors.map((e) => `${e.path} (${e.message})`).join('; ')}`)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

/** Stands in for the reference engine's `NotFound`. */
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
 * A structural mirror of the subset of a real `Field` that the traversal reads. A
 * real field from `src/collections/*.ts` is assignable without modification.
 * Hook and access entries are typed loosely and forwarded unmodified. The
 * `tabs` field type is not modelled (no field in this app uses one).
 */
export type FieldConfigLike = {
  name?: string
  type: string
  label?: unknown
  fields?: FieldConfigLike[]
  /** `blocks` fields only: the plain `blocks: Block[]` array form. */
  blocks?: Array<{ slug: string; fields: FieldConfigLike[] }>
  required?: boolean
  /** Read by `rest.ts`'s `applyBeforeDuplicate`, not by this file's pipeline. */
  unique?: boolean
  hasMany?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  minRows?: number
  maxRows?: number
  /** `select` options. Typed `unknown[]` and cast to `SelectOption[]` where read. */
  options?: unknown[]
  /** Typed `unknown` (a real `relationTo` may be `string | string[]`); cast to `string | undefined` where read. */
  relationTo?: unknown
  /** A plain value or `(args) => value | Promise<value>`. */
  defaultValue?: unknown
  /** A field's own custom validator. Typed `unknown` and cast to `ValidatorFn` where read. */
  validate?: unknown
  /** `richText` only. Typed `unknown` and cast to `LexicalEditorLike | undefined` where read. */
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
    /** Only `user` is ever supplied as the third argument; typed with rest args to stay assignable from the real `Condition`. */
    condition?: (...args: any[]) => boolean // eslint-disable-line @typescript-eslint/no-explicit-any -- see comment above
  }
}

/** Structural mirror of a real `CollectionConfig`: only the parts this pipeline reads. A real config is assignable without stripping anything. */
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
  /** Only `versions.drafts` (boolean or `{validate?: boolean}`) is read. A bare `false` is valid and carries no `.drafts`. */
  versions?: boolean | { drafts?: boolean | { validate?: boolean } }
  /**
   * Only truthiness is read, by `hashIncomingPassword` (hashes a `users`-style
   * collection's plain `password` into `salt`/`hash`). Typed `unknown` so a real
   * `CollectionConfig`'s `auth` value is assignable (see `read-operations.ts`'s
   * `ReadEntityConfig.auth`).
   */
  auth?: unknown
}

/** Structural mirror of a real `GlobalConfig`. Globals have no create/delete access or afterDelete hook. */
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
 * The slice of a `src/cms/db/collections/*.ts` file's exports this pipeline
 * calls, for example `{ create: createFaq, updateByID: updateFaq, deleteByID:
 * deleteFaq, findByID: findFaqByID }`. `updateByID`'s `{ draft }` option mirrors
 * `createDraftOps`; a plain collection's `updateByID(id, data)` is assignable.
 */
export type CollectionDbOps<TDoc extends { id: number }> = {
  create: (data: Record<string, unknown>) => Promise<TDoc>
  updateByID: (id: number, data: Record<string, unknown>, opts?: { draft?: boolean }) => Promise<TDoc | null>
  deleteByID: (id: number) => Promise<boolean>
  findByID: (id: number, opts?: { draft?: boolean }) => Promise<TDoc | null>
}

/** The slice of a `src/cms/db/globals/*.ts` file's exports `updateGlobalDocument` calls (a global upsert: `find` and `update`). */
export type GlobalDbOps<TDoc> = {
  find: () => Promise<TDoc | null>
  update: (data: Record<string, unknown>) => Promise<TDoc>
}

/* -------------------------------------------------------------------------- */
/* matchesWhere - narrow, documented in-memory access-result matcher          */
/* -------------------------------------------------------------------------- */

/**
 * Evaluates whether `doc` satisfies a `Where` an access function returned, in
 * memory. Supports only `equals`/`not_equals`/`in` plus `and`/`or`, which is the
 * complete vocabulary of this app's write-access functions (the only one that
 * returns a `Where` is `isAdminOrSelf` on `Users.access.update`, producing
 * `{id: {equals}}`). Not a general query engine.
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
/* Unique-constraint shaping                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Translates a caught DB error into a `ValidationError` when (and only when) it
 * looks like a SQLite/D1 unique-constraint violation. Returns `undefined` for
 * any other error so a caller can `throw translated ?? error` without
 * swallowing unrelated errors. A column only errors if its live table has a
 * real unique index (for example `eg_events.slug`); `generate.ts` does not emit
 * `UNIQUE` for new tables, so this stays dormant for those columns.
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
/* Field defaults                                                             */
/* -------------------------------------------------------------------------- */

/**
 * An EXISTING value on the original/sibling doc wins over `field.defaultValue`,
 * so a partial UPDATE treats an omitted-from-`data` field as "still has its old
 * value", while a CREATE (where `siblingDoc` is `{}`) falls through to
 * `defaultValue`. A function `defaultValue` receives `{req, user}`.
 */
async function resolveFieldDefault(field: FieldConfigLike, siblingDoc: Record<string, unknown>, req: LocalReq): Promise<unknown> {
  const name = field.name
  if (!name) return undefined
  if (siblingDoc[name] !== undefined) return siblingDoc[name]
  if (field.defaultValue === undefined) return undefined
  return typeof field.defaultValue === 'function' ? await (field.defaultValue as (args: { req: unknown; user: unknown }) => unknown)({ req, user: req.user }) : field.defaultValue
}

/* -------------------------------------------------------------------------- */
/* traverseBeforeValidate                                                     */
/* -------------------------------------------------------------------------- */

type TraverseCtx = {
  /** The WHOLE top-level `data` object, unchanged across the traversal: real hook args always receive this, not the current field's nested `siblingData`. */
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
 * Per field: default-if-undefined -> field hooks -> field access control (strips
 * the field if denied) -> default-if-STILL-undefined. Recurses into
 * `array`/`blocks`/`group`/`row`/`collapsible` (`row`/`collapsible` share the
 * parent's `siblingData`; `group` nests, creating `{}` if absent). `join`
 * fields are skipped. Type coercion of incoming data is out of scope.
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

  // Execute field access control - the reference engine only checks 'create'/'update'
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
/* traverseBeforeChange                                                       */
/* -------------------------------------------------------------------------- */

type BeforeChangeCtx = TraverseCtx & {
  /** Same as `doc` here: this app never enables localization. Kept for shape fidelity with `BeforeChangeFieldHookArgs.siblingDocWithLocales`. */
  docWithLocales: Record<string, unknown>
  /** `true` for the whole document when saving a draft on a collection without `versions.drafts.validate: true`. Combined per field with `!passesCondition` and threaded to children. */
  skipValidation: boolean
  errors: ValidationFieldError[]
}

/**
 * Per field: run `admin.condition` -> field beforeChange hooks -> (unless this
 * field or an ancestor was skipped) validate via `field.validate ??
 * getDefaultValidator(field.type)`, pushing a string result onto `errors`
 * instead of throwing, so every field's error is reported at once. Returns the
 * effective skip flag so array/blocks/group recursion can propagate it.
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
    // never `field.validate`: the engine's config sanitizer attaches its own
    // default validator to every field, and that one fails against this app's
    // minimal `req` (garbled "...invalid relationships: 3 0" error that blocked
    // every full-validation publish of a document with a relationship/upload
    // set; drafts skip validation, which is why it was missed at first).
    // `validators.ts`'s `relationshipOrUpload` is the verified replacement.
    // Every other field type still prefers `field.validate` first.
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
      const options: ValidateFieldOptions & { req: LocalReq; data?: Record<string, unknown>; id?: unknown; siblingData?: Record<string, unknown> } = {
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
        // `req` is forwarded because `field.validate` can be the engine-injected
        // default validator, which destructures `req.engine`/`req.t` directly
        // and crashes without it. The reference engine always passes `req`.
        req,
        // Custom field validators (for example the page slug uniqueness check) need the whole
        // document being saved and its id, like the reference engine passes them. Without the
        // id a uniqueness check matches the document itself and every update of an existing
        // page failed with "Another page with this slug already exists".
        data,
        id: (doc as { id?: unknown } | undefined)?.id,
        siblingData,
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
/* traverseAfterRead                                                          */
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
 * This app's only real field-level `afterRead` hook is `decryptSecretHook`
 * (`src/utilities/secretField.ts`). Locale flattening, hidden-field stripping and
 * relationship population are not needed (no localization, `src/cms/db` never
 * populates related documents). What is implemented: field hooks, then field
 * READ access control (strips the field if denied), in that order.
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

/** Deep-copies incoming data before the beforeChange traversal so its in-place mutations never alias the caller's `data` or the beforeValidate stage's copy. Write data is plain JSON-shaped (dates are ISO strings), so a JSON round-trip is a faithful copy. */
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
 * Hashes a `users`-style (`auth: true`) collection's plain `password` into
 * `salt`/`hash` using `./auth.ts`'s `hashPassword` (PBKDF2-HMAC-SHA256), since
 * `password` is not a real schema field. A `password` key that is not a
 * non-empty string is dropped, and an update that does not include `password`
 * leaves the existing salt/hash alone.
 *
 * Called on `resultData` as the LAST step before the DB write, not on raw
 * incoming data: the engine's sanitizer injects implicit `salt`/`hash`/etc
 * fields with restrictive field access into an `auth: true` collection, so the
 * normal field-level access pass strips any client-supplied `salt`/`hash`
 * earlier than this. `password` itself is never a declared field, so it rides
 * along untouched until this function consumes it.
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
  /** Skips the access-check step entirely, as in the reference engine - used pervasively by this app's own internal hook/server code. */
  overrideAccess?: boolean
  /** Only meaningful when `collection.versions.drafts` is set. */
  draft?: boolean
}

/** See the file header for the CREATE step order. */
export async function createDocument<TDoc extends { id: number }>(args: CreateDocumentArgs<TDoc>): Promise<TDoc> {
  const { collection, db, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  // Access
  if (!overrideAccess) {
    await executeAccess(collection.access?.create, { data: args.data, req })
  }

  // This app's create() call sites never pass the reference engine's
  // `duplicateFromID`, so `originalDoc` is always `{}`.
  const originalDoc: Record<string, unknown> = {}

  let data: Record<string, unknown> = { ...args.data }

  const draftsEnabled = hasDraftsEnabled(collection)
  const isSavingDraft = Boolean(args.draft) && draftsEnabled
  if (isSavingDraft) data._status = 'draft'

  // beforeValidate - Fields (BEFORE beforeValidate - Collection)
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

  // Password hashing - deliberately AFTER every field-level pass above, so
  // field-level access cannot strip the generated `salt`/`hash` (see
  // `hashIncomingPassword`).
  resultData = hashIncomingPassword(collection, resultData)

  // DB create - draft-aware via `db`. Wrapped so a real SQLite/D1
  // unique-constraint violation surfaces as a `ValidationError` instead of a
  // raw DB error.
  let created: TDoc
  try {
    created = await db.create(resultData)
  } catch (error) {
    throw uniqueConstraintErrorToValidationError(error) ?? error
  }

  // afterRead - Fields (BEFORE afterChange)
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

/** See the file header for the UPDATE step order. */
export async function updateDocument<TDoc extends { id: number }>(args: UpdateDocumentArgs<TDoc>): Promise<TDoc> {
  const { collection, db, id, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  // Access - may resolve to a Where (see `matchesWhere`)
  const accessResult: AccessResult = overrideAccess ? true : await executeAccess(collection.access?.update, { id, data: args.data, req })

  // Fetch the original doc BEFORE running any hook, as the reference engine does
  const original = await db.findByID(id)
  if (!original) throw new NotFound()

  const originalDoc = original as unknown as Record<string, unknown>

  if (typeof accessResult === 'object' && !matchesWhere(originalDoc, accessResult)) {
    // A doc exists but the access Where excludes it - Forbidden, not NotFound.
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

  // Password hashing - see createDocument for why it runs here.
  resultData = hashIncomingPassword(collection, resultData)

  // DB update - draft-aware (`createDraftOps.updateByID` skips the live write
  // entirely when `draft: true`). Wrapped for the same unique-constraint reason
  // as createDocument's db.create call.
  let updated: TDoc | null
  try {
    updated = await db.updateByID(id, resultData, { draft: args.draft })
  } catch (error) {
    throw uniqueConstraintErrorToValidationError(error) ?? error
  }
  if (!updated) throw new NotFound()

  // afterRead - Fields (BEFORE afterChange)
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

/** See the file header for the DELETE step order. */
export async function deleteDocument<TDoc extends { id: number }>(args: DeleteDocumentArgs<TDoc>): Promise<TDoc> {
  const { collection, db, id, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  const accessResult: AccessResult = overrideAccess ? true : await executeAccess(collection.access?.delete, { id, req })

  // This app declares zero `beforeDelete` hooks anywhere, so the reference
  // engine's beforeDelete step is not implemented here.

  const doc = await db.findByID(id)
  if (!doc) throw new NotFound()

  const docRecord = doc as unknown as Record<string, unknown>

  if (typeof accessResult === 'object' && !matchesWhere(docRecord, accessResult)) {
    throw new Forbidden()
  }

  const deleted = await db.deleteByID(id)
  if (!deleted) throw new NotFound()

  // afterRead - Fields (BEFORE afterDelete) - on the pre-deletion snapshot.
  const resultDoc: Record<string, unknown> = { ...docRecord }
  await traverseAfterRead(collection.fields, resultDoc, [], { doc: resultDoc, collection, global: null, context, req, overrideAccess })

  // afterDelete - Collection (no `data`/`operation`)
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

/** See the file header for the UPDATE GLOBAL step order. Globals' beforeValidate/beforeChange hooks receive `overrideAccess`; a collection's do not. */
export async function updateGlobalDocument<TDoc>(args: UpdateGlobalDocumentArgs<TDoc>): Promise<TDoc> {
  const { global, db, req } = args
  const overrideAccess = args.overrideAccess ?? false
  const context = (req.context as RequestContextLike | undefined) ?? {}

  // Every global's `access.update` is boolean-only (`isAdmin`), so unlike
  // `updateDocument` no `matchesWhere` check runs here: `executeAccess` already
  // throws `Forbidden` for a bare `false`.
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

  // beforeValidate - Global (includes overrideAccess)
  data = (await runCollectionHooks(
    global.hooks?.beforeValidate as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { context, data, global, originalDoc, overrideAccess, req } as unknown as Record<string, unknown>,
    'data',
  )) as Record<string, unknown>

  // beforeChange - Global (includes overrideAccess)
  data = (await runCollectionHooks(
    global.hooks?.beforeChange as unknown as Array<(args: Record<string, unknown>) => unknown> | undefined,
    { context, data, global, originalDoc, overrideAccess, req } as unknown as Record<string, unknown>,
    'data',
  )) as Record<string, unknown>

  // beforeChange - Fields (+ validation). No global in this app has drafts, so
  // `skipValidation` is always false here.
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
