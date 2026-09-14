/**
 * Field-level validation, reimplemented from Payload 3.88.0's real
 * `node_modules/payload/dist/fields/validations.js` so this app's eventual
 * from-scratch Local API (stage 1a of the Payload-removal plan - see the
 * `payload-removal-plan.md` project doc for the full sequence) can make the
 * exact same accept/reject decisions Payload's REST/Local API and admin UI
 * enforce today, without pulling in the machinery those decisions don't
 * actually need for this app: i18n `t('validation:...')` lookups, the
 * `req`/`payload.config` plumbing every real validator threads through,
 * `filterOptions` DB round-trips, and Ajv JSON-schema validation.
 *
 * Scope is deliberately narrow: only the 13 field types this app's
 * collections/globals/blocks actually declare anywhere under `src/`
 * (confirmed by grepping every `type: '...'` field literal) -
 * `text, textarea, number, checkbox, email, date, select, relationship,
 * upload, array, blocks, json, richText`. Every other real Payload field
 * type (`password`, `code`, `point`, `radio`, `confirmPassword`,
 * `username`, plus the pure-layout `group`/`row`/`collapsible`/`tabs`/
 * `join`) is out of scope - this app never uses them, or (group/row/etc.)
 * they carry no validation of their own, only subfields that would be
 * validated recursively by whatever calls into this table per-field.
 *
 * `unique` is explicitly OUT OF SCOPE here too: real Payload enforces it as
 * a DB constraint caught after a failed insert (SQLITE_CONSTRAINT_UNIQUE),
 * never as one of these field validators - there is no `unique` entry in
 * `payload/dist/fields/validations.js`'s own exported `validations` table
 * either. It belongs in a later stage's operations/write layer, not here.
 *
 * Every returned error is a plain English string, not one of Payload's
 * `t('validation:...')` translation keys - this app never configured a
 * second admin-UI locale, so there is nothing to look up, and the exact
 * wording is not part of this module's contract. Callers should branch on
 * `typeof result === 'string'`, the same way Payload's own callers do,
 * never on the string's content.
 *
 * This module is intentionally NOT wired into `@/engine` or
 * `engage.config.ts` yet (a later stage) - it stands alone, exercised only
 * by its own tests, so it can be reviewed and proven correct against real
 * Payload behavior in isolation first.
 */

/** A `select` field's `options` entry - Payload allows a bare string as shorthand for `{ label: value, value }`. This app's own `options` arrays are always the `{ label, value }` object form (confirmed by grep), but the string form is implemented anyway since real Payload accepts both (validations.js:623-646). */
export type SelectOption = string | { label: string; value: string }

/** The subset of a real Payload `RichTextField`'s sanitized `editor` this module needs - just the `validate` function `@payloadcms/richtext-lexical`'s `lexicalEditor()` attaches to every rich text field's config (validations.js:249-256 calls exactly this, `editor.validate(value, options)`, and throws if it's missing - reimplemented as a graceful fallback below instead, since wiring the real Lexical editor through is a separate, later stage). */
export type LexicalEditorLike = {
  validate: (value: unknown, options: ValidateFieldOptions) => true | string | Promise<true | string>
}

/**
 * The real Payload `db.defaultIDType` (Local API name) an app's relationship/
 * upload target IDs are shaped like: `'text'` for a Mongo ObjectId or a
 * sqlite adapter configured with `idType: 'uuid' | 'uuidv7'`, `'number'` for
 * a sqlite/Postgres adapter's default integer auto-increment primary key.
 *
 * This app's own default is `'number'`, NOT `'text'` - confirmed two ways:
 * (1) `node_modules/@payloadcms/db-d1-sqlite/dist/index.js`:
 * `payloadIDType = idType === 'uuid' || idType === 'uuidv7' ? 'text' : 'number'`,
 * and `engage.config.ts`'s `engageD1Adapter({...})` call never passes an
 * `idType` option, so it takes that `'number'` default; (2) every live
 * collection table `src/cms/db/schema/generate.ts`'s `generateTable`
 * produces uses `id: integer('id').primaryKey({ autoIncrement: true })`, and
 * no collection under `src/collections`/`src/features` declares its own
 * `{ name: 'id', type: 'text' }` override (grepped for `name: 'id'` - no
 * matches) that would flip its `customIDType`.
 */
export type IDType = 'text' | 'number'

/**
 * The union of every option real Payload validators destructure off their
 * second argument, trimmed to what this app's 13 in-scope field types
 * actually read (see each validator below for which subset it uses) and
 * flattened out of the real `{ req: { payload: { config }, t }, ... }`
 * shape those validators are normally called with, since none of this
 * app's fields need `req`/`payload.config`/i18n for the paths reimplemented
 * here.
 */
export type ValidateFieldOptions = {
  required?: boolean
  hasMany?: boolean
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  minRows?: number
  maxRows?: number
  /** `select` only. */
  options?: SelectOption[]
  /** `relationship`/`upload` only. This app never configures a polymorphic `relationTo: [...]` array (confirmed by grep) - always a single collection slug string. */
  relationTo?: string
  /** `relationship`/`upload` only - defaults to `'number'`, this app's real default (see `IDType`'s doc comment). */
  idType?: IDType
  /** `json` only - set by the caller when it already tried `JSON.parse`-ing a string value and that threw, mirroring real Payload's own field-level `beforeValidate` hook wiring `jsonError` in before calling this validator (validations.js:166-217 never parses JSON itself either). */
  jsonError?: string
  /** `richText` only - the field's already-configured Lexical editor, when one has been wired up (see `LexicalEditorLike`'s doc comment for why this module doesn't assume one is always present yet). */
  editor?: LexicalEditorLike
}

export type ValidatorFn = (value: unknown, options: ValidateFieldOptions) => true | string | Promise<true | string>

const isNumber = (value: unknown): boolean => {
  // Mirrors payload/dist/utilities/isNumber.js exactly: `null`/`undefined`
  // and a whitespace-only string are never numbers (even though
  // `Number('   ')` is `0`, not `NaN`), everything else goes through
  // `!Number.isNaN(Number(value))` - so `"0"`, `0`, `"3.14"`, `true` (→ 1)
  // are all "numbers" by this definition, but `""`, `"abc"`, `null`,
  // `undefined` are not.
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return false
  return !Number.isNaN(Number(value))
}

const isValidID = (value: unknown, idType: IDType): boolean => {
  // Mirrors payload/dist/utilities/isValidID.js, minus the Mongo ObjectId
  // branch (irrelevant to this app's sqlite adapter - `idType` here is
  // never `'ObjectID'`) and the `type === 'text'` object-shaped-ObjectId
  // case, for the same reason: this app's text IDs (were it ever to use
  // one - see `IDType`'s doc comment for why it doesn't today) would only
  // ever be plain strings, never Mongo ObjectId instances.
  if (idType === 'text') return typeof value === 'string' && value.length > 0
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * Shared by `text`/`number` (only when `hasMany: true`) and `array`/`blocks`
 * (always) - mirrors validations.js:259-282's `validateArrayLength` exactly,
 * including its `Array.isArray(value) ? value.length : (value || 0)`
 * fallback for a non-array `value`: kept faithful to the source rather than
 * "fixed" to `typeof value === 'number' ? value : 0`, since every in-scope
 * caller only ever passes an array (or `undefined`) here in practice, and
 * this module's job is decision-parity with real Payload, not improving on
 * it.
 */
const validateArrayLength = (value: unknown, { maxRows, minRows, required }: Pick<ValidateFieldOptions, 'maxRows' | 'minRows' | 'required'>): true | string => {
  const arrayLength = Array.isArray(value) ? value.length : ((value as number) || 0)
  if (!required && arrayLength === 0) return true
  if (typeof minRows === 'number' && arrayLength < minRows) {
    return `This field requires at least ${minRows} row${minRows === 1 ? '' : 's'}.`
  }
  if (typeof maxRows === 'number' && arrayLength > maxRows) {
    return `This field requires no more than ${maxRows} row${maxRows === 1 ? '' : 's'}.`
  }
  if (required && !arrayLength) return 'This field requires at least 1 row.'
  return true
}

/**
 * Mirrors validations.js:6-56's `text` exactly: a not-required field with
 * `null`/`undefined` short-circuits to valid before anything else runs (so
 * `minLength`/`maxLength` never reject a genuinely absent value); `hasMany`
 * validates row count first; then EVERY string in play (the whole array for
 * `hasMany`, or the single value otherwise) is length-checked against the
 * field's own `maxLength`/`minLength` - real Payload also folds in a
 * `payload.config`-wide `defaultMaxTextLength` default here, which this
 * app's `engage.config.ts` never sets (grepped, no matches), so only the
 * field's own `maxLength` is implemented; finally `required` fails on
 * anything falsy, OR a string/array whose `.length` is `0` (so `[]` fails
 * required even though it's truthy).
 */
export const text: ValidatorFn = (value, { hasMany, maxLength, maxRows, minLength, minRows, required }) => {
  if (!required && (value === undefined || value === null)) return true

  if (hasMany === true) {
    const lengthResult = validateArrayLength(value, { maxRows, minRows, required })
    if (typeof lengthResult === 'string') return lengthResult
  }

  const stringsToValidate = Array.isArray(value) ? value : [value]
  for (const stringValue of stringsToValidate) {
    const length = (stringValue as string | undefined)?.length ?? 0
    if (typeof maxLength === 'number' && length > maxLength) {
      return `This value must be shorter than the max length of ${maxLength} characters.`
    }
    if (typeof minLength === 'number' && length < minLength) {
      return `This value must be longer than the minimum length of ${minLength} characters.`
    }
  }

  if (required) {
    if (!value || ((typeof value === 'string' || Array.isArray(value)) && (value as string | unknown[]).length === 0)) {
      return 'This field is required.'
    }
  }
  return true
}

/**
 * Mirrors validations.js:137-159's `textarea` exactly - simpler than `text`:
 * no `hasMany`, no array shape at all, and both length checks are gated by
 * `value &&`, so a falsy value skips length-checking entirely rather than
 * treating an absent value as length `0`. `required && !value` is the only
 * required check (unlike `text`, there is no separate "empty array/string
 * of length 0" case here since `textarea` never holds an array).
 */
export const textarea: ValidatorFn = (value, { maxLength, minLength, required }) => {
  const str = value as string | undefined
  if (str && typeof maxLength === 'number' && str.length > maxLength) {
    return `This value must be shorter than the max length of ${maxLength} characters.`
  }
  if (str && typeof minLength === 'number' && str.length < minLength) {
    return `This value must be longer than the minimum length of ${minLength} characters.`
  }
  if (required && !value) return 'This field is required.'
  return true
}

/**
 * Mirrors validations.js:285-330's `number` exactly. `hasMany` validates row
 * count first. Then the "no value" gate: `!value && !isNumber(value)` -
 * note this is NOT simply "is it falsy", because `0` is falsy but
 * `isNumber(0)` is `true`, so `0` skips this gate and falls through to real
 * numeric validation instead of being treated as "no value"; only a value
 * that is BOTH falsy AND not a number (`""`, `null`, `undefined`, `"abc"`
 * is falsy? no - `"abc"` is truthy, so `!value` is false for it, meaning a
 * non-numeric truthy string like `"abc"` does NOT hit this gate either - it
 * falls through to the `isNumber` check below and fails there instead)
 * reaches this required/pass branch. Otherwise every entry (the array for
 * `hasMany`, or the single value) must be `isNumber`, then gets compared via
 * `parseFloat` against `max` (checked first) then `min` - order matches the
 * source exactly.
 */
export const number: ValidatorFn = (value, { hasMany, max, maxRows, min, minRows, required }) => {
  if (hasMany === true) {
    const lengthResult = validateArrayLength(value, { maxRows, minRows, required })
    if (typeof lengthResult === 'string') return lengthResult
  }

  if (!value && !isNumber(value)) {
    if (required) return 'This field is required.'
    return true
  }

  const numbersToValidate = Array.isArray(value) ? value : [value]
  for (const entry of numbersToValidate) {
    if (!isNumber(entry)) return 'Please enter a valid number.'
    const numberValue = parseFloat(entry as string)
    if (typeof max === 'number' && numberValue > max) return `This value must be less than or equal to ${max}.`
    if (typeof min === 'number' && numberValue < min) return `This value must be greater than or equal to ${min}.`
  }
  return true
}

/**
 * Mirrors validations.js:219-224's `checkbox` exactly: there is no distinct
 * "required" message at all - a missing required checkbox and a non-boolean
 * truthy value both fail with the SAME "must be true or false" message,
 * because the real condition is one boolean expression, not two separate
 * checks: `(value truthy AND not boolean) OR (required AND not boolean)`.
 * `false` always passes (`typeof false === 'boolean'` satisfies both
 * halves), and an unset, non-required checkbox (`value` and `required` both
 * falsy/absent) also passes.
 */
export const checkbox: ValidatorFn = (value, { required }) => {
  if ((value && typeof value !== 'boolean') || (required && typeof value !== 'boolean')) {
    return 'This field can only be equal to true or false.'
  }
  return true
}

/**
 * Mirrors validations.js:89-112's `email` exactly for this app's shape: the
 * `collectionSlug`/`loginWithUsername` branch is omitted because no
 * collection in this app sets `auth.loginWithUsername` (grepped, no
 * matches) - Users, the only `auth: true` collection, uses plain
 * email+password. The regex itself (double-dot rejection via a negative
 * lookahead, no spaces, a `[a-z0-9]`-bounded domain with a >=2-letter TLD)
 * is copied verbatim from the source, not re-derived.
 */
const EMAIL_REGEX =
  /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

export const email: ValidatorFn = (value, { required }) => {
  const str = value as string | undefined
  if ((str && !EMAIL_REGEX.test(str)) || (!str && required)) {
    return 'Please enter a valid email address.'
  }
  return true
}

/**
 * Mirrors validations.js:225-248's `date` exactly, minus the sibling
 * `${name}_tz` timezone-field branch: no field in this app sets
 * `field.timezone: true` (grepped `timezone` under `src/`, only unrelated
 * hits - an IANA-timezone type comment and a UTC-month-grouping comment),
 * so `validTimezone` in the real source is always `true` for this app and
 * that whole branch collapses away. What's left: a valid, parseable date
 * always passes; a truthy-but-unparseable value fails as "not a valid
 * date" (this happens BEFORE the required check, so an invalid non-empty
 * date string fails with the date message even on a non-required field);
 * only a genuinely empty value falls through to the required check. There
 * is no `min`/`max` support at all in real Payload's own `date` validator
 * (confirmed: nothing in the source references `min`/`max` for this field
 * type, matching that no field in this app needs it either).
 */
export const date: ValidatorFn = (value, { required }) => {
  const validDate = Boolean(value) && !Number.isNaN(Date.parse(String(value)))
  if (validDate) return true
  if (value) return 'Not a valid date.'
  if (required) return 'This field is required.'
  return true
}

/**
 * Mirrors validations.js:249-256's `richText` in spirit, not literally: real
 * Payload REQUIRES `options.editor` to be present (it throws if it's
 * missing or unsanitized) because by the time Payload's own field
 * validation runs, every rich text field has already been sanitized with a
 * real `@payloadcms/richtext-lexical` `lexicalEditor()` config. This module
 * stands alone (not yet wired to that sanitization pipeline - a later,
 * separate stage per the removal plan, since Lexical itself is not part of
 * the Payload-core cutover), so it degrades gracefully instead: delegate to
 * `options.editor.validate(value, options)` when an editor is supplied,
 * otherwise fall back to a minimal required-only check against Lexical's
 * own empty-document shape (`{ root: { children: [] } }`) rather than
 * reimplementing any of Lexical's internal per-node validation, which is
 * explicitly out of scope for this stage.
 */
export const richText: ValidatorFn = async (value, options) => {
  const { editor, required } = options
  if (editor && typeof editor.validate === 'function') {
    return editor.validate(value, options)
  }
  const root = (value as { root?: { children?: unknown[] } } | null | undefined)?.root
  const hasContent = Array.isArray(root?.children) && root.children.length > 0
  if (required && !hasContent) return 'This field is required.'
  return true
}

/**
 * Mirrors validations.js:623-663's `select` exactly, including the parts
 * the task brief's summary omitted (verified directly against source, per
 * the module-level instruction not to trust paraphrase alone): real Payload
 * ALSO rejects a value that isn't one of the field's own `options` at all
 * (an "invalid selection" check, unconditional - it runs whether or not
 * `filterOptions` is configured, since `filteredOptions` defaults to plain
 * `options` when there's no `filterOptions` function), for both the
 * `hasMany` array-of-values shape and the single-string shape. This app
 * never configures `filterOptions` on a `select` field (grepped, no
 * matches), so `filteredOptions` here is always just the field's own
 * `options`. Order matches the source: invalid-selection (array) ->
 * duplicate-selection (only when `hasMany` and length > 1) ->
 * invalid-selection (single string) -> required. `options` entries are
 * `{ label, value }` objects for every `select` field in this app
 * (confirmed by grep), but the bare-string shorthand form is implemented
 * too since real Payload accepts both.
 */
const optionMatches = (option: SelectOption, input: unknown): boolean => option === input || (typeof option !== 'string' && option.value === input)

export const select: ValidatorFn = (value, { hasMany, options: fieldOptions = [], required }) => {
  if (Array.isArray(value) && value.some((input) => !fieldOptions.some((option) => optionMatches(option, input)))) {
    return 'This field has an invalid selection.'
  }

  if (hasMany && Array.isArray(value) && value.length > 1) {
    const counts = new Map<unknown, number>()
    for (const item of value) counts.set(item, (counts.get(item) ?? 0) + 1)
    if ([...counts.values()].some((count) => count > 1)) {
      return 'This field has one or more duplicate selections.'
    }
  }

  if (typeof value === 'string' && !fieldOptions.some((option) => optionMatches(option, value))) {
    return 'This field has an invalid selection.'
  }

  if (required && (value === undefined || value === null || (hasMany && Array.isArray(value) && value.length === 0))) {
    return 'This field is required.'
  }

  return true
}

/**
 * Shared by `relationship` and `upload` - real Payload's own two exported
 * validators (validations.js:511-566 and :567-622) are byte-for-byte
 * identical logic (both destructure the same options and run the same
 * steps), differing only in field type, so this app's app-relevant subset
 * is implemented once and exported under both names, same as the source's
 * duplication would collapse to if it were ever refactored.
 *
 * Deliberately NOT implemented: the polymorphic `relationTo: [...]` array
 * branch's ID extraction (this app never configures one - grepped every
 * `relationTo:` field literal under `src/`, always a single string) beyond
 * a pass-through that simply skips such a value rather than crashing; the
 * `filterOptions`/`validateFilterOptions` DB-existence check (confirmed
 * unused by every relationship/upload field in this app via grep - no
 * field configures `filterOptions`); and the admin-UI-only
 * `event === 'onChange'` early return (irrelevant server-side - there is no
 * "still typing" concept in a Local API/REST create-or-update call). What
 * IS implemented: required (fails when the value is falsy-and-not-a-number,
 * or an empty array, AND the field is required), row-count bounds (checked
 * ONLY when the array is non-empty - a `required: false` empty array
 * legitimately skips `minRows` entirely, unlike `array`/`blocks` below,
 * where `minRows` runs whenever the field is `required`), and shape-only ID
 * validation via `isValidID` - no DB existence/permission check, matching
 * that real Payload's own field validator doesn't do one either (that's a
 * separate, later `payload.find`-based step in the real create/update
 * operation, not this validator).
 */
const relationshipOrUpload: ValidatorFn = (value, options) => {
  const { idType = 'number', maxRows, minRows, relationTo, required } = options

  const isEmptyArray = Array.isArray(value) && value.length === 0
  if (((!value && typeof value !== 'number') || isEmptyArray) && required) {
    return 'This field is required.'
  }

  if (Array.isArray(value) && value.length > 0) {
    if (typeof minRows === 'number' && value.length < minRows) {
      return `This field requires at least ${minRows} row${minRows === 1 ? '' : 's'}.`
    }
    if (typeof maxRows === 'number' && value.length > maxRows) {
      return `This field requires no more than ${maxRows} row${maxRows === 1 ? '' : 's'}.`
    }
  }

  if (typeof value !== 'undefined' && value !== null) {
    const values = Array.isArray(value) ? value : [value]
    const invalid = values.filter((val) => {
      // Matches the source's own two-branch assignment: for this app's
      // always-single-string `relationTo`, `requestedID` is only ever set
      // when `val` is truthy or numeric - anything else (including the
      // polymorphic `relationTo: [...]` branch this module doesn't
      // implement) leaves it `undefined`, which then fails `isValidID`
      // below exactly like the source's own unset `let requestedID` would.
      // `requestedID === null` is the one deliberate skip real Payload
      // carves out (only reachable via the polymorphic branch's
      // `val.value` being explicitly `null`), kept here for parity even
      // though this app never exercises it.
      let requestedID: unknown
      if (typeof relationTo === 'string' && (val || typeof val === 'number')) requestedID = val
      if (requestedID === null) return false
      return !isValidID(requestedID, idType)
    })
    if (invalid.length > 0) {
      return `This relationship field has the following invalid relationships: ${invalid.map((val) => JSON.stringify(val)).join(', ')}`
    }
  }

  return true
}

export const relationship: ValidatorFn = relationshipOrUpload
export const upload: ValidatorFn = relationshipOrUpload

/**
 * Mirrors validations.js:331-336's `array` exactly - pure delegation to the
 * shared row-count check, nothing else: no per-row content validation
 * happens here (a real array field's own subfields are validated
 * separately, one level down, by whatever calls into this table per
 * subfield - out of scope for this validator itself, same as real
 * Payload's).
 */
export const array: ValidatorFn = (value, { maxRows, minRows, required }) => validateArrayLength(value, { maxRows, minRows, required })

/**
 * Mirrors validations.js:377-408's `blocks` exactly, minus the
 * `filterOptions`/`validateBlocksFilterOptions` allowed-block-slugs check -
 * confirmed unused by every `blocks` field in this app (grepped
 * `filterOptions` under `src/`, no matches). What's left is the same
 * row-count check `array` uses, applied to the array of block objects
 * themselves (not any block's own subfields, which are out of scope here
 * for the same reason as `array`'s).
 */
export const blocks: ValidatorFn = (value, { maxRows, minRows, required }) => validateArrayLength(value, { maxRows, minRows, required })

/**
 * Mirrors validations.js:166-217's `json` exactly, minus the Ajv
 * `jsonSchema` branch - confirmed unused by every `json` field in this app
 * (grepped `jsonSchema` under `src/`, no matches). `jsonError` is a
 * pass-through flag the CALLER sets after already attempting
 * `JSON.parse` on a string value and having it throw (real Payload wires
 * this from a field-level `beforeValidate` hook, not from inside this
 * validator - this validator never parses JSON itself, in either
 * implementation).
 */
export const json: ValidatorFn = (value, { jsonError, required }) => {
  if (required && !value) return 'This field is required.'
  if (jsonError !== undefined) return 'This field has invalid input.'
  return true
}

/**
 * Lookup table mirroring real Payload's own exported `validations` object
 * (validations.js, final block) trimmed to this app's 13 in-scope field
 * types (see this module's top doc comment for the full "why only these"
 * reasoning and the deliberately-excluded types).
 */
export const fieldValidators: Record<string, ValidatorFn> = {
  text,
  textarea,
  number,
  checkbox,
  email,
  date,
  select,
  relationship,
  upload,
  array,
  blocks,
  json,
  richText,
}

/** Looks up a field type's validator, or `undefined` for a type this table doesn't cover (see this module's top doc comment for what's out of scope and why). */
export function getDefaultValidator(fieldType: string): ValidatorFn | undefined {
  return fieldValidators[fieldType]
}
