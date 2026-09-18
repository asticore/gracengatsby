/**
 * REST + GraphQL API removal (Stage 7) - a hand-rolled bracket-notation
 * query-string parser for this app's future from-scratch REST handlers,
 * matching real Payload's own query wire format WITHOUT depending on the
 * `qs`/`qs-esm` package real Payload uses internally.
 *
 * ---------------------------------------------------------------------------
 * Why hand-rolled instead of a dependency
 * ---------------------------------------------------------------------------
 * Real Payload parses REST query strings with the `qs-esm` package
 * (`node_modules/payload/dist/utilities/parseParams.js` calls
 * `qs.parse(search, { allowEmptyArrays: true, arrayLimit: 1000, depth: 10,
 * ignoreQueryPrefix: true })`). `qs-esm` is only a TRANSITIVE dependency of
 * this app today (pulled in by `payload` itself) - it is not in this app's
 * own `package.json`, and would vanish the moment `payload` is finally
 * uninstalled. Every prior `localapi/` stage has held the line of "reproduce
 * the real behavior with Node/web-platform built-ins, add zero new runtime
 * dependencies" (see `auth.ts`'s own "Zero-new-dependency JWT" section for
 * the same reasoning applied to `jose`) - this module is that same policy
 * applied to query parsing.
 *
 * ---------------------------------------------------------------------------
 * What this module reproduces, and what it deliberately narrows
 * ---------------------------------------------------------------------------
 * Real Payload's `parseParams` (full file read) extracts, from a parsed
 * query object: boolean params (`autosave`, `draft`, `trash`, `overrideLock`,
 * `pagination`, `flattenLocales`), number params (`depth`, `limit`, `page`),
 * and structured params via dedicated sub-parsers (`populate`, `select`,
 * `joins`, `sort`, `where`, plus a JSON `data` body param for multipart
 * requests). This module implements exactly the subset the Stage 7 hybrid
 * dispatcher's "in scope now" REST handlers actually need (see
 * payload-removal-plan.md's "REST + GraphQL API removal (Stage 7)" section):
 * `where`, `sort`, `limit`, `page`, `depth`, `pagination`, `draft`. It does
 * NOT implement `populate`/`select`/`joins`/`autosave`/`trash`/
 * `overrideLock`/`flattenLocales` - none of those are needed by the core
 * CRUD + core auth surface this stage builds first, and each is left for
 * whichever later sub-stage needs it, same as this whole project's
 * established "document the gap, don't invent it away" convention.
 *
 * `qs-esm`'s own parse options matter for what this module does NOT need to
 * worry about replicating: `arrayLimit: 1000`/`depth: 10` are qs's own
 * recursion/size guards against pathological input, not behavior any real
 * call site in this app depends on: `ignoreQueryPrefix` just means a
 * caller MAY hand `?a=1` instead of `a=1` - `URLSearchParams` already
 * strips a leading `?` when constructed from a full query string, so this
 * module never sees one; `allowEmptyArrays` lets `where[or][]=` parse to an
 * empty array rather than being dropped - reproduced below by treating an
 * empty bracket segment as an explicit array marker.
 *
 * ---------------------------------------------------------------------------
 * Bracket-notation grammar this module parses
 * ---------------------------------------------------------------------------
 * `where[field][operator]=value` - a leaf condition on `field`.
 * `where[and][0][field][operator]=value` / `where[or][0][...]` - boolean
 * composition, matching real Payload's own `Where` shape
 * (`./access.ts`'s own `Where` type, re-declared there for the same
 * zero-dependency reason). Array indices in the path (`[0]`, `[1]`, ...)
 * are what distinguish an `and`/`or` branch from a field name at that
 * position - this module treats any all-digit bracket segment as an array
 * index and any other bracket segment as an object key, exactly like `qs`'s
 * own default (non-`indices: false`) behavior.
 * `sort=field` (ascending) / `sort=-field` (descending) / `sort=a,-b`
 * (comma-joined multi-field, matching real Payload's own REST client
 * serialization of a `Sort` array).
 * `limit=20` / `page=2` / `depth=1` - plain integers.
 * `pagination=false` / `draft=true` - plain booleans (`"false"` is the only
 * string this module treats as `false`; anything else present is `true`,
 * matching real Payload's own boolean-param coercion in `parseParams.js`,
 * which does exactly `value === 'false' ? false : Boolean(value)`).
 *
 * ---------------------------------------------------------------------------
 * Value coercion inside `where`
 * ---------------------------------------------------------------------------
 * A query string only ever carries strings. Real Payload's own downstream
 * field-type-aware coercion happens deep inside its ORM sanitizer layer -
 * this app has no equivalent yet (see `./read-operations.ts`'s own `where`
 * handling and `src/cms/db/where.ts`'s `buildWhere`, which both already
 * expect a `Where` whose leaf VALUES are already the right JS type: a real
 * number for a numeric comparison, a real boolean for `exists`, a real array
 * for `in`/`not_in`). `coerceWhereValue` below does the minimal, honest
 * version of that: `exists` becomes a boolean; `in`/`not_in`/`all` become an
 * array (splitting a single comma-joined string, matching real Payload's own
 * REST client convention of sending `where[field][in]=1,2,3` rather than
 * indexed brackets for these three operators - though indexed brackets are
 * accepted too, since the generic bracket parser already produces an array
 * for them); everything else is passed through `coerceScalar`, which returns
 * a real `number` for a value that parses as one, a real `boolean` for the
 * literal strings `"true"`/`"false"`, and the original string otherwise.
 * This is a best-effort, field-type-BLIND coercion (it cannot know a field
 * named `slug` should stay a string even if a document happened to be
 * titled `"123"`) - a real, documented limitation, not a bug: real Payload
 * avoids this exact ambiguity by validating against the actual field type
 * from the collection config, which this module deliberately does not have
 * access to (query parsing is a request-shape concern, not a schema one, in
 * this module's own layering).
 */

import type { Where } from './access'
import type { Sort } from './read-operations'

export type ParsedQuery = {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  depth?: number
  pagination?: boolean
  draft?: boolean
}

/** Tokenizes one query-string key into its bracket-notation path segments: `"where[or][0][field][equals]"` -> `["where", "or", "0", "field", "equals"]`. A key with no brackets at all (`"limit"`) tokenizes to a single-element path. Malformed bracket syntax (an unclosed `[`) is treated as literal text in the base segment rather than throwing - a REST endpoint should never 500 on a client's malformed query string. */
function tokenizeKey(key: string): string[] {
  const bracketRe = /\[([^[\]]*)\]/g
  const firstBracket = key.indexOf('[')
  if (firstBracket === -1) return [key]

  const base = key.slice(0, firstBracket)
  const rest = key.slice(firstBracket)
  const segments = [base]
  let match: RegExpExecArray | null
  bracketRe.lastIndex = 0
  while ((match = bracketRe.exec(rest))) {
    segments.push(match[1])
  }
  return segments
}

/** A segment made entirely of digits (and non-empty) is an array index in `qs`'s own bracket grammar - `"0"`/`"12"` yes, `""`/`"or"`/`"01a"` no. */
function isArrayIndexSegment(segment: string): boolean {
  return segment.length > 0 && /^\d+$/.test(segment)
}

/** Assigns `value` into `target` at the path described by `segments`, building nested plain objects (or, per `isArrayIndexSegment`, arrays) along the way as needed. Mirrors `qs`'s own default bracket-nesting behavior closely enough for this module's real use (this app's own `where`/`sort` shapes never nest deeper than `and`/`or` -> array index -> field -> operator, four levels). */
function assignPath(target: Record<string, unknown>, segments: string[], value: string): void {
  let cursor: Record<string, unknown> | unknown[] = target

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const isLast = i === segments.length - 1

    if (isLast) {
      if (Array.isArray(cursor)) {
        cursor[Number(segment)] = value
      } else {
        cursor[segment] = value
      }
      return
    }

    const nextSegment = segments[i + 1]
    const nextIsArray = isArrayIndexSegment(nextSegment)
    const key: string | number = Array.isArray(cursor) ? Number(segment) : segment

    let existing = (cursor as Record<string | number, unknown>)[key]
    if (existing === undefined || typeof existing !== 'object' || existing === null) {
      existing = nextIsArray ? [] : {}
      ;(cursor as Record<string | number, unknown>)[key] = existing
    }
    cursor = existing as Record<string, unknown> | unknown[]
  }
}

/** Parses every key in `searchParams` via bracket notation (see the file header's grammar) into one nested plain-object tree, e.g. `{ where: { title: { equals: 'x' } }, sort: '-createdAt', limit: '10' }` - leaf values are still raw strings at this point; `parseSearchParams` below picks out and coerces the specific top-level keys this module supports. */
function parseBracketParams(searchParams: URLSearchParams): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [rawKey, value] of searchParams.entries()) {
    const segments = tokenizeKey(rawKey)
    assignPath(root, segments, value)
  }
  return root
}

/** A value that round-trips through `Number(...)` as a finite number (and is non-empty) is treated as numeric - matching real Payload's own `parseParams.js` number-param handling (`Number.isNaN(Number(value)) ? undefined : Number(value)`, applied there only to `depth`/`limit`/`page`; applied here more broadly to any `where` leaf value, per the file header's "Value coercion" section). The literal strings `"true"`/`"false"` become real booleans. Anything else stays a string. */
function coerceScalar(value: string): string | number | boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value !== '' && Number.isFinite(Number(value))) return Number(value)
  return value
}

const ARRAY_VALUE_OPERATORS = new Set(['in', 'not_in', 'all'])

/** Coerces one operator's raw value (still strings/arrays-of-strings from `parseBracketParams`) into the type `./access.ts`'s `Where`/`src/cms/db/where.ts`'s `buildWhere` actually expect - see the file header's "Value coercion inside `where`" section for the exact rules and their limits. */
function coerceOperatorValue(operator: string, rawValue: unknown): unknown {
  if (operator === 'exists') {
    return rawValue === 'false' ? false : Boolean(rawValue)
  }
  if (ARRAY_VALUE_OPERATORS.has(operator)) {
    const items = Array.isArray(rawValue) ? rawValue : typeof rawValue === 'string' ? rawValue.split(',') : [rawValue]
    return items.map((item) => (typeof item === 'string' ? coerceScalar(item) : item))
  }
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => (typeof item === 'string' ? coerceScalar(item) : item))
  }
  return typeof rawValue === 'string' ? coerceScalar(rawValue) : rawValue
}

/** Walks a raw, string-leaved bracket-parsed object into a real `Where`, applying `coerceOperatorValue` at every leaf. Reserved keys `and`/`or` recurse into each array element as a nested `Where`; every other key is a field name whose value is an operator object (`{ [operator]: rawValue }`). Malformed shapes (a field mapped to something other than an object, an `and`/`or` value that isn't an array) are skipped rather than thrown on - same "never 500 on a malformed query string" reasoning as `tokenizeKey`. */
function coerceWhere(raw: unknown): Where | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const result: Where = {}
  let sawAnyKey = false

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(value)) continue
      const nested = value.map((entry) => coerceWhere(entry)).filter((entry): entry is Where => entry !== undefined)
      if (nested.length > 0) {
        result[key] = nested
        sawAnyKey = true
      }
      continue
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const operatorEntry: Record<string, unknown> = {}
    for (const [operator, rawValue] of Object.entries(value as Record<string, unknown>)) {
      operatorEntry[operator] = coerceOperatorValue(operator, rawValue)
    }
    if (Object.keys(operatorEntry).length > 0) {
      result[key] = operatorEntry
      sawAnyKey = true
    }
  }

  return sawAnyKey ? result : undefined
}

/** Real Payload's REST client (and every hand-typed URL this app's own 4 known REST fetch call sites build) sends multi-field sort as a single comma-joined string (`sort=-createdAt,title`), matching real Payload's own `Sort` type (`string | string[]`) collapsed to its wire form. A single field with no comma stays a plain string (matching `find`/`count`'s own `Sort` param, which accepts either shape - see `./read-operations.ts`). */
function coerceSort(raw: unknown): Sort | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  return raw.includes(',') ? raw.split(',') : raw
}

function coerceInteger(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function coerceBoolean(raw: unknown): boolean | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  return raw !== 'false'
}

/**
 * The one function this module exports for real use: parses a request's
 * query string into the subset of Payload's REST query params this stage's
 * REST handlers understand (see the file header for the full list and what
 * is deliberately out of scope). Takes a `URLSearchParams` directly (not a
 * raw string) so a real Next.js route handler can hand it
 * `request.nextUrl.searchParams` / `new URL(request.url).searchParams`
 * without this module needing to know anything about the web-platform
 * request type it came from.
 */
export function parseSearchParams(searchParams: URLSearchParams): ParsedQuery {
  const root = parseBracketParams(searchParams)

  const result: ParsedQuery = {}
  const where = coerceWhere(root.where)
  if (where) result.where = where
  const sort = coerceSort(root.sort)
  if (sort !== undefined) result.sort = sort
  const limit = coerceInteger(root.limit)
  if (limit !== undefined) result.limit = limit
  const page = coerceInteger(root.page)
  if (page !== undefined) result.page = page
  const depth = coerceInteger(root.depth)
  if (depth !== undefined) result.depth = depth
  const pagination = coerceBoolean(root.pagination)
  if (pagination !== undefined) result.pagination = pagination
  const draft = coerceBoolean(root.draft)
  if (draft !== undefined) result.draft = draft

  return result
}
