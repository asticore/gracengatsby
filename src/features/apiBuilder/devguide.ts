import { SOURCE_COLLECTIONS, type FieldInfo } from '@/features/dataViews/catalogue'
import { ENGINE_OPERATOR, endpointParamNames, endpointPath, isSecretLikeField, type ApiEndpoint, type FilterOperator } from './core'

/**
 * The developer guide, generated from the builder: OpenAPI 3.1 (JSON and YAML), a Markdown guide,
 * an HTML guide and a Postman v2.1 collection. Pure: the caller passes the base URL and the
 * enabled endpoints. No key, password or secret is ever written into a guide; the API key is always
 * a placeholder. Only enabled endpoints are documented.
 */

export type GuideOptions = { baseUrl: string; siteName: string; generatedAt: string }

const KIND_SCHEMA: Record<FieldInfo['kind'], Record<string, unknown>> = {
  text: { type: 'string' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  date: { type: 'string', format: 'date-time' },
}

/** The kind of a built-in field, looked up in the same catalogue the builder uses. Unknown fields are text. */
export function fieldKind(collection: string, key: string): FieldInfo['kind'] {
  const source = SOURCE_COLLECTIONS.find((c) => c.slug === collection)
  return source?.fields.find((f) => f.key === key)?.kind ?? 'text'
}

const label = (collection: string, key: string): string => SOURCE_COLLECTIONS.find((c) => c.slug === collection)?.fields.find((f) => f.key === key)?.label ?? key

const schemaName = (e: ApiEndpoint): string => `${e.version}_${e.slug.replace(/[^a-zA-Z0-9]/g, '_')}`

const enabledOnly = (endpoints: readonly ApiEndpoint[]): ApiEndpoint[] => endpoints.filter((e) => e.enabled)

/** The fields a guide may show: the endpoint's list minus anything secret-like, even if one slipped into storage. */
const exposedFields = (e: ApiEndpoint): string[] => e.fields.filter((f) => !isSecretLikeField(f))
const filterFields = (e: ApiEndpoint): ApiEndpoint => ({ ...e, fields: exposedFields(e), filters: e.filters.filter((f) => !isSecretLikeField(f.field)), sortable: e.sortable.filter((f) => !isSecretLikeField(f)) })

function recordSchema(e: ApiEndpoint, forWrite: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  if (!forWrite) properties.id = { type: 'integer', description: 'Record id.' }
  for (const field of e.fields) {
    properties[field] = { ...KIND_SCHEMA[fieldKind(e.collection, field)], description: label(e.collection, field) }
  }
  return { type: 'object', properties, additionalProperties: false }
}

const errorResponse = (description: string): Record<string, unknown> => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
})

/** The OpenAPI 3.1 document for the enabled endpoints. */
export function buildOpenApi(endpoints: readonly ApiEndpoint[], options: GuideOptions): Record<string, unknown> {
  const enabled = enabledOnly(endpoints).map(filterFields)
  const paths: Record<string, Record<string, unknown>> = {}
  const schemas: Record<string, unknown> = {
    Error: {
      type: 'object',
      properties: { errors: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, message: { type: 'string' } } } } },
    },
  }

  for (const e of enabled) {
    const base = endpointPath(e.version, e.slug)
    const name = schemaName(e)
    schemas[name] = recordSchema(e, false)
    schemas[`${name}_input`] = recordSchema(e, true)
    const rate = { 'x-rate-limit-per-minute': e.rateLimitPerMinute }
    const params = endpointParamNames(e).map((p) => ({ name: p.name, in: 'query', required: false, description: p.description, schema: { type: 'string' } }))
    const listEnvelope = {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: `#/components/schemas/${name}` } },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        totalDocs: { type: ['integer', 'null'] },
        totalPages: { type: ['integer', 'null'] },
        hasNextPage: { type: 'boolean' },
      },
    }
    const listSchema = e.responseFormat === 'array' ? { type: 'array', items: { $ref: `#/components/schemas/${name}` } } : listEnvelope
    const single = { type: 'object', properties: { data: { $ref: `#/components/schemas/${name}` } } }
    const errorsFor = (codes: Array<[string, string]>) => Object.fromEntries(codes.map(([code, text]) => [code, errorResponse(text)]))
    const common = errorsFor([
      ['401', 'No API key, or the key is not valid.'],
      ['403', 'The key is not allowed to call this endpoint, or the field is not allowed.'],
      ['429', 'Too many requests for this key. See the Retry-After header.'],
    ])

    const item: Record<string, unknown> = {}
    item.get = {
      operationId: `list_${name}`,
      summary: `List ${e.name}`,
      description: e.description || undefined,
      tags: [e.name],
      parameters: params,
      security: [{ ApiKey: [] }],
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: listSchema } } },
        '400': errorResponse('A parameter is unknown or not allowed.'),
        ...common,
      },
      ...rate,
    }
    if (e.allowCreate) {
      item.post = {
        operationId: `create_${name}`,
        summary: `Create ${e.name}`,
        tags: [e.name],
        security: [{ ApiKey: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}_input` } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: single } } }, '400': errorResponse('The body is not a JSON object.'), ...common },
        ...rate,
      }
    }
    paths[base] = item

    const one: Record<string, unknown> = {}
    one.get = {
      operationId: `get_${name}`,
      summary: `Get one ${e.name}`,
      tags: [e.name],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
      security: [{ ApiKey: [] }],
      responses: { '200': { description: 'OK', content: { 'application/json': { schema: single } } }, ...errorsFor([['404', 'No record with that id.']]), ...common },
      ...rate,
    }
    if (e.allowUpdate) {
      one.patch = {
        operationId: `update_${name}`,
        summary: `Update one ${e.name}`,
        tags: [e.name],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
        security: [{ ApiKey: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}_input` } } } },
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: single } } }, ...errorsFor([['404', 'No record with that id.']]), ...common },
        ...rate,
      }
    }
    paths[`${base}/{id}`] = one
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `${options.siteName} API`,
      version: '1.0.0',
      description: `Generated from the API builder on ${options.generatedAt}. Only enabled endpoints are listed.`,
    },
    servers: [{ url: options.baseUrl.replace(/\/$/, ''), description: 'This site' }],
    security: [{ ApiKey: [] }],
    tags: enabled.map((e) => ({ name: e.name, description: e.description || undefined })),
    paths,
    components: {
      securitySchemes: {
        ApiKey: { type: 'http', scheme: 'bearer', description: 'An API key from the site admin, sent as Authorization: Bearer <key>. The x-api-key header is also accepted.' },
      },
      schemas,
    },
  }
}

/**
 * A small YAML writer for the JSON-shaped OpenAPI document. Strings are written as JSON strings
 * (valid YAML double-quoted scalars), so no key or value is ever mis-read as YAML syntax.
 */
export function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const empty = Array.isArray(item) ? item.length === 0 : Object.keys(item).length === 0
          if (empty) return `${pad}- ${Array.isArray(item) ? '[]' : '{}'}`
          return `${pad}-\n${toYaml(item, indent + 1)}`
        }
        return `${pad}- ${toYaml(item, indent + 1)}`
      })
      .join('\n')
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return '{}'
  return entries
    .map(([key, child]) => {
      const k = JSON.stringify(key)
      if (child !== null && typeof child === 'object') {
        const empty = Array.isArray(child) ? child.length === 0 : Object.keys(child).length === 0
        if (empty) return `${pad}${k}: ${Array.isArray(child) ? '[]' : '{}'}`
        return `${pad}${k}:\n${toYaml(child, indent + 1)}`
      }
      return `${pad}${k}: ${toYaml(child, indent + 1)}`
    })
    .join('\n')
}

/** Example request for one operation, in the three languages the guide shows. */
export type Example = { method: string; url: string; body?: string; query?: string }

export function examplesFor(e: ApiEndpoint, method: 'GET' | 'POST' | 'PATCH', baseUrl: string, id?: number): { curl: string; javascript: string; python: string } {
  const url = `${baseUrl.replace(/\/$/, '')}${endpointPath(e.version, e.slug)}${id !== undefined ? `/${id}` : ''}${method === 'GET' && id === undefined ? '?limit=5' : ''}`
  const sample = Object.fromEntries(e.fields.slice(0, 2).map((f) => [f, fieldKind(e.collection, f) === 'number' ? 1 : fieldKind(e.collection, f) === 'boolean' ? true : 'example']))
  const body = method === 'GET' ? undefined : JSON.stringify(sample, null, 2)
  const curlBody = body ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${body.replace(/'/g, `'\\''`).replace(/\n\s*/g, ' ')}'` : ''
  const curl = `curl -X ${method} '${url}' \\\n  -H 'Authorization: Bearer YOUR_API_KEY'${curlBody}`
  const jsBody = body ? `,\n  headers: { Authorization: 'Bearer YOUR_API_KEY', 'Content-Type': 'application/json' },\n  body: JSON.stringify(${body.replace(/\n/g, '\n  ')})` : `,\n  headers: { Authorization: 'Bearer YOUR_API_KEY' }`
  const javascript = `const response = await fetch('${url}', {\n  method: '${method}'${jsBody}\n})\nconst json = await response.json()`
  const pyBody = body ? `\nbody = ${pyLiteral(sample)}\n` : ''
  const pyCall = body ? `requests.request('${method}', url, headers=headers, json=body)` : `requests.request('${method}', url, headers=headers)`
  const python = `import requests\n\nurl = '${url}'\nheaders = {'Authorization': 'Bearer YOUR_API_KEY'}${pyBody}\nresponse = ${pyCall}\nprint(response.status_code, response.json())`
  return { curl, javascript, python }
}

function pyLiteral(value: unknown): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(pyLiteral).join(', ')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${JSON.stringify(k)}: ${pyLiteral(v)}`)
    .join(', ')}}`
}

const filterLines = (e: ApiEndpoint): string[] => {
  const out: string[] = []
  for (const f of e.filters) {
    for (const op of f.operators as FilterOperator[]) out.push(`${op === 'eq' ? f.field : `${f.field}.${op}`} (${ENGINE_OPERATOR[op]})`)
  }
  return out
}

/** The Markdown guide. Every value from the builder is written as text, never as markup. */
export function buildMarkdownGuide(endpoints: readonly ApiEndpoint[], options: GuideOptions): string {
  const enabled = enabledOnly(endpoints).map(filterFields)
  const base = options.baseUrl.replace(/\/$/, '')
  const out: string[] = []
  out.push(`# ${options.siteName} API`, '', `Generated ${options.generatedAt} from the API builder. Only enabled endpoints are listed.`, '')
  out.push('## Base URL', '', `\`${base}\``, '')
  out.push('## Authentication', '', 'Send an API key with every request:', '', '```', 'Authorization: Bearer YOUR_API_KEY', '```', '', 'The `x-api-key` header is also accepted. Keys are created by the site admin. A key can only do what its scopes and the endpoint allow.', '')
  out.push('## Errors', '', '| Status | Meaning |', '| --- | --- |', '| 400 | A parameter is unknown, not allowed, or the body is not a JSON object. |', '| 401 | No API key, or the key is not valid or has expired. |', '| 403 | The key may not call this endpoint, or the field is not allowed. |', '| 404 | No endpoint or record with that address. |', '| 405 | The method is not offered for this endpoint. |', '| 429 | Rate limit reached. Wait for the `Retry-After` seconds. |', '| 500 | Something went wrong on the server. |', '')
  out.push('Error bodies look like `{ "errors": [{ "name": "...", "message": "..." }] }`.', '')
  out.push('## Rate limits', '', 'Each endpoint has its own limit per key, per minute. Listed under each endpoint.', '')
  for (const e of enabled) {
    const path = endpointPath(e.version, e.slug)
    out.push(`## ${e.name}`, '', e.description ? `${e.description}` : '', '')
    out.push(`- Address: \`${base}${path}\``, `- Rate limit: ${e.rateLimitPerMinute} requests a minute per key`, `- Fields: ${e.fields.map((f) => `\`${f}\``).join(', ')}`, `- Required role of the key's owner: ${e.requiredRole}`, `- Creating: ${e.allowCreate ? 'POST' : 'not offered'}`, `- Updating: ${e.allowUpdate ? 'PATCH' : 'not offered'}`, '')
    out.push('### Parameters', '', '| Name | Where | Description |', '| --- | --- | --- |')
    for (const p of endpointParamNames(e)) out.push(`| \`${p.name}\` | query | ${p.description} |`)
    out.push('')
    if (filterLines(e).length) out.push(`Filters: ${filterLines(e).map((l) => `\`${l}\``).join(', ')}`, '')
    out.push('### List', '')
    out.push('```http', `GET ${path}?limit=5`, 'Authorization: Bearer YOUR_API_KEY', '```', '')
    const ex = examplesFor(e, 'GET', base)
    out.push('```bash', ex.curl, '```', '', '```javascript', ex.javascript, '```', '', '```python', ex.python, '```', '')
    out.push(`Response (${e.responseFormat === 'array' ? 'bare array' : 'envelope'}): ${e.responseFormat === 'array' ? '`[{ "id": 1, ... }]`' : '`{ "data": [{ "id": 1, ... }], "page": 1, "limit": 5, "totalDocs": 12, "totalPages": 3, "hasNextPage": true }`'}`, '')
    out.push('### Get one', '', `\`GET ${path}/{id}\` returns \`{ "data": { "id": 1, ... } }\`, or 404.`, '')
    if (e.allowCreate) {
      const post = examplesFor(e, 'POST', base)
      out.push('### Create', '', `\`POST ${path}\` with a JSON object of exposed fields. Returns 201 with \`{ "data": {...} }\`.`, '', '```bash', post.curl, '```', '')
    }
    if (e.allowUpdate) {
      const patch = examplesFor(e, 'PATCH', base, 1)
      out.push('### Update', '', `\`PATCH ${path}/{id}\` with the fields to change. Returns 200 with \`{ "data": {...} }\`.`, '', '```bash', patch.curl, '```', '')
    }
  }
  if (enabled.length === 0) out.push('No endpoints are enabled yet.', '')
  return out.join('\n')
}

const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** The HTML guide: the Markdown content as a self-contained page, every value escaped. */
export function buildHtmlGuide(endpoints: readonly ApiEndpoint[], options: GuideOptions, robots = 'noindex, nofollow, noarchive'): string {
  const md = buildMarkdownGuide(endpoints, options)
  const body = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('```')) return line.length > 3 ? '<pre><code>' : '</code></pre>'
      if (line.startsWith('### ')) return `<h3>${esc(line.slice(4))}</h3>`
      if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`
      if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`
      if (line.startsWith('| ')) return `<tr>${line.split('|').slice(1, -1).map((c) => `<td>${esc(c.trim().replace(/`/g, ''))}</td>`).join('')}</tr>`
      if (line.startsWith('- ')) return `<li>${esc(line.slice(2).replace(/`/g, ''))}</li>`
      if (line === '') return ''
      return `<p>${esc(line.replace(/`/g, ''))}</p>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${esc(robots)}">
<title>${esc(options.siteName)} API</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;line-height:1.5}pre{background:#f4f4f4;padding:12px;overflow:auto;border-radius:6px}code{font-family:ui-monospace,monospace}table{border-collapse:collapse}td{border:1px solid #ddd;padding:4px 8px}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}pre{background:#222}td{border-color:#444}}</style>
</head>
<body>
${body}
</body>
</html>
`
}

/** A Postman Collection v2.1 export. The API key is a collection variable, left empty. */
export function buildPostman(endpoints: readonly ApiEndpoint[], options: GuideOptions): Record<string, unknown> {
  const enabled = enabledOnly(endpoints).map(filterFields)
  const base = options.baseUrl.replace(/\/$/, '')
  const requestFor = (e: ApiEndpoint, method: 'GET' | 'POST' | 'PATCH', id?: string, name?: string) => {
    const path = [...endpointPath(e.version, e.slug).split('/').filter(Boolean), ...(id ? [id] : [])]
    const query = method === 'GET' && !id ? [{ key: 'limit', value: '5' }] : []
    const hasBody = method !== 'GET'
    return {
      name: name ?? `${method} ${e.name}`,
      request: {
        method,
        header: [
          { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' },
          ...(hasBody ? [{ key: 'Content-Type', value: 'application/json', type: 'text' }] : []),
        ],
        url: { raw: `{{baseUrl}}/${path.join('/')}${query.length ? '?limit=5' : ''}`, host: ['{{baseUrl}}'], path, query },
        ...(hasBody
          ? { body: { mode: 'raw', raw: JSON.stringify(Object.fromEntries(e.fields.slice(0, 2).map((f) => [f, 'example'])), null, 2), options: { raw: { language: 'json' } } } }
          : {}),
        description: e.description || undefined,
      },
    }
  }
  const items = enabled.map((e) => {
    const subs = [requestFor(e, 'GET', undefined, `List ${e.name}`)]
    if (e.allowCreate) subs.push(requestFor(e, 'POST', undefined, `Create ${e.name}`))
    subs.push(requestFor(e, 'GET', '1', `Get one ${e.name}`))
    if (e.allowUpdate) subs.push(requestFor(e, 'PATCH', '1', `Update one ${e.name}`))
    return { name: e.name, item: subs }
  })
  return {
    info: {
      name: `${options.siteName} API`,
      description: `Generated from the API builder on ${options.generatedAt}.`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
    variable: [
      { key: 'baseUrl', value: base, type: 'string' },
      { key: 'apiKey', value: '', type: 'string' },
    ],
  }
}
