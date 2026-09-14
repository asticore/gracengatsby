// Pure unit tests for src/localapi/operations.ts's own internal logic -
// mock collection/global configs, mock hooks, and a tiny in-memory fake
// standing in for a `src/cms/db/collections/*.ts` file's real exports (see
// operations.ts's own `CollectionDbOps`/`GlobalDbOps` doc comments). No
// `getEngine()`/live DB here - same reasoning `localapi-access.int.spec.ts`/
// `localapi-validators.int.spec.ts` give for staying on this repo's default
// jsdom environment: nothing here touches wrangler's bundled esbuild or the
// `@/engine`<->`@/engage.config` circular import. Real, unmodified app
// collections/hooks running against the real live DB are covered separately
// in `tests/int/localapi-operations-parity.int.spec.ts`.
import { describe, expect, it, vi } from 'vitest'

import type { LocalReq } from '@/localapi/access'
import { Forbidden } from '@/localapi/access'
import type { CollectionConfigLike, CollectionDbOps, GlobalConfigLike, GlobalDbOps } from '@/localapi/operations'
import { createDocument, deleteDocument, matchesWhere, NotFound, updateDocument, updateGlobalDocument, uniqueConstraintErrorToValidationError, ValidationError } from '@/localapi/operations'

/* -------------------------------------------------------------------------- */
/* Test fixtures                                                              */
/* -------------------------------------------------------------------------- */

type Doc = { id: number; title: string; slug?: string; count?: number; _status?: string; secret?: string; [key: string]: unknown }

function makeFakeDb(initial: Doc[] = []): CollectionDbOps<Doc> & { rows: Doc[] } {
  const rows = [...initial]
  let nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1
  return {
    rows,
    async create(data) {
      const doc = { ...data, id: nextId++ } as Doc
      rows.push(doc)
      return doc
    },
    async updateByID(id, data) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return null
      rows[idx] = { ...rows[idx], ...data } as Doc
      return rows[idx]
    },
    async deleteByID(id) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return false
      rows.splice(idx, 1)
      return true
    },
    async findByID(id) {
      return rows.find((r) => r.id === id) ?? null
    },
  }
}

function makeFakeGlobalDb(initial: Record<string, unknown> | null = null): GlobalDbOps<Record<string, unknown>> {
  let row = initial
  return {
    async find() {
      return row
    },
    async update(data) {
      row = { ...(row ?? {}), ...data }
      return row
    },
  }
}

const adminReq: LocalReq = { user: { id: 1, roles: ['admin'] } }
const anonReq: LocalReq = { user: null }
const selfReq: LocalReq = { user: { id: 42, roles: ['customer'] } }

const baseCollection: CollectionConfigLike = {
  slug: 'widgets',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'count', type: 'number' },
  ],
  access: {
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
    read: () => true,
  },
}

/* -------------------------------------------------------------------------- */
/* createDocument                                                             */
/* -------------------------------------------------------------------------- */

describe('operations/createDocument', () => {
  it('throws Forbidden when access denies and overrideAccess is not set', async () => {
    const db = makeFakeDb()
    await expect(createDocument({ collection: baseCollection, db, data: { title: 'x' }, req: anonReq })).rejects.toThrow(Forbidden)
    expect(db.rows).toHaveLength(0)
  })

  it('overrideAccess:true skips the access check entirely', async () => {
    const db = makeFakeDb()
    const doc = await createDocument({ collection: baseCollection, db, data: { title: 'x' }, req: anonReq, overrideAccess: true })
    expect(doc.title).toBe('x')
  })

  it('runs field-level beforeValidate BEFORE collection-level beforeValidate (Deviation 1)', async () => {
    const order: string[] = []
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
          hooks: { beforeValidate: [((): undefined => { order.push('field'); return undefined }) as never] },
        },
      ],
      hooks: {
        beforeValidate: [
          ((args: { data: Record<string, unknown> }) => {
            order.push('collection')
            return args.data
          }) as never,
        ],
      },
    }
    const db = makeFakeDb()
    await createDocument({ collection, db, data: { title: 'x' }, req: adminReq })
    expect(order).toEqual(['field', 'collection'])
  })

  it('runs collection-level beforeChange BEFORE field-level beforeChange', async () => {
    const order: string[] = []
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
          hooks: { beforeChange: [((): undefined => { order.push('field'); return undefined }) as never] },
        },
      ],
      hooks: {
        beforeChange: [
          ((args: { data: Record<string, unknown> }) => {
            order.push('collection')
            return args.data
          }) as never,
        ],
      },
    }
    const db = makeFakeDb()
    await createDocument({ collection, db, data: { title: 'x' }, req: adminReq })
    expect(order).toEqual(['collection', 'field'])
  })

  it('collects EVERY field validation error before throwing one ValidationError (not fail-fast)', async () => {
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'count', type: 'number', required: true },
      ],
    }
    const db = makeFakeDb()
    const err = await createDocument({ collection, db, data: {}, req: adminReq }).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as ValidationError).errors.map((e) => e.path).sort()).toEqual(['count', 'title'])
    expect(db.rows).toHaveLength(0)
  })

  it('applies field.defaultValue before validating, so an omitted required field with a default still passes', async () => {
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [{ name: 'title', type: 'text', required: true, defaultValue: 'Untitled' }],
    }
    const db = makeFakeDb()
    const doc = await createDocument({ collection, db, data: {}, req: adminReq })
    expect(doc.title).toBe('Untitled')
  })

  it('a draft save on a drafts-enabled collection skips validation and stamps _status', async () => {
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [{ name: 'title', type: 'text', required: true }],
      versions: { drafts: true },
    }
    const db = makeFakeDb()
    const doc = await createDocument({ collection, db, data: {}, req: adminReq, draft: true })
    expect(doc._status).toBe('draft')
  })

  it('afterRead field hooks run on the created doc BEFORE afterChange - Deviation 2', async () => {
    const order: string[] = []
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [
        {
          name: 'secret',
          type: 'text',
          hooks: {
            afterRead: [
              (() => {
                order.push('afterRead')
                return 'decrypted'
              }) as never,
            ],
          },
        },
      ],
      hooks: {
        afterChange: [
          ((args: { doc: Record<string, unknown> }) => {
            order.push('afterChange')
            // Proves afterRead already ran: afterChange sees the DECRYPTED value.
            expect(args.doc.secret).toBe('decrypted')
            return args.doc
          }) as never,
        ],
      },
    }
    const db = makeFakeDb()
    const doc = await createDocument({ collection, db, data: { secret: 'ciphertext' }, req: adminReq })
    expect(order).toEqual(['afterRead', 'afterChange'])
    expect(doc.secret).toBe('decrypted')
  })

  it('afterChange collection hook receives previousDoc: {} on create', async () => {
    let seenPreviousDoc: unknown
    const collection: CollectionConfigLike = {
      ...baseCollection,
      hooks: {
        afterChange: [
          ((args: { previousDoc: unknown; doc: Record<string, unknown> }) => {
            seenPreviousDoc = args.previousDoc
            return args.doc
          }) as never,
        ],
      },
    }
    const db = makeFakeDb()
    await createDocument({ collection, db, data: { title: 'x' }, req: adminReq })
    expect(seenPreviousDoc).toEqual({})
  })

  it('field-level access control strips a field a non-privileged create request may not set', async () => {
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [
        { name: 'title', type: 'text' },
        { name: 'secret', type: 'text', access: { create: ({ req }) => Boolean(req.user?.roles?.includes('admin')) } },
      ],
    }
    const db = makeFakeDb()
    const doc = await createDocument({ collection, db, data: { title: 'x', secret: 'nope' }, req: selfReq })
    expect(doc.secret).toBeUndefined()

    const adminDoc = await createDocument({ collection, db, data: { title: 'y', secret: 'yep' }, req: adminReq })
    expect(adminDoc.secret).toBe('yep')
  })
})

/* -------------------------------------------------------------------------- */
/* updateDocument                                                             */
/* -------------------------------------------------------------------------- */

describe('operations/updateDocument', () => {
  it('throws NotFound when the document does not exist', async () => {
    const db = makeFakeDb()
    await expect(updateDocument({ collection: baseCollection, db, id: 999, data: { title: 'x' }, req: adminReq })).rejects.toThrow(NotFound)
  })

  it('a Where-shaped access result (e.g. isAdminOrSelf) allows the owner and denies everyone else', async () => {
    const db = makeFakeDb([{ id: 42, title: 'mine' }])
    const collection: CollectionConfigLike = {
      ...baseCollection,
      access: {
        ...baseCollection.access,
        update: ({ req }) => (req.user?.roles?.includes('admin') ? true : req.user ? { id: { equals: req.user.id } } : false),
      },
    }
    const updated = await updateDocument({ collection, db, id: 42, data: { title: 'still mine' }, req: selfReq })
    expect(updated.title).toBe('still mine')

    const otherReq: LocalReq = { user: { id: 7, roles: ['customer'] } }
    await expect(updateDocument({ collection, db, id: 42, data: { title: 'hijack' }, req: otherReq })).rejects.toThrow(Forbidden)
  })

  it('a partial update that omits a required field falls back to the ORIGINAL doc value, not undefined', async () => {
    const db = makeFakeDb([{ id: 1, title: 'existing title', count: 3 }])
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'count', type: 'number' },
      ],
    }
    const updated = await updateDocument({ collection, db, id: 1, data: { count: 9 }, req: adminReq })
    expect(updated.title).toBe('existing title')
    expect(updated.count).toBe(9)
  })

  it('afterChange collection hook receives previousDoc = the doc as fetched before this update', async () => {
    const db = makeFakeDb([{ id: 1, title: 'old' }])
    let seenPreviousDoc: Record<string, unknown> | undefined
    const collection: CollectionConfigLike = {
      ...baseCollection,
      hooks: {
        afterChange: [
          ((args: { previousDoc: Record<string, unknown>; doc: Record<string, unknown> }) => {
            seenPreviousDoc = args.previousDoc
            return args.doc
          }) as never,
        ],
      },
    }
    await updateDocument({ collection, db, id: 1, data: { title: 'new' }, req: adminReq })
    expect(seenPreviousDoc?.title).toBe('old')
  })

  it('forwards the draft flag through to db.updateByID', async () => {
    const db = makeFakeDb([{ id: 1, title: 'old' }])
    const spy = vi.spyOn(db, 'updateByID')
    const collection: CollectionConfigLike = { ...baseCollection, versions: { drafts: true } }
    await updateDocument({ collection, db, id: 1, data: { title: 'new' }, req: adminReq, draft: true })
    expect(spy).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'new' }), { draft: true })
  })

  it('a draft update skips validation even when a required field is blanked out', async () => {
    const db = makeFakeDb([{ id: 1, title: 'old' }])
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [{ name: 'title', type: 'text', required: true }],
      versions: { drafts: true },
    }
    const updated = await updateDocument({ collection, db, id: 1, data: { title: '' }, req: adminReq, draft: true })
    expect(updated).toBeTruthy()
  })
})

/* -------------------------------------------------------------------------- */
/* deleteDocument                                                             */
/* -------------------------------------------------------------------------- */

describe('operations/deleteDocument', () => {
  it('throws NotFound when the document does not exist', async () => {
    const db = makeFakeDb()
    await expect(deleteDocument({ collection: baseCollection, db, id: 999, req: adminReq })).rejects.toThrow(NotFound)
  })

  it('throws Forbidden (not a bare deny) when access denies without overrideAccess', async () => {
    const db = makeFakeDb([{ id: 1, title: 'x' }])
    await expect(deleteDocument({ collection: baseCollection, db, id: 1, req: anonReq })).rejects.toThrow(Forbidden)
    expect(db.rows).toHaveLength(1)
  })

  it('afterDelete hook args have no data/operation, and doc reflects afterRead having already run', async () => {
    let seenArgs: Record<string, unknown> | undefined
    const collection: CollectionConfigLike = {
      ...baseCollection,
      fields: [{ name: 'title', type: 'text' }, { name: 'secret', type: 'text', hooks: { afterRead: [(() => 'decrypted') as never] } }],
      hooks: {
        afterDelete: [
          ((args: Record<string, unknown>) => {
            seenArgs = args
            return args.doc
          }) as never,
        ],
      },
    }
    const db = makeFakeDb([{ id: 1, title: 'x', secret: 'cipher' }])
    const doc = await deleteDocument({ collection, db, id: 1, req: adminReq })
    expect(seenArgs).not.toHaveProperty('data')
    expect(seenArgs).not.toHaveProperty('operation')
    expect(seenArgs?.id).toBe(1)
    expect(doc.secret).toBe('decrypted')
    expect(db.rows).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */
/* updateGlobalDocument                                                       */
/* -------------------------------------------------------------------------- */

describe('operations/updateGlobalDocument', () => {
  const baseGlobal: GlobalConfigLike = {
    slug: 'site-settings',
    fields: [{ name: 'siteName', type: 'text' }],
    access: { update: ({ req }) => Boolean(req.user), read: () => true },
  }

  it('throws Forbidden when access denies', async () => {
    const db = makeFakeGlobalDb()
    await expect(updateGlobalDocument({ global: baseGlobal, db, data: { siteName: 'x' }, req: anonReq })).rejects.toThrow(Forbidden)
  })

  it("global beforeValidate/beforeChange hooks receive overrideAccess - Deviation 3 (a collection's own do not)", async () => {
    const seen: Array<boolean | undefined> = []
    const global: GlobalConfigLike = {
      ...baseGlobal,
      hooks: {
        beforeValidate: [((args: { overrideAccess?: boolean; data: Record<string, unknown> }) => { seen.push(args.overrideAccess); return args.data }) as never],
        beforeChange: [((args: { overrideAccess?: boolean; data: Record<string, unknown> }) => { seen.push(args.overrideAccess); return args.data }) as never],
      },
    }
    const db = makeFakeGlobalDb({})
    await updateGlobalDocument({ global, db, data: { siteName: 'x' }, req: adminReq, overrideAccess: true })
    expect(seen).toEqual([true, true])
  })

  it('afterChange previousDoc reflects the global row as it existed before this update', async () => {
    let seenPreviousDoc: Record<string, unknown> | undefined
    const global: GlobalConfigLike = {
      ...baseGlobal,
      hooks: {
        afterChange: [
          ((args: { previousDoc: Record<string, unknown>; doc: Record<string, unknown> }) => {
            seenPreviousDoc = args.previousDoc
            return args.doc
          }) as never,
        ],
      },
    }
    const db = makeFakeGlobalDb({ siteName: 'old name' })
    const updated = await updateGlobalDocument({ global, db, data: { siteName: 'new name' }, req: adminReq })
    expect(seenPreviousDoc?.siteName).toBe('old name')
    expect(updated.siteName).toBe('new name')
  })
})

/* -------------------------------------------------------------------------- */
/* matchesWhere                                                               */
/* -------------------------------------------------------------------------- */

describe('operations/matchesWhere', () => {
  const doc = { id: 42, status: 'published', role: 'admin' }

  it('equals', () => {
    expect(matchesWhere(doc, { id: { equals: 42 } })).toBe(true)
    expect(matchesWhere(doc, { id: { equals: 1 } })).toBe(false)
  })

  it('not_equals', () => {
    expect(matchesWhere(doc, { id: { not_equals: 1 } })).toBe(true)
    expect(matchesWhere(doc, { id: { not_equals: 42 } })).toBe(false)
  })

  it('in', () => {
    expect(matchesWhere(doc, { status: { in: ['draft', 'published'] } })).toBe(true)
    expect(matchesWhere(doc, { status: { in: ['draft'] } })).toBe(false)
  })

  it('and / or composition', () => {
    expect(matchesWhere(doc, { and: [{ id: { equals: 42 } }, { status: { equals: 'published' } }] })).toBe(true)
    expect(matchesWhere(doc, { and: [{ id: { equals: 42 } }, { status: { equals: 'draft' } }] })).toBe(false)
    expect(matchesWhere(doc, { or: [{ id: { equals: 1 } }, { status: { equals: 'published' } }] })).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* uniqueConstraintErrorToValidationError                                     */
/* -------------------------------------------------------------------------- */

describe('operations/uniqueConstraintErrorToValidationError', () => {
  it('translates a SQLite unique-constraint error message into a ValidationError', () => {
    const result = uniqueConstraintErrorToValidationError(new Error('SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: eg_events.slug'), 'slug')
    expect(result).toBeInstanceOf(ValidationError)
    expect(result?.errors).toEqual([{ path: 'slug', message: 'This value must be unique.' }])
  })

  it('returns undefined for an unrelated error', () => {
    expect(uniqueConstraintErrorToValidationError(new Error('network timeout'))).toBeUndefined()
  })
})
