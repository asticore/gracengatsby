// Pure unit tests against a fully mocked ReadRegistry - no real D1, no real
// Payload, no `@/engage.config` ceremony needed (unlike the parity suite).
// Proves `find`/`findByID`/`count`/`findGlobal`'s own decision logic in
// isolation: access resolution (`overrideAccess`/`disableErrors` defaults),
// where-merging, field-level `afterRead` hooks + field access, depth
// population, and draft threading - each exercised against small, purpose-
// built fixtures rather than this app's real (much bigger) collections.
// `localapi-read-operations-parity.int.spec.ts` covers the "does this agree
// with real, live Payload" half of the discipline.
import { describe, expect, it } from 'vitest'

import { Forbidden, type LocalReq } from '@/localapi/access'
import { count, find, findByID, findGlobal, NotFound, type CollectionReadEntry, type Doc, type GlobalReadEntry, type PaginatedDocs, type ReadRegistry } from '@/localapi/read-operations'

const admin: LocalReq['user'] = { id: 1, roles: ['admin'] }
const member: LocalReq['user'] = { id: 2, roles: ['customer'] }
const anon: LocalReq['user'] = null

/* -------------------------------------------------------------------------- */
/* Fixture: an in-memory "collection" backing store, matching the shape      */
/* src/cms/db's own findXPaginated/findXByID/countX functions expose.        */
/* -------------------------------------------------------------------------- */

function makeCollectionEntry(rows: Doc[], overrides: Partial<CollectionReadEntry> = {}): CollectionReadEntry {
  const findByIDFn = async (id: number): Promise<Doc | null> => rows.find((r) => r.id === id) ?? null

  const matchesEquals = (doc: Doc, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true
    return Object.entries(where).every(([key, value]) => {
      if (key === 'and') return (value as Record<string, unknown>[]).every((w) => matchesEquals(doc, w))
      if (key === 'or') return (value as Record<string, unknown>[]).some((w) => matchesEquals(doc, w))
      const ops = value as Record<string, unknown>
      return Object.entries(ops).every(([op, operand]) => {
        if (op === 'equals') return doc[key] === operand
        if (op === 'in') return (operand as unknown[]).includes(doc[key])
        throw new Error(`fixture matcher: unsupported operator ${op}`)
      })
    })
  }

  return {
    config: { slug: 'fixture', fields: [] },
    findByID: findByIDFn,
    count: async (args) => rows.filter((r) => matchesEquals(r, args?.where as Record<string, unknown> | undefined)).length,
    findPaginated: async (args): Promise<PaginatedDocs> => {
      const matched = rows.filter((r) => matchesEquals(r, args?.where as Record<string, unknown> | undefined))
      const limit = args?.limit ?? 10
      const page = args?.page ?? 1
      const docs = matched.slice((page - 1) * limit, page * limit)
      return {
        docs,
        totalDocs: matched.length,
        limit,
        totalPages: Math.max(1, Math.ceil(matched.length / limit)),
        page,
        pagingCounter: matched.length === 0 ? 0 : (page - 1) * limit + 1,
        hasPrevPage: page > 1,
        hasNextPage: page * limit < matched.length,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page * limit < matched.length ? page + 1 : null,
      }
    },
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- */
/* overrideAccess / disableErrors defaults                                    */
/* -------------------------------------------------------------------------- */

describe('localapi/read-operations - overrideAccess/disableErrors defaults', () => {
  const rows: Doc[] = [{ id: 1, title: 'a' }, { id: 2, title: 'b' }]
  const registry: ReadRegistry = {
    collections: {
      widgets: makeCollectionEntry(rows, { config: { slug: 'widgets', fields: [], access: { read: () => false } } }),
    },
    globals: {},
  }

  it('find: overrideAccess defaults to true - an always-false access fn never runs', async () => {
    const result = await find(registry, 'widgets', { req: { user: anon } })
    expect(result.docs.map((d) => d.id)).toEqual([1, 2])
  })

  it('find: overrideAccess:false + no disableErrors -> denied access throws Forbidden', async () => {
    await expect(find(registry, 'widgets', { req: { user: anon }, overrideAccess: false })).rejects.toThrow(Forbidden)
  })

  it('find: overrideAccess:false + disableErrors:true -> denied access returns the real empty-result shape', async () => {
    const result = await find(registry, 'widgets', { req: { user: anon }, overrideAccess: false, disableErrors: true, limit: 5 })
    expect(result).toEqual({
      docs: [],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 5,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: 0,
      totalPages: 1,
    })
  })

  it('findByID: overrideAccess defaults to true', async () => {
    const doc = await findByID(registry, 'widgets', 1, { req: { user: anon } })
    expect(doc?.title).toBe('a')
  })

  it('findByID: overrideAccess:false + no disableErrors -> throws Forbidden', async () => {
    await expect(findByID(registry, 'widgets', 1, { req: { user: anon }, overrideAccess: false })).rejects.toThrow(Forbidden)
  })

  it('findByID: overrideAccess:false + disableErrors:true -> returns null', async () => {
    await expect(findByID(registry, 'widgets', 1, { req: { user: anon }, overrideAccess: false, disableErrors: true })).resolves.toBeNull()
  })

  it('count: overrideAccess defaults to true', async () => {
    await expect(count(registry, 'widgets', { req: { user: anon } })).resolves.toEqual({ totalDocs: 2 })
  })

  it('count: overrideAccess:false + no disableErrors -> throws Forbidden', async () => {
    await expect(count(registry, 'widgets', { req: { user: anon }, overrideAccess: false })).rejects.toThrow(Forbidden)
  })

  it('count: overrideAccess:false + disableErrors:true -> { totalDocs: 0 }', async () => {
    await expect(count(registry, 'widgets', { req: { user: anon }, overrideAccess: false, disableErrors: true })).resolves.toEqual({ totalDocs: 0 })
  })

  it('unknown collection throws a clear error', async () => {
    await expect(find(registry, 'nope', { req: { user: anon } })).rejects.toThrow(/unknown collection/)
    await expect(findByID(registry, 'nope', 1, { req: { user: anon } })).rejects.toThrow(/unknown collection/)
    await expect(count(registry, 'nope', { req: { user: anon } })).rejects.toThrow(/unknown collection/)
  })
})

/* -------------------------------------------------------------------------- */
/* Row-filtering (Where-returning access functions)                          */
/* -------------------------------------------------------------------------- */

describe('localapi/read-operations - row-filtering access', () => {
  const rows: Doc[] = [
    { id: 1, title: 'Published', _status: 'published' },
    { id: 2, title: 'Draft', _status: 'draft' },
  ]
  const adminOrPublished = ({ req }: { req: LocalReq }) => (req.user?.roles?.includes('admin') ? true : { _status: { equals: 'published' } })
  const registry: ReadRegistry = {
    collections: {
      posts: makeCollectionEntry(rows, { config: { slug: 'posts', fields: [], access: { read: adminOrPublished } } }),
    },
    globals: {},
  }

  it('find: admin sees every row', async () => {
    const result = await find(registry, 'posts', { req: { user: admin }, overrideAccess: false })
    expect(result.docs.map((d) => d.id)).toEqual([1, 2])
  })

  it('find: anon only sees rows matching the access Where, merged with the caller where', async () => {
    const result = await find(registry, 'posts', { req: { user: anon }, overrideAccess: false })
    expect(result.docs.map((d) => d.id)).toEqual([1])
    expect(result.totalDocs).toBe(1)
  })

  it('findByID: admin can fetch a draft row', async () => {
    const doc = await findByID(registry, 'posts', 2, { req: { user: admin }, overrideAccess: false })
    expect(doc?.id).toBe(2)
  })

  it('findByID: anon fetching a draft row (in-memory access-Where match fails) -> throws NotFound, even though the row exists', async () => {
    await expect(findByID(registry, 'posts', 2, { req: { user: anon }, overrideAccess: false })).rejects.toThrow(NotFound)
  })

  it('findByID: anon fetching a draft row + disableErrors:true -> null instead of throwing', async () => {
    const doc = await findByID(registry, 'posts', 2, { req: { user: anon }, overrideAccess: false, disableErrors: true })
    expect(doc).toBeNull()
  })

  it('findByID: anon fetching a published row -> returned', async () => {
    const doc = await findByID(registry, 'posts', 1, { req: { user: anon }, overrideAccess: false })
    expect(doc?.id).toBe(1)
  })

  it('findByID: not-found id -> throws NotFound by default (real Payload does not distinguish "missing" from "denied" without disableErrors)', async () => {
    await expect(findByID(registry, 'posts', 999, { req: { user: admin }, overrideAccess: false })).rejects.toThrow(NotFound)
  })

  it('findByID: not-found id + disableErrors:true -> null', async () => {
    const doc = await findByID(registry, 'posts', 999, { req: { user: admin }, overrideAccess: false, disableErrors: true })
    expect(doc).toBeNull()
  })

  it('findByID: a row filtered out by the access Where (not a bad id) ALSO throws NotFound by default, same as a genuinely missing id', async () => {
    await expect(findByID(registry, 'posts', 2, { req: { user: anon }, overrideAccess: false })).rejects.toThrow(NotFound)
  })

  it('count: row-filtering pushes into the count query too', async () => {
    await expect(count(registry, 'posts', { req: { user: anon }, overrideAccess: false })).resolves.toEqual({ totalDocs: 1 })
    await expect(count(registry, 'posts', { req: { user: admin }, overrideAccess: false })).resolves.toEqual({ totalDocs: 2 })
  })
})

/* -------------------------------------------------------------------------- */
/* Field-level afterRead hooks + field access stripping                      */
/* -------------------------------------------------------------------------- */

describe('localapi/read-operations - field-level afterRead hooks + access', () => {
  const decrypt = ({ value }: { value?: unknown }) => (typeof value === 'string' ? value.replace('enc:', '') : value)
  const adminOnly = ({ req }: { req: LocalReq }) => Boolean(req.user?.roles?.includes('admin'))

  const rows: Doc[] = [{ id: 1, apiKey: 'enc:secret-123', label: 'ok' }]
  const registry: ReadRegistry = {
    collections: {
      settings: makeCollectionEntry(rows, {
        config: {
          slug: 'settings',
          fields: [
            { name: 'apiKey', type: 'text', hooks: { afterRead: [decrypt] }, access: { read: adminOnly } },
            { name: 'label', type: 'text' },
          ],
        },
      }),
    },
    globals: {},
  }

  it('runs the afterRead hook before the field-access check (decrypted value is what gets access-checked/stripped)', async () => {
    const asAdmin = await findByID(registry, 'settings', 1, { req: { user: admin }, overrideAccess: false })
    expect(asAdmin?.apiKey).toBe('secret-123')
    expect(asAdmin?.label).toBe('ok')
  })

  it('strips a field whose access.read denies the caller, leaving siblings untouched', async () => {
    const asMember = await findByID(registry, 'settings', 1, { req: { user: member }, overrideAccess: false })
    expect(asMember?.apiKey).toBeUndefined()
    expect(asMember?.label).toBe('ok')
  })

  it('overrideAccess:true (the find()/findByID() default) skips field-level access too - decrypted value stays even for a non-admin', async () => {
    const doc = await findByID(registry, 'settings', 1, { req: { user: member } })
    expect(doc?.apiKey).toBe('secret-123')
  })

  it('find(): same hook + field-access behaviour applies per doc', async () => {
    const result = await find(registry, 'settings', { req: { user: member }, overrideAccess: false })
    expect(result.docs[0]?.apiKey).toBeUndefined()
    expect(result.docs[0]?.label).toBe('ok')
  })
})

/* -------------------------------------------------------------------------- */
/* Nested fields: group / row / array / blocks                               */
/* -------------------------------------------------------------------------- */

describe('localapi/read-operations - nested field traversal', () => {
  const adminOnly = ({ req }: { req: LocalReq }) => Boolean(req.user?.roles?.includes('admin'))
  const shout = ({ value }: { value?: unknown }) => (typeof value === 'string' ? value.toUpperCase() : value)

  // A fresh registry per test, not a shared `const` - `findByID`'s shallow
  // `{ ...rawDoc }` copy (matching real Payload, which also mutates
  // `siblingDoc` in place rather than deep-cloning per read) only protects
  // the TOP-level doc object; a nested group's own object is the SAME
  // reference the fixture row holds. In real usage this is a non-issue
  // (`src/cms/db`'s `nestGroups`/`attachArrays` build brand new nested
  // objects on every single read), but a shared, reused-across-tests fixture
  // row would let one test's field-access deletion permanently mutate what
  // the next test reads - hence a fresh fixture per test here instead.
  function makeRegistry(): ReadRegistry {
    const rows: Doc[] = [
      {
        id: 1,
        // group > row > secret field
        stripe: { enabled: true, secretKey: 'sk_live_x' },
        // array of objects, each with a field carrying a hook
        items: [{ id: 'a', note: 'hi' }, { id: 'b', note: 'bye' }],
        // blocks: two different block types in one list
        blocks: [
          { id: 'blk1', blockType: 'hero', heading: 'welcome' },
          { id: 'blk2', blockType: 'quote', text: 'hello' },
        ],
      },
    ]

    return {
      collections: {
        page: makeCollectionEntry(rows, {
          config: {
            slug: 'page',
            fields: [
              {
                type: 'group',
                name: 'stripe',
                fields: [
                  { type: 'row', fields: [{ name: 'enabled', type: 'checkbox' }] },
                  { name: 'secretKey', type: 'text', access: { read: adminOnly } },
                ],
              },
              {
                name: 'items',
                type: 'array',
                fields: [{ name: 'note', type: 'text', hooks: { afterRead: [shout] } }],
              },
              {
                name: 'blocks',
                type: 'blocks',
                blocks: [
                  { slug: 'hero', fields: [{ name: 'heading', type: 'text', hooks: { afterRead: [shout] } }] },
                  { slug: 'quote', fields: [{ name: 'text', type: 'text' }] },
                ],
              },
            ],
          },
        }),
      },
      globals: {},
    }
  }

  it('strips a field access-denied field nested inside a group>row, leaves its row siblings alone', async () => {
    const doc = await findByID(makeRegistry(), 'page', 1, { req: { user: member }, overrideAccess: false })
    expect((doc?.stripe as Record<string, unknown>)?.enabled).toBe(true)
    expect((doc?.stripe as Record<string, unknown>)?.secretKey).toBeUndefined()
  })

  it('admin keeps the nested secret field', async () => {
    const doc = await findByID(makeRegistry(), 'page', 1, { req: { user: admin }, overrideAccess: false })
    expect((doc?.stripe as Record<string, unknown>)?.secretKey).toBe('sk_live_x')
  })

  it('runs a field hook on every array item independently', async () => {
    const doc = await findByID(makeRegistry(), 'page', 1, { req: { user: admin } })
    const items = doc?.items as { id: string; note: string }[]
    expect(items.map((i) => i.note)).toEqual(['HI', 'BYE'])
  })

  it('runs each block type\'s own field hooks using that block\'s own field list', async () => {
    const doc = await findByID(makeRegistry(), 'page', 1, { req: { user: admin } })
    const blocks = doc?.blocks as Record<string, unknown>[]
    expect(blocks[0]?.heading).toBe('WELCOME') // hero block's hook ran
    expect(blocks[1]?.text).toBe('hello') // quote block has no hook - untouched
  })
})

/* -------------------------------------------------------------------------- */
/* depth / population                                                        */
/* -------------------------------------------------------------------------- */

describe('localapi/read-operations - depth population', () => {
  const authorRows: Doc[] = [{ id: 10, name: 'Ada' }, { id: 11, name: 'Grace' }]
  const postRows: Doc[] = [
    { id: 1, title: 'Post 1', author: 10, tags: [10, 11] },
    { id: 2, title: 'Post 2', author: 999 /* dangling id */ },
  ]

  const registry: ReadRegistry = {
    collections: {
      authors: makeCollectionEntry(authorRows, { config: { slug: 'authors', fields: [{ name: 'name', type: 'text' }] } }),
      posts: makeCollectionEntry(postRows, {
        config: {
          slug: 'posts',
          fields: [
            { name: 'title', type: 'text' },
            { name: 'author', type: 'relationship', relationTo: 'authors' },
            { name: 'tags', type: 'relationship', relationTo: 'authors', hasMany: true },
          ],
        },
      }),
    },
    globals: {},
  }

  it('depth:0 leaves relationship values as raw ids', async () => {
    const doc = await findByID(registry, 'posts', 1, { req: { user: admin }, depth: 0 })
    expect(doc?.author).toBe(10)
    expect(doc?.tags).toEqual([10, 11])
  })

  it('depth:1 (or the default) populates a single-target relationship into the related doc', async () => {
    const doc = await findByID(registry, 'posts', 1, { req: { user: admin }, depth: 1 })
    expect(doc?.author).toEqual({ id: 10, name: 'Ada' })
  })

  it('populates a hasMany relationship element-by-element', async () => {
    const doc = await findByID(registry, 'posts', 1, { req: { user: admin }, depth: 1 })
    expect(doc?.tags).toEqual([{ id: 10, name: 'Ada' }, { id: 11, name: 'Grace' }])
  })

  it('a dangling/not-found related id falls back to the raw id, matching real Payload\'s "ids are visible regardless of access controls"', async () => {
    const doc = await findByID(registry, 'posts', 2, { req: { user: admin }, depth: 1 })
    expect(doc?.author).toBe(999)
  })

  it('find(): population applies per doc in a list result too', async () => {
    const result = await find(registry, 'posts', { req: { user: admin }, depth: 1 })
    expect(result.docs.find((d) => d.id === 1)?.author).toEqual({ id: 10, name: 'Ada' })
  })

  it('population always disables errors internally, even when the outer call did not: a related doc whose access is denied falls back to the raw id rather than throwing', async () => {
    const gatedAuthors = makeCollectionEntry(authorRows, {
      config: { slug: 'authors', fields: [{ name: 'name', type: 'text' }], access: { read: () => false } },
    })
    const gatedRegistry: ReadRegistry = { collections: { ...registry.collections, authors: gatedAuthors }, globals: {} }
    const doc = await findByID(gatedRegistry, 'posts', 1, { req: { user: admin }, overrideAccess: false, depth: 1 })
    // The post itself has no access fn (defaults to "logged in" - admin passes); its
    // related author does have an always-false one. Population must not throw.
    expect(doc?.author).toBe(10)
  })
})

/* -------------------------------------------------------------------------- */
/* draft threading (findByID only - see the module's own file header)        */
/* -------------------------------------------------------------------------- */

describe('localapi/read-operations - draft threading', () => {
  it('findByID forwards { draft } to the registry entry\'s own findByID untouched', async () => {
    const seen: { draft?: boolean }[] = []
    const registry: ReadRegistry = {
      collections: {
        events: {
          config: { slug: 'events', fields: [] },
          findByID: async (id, opts) => {
            seen.push(opts ?? {})
            return { id, title: opts?.draft ? 'Draft title' : 'Live title' }
          },
          findPaginated: async () => ({ docs: [], totalDocs: 0, limit: 10, totalPages: 1, page: 1, pagingCounter: 0, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null }),
          count: async () => 0,
        },
      },
      globals: {},
    }

    const live = await findByID(registry, 'events', 1, { req: { user: admin } })
    const draft = await findByID(registry, 'events', 1, { req: { user: admin }, draft: true })
    expect(live?.title).toBe('Live title')
    expect(draft?.title).toBe('Draft title')
    expect(seen).toEqual([{ draft: undefined }, { draft: true }])
  })
})

/* -------------------------------------------------------------------------- */
/* findGlobal                                                                 */
/* -------------------------------------------------------------------------- */

describe('localapi/read-operations - findGlobal', () => {
  const adminOnly = ({ req }: { req: LocalReq }) => Boolean(req.user?.roles?.includes('admin'))

  function makeGlobalEntry(doc: Doc | null, overrides: Partial<GlobalReadEntry['config']> = {}): GlobalReadEntry {
    return { config: { slug: 'settings', fields: [{ name: 'siteName', type: 'text' }], ...overrides }, find: async () => doc }
  }

  it('overrideAccess defaults to true', async () => {
    const registry: ReadRegistry = { collections: {}, globals: { settings: makeGlobalEntry({ id: 1, siteName: 'Grace & Gatsby' }, { access: { read: adminOnly } }) } }
    const doc = await findGlobal(registry, 'settings', { req: { user: anon } })
    expect(doc?.siteName).toBe('Grace & Gatsby')
  })

  it('overrideAccess:false + no disableErrors -> throws Forbidden', async () => {
    const registry: ReadRegistry = { collections: {}, globals: { settings: makeGlobalEntry({ id: 1, siteName: 'x' }, { access: { read: adminOnly } }) } }
    await expect(findGlobal(registry, 'settings', { req: { user: anon }, overrideAccess: false })).rejects.toThrow(Forbidden)
  })

  it('overrideAccess:false + disableErrors:true -> null', async () => {
    const registry: ReadRegistry = { collections: {}, globals: { settings: makeGlobalEntry({ id: 1, siteName: 'x' }, { access: { read: adminOnly } }) } }
    await expect(findGlobal(registry, 'settings', { req: { user: anon }, overrideAccess: false, disableErrors: true })).resolves.toBeNull()
  })

  it('never-written global (find() -> null) still gets field defaultValue backfilled', async () => {
    const registry: ReadRegistry = {
      collections: {},
      globals: { settings: { config: { slug: 'settings', fields: [{ name: 'siteName', type: 'text', defaultValue: 'Untitled site' }] }, find: async () => null } },
    }
    const doc = await findGlobal(registry, 'settings', { req: { user: admin } })
    expect(doc?.siteName).toBe('Untitled site')
  })

  it('unknown global throws a clear error', async () => {
    const registry: ReadRegistry = { collections: {}, globals: {} }
    await expect(findGlobal(registry, 'nope', { req: { user: admin } })).rejects.toThrow(/unknown global/)
  })
})
