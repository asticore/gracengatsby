/**
 * API builder: the pure rules for custom endpoints. No database, no request
 * object, no engine, so every rule is unit-testable on its own.
 *
 * A custom endpoint is served at `/api/x/<version>/<name>` (list and create) and
 * `/api/x/<version>/<name>/<id>` (read one and update). It reads or writes one
 * collection and exposes only the fields an admin ticked. Authorisation is NOT
 * here: the runtime (./runtime.ts) authenticates with the existing API key system
 * (src/features/apiKeys) and checks the key's scopes, the endpoint's own key list
 * and role rules, and the rate limit. This file only decides what a definition
 * may contain and what a request may ask for.
 */

export const ENDPOINT_BASE = 'x'
export const ENDPOINT_VERSION_PATTERN = /^v[1-9][0-9]{0,2}$/
export const ENDPOINT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/
export const MAX_ENDPOINTS = 200
export const MAX_EXPOSED_FIELDS = 200
export const MAX_FILTERS = 30
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 20
export const MAX_RATE_PER_MINUTE = 600
export const DEFAULT_RATE_PER_MINUTE = 60
export const MAX_ALLOWED_KEYS = 100

/** Words a custom endpoint name or version may never be, on top of every collection and global slug. */
export const RESERVED_ENDPOINT_WORDS: ReadonlySet<string> = new Set([
  'x',
  'api',
  'admin',
  'login',
  'logout',
  'me',
  'docs',
  'openapi',
  'graphql',
  'globals',
  'access',
  'password',
  'passwords',
  'sessions',
  'session',
  'api-keys',
  'api_keys',
  'users',
  'unlock',
  'refresh-token',
  'forgot-password',
  'reset-password',
  'two-factor',
  '2fa',
  'passkeys',
  'passkey',
  'social',
  'payments',
  'secrets',
  'secret',
  'health',
  'robots',
  'sitemap',
  'webhooks',
  'webhook',
  'endpoints',
])

export const FILTER_OPERATORS = ['eq', 'contains', 'gt', 'gte', 'lt', 'lte'] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export const REQUIRED_ROLES = ['any', 'staff', 'editor', 'admin'] as const
export type RequiredRole = (typeof REQUIRED_ROLES)[number]

export const RESPONSE_FORMATS = ['envelope', 'array'] as const
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number]

export type EndpointFilter = { field: string; operators: FilterOperator[] }

export type ApiEndpointConfig = {
  /** Human name shown in the builder and the developer guide. */
  name: string
  description: string
  /** Version segment, for example `v1`. */
  version: string
  /** Name segment, for example `products-lite`. */
  slug: string
  /** Collection slug the endpoint reads and writes. */
  collection: string
  /** Built-in or custom-field keys the endpoint exposes. Ids are always returned. */
  fields: string[]
  filters: EndpointFilter[]
  sortable: string[]
  /** Default sort, `-field` for descending. Null means the collection's own order. */
  defaultSort: string | null
  defaultLimit: number
  maxLimit: number
  /** Create (POST) and update (PATCH) are opt-in. Reads are always on. Delete is never offered. */
  allowCreate: boolean
  allowUpdate: boolean
  /** The role the key's owner must hold. */
  requiredRole: RequiredRole
  /** Keys (by id) allowed to call the endpoint. Null means any valid key whose scopes allow it. */
  allowedKeyIds: number[] | null
  rateLimitPerMinute: number
  enabled: boolean
  responseFormat: ResponseFormat
}

export type ApiEndpoint = ApiEndpointConfig & {
  id: number
  createdAt: string
  updatedAt: string
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Field names that are never exposed, never filtered, never sorted and never written by an endpoint.
 * Same family as the API key write guard (src/features/apiKeys/core.ts), plus private `_` fields.
 */
const SECRET_LIKE_FIELD = /password|secret|salt|hash|token|two.?factor|api.?key|passkey|session/i

export const isSecretLikeField = (name: string): boolean => name.startsWith('_') || SECRET_LIKE_FIELD.test(name)

/** Collections no endpoint may point at, whatever their role. Mirrors the API key deny list. */
const DENIED_COLLECTIONS = new Set(['users', 'api-keys', 'api_keys', 'globals'])

export const isEndpointCollectionAllowed = (slug: string): boolean => !DENIED_COLLECTIONS.has(slug) && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)

/**
 * Checks a version and name pair. `reserved` is every collection and global slug in the
 * app, passed in by the caller so this file does not import the registry.
 */
export function validateEndpointPath(version: unknown, slug: unknown, reserved: ReadonlySet<string> = new Set()): ValidationResult<{ version: string; slug: string }> {
  if (typeof version !== 'string' || !ENDPOINT_VERSION_PATTERN.test(version)) {
    return { ok: false, error: 'The version must look like v1 or v2.' }
  }
  if (typeof slug !== 'string' || !ENDPOINT_NAME_PATTERN.test(slug) || slug.includes('--')) {
    return { ok: false, error: 'The path can use lower-case letters, numbers and single hyphens, up to 48 characters.' }
  }
  const cleanSlug = slug
  const cleanVersion = version
  if (RESERVED_ENDPOINT_WORDS.has(cleanSlug) || reserved.has(cleanSlug)) {
    return { ok: false, error: `"${cleanSlug}" is a reserved word. Choose another path.` }
  }
  return { ok: true, value: { version: cleanVersion, slug: cleanSlug } }
}

/** The public path of an endpoint, without the host: `/api/x/v1/products-lite`. */
export const endpointPath = (version: string, slug: string): string => `/api/${ENDPOINT_BASE}/${version}/${slug}`

const FILTER_KEY = /^([a-z0-9_]{1,64})(?:\.(eq|contains|gt|gte|lt|lte))?$/

/** One query parameter name, split into a field and an operator. `status` means `status.eq`. */
export function parseFilterKey(key: string): { field: string; operator: FilterOperator } | null {
  const match = FILTER_KEY.exec(key)
  if (!match) return null
  return { field: match[1], operator: (match[2] as FilterOperator | undefined) ?? 'eq' }
}

const SORT_KEY = /^-?([a-z0-9_]{1,64})$/

export function validateEndpoint(input: unknown, context: { exposable: ReadonlySet<string>; collectionFields: ReadonlySet<string>; reserved?: ReadonlySet<string>; keyIds?: ReadonlySet<number> }): ValidationResult<ApiEndpointConfig> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'The endpoint is missing its details.' }
  const raw = input as Record<string, unknown>
  const str = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null)

  const name = str(raw.name, 80)
  if (!name) return { ok: false, error: 'Give the endpoint a name of 80 characters or fewer.' }
  const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : ''

  const path = validateEndpointPath(raw.version, raw.slug, context.reserved)
  if (path.ok === false) return { ok: false, error: path.error }

  if (typeof raw.collection !== 'string' || !isEndpointCollectionAllowed(raw.collection)) {
    return { ok: false, error: 'Choose a collection this API may read.' }
  }
  const collection = raw.collection

  if (!Array.isArray(raw.fields) || raw.fields.length === 0) return { ok: false, error: 'Expose at least one field.' }
  if (raw.fields.length > MAX_EXPOSED_FIELDS) return { ok: false, error: `An endpoint can expose at most ${MAX_EXPOSED_FIELDS} fields.` }
  const fields: string[] = []
  for (const item of raw.fields) {
    if (typeof item !== 'string' || !context.exposable.has(item) || isSecretLikeField(item)) {
      return { ok: false, error: `The field "${String(item)}" cannot be exposed.` }
    }
    if (!fields.includes(item)) fields.push(item)
  }

  const filters: EndpointFilter[] = []
  const rawFilters = Array.isArray(raw.filters) ? raw.filters : []
  if (rawFilters.length > MAX_FILTERS) return { ok: false, error: `An endpoint can have at most ${MAX_FILTERS} filters.` }
  for (const item of rawFilters) {
    const f = (item ?? {}) as Record<string, unknown>
    if (typeof f.field !== 'string' || !fields.includes(f.field)) return { ok: false, error: 'A filter must use one of the exposed fields.' }
    const operators = (Array.isArray(f.operators) ? f.operators : []).filter((op): op is FilterOperator => (FILTER_OPERATORS as readonly string[]).includes(op as string))
    if (operators.length === 0) return { ok: false, error: `Choose at least one filter operator for ${f.field}.` }
    filters.push({ field: f.field, operators: [...new Set(operators)] })
  }

  const sortable: string[] = []
  for (const item of Array.isArray(raw.sortable) ? raw.sortable : []) {
    if (typeof item !== 'string' || !fields.includes(item)) return { ok: false, error: 'Sortable fields must be exposed fields.' }
    if (!sortable.includes(item)) sortable.push(item)
  }
  let defaultSort: string | null = null
  if (typeof raw.defaultSort === 'string' && raw.defaultSort !== '') {
    const m = SORT_KEY.exec(raw.defaultSort)
    if (!m || !sortable.includes(m[1])) return { ok: false, error: 'The default sort must be a sortable field.' }
    defaultSort = raw.defaultSort
  }

  const defaultLimit = intIn(raw.defaultLimit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  const maxLimit = intIn(raw.maxLimit, MAX_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  if (defaultLimit === null || maxLimit === null || defaultLimit > maxLimit) {
    return { ok: false, error: `Page sizes must be between 1 and ${MAX_PAGE_SIZE}, and the default cannot exceed the maximum.` }
  }

  const requiredRole = (REQUIRED_ROLES as readonly string[]).includes(raw.requiredRole as string) ? (raw.requiredRole as RequiredRole) : 'staff'

  let allowedKeyIds: number[] | null = null
  if (raw.allowedKeyIds !== null && raw.allowedKeyIds !== undefined) {
    if (!Array.isArray(raw.allowedKeyIds)) return { ok: false, error: 'Choose which keys may call this endpoint.' }
    if (raw.allowedKeyIds.length > MAX_ALLOWED_KEYS) return { ok: false, error: `At most ${MAX_ALLOWED_KEYS} keys can be listed.` }
    allowedKeyIds = []
    for (const item of raw.allowedKeyIds) {
      const id = Number(item)
      if (!Number.isInteger(id) || id < 1) return { ok: false, error: 'Choose which keys may call this endpoint.' }
      if (context.keyIds && !context.keyIds.has(id)) return { ok: false, error: `Key ${id} does not exist.` }
      if (!allowedKeyIds.includes(id)) allowedKeyIds.push(id)
    }
  }

  const rateLimitPerMinute = intIn(raw.rateLimitPerMinute, DEFAULT_RATE_PER_MINUTE, 1, MAX_RATE_PER_MINUTE)
  if (rateLimitPerMinute === null) return { ok: false, error: `The rate limit must be between 1 and ${MAX_RATE_PER_MINUTE} requests a minute.` }

  const responseFormat = (RESPONSE_FORMATS as readonly string[]).includes(raw.responseFormat as string) ? (raw.responseFormat as ResponseFormat) : 'envelope'

  return {
    ok: true,
    value: {
      name,
      description,
      version: path.value.version,
      slug: path.value.slug,
      collection,
      fields,
      filters,
      sortable,
      defaultSort,
      defaultLimit,
      maxLimit,
      allowCreate: raw.allowCreate === true,
      allowUpdate: raw.allowUpdate === true,
      requiredRole,
      allowedKeyIds,
      rateLimitPerMinute,
      enabled: raw.enabled !== false,
      responseFormat,
    },
  }
}

function intIn(value: unknown, fallback: number, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

/** Keeps only the exposed, non-secret keys of a document. The id is always kept. */
export function projectDocument(doc: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { id: doc.id }
  for (const field of fields) {
    if (isSecretLikeField(field)) continue
    if (Object.prototype.hasOwnProperty.call(doc, field)) out[field] = doc[field]
  }
  return out
}

/** The first body key an endpoint may not write, or null. Writes are limited to exposed, non-secret fields. */
export function firstUnwritableKey(body: Record<string, unknown>, fields: readonly string[]): string | null {
  for (const key of Object.keys(body)) {
    if (!fields.includes(key) || isSecretLikeField(key)) return key
  }
  return null
}

export type ParsedQuery = {
  where: Record<string, Record<string, unknown>>
  sort: string | undefined
  limit: number
  page: number
}

/**
 * Reads a request's query string against an endpoint. Unknown parameters are an error, so a
 * typo cannot silently return everything. `limit` is clamped to the endpoint's maximum.
 */
export function parseEndpointQuery(endpoint: Pick<ApiEndpointConfig, 'fields' | 'filters' | 'sortable' | 'defaultSort' | 'defaultLimit' | 'maxLimit'>, params: URLSearchParams): ValidationResult<ParsedQuery> {
  const where: Record<string, Record<string, unknown>> = {}
  let sort: string | undefined = endpoint.defaultSort ?? undefined
  let limit = endpoint.defaultLimit
  let page = 1
  for (const [key, value] of params.entries()) {
    if (key === 'limit') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'limit must be a whole number of 1 or more.' }
      limit = Math.min(n, endpoint.maxLimit)
      continue
    }
    if (key === 'page') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'page must be a whole number of 1 or more.' }
      page = n
      continue
    }
    if (key === 'sort') {
      const m = SORT_KEY.exec(value)
      if (!m || !endpoint.sortable.includes(m[1])) return { ok: false, error: `You cannot sort by "${value}".` }
      sort = value
      continue
    }
    const parsed = parseFilterKey(key)
    if (!parsed) return { ok: false, error: `Unknown parameter "${key}".` }
    const filter = endpoint.filters.find((f) => f.field === parsed.field)
    if (!filter || !filter.operators.includes(parsed.operator)) return { ok: false, error: `You cannot filter by "${key}".` }
    where[parsed.field] = { ...(where[parsed.field] ?? {}), [ENGINE_OPERATOR[parsed.operator]]: value }
  }
  return { ok: true, value: { where, sort, limit, page } }
}

/** Maps a filter operator to the engine's where-clause operator name. */
export const ENGINE_OPERATOR: Record<FilterOperator, string> = {
  eq: 'equals',
  contains: 'contains',
  gt: 'greater_than',
  gte: 'greater_than_equal',
  lt: 'less_than',
  lte: 'less_than_equal',
}

/** The pieces of an endpoint definition that a developer guide, OpenAPI file and Postman collection all need. */
export function endpointParamNames(endpoint: Pick<ApiEndpointConfig, 'filters' | 'sortable'>): Array<{ name: string; description: string }> {
  const out: Array<{ name: string; description: string }> = []
  for (const f of endpoint.filters) {
    for (const op of f.operators) {
      out.push({ name: op === 'eq' ? f.field : `${f.field}.${op}`, description: `Filter ${f.field} (${op}).` })
    }
  }
  if (endpoint.sortable.length) out.push({ name: 'sort', description: `Sort by one of: ${endpoint.sortable.join(', ')}. Prefix with - for descending.` })
  out.push({ name: 'limit', description: 'Page size.' }, { name: 'page', description: 'Page number, from 1.' })
  return out
}
