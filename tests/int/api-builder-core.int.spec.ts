import { describe, expect, it } from 'vitest'

import {
  ENGINE_OPERATOR,
  endpointPath,
  firstUnwritableKey,
  isSecretLikeField,
  parseEndpointQuery,
  parseFilterKey,
  projectDocument,
  validateEndpoint,
  validateEndpointPath,
  type ApiEndpointConfig,
} from '@/features/apiBuilder/core'

const exposable = new Set(['title', 'slug', 'status', 'price', 'createdAt', 'passwordHash', 'apiToken'])
const base: Record<string, unknown> = {
  name: 'Products lite',
  version: 'v1',
  slug: 'products-lite',
  collection: 'products',
  fields: ['title', 'slug', 'price'],
  filters: [{ field: 'title', operators: ['eq', 'contains'] }],
  sortable: ['price', 'title'],
  defaultSort: '-price',
  defaultLimit: 20,
  maxLimit: 50,
  allowCreate: false,
  allowUpdate: false,
  requiredRole: 'staff',
  allowedKeyIds: null,
  rateLimitPerMinute: 60,
  enabled: true,
  responseFormat: 'envelope',
}
const ctx = { exposable, collectionFields: exposable, reserved: new Set(['pages']), keyIds: new Set([1, 2]) }
const valid = (over: Record<string, unknown> = {}) => validateEndpoint({ ...base, ...over }, ctx)

describe('API builder: path validation', () => {
  it('accepts a versioned, lower-case name', () => {
    expect(validateEndpointPath('v1', 'products-lite')).toEqual({ ok: true, value: { version: 'v1', slug: 'products-lite' } })
    expect(endpointPath('v2', 'orders')).toBe('/api/x/v2/orders')
  })

  it('rejects a missing or non-version segment', () => {
    for (const v of ['1', 'version1', 'v0', 'v', 'latest', '', 'v1.2']) {
      expect(validateEndpointPath(v, 'orders').ok).toBe(false)
    }
  })

  it('rejects names with capitals, slashes, dots, double hyphens or a leading hyphen', () => {
    for (const s of ['Orders', 'a/b', 'a.b', '-orders', 'orders-', 'a--b', 'a b', '', 'x'.repeat(60)]) {
      expect(validateEndpointPath('v1', s).ok).toBe(false)
    }
  })

  it('rejects reserved words and every collection slug the caller passes in', () => {
    for (const s of ['api', 'admin', 'login', 'docs', 'openapi', 'x', 'users', 'api-keys', 'pages']) {
      const r = validateEndpointPath('v1', s, new Set(['pages']))
      expect(r.ok, s).toBe(false)
    }
  })
})

describe('API builder: field whitelist', () => {
  it('flags secret-like and private fields as never exposable', () => {
    for (const f of ['passwordHash', 'apiToken', 'resetToken', 'salt', 'twoFactorSecret', 'hash', 'sessionId', '_private']) {
      expect(isSecretLikeField(f), f).toBe(true)
    }
    expect(isSecretLikeField('title')).toBe(false)
  })

  it('refuses to expose a secret field even when the caller lists it', () => {
    const r = valid({ fields: ['title', 'passwordHash'] })
    expect(r.ok).toBe(false)
  })

  it('refuses a field the collection does not have', () => {
    expect(valid({ fields: ['title', 'nope'] }).ok).toBe(false)
  })

  it('projects a document down to the exposed fields, always keeping the id', () => {
    const doc = { id: 9, title: 'A', slug: 'a', price: 3, passwordHash: 'x', apiToken: 'y', internal: 'z' }
    expect(projectDocument(doc, ['title', 'passwordHash', 'apiToken'])).toEqual({ id: 9, title: 'A' })
  })

  it('refuses a write that touches a field outside the exposed list', () => {
    expect(firstUnwritableKey({ title: 'x' }, ['title', 'slug'])).toBeNull()
    expect(firstUnwritableKey({ title: 'x', price: 5 }, ['title', 'slug'])).toBe('price')
    expect(firstUnwritableKey({ passwordHash: 'x' }, ['title', 'passwordHash'])).toBe('passwordHash')
  })
})

describe('API builder: endpoint validation', () => {
  it('accepts a sound definition and fills the defaults', () => {
    const r = valid()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.allowCreate).toBe(false)
      expect(r.value.allowUpdate).toBe(false)
      expect(r.value.enabled).toBe(true)
    }
  })

  it('rejects a filter on a field that is not exposed', () => {
    expect(valid({ filters: [{ field: 'status', operators: ['eq'] }] }).ok).toBe(false)
  })

  it('rejects a default sort that is not sortable', () => {
    expect(valid({ defaultSort: '-status' }).ok).toBe(false)
  })

  it('rejects a page size over 100 and a default above the maximum', () => {
    expect(valid({ maxLimit: 101 }).ok).toBe(false)
    expect(valid({ defaultLimit: 60, maxLimit: 50 }).ok).toBe(false)
  })

  it('rejects an unknown key id in the allowed list', () => {
    expect(valid({ allowedKeyIds: [1, 99] }).ok).toBe(false)
    const ok = valid({ allowedKeyIds: [2, 2, 1] })
    expect(ok.ok && ok.value.allowedKeyIds).toEqual([2, 1])
  })

  it('rejects a rate limit outside 1 to 600', () => {
    expect(valid({ rateLimitPerMinute: 0 }).ok).toBe(false)
    expect(valid({ rateLimitPerMinute: 601 }).ok).toBe(false)
  })

  it('refuses a collection that the API may not touch', () => {
    expect(valid({ collection: 'users' }).ok).toBe(false)
    expect(valid({ collection: 'api-keys' }).ok).toBe(false)
  })
})

describe('API builder: query parsing', () => {
  const endpoint: ApiEndpointConfig = { ...(base as unknown as ApiEndpointConfig), filters: [{ field: 'title', operators: ['eq', 'contains'] }, { field: 'price', operators: ['gte', 'lt'] }], sortable: ['price', 'title'], fields: ['title', 'price'] } as ApiEndpointConfig

  it('turns allowed filters into engine where-clauses', () => {
    const r = parseEndpointQuery(endpoint, new URLSearchParams('title=Shoe&title.contains=red&price.gte=5'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.where).toEqual({ title: { equals: 'Shoe', contains: 'red' }, price: { greater_than_equal: '5' } })
    }
  })

  it('refuses an unknown parameter instead of ignoring it', () => {
    expect(parseEndpointQuery(endpoint, new URLSearchParams('secret=1')).ok).toBe(false)
  })

  it('refuses an operator the endpoint did not allow', () => {
    expect(parseEndpointQuery(endpoint, new URLSearchParams('price.contains=5')).ok).toBe(false)
  })

  it('refuses a sort on a field that is not sortable, and accepts a descending sort', () => {
    expect(parseEndpointQuery(endpoint, new URLSearchParams('sort=-createdAt')).ok).toBe(false)
    const r = parseEndpointQuery(endpoint, new URLSearchParams('sort=-price'))
    expect(r.ok && r.value.sort).toBe('-price')
  })

  it('clamps limit to the maximum and refuses a bad page', () => {
    const r = parseEndpointQuery(endpoint, new URLSearchParams('limit=500'))
    expect(r.ok && r.value.limit).toBe(50)
    expect(parseEndpointQuery(endpoint, new URLSearchParams('page=0')).ok).toBe(false)
    expect(parseEndpointQuery(endpoint, new URLSearchParams('limit=abc')).ok).toBe(false)
  })

  it('parses a filter key into its field and operator', () => {
    expect(parseFilterKey('title')).toEqual({ field: 'title', operator: 'eq' })
    expect(parseFilterKey('price.gte')).toEqual({ field: 'price', operator: 'gte' })
    expect(parseFilterKey('bad key')).toBeNull()
    expect(ENGINE_OPERATOR.gte).toBe('greater_than_equal')
  })
})
