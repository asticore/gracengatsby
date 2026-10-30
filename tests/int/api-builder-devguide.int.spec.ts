/* eslint-disable @typescript-eslint/no-explicit-any -- the OpenAPI checker walks an untyped JSON document */
import { describe, expect, it, vi } from 'vitest'

import { buildHtmlGuide, buildMarkdownGuide, buildOpenApi, buildPostman, examplesFor, toYaml } from '@/features/apiBuilder/devguide'
import { isGuideFormat, renderGuide, sameToken } from '@/features/apiBuilder/guideResponse'
import { serveDocs } from '@/features/apiBuilder/runtime'
import type { ApiEndpoint } from '@/features/apiBuilder/core'
import type { EndpointStore } from '@/features/apiBuilder/store'

const endpoint = (over: Partial<ApiEndpoint> = {}): ApiEndpoint => ({
  id: 1, name: 'Products lite', description: 'Public product list', version: 'v1', slug: 'products-lite', collection: 'products',
  fields: ['title', 'price'], filters: [{ field: 'title', operators: ['eq', 'contains'] }], sortable: ['price'], defaultSort: '-price',
  defaultLimit: 20, maxLimit: 50, allowCreate: true, allowUpdate: true, requiredRole: 'any', allowedKeyIds: null,
  rateLimitPerMinute: 60, enabled: true, responseFormat: 'envelope', createdAt: 'x', updatedAt: 'x', ...over,
})
const OPTS = { baseUrl: 'https://shop.example', siteName: 'Example Shop', generatedAt: '2026-10-30' }

/** A structural check of the OpenAPI document: the rules a consumer relies on. Returns the problems found. */
function openApiProblems(doc: Record<string, any>): string[] {
  const problems: string[] = []
  if (doc.openapi !== '3.1.0') problems.push('openapi version')
  const schemas = doc.components?.schemas ?? {}
  const ids = new Set<string>()
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string') {
        const name = v.replace('#/components/schemas/', '')
        if (!(name in schemas)) problems.push(`unresolved ${v}`)
      } else walk(v)
    }
  }
  walk(doc)
  for (const [path, item] of Object.entries<Record<string, any>>(doc.paths ?? {})) {
    if (!path.startsWith('/api/x/')) problems.push(`path ${path}`)
    const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    for (const [method, op] of Object.entries<Record<string, any>>(item)) {
      if (method === 'delete') problems.push(`delete offered at ${path}`)
      if (!op.responses || !Object.keys(op.responses).some((c) => c.startsWith('2'))) problems.push(`no 2xx ${method} ${path}`)
      if (ids.has(op.operationId)) problems.push(`duplicate ${op.operationId}`)
      ids.add(op.operationId)
      for (const p of pathParams) {
        if (!(op.parameters ?? []).some((x: Record<string, string>) => x.name === p && x.in === 'path')) problems.push(`missing path param ${p} in ${method} ${path}`)
      }
    }
  }
  return problems
}

describe('API builder: OpenAPI 3.1 document', () => {
  it('is structurally valid: refs resolve, path params are declared, no delete, operation ids unique', () => {
    const doc = buildOpenApi([endpoint(), endpoint({ id: 2, name: 'Orders', slug: 'orders', collection: 'products', allowCreate: false, allowUpdate: false })], OPTS)
    expect(openApiProblems(doc)).toEqual([])
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths as object)).toEqual(expect.arrayContaining(['/api/x/v1/products-lite', '/api/x/v1/products-lite/{id}', '/api/x/v1/orders']))
  })

  it('lists POST and PATCH only where the endpoint allows them, and never DELETE', () => {
    const doc = buildOpenApi([endpoint({ allowCreate: false, allowUpdate: false })], OPTS) as { paths: Record<string, Record<string, unknown>> }
    expect(Object.keys(doc.paths['/api/x/v1/products-lite'])).toEqual(['get'])
    expect(Object.keys(doc.paths['/api/x/v1/products-lite/{id}'])).toEqual(['get'])
    const open = buildOpenApi([endpoint()], OPTS) as { paths: Record<string, Record<string, unknown>> }
    expect(Object.keys(open.paths['/api/x/v1/products-lite'])).toEqual(['get', 'post'])
    expect(Object.keys(open.paths['/api/x/v1/products-lite/{id}'])).toEqual(['get', 'patch'])
    expect(JSON.stringify(open)).not.toContain('"delete"')
  })

  it('documents only enabled endpoints, and only the exposed fields', () => {
    const doc = buildOpenApi([endpoint({ enabled: false }), endpoint({ id: 2, slug: 'live' })], OPTS) as { paths: object; components: { schemas: Record<string, { properties: object }> } }
    expect(Object.keys(doc.paths).some((p) => p.includes('products-lite'))).toBe(false)
    expect(Object.keys(doc.paths)).toContain('/api/x/v1/live')
    const props = Object.keys(doc.components.schemas.v1_live.properties)
    expect(props).toEqual(['id', 'title', 'price'])
  })

  it('never writes a secret-like field into the schemas, even if one slipped into storage', () => {
    const doc = buildOpenApi([endpoint({ fields: ['title', 'passwordHash'] })], OPTS)
    expect(JSON.stringify(doc)).not.toContain('passwordHash')
  })

  it('never writes a key into any output', () => {
    const e = endpoint()
    const outputs = [JSON.stringify(buildOpenApi([e], OPTS)), toYaml(buildOpenApi([e], OPTS)), buildMarkdownGuide([e], OPTS), buildHtmlGuide([e], OPTS), JSON.stringify(buildPostman([e], OPTS))]
    for (const out of outputs) expect(out).not.toMatch(/egk_[A-Za-z0-9_-]{10,}/)
  })
})

describe('API builder: YAML', () => {
  it('quotes strings so no value is read as YAML syntax', () => {
    const yaml = toYaml({ a: 'yes', b: 'x: y', c: '- item', d: 1, e: true, f: null, g: [], h: {} })
    expect(yaml).toContain('"a": "yes"')
    expect(yaml).toContain('"b": "x: y"')
    expect(yaml).toContain('"c": "- item"')
    expect(yaml).toContain('"g": []')
    expect(yaml).toContain('"h": {}')
  })

  it('indents nested objects and arrays', () => {
    const yaml = toYaml({ outer: { list: [{ name: 'n' }] } })
    expect(yaml).toBe('"outer":\n  "list":\n    -\n      "name": "n"')
  })
})

describe('API builder: Markdown and HTML guide', () => {
  it('covers base URL, auth header, each endpoint, examples in three languages, errors and rate limits', () => {
    const md = buildMarkdownGuide([endpoint()], OPTS)
    expect(md).toContain('https://shop.example')
    expect(md).toContain('Authorization: Bearer YOUR_API_KEY')
    expect(md).toContain('/api/x/v1/products-lite')
    expect(md).toContain('curl -X GET')
    expect(md).toContain('await fetch(')
    expect(md).toContain('requests.request(')
    expect(md).toContain('| 429 |')
    expect(md).toContain('60 requests a minute')
  })

  it('escapes every builder value in the HTML guide, and marks the page noindex', () => {
    const html = buildHtmlGuide([endpoint({ name: '<script>alert(1)</script>', description: '"quoted" & <b>' })], OPTS)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive">')
  })

  it('examples put the key in as a placeholder, and quote a single quote safely in curl', () => {
    const ex = examplesFor(endpoint({ fields: ['title'] }), 'GET', 'https://shop.example')
    expect(ex.curl).toContain('Bearer YOUR_API_KEY')
    const ex2 = examplesFor(endpoint({ fields: ['title'] }), 'PATCH', 'https://shop.example', 7)
    expect(ex2.curl).toContain('/api/x/v1/products-lite/7')
  })
})

describe('API builder: Postman collection', () => {
  it('is a v2.1 collection with a baseUrl and an empty apiKey variable, and no key in the requests', () => {
    const pm = buildPostman([endpoint()], OPTS) as { info: { schema: string }; item: Array<{ item: Array<{ request: { header: Array<{ value: string }> } }> }>; variable: Array<{ key: string; value: string }> }
    expect(pm.info.schema).toContain('v2.1.0')
    expect(pm.variable).toEqual([{ key: 'baseUrl', value: 'https://shop.example', type: 'string' }, { key: 'apiKey', value: '', type: 'string' }])
    const requests = pm.item.flatMap((i) => i.item)
    expect(requests).toHaveLength(4)
    expect(requests.every((r) => r.request.header[0].value === 'Bearer {{apiKey}}')).toBe(true)
  })
})

describe('API builder: guide responses and tokens', () => {
  it('maps only known formats, sets an attachment name, and marks HTML noindex', async () => {
    expect(isGuideFormat('openapi.json')).toBe(true)
    expect(isGuideFormat('../../etc')).toBe(false)
    const res = renderGuide('openapi.yaml', [endpoint()], OPTS, 'download')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="openapi.yaml"')
    expect(res.headers.get('Content-Type')).toContain('yaml')
    const page = renderGuide('guide.html', [endpoint()], OPTS, 'page')
    expect(page.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(page.headers.get('Content-Disposition')).toBeNull()
  })

  it('compares tokens in constant time, and refuses a different length or an empty token', () => {
    expect(sameToken('abc123', 'abc123')).toBe(true)
    expect(sameToken('abc123', 'abc124')).toBe(false)
    expect(sameToken('abc', 'abcd')).toBe(false)
    expect(sameToken('', '')).toBe(false)
  })
})

describe('API builder: public docs route', () => {
  const store = (docsPublic: boolean): EndpointStore =>
    ({
      list: vi.fn(async () => [endpoint()]),
      docsSettings: vi.fn(async () => ({ docsPublic, docsToken: 'a'.repeat(32) })),
    }) as unknown as EndpointStore
  const url = (path: string) => new Request(`https://shop.example${path}`)

  it('is a 404 while the public link is off, even with the right token', async () => {
    const res = await serveDocs(url(`/api/x/docs/${'a'.repeat(32)}`), ['x', 'docs', 'a'.repeat(32)], store(false), async () => 'Shop')
    expect(res.status).toBe(404)
  })

  it('is a 404 with a wrong token, and with no token', async () => {
    expect((await serveDocs(url('/api/x/docs/nope'), ['x', 'docs', 'nope'], store(true), async () => 'Shop')).status).toBe(404)
    expect((await serveDocs(url('/api/x/docs'), ['x', 'docs'], store(true), async () => 'Shop')).status).toBe(404)
  })

  it('serves the HTML guide with the right token, noindex, and the site name', async () => {
    const res = await serveDocs(url(`/api/x/docs/${'a'.repeat(32)}`), ['x', 'docs', 'a'.repeat(32)], store(true), async () => 'Example Shop')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex')
    const body = await res.text()
    expect(body).toContain('Example Shop API')
  })

  it('serves the OpenAPI format on the public link when asked', async () => {
    const res = await serveDocs(url(`/api/x/docs/${'a'.repeat(32)}?format=openapi.json`), ['x', 'docs', 'a'.repeat(32)], store(true), async () => 'Shop')
    expect(res.headers.get('Content-Type')).toContain('json')
    expect(JSON.parse(await res.text()).openapi).toBe('3.1.0')
  })
})
