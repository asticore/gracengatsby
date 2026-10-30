import { forbiddenFieldIn, presentedApiKey, scopesAllow, ApiKeyRefused, type ApiKeyContext, type ApiKeyScope } from '@/features/apiKeys'
import { isStaffRoles } from '@/features/apiKeys/core'
import { hitShared } from '@/features/security/rateLimit'
import { CALL_LOG_RETENTION_MS, createD1EndpointStore, type EndpointStore } from './store'
import { isGuideFormat, renderGuide, sameToken, siteNameFor } from './guideResponse'
import {
  ENDPOINT_BASE,
  firstUnwritableKey,
  parseEndpointQuery,
  projectDocument,
  type ApiEndpoint,
  type RequiredRole,
} from './core'

/**
 * Serves the custom endpoints under /api/x/<version>/<name>. Authentication is the
 * existing API key system: `engine.auth({ apiKeys: true })` reads the key, checks it is
 * live and not expired, and reads the owner's live roles. This module then applies the
 * endpoint's own rules on top of the key's scopes: the key list, the owner's role, the
 * method switches, the field whitelist and the rate limit. Nothing here is a second auth.
 *
 * Returns null for any path that is not under `x`, so the normal REST dispatch carries on.
 */

export type EndpointEngine = {
  findGlobal?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  auth: (args: { headers: Headers; apiKeys?: boolean }) => Promise<{ user: unknown; apiKey?: ApiKeyContext }>
  find: (args: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[]; totalDocs?: number; hasNextPage?: boolean; page?: number; totalPages?: number }>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

export type EndpointRuntimeDeps = {
  engine: EndpointEngine
  store: EndpointStore
  now: () => number
  /** Counts one request for this key on this endpoint. Returns whether it is over the limit. */
  rateLimit: (key: string, perMinute: number) => Promise<{ limited: boolean; retryAfterSeconds: number }>
  /** Whether to run the occasional log prune. Tests pass false. */
  prune?: boolean
}

export type EndpointDecision = { ok: true } | { ok: false; status: 401 | 403 | 405; name: string; message: string }

const ROLE_RULES: Record<RequiredRole, (roles: readonly string[]) => boolean> = {
  any: () => true,
  staff: (roles) => isStaffRoles(roles),
  editor: (roles) => roles.includes('admin') || roles.includes('editor'),
  admin: (roles) => roles.includes('admin'),
}

/**
 * Pure: may this key, held by this owner, make this request to this endpoint? Checked in order:
 * enabled, method switch, key list, owner role, key scope for the collection.
 */
export function decideEndpointAccess(input: {
  endpoint: Pick<ApiEndpoint, 'enabled' | 'collection' | 'allowCreate' | 'allowUpdate' | 'allowedKeyIds' | 'requiredRole'>
  method: string
  keyId: number
  keyScopes: readonly ApiKeyScope[]
  roles: readonly string[]
}): EndpointDecision {
  const { endpoint, method, keyId } = input
  const verb = method.toUpperCase()
  const deny = (status: 403 | 405, name: string, message: string): EndpointDecision => ({ ok: false, status, name, message })
  if (!endpoint.enabled) return deny(403, 'Forbidden', 'This endpoint is turned off.')
  let action: 'read' | 'write'
  if (verb === 'GET' || verb === 'HEAD') action = 'read'
  else if (verb === 'POST') {
    if (!endpoint.allowCreate) return deny(405, 'MethodNotAllowed', 'This endpoint does not accept POST.')
    action = 'write'
  } else if (verb === 'PATCH') {
    if (!endpoint.allowUpdate) return deny(405, 'MethodNotAllowed', 'This endpoint does not accept PATCH.')
    action = 'write'
  } else {
    return deny(405, 'MethodNotAllowed', 'This endpoint does not accept that method. Deletion is not offered.')
  }
  if (endpoint.allowedKeyIds && !endpoint.allowedKeyIds.includes(keyId)) {
    return deny(403, 'Forbidden', 'This API key is not allowed to call this endpoint.')
  }
  if (!ROLE_RULES[endpoint.requiredRole](input.roles)) {
    return deny(403, 'Forbidden', 'The account that owns this key does not have the role this endpoint needs.')
  }
  if (!scopesAllow(input.keyScopes, endpoint.collection, action)) {
    return deny(403, 'Forbidden', `This API key does not have the ${endpoint.collection}:${action === 'read' ? 'read' : 'write'} scope.`)
  }
  return { ok: true }
}

const json = (body: unknown, status: number, headers?: Record<string, string>): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

const refusal = (status: number, name: string, message: string, headers?: Record<string, string>): Response =>
  json({ errors: [{ name, message }] }, status, headers)

/**
 * Parses the path after `/api/`. `x/v1/name` or `x/v1/name/42`. Null when the shape is wrong.
 */
export function parseEndpointRoute(slug: readonly string[]): { version: string; name: string; id: number | null } | null {
  if (slug[0] !== ENDPOINT_BASE) return null
  if (slug.length !== 3 && slug.length !== 4) return null
  let id: number | null = null
  if (slug.length === 4) {
    const n = Number(slug[3])
    if (!Number.isInteger(n) || n < 1) return null
    id = n
  }
  return { version: slug[1], name: slug[2], id }
}

export async function serveCustomEndpoint(request: Request, slug: readonly string[], deps: EndpointRuntimeDeps): Promise<Response | null> {
  const route = parseEndpointRoute(slug)
  if (!route) return slug[0] === ENDPOINT_BASE ? refusal(404, 'NotFound', 'Route not found.') : null

  const endpoint = await deps.store.findByPath(route.version, route.name)
  if (!endpoint || !endpoint.enabled) return refusal(404, 'NotFound', 'Route not found.')

  const method = request.method.toUpperCase()
  const started = deps.now()
  const finish = async (response: Response, keyId: number | null, userId: number | null): Promise<Response> => {
    const createdAt = new Date(started).toISOString()
    await deps.store.logCall({ endpointId: endpoint.id, keyId, userId, method, status: response.status, createdAt }).catch((): void => undefined)
    if (deps.prune !== false && Math.random() < 0.02) {
      await deps.store.pruneLog(new Date(started - CALL_LOG_RETENTION_MS).toISOString()).catch((): void => undefined)
    }
    return response
  }

  if (!['GET', 'HEAD', 'POST', 'PATCH'].includes(method)) return finish(refusal(405, 'MethodNotAllowed', 'This endpoint does not accept that method.'), null, null)
  if (!presentedApiKey(request.headers)) return finish(refusal(401, 'ApiKeyRefused', 'Send an API key in the Authorization header as Bearer egk_....'), null, null)

  let user: unknown
  let key: ApiKeyContext | undefined
  try {
    ;({ user, apiKey: key } = await deps.engine.auth({ headers: request.headers, apiKeys: true }))
  } catch (err) {
    if (err instanceof ApiKeyRefused) return finish(refusal(err.status, 'ApiKeyRefused', err.message), null, null)
    return finish(refusal(500, 'Error', 'Something went wrong.'), null, null)
  }
  if (!key) return finish(refusal(401, 'ApiKeyRefused', 'API key is not valid.'), null, null)
  const owner = user as { id?: number; roles?: string[] } | null
  const roles = owner?.roles ?? []
  const userId = typeof owner?.id === 'number' ? owner.id : key.userId

  const decision = decideEndpointAccess({ endpoint, method, keyId: key.id, keyScopes: key.scopes, roles })
  if (decision.ok === false) return finish(refusal(decision.status, decision.name, decision.message), key.id, userId)

  const limit = await deps.rateLimit(`api-endpoint:${endpoint.id}:${key.id}`, endpoint.rateLimitPerMinute)
  if (limit.limited) {
    return finish(refusal(429, 'RateLimited', 'Too many requests for this endpoint. Try again in a moment.', { 'Retry-After': String(limit.retryAfterSeconds) }), key.id, userId)
  }

  const collection = endpoint.collection
  const access = { user, overrideAccess: false, depth: 0 }
  const shape = (doc: Record<string, unknown>) => projectDocument(doc, endpoint.fields)

  try {
    if (method === 'GET' || method === 'HEAD') {
      if (route.id !== null) {
        const doc = await deps.engine.findByID({ ...access, collection, id: route.id })
        if (!doc) return finish(refusal(404, 'NotFound', 'Not found.'), key.id, userId)
        return finish(json({ data: shape(doc) }, 200), key.id, userId)
      }
      const parsed = parseEndpointQuery(endpoint, new URL(request.url).searchParams)
      if (parsed.ok === false) return finish(refusal(400, 'BadRequest', parsed.error), key.id, userId)
      const q = parsed.value
      const result = await deps.engine.find({
        ...access,
        collection,
        where: Object.keys(q.where).length ? q.where : undefined,
        sort: q.sort,
        limit: q.limit,
        page: q.page,
        pagination: true,
      })
      const data = result.docs.map(shape)
      if (endpoint.responseFormat === 'array') return finish(json(data, 200), key.id, userId)
      return finish(
        json({ data, page: result.page ?? q.page, limit: q.limit, totalDocs: result.totalDocs ?? null, totalPages: result.totalPages ?? null, hasNextPage: result.hasNextPage ?? false }, 200),
        key.id,
        userId,
      )
    }

    // POST and PATCH: a JSON object, made of exposed fields only.
    const body = (await request.json().catch((): null => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || Array.isArray(body)) return finish(refusal(400, 'BadRequest', 'Send a JSON object.'), key.id, userId)
    const badKey = firstUnwritableKey(body, endpoint.fields)
    if (badKey) return finish(refusal(403, 'Forbidden', `This endpoint cannot write the field "${badKey}".`), key.id, userId)
    const secret = forbiddenFieldIn(body)
    if (secret) return finish(refusal(403, 'Forbidden', `API keys cannot write the field "${secret}".`), key.id, userId)

    if (method === 'POST') {
      if (route.id !== null) return finish(refusal(404, 'NotFound', 'Route not found.'), key.id, userId)
      const created = await deps.engine.create({ ...access, collection, data: body })
      return finish(json({ data: shape(created) }, 201), key.id, userId)
    }
    if (route.id === null) return finish(refusal(404, 'NotFound', 'Route not found.'), key.id, userId)
    const updated = await deps.engine.update({ ...access, collection, id: route.id, data: body })
    if (!updated) return finish(refusal(404, 'NotFound', 'Not found.'), key.id, userId)
    return finish(json({ data: shape(updated) }, 200), key.id, userId)
  } catch {
    return finish(refusal(500, 'Error', 'Something went wrong.'), key.id, userId)
  }
}

/**
 * The public developer guide: /api/x/docs/<token>. Served only while the admin has switched the public
 * link on, and only with the current token. Anything else is the same 404 as an unknown endpoint.
 * Every response is noindex (also set by the middleware for /api).
 */
export async function serveDocs(request: Request, slug: readonly string[], store: EndpointStore, siteName: () => Promise<string>): Promise<Response> {
  const notFound = Response.json({ errors: [{ name: 'NotFound', message: 'Route not found.' }] }, { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' } })
  if (slug.length !== 3) return notFound
  const docs = await store.docsSettings()
  if (!docs.docsPublic || !sameToken(slug[2], docs.docsToken)) return notFound
  const format = new URL(request.url).searchParams.get('format')
  const endpoints = await store.list()
  return renderGuide(
    isGuideFormat(format) ? format : 'guide.html',
    endpoints,
    { baseUrl: new URL(request.url).origin, siteName: await siteName(), generatedAt: new Date().toISOString().slice(0, 10) },
    'page',
  )
}

/** The production wiring: D1 store, shared rate limit, the engine from the REST dispatcher. */
export async function handleCustomApiEndpoint(request: Request, slug: readonly string[], engine: EndpointEngine, resolveDb: () => Promise<unknown>): Promise<Response | null> {
  if (slug[0] !== ENDPOINT_BASE) return null
  const store = createD1EndpointStore(async () => (await resolveDb()) as never)
  if (slug[1] === 'docs') return serveDocs(request, slug, store, () => siteNameFor(engine))
  return serveCustomEndpoint(request, slug, {
    engine,
    store,
    now: () => Date.now(),
    rateLimit: async (key, perMinute) => {
      const decision = await hitShared(key, perMinute)
      return { limited: decision.limited, retryAfterSeconds: decision.retryAfterSeconds }
    },
  })
}
