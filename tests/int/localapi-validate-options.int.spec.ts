// Tests for validate function receiving `data`, `id`, and `siblingData` options.
// Demonstrates that custom validators can now access the full document, the original
// doc's id (for uniqueness checks), and sibling field data during both create and update.
import { describe, expect, it } from 'vitest'

import type { LocalReq } from '@/localapi/access'
import type { CollectionConfigLike, CollectionDbOps } from '@/localapi/operations'
import { createDocument, updateDocument, ValidationError } from '@/localapi/operations'

type Doc = { id: number; parentId?: number; slug?: string; [key: string]: unknown }

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

const adminReq: LocalReq = { user: { id: 1, roles: ['admin'] } }

describe('localapi/operations - validate function options (data, id, siblingData)', () => {
  describe('custom field validators receiving validation context', () => {
    it('(a) updating an existing doc without changing its unique slug passes with a custom field validate that queries {slug equals, id not_equals id}', async () => {
      const db = makeFakeDb([
        { id: 1, parentId: 10, slug: 'about' },
      ])

      const slugValidatorCalls: Array<{ value: unknown; options: Record<string, unknown> }> = []

      const collection: CollectionConfigLike = {
        slug: 'pages',
        fields: [
          {
            name: 'slug',
            type: 'text',
            validate: ((value: unknown, options: Record<string, unknown>) => {
              slugValidatorCalls.push({ value, options })
              // Custom uniqueness validator: allow same slug if updating the same doc (id matches)
              const { data, id, siblingData } = options
              if (typeof siblingData === 'object' && siblingData !== null) {
                const currentSlug = (siblingData as Record<string, unknown>).slug
                const currentParentId = (data as Record<string, unknown>)?.parentId
                if (typeof currentSlug === 'string' && currentSlug === value && id === 1 && currentParentId === 10) {
                  return true
                }
              }
              // For this test: only allow unique slugs (simple check)
              if (value === 'about' && id !== 1) return 'Another page with this slug already exists under the same parent'
              return true
            }) as never,
          },
        ],
        access: {
          create: ({ req }) => Boolean(req.user),
          update: ({ req }) => Boolean(req.user),
          delete: ({ req }) => Boolean(req.user),
          read: () => true,
        },
      }

      const updated = await updateDocument({ collection, db, id: 1, data: { slug: 'about' }, req: adminReq })
      expect(updated.slug).toBe('about')
      // Verify validator was called and received the correct options
      expect(slugValidatorCalls).toHaveLength(1)
      expect(slugValidatorCalls[0].options.id).toBe(1)
      // data contains the incoming update data (partial, not full merged doc)
      expect(slugValidatorCalls[0].options.data).toEqual({ slug: 'about' })
    })

    it('(b) creating a second doc with the same slug under same parent fails with the validator message', async () => {
      const db = makeFakeDb([
        { id: 1, parentId: 10, slug: 'about' },
      ])

      const collection: CollectionConfigLike = {
        slug: 'pages',
        fields: [
          {
            name: 'slug',
            type: 'text',
            validate: ((value: unknown, options: Record<string, unknown>) => {
              const { data, id, siblingData } = options
              // Allow same slug only if updating same doc
              if (typeof siblingData === 'object' && siblingData !== null) {
                const currentSlug = (siblingData as Record<string, unknown>).slug
                const currentParentId = (data as Record<string, unknown>)?.parentId
                if (typeof currentSlug === 'string' && currentSlug === value && id === 1 && currentParentId === 10) {
                  return true
                }
              }
              // Reject duplicate slug (create or different doc)
              if (value === 'about') return 'Another page with this slug already exists under the same parent'
              return true
            }) as never,
          },
        ],
        access: {
          create: ({ req }) => Boolean(req.user),
          update: ({ req }) => Boolean(req.user),
          delete: ({ req }) => Boolean(req.user),
          read: () => true,
        },
      }

      const err = await createDocument({ collection, db, data: { parentId: 10, slug: 'about' }, req: adminReq }).catch((e) => e)
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).errors[0].message).toBe('Another page with this slug already exists under the same parent')
    })

    it('(c) validator receives `data` with the full document and `id` undefined on create', async () => {
      const db = makeFakeDb()

      const slugValidatorCalls: Array<{ id: unknown; data: unknown }> = []

      const collection: CollectionConfigLike = {
        slug: 'pages',
        fields: [
          {
            name: 'slug',
            type: 'text',
            validate: ((value: unknown, options: Record<string, unknown>) => {
              const { data, id } = options
              slugValidatorCalls.push({ id, data })
              return true
            }) as never,
          },
        ],
        access: {
          create: ({ req }) => Boolean(req.user),
          update: ({ req }) => Boolean(req.user),
          delete: ({ req }) => Boolean(req.user),
          read: () => true,
        },
      }

      await createDocument({ collection, db, data: { parentId: 5, slug: 'new-page' }, req: adminReq })
      expect(slugValidatorCalls).toHaveLength(1)
      expect(slugValidatorCalls[0].id).toBeUndefined()
      expect(slugValidatorCalls[0].data).toEqual({ parentId: 5, slug: 'new-page' })
    })

    it('validator receives siblingData with current field value during beforeChange traversal', async () => {
      const db = makeFakeDb()

      const slugValidatorCalls: Array<{ siblingData: unknown }> = []

      const collection: CollectionConfigLike = {
        slug: 'pages',
        fields: [
          {
            name: 'slug',
            type: 'text',
            validate: ((value: unknown, options: Record<string, unknown>) => {
              const { siblingData } = options
              slugValidatorCalls.push({ siblingData })
              return true
            }) as never,
          },
        ],
        access: {
          create: ({ req }) => Boolean(req.user),
          update: ({ req }) => Boolean(req.user),
          delete: ({ req }) => Boolean(req.user),
          read: () => true,
        },
      }

      await createDocument({ collection, db, data: { slug: 'test-slug' }, req: adminReq })
      expect(slugValidatorCalls).toHaveLength(1)
      expect(slugValidatorCalls[0].siblingData).toEqual({ slug: 'test-slug' })
    })

    it('validator receives data param containing all fields from the incoming request during create', async () => {
      const db = makeFakeDb()

      const validatorDataCaptures: Array<Record<string, unknown>> = []

      const collection: CollectionConfigLike = {
        slug: 'pages',
        fields: [
          {
            name: 'slug',
            type: 'text',
            validate: ((value: unknown, options: Record<string, unknown>) => {
              const { data } = options
              validatorDataCaptures.push(data as Record<string, unknown>)
              return true
            }) as never,
          },
          { name: 'title', type: 'text' },
          { name: 'parentId', type: 'number' },
        ],
        access: {
          create: ({ req }) => Boolean(req.user),
          update: ({ req }) => Boolean(req.user),
          delete: ({ req }) => Boolean(req.user),
          read: () => true,
        },
      }

      await createDocument(
        {
          collection,
          db,
          data: { slug: 'test', title: 'Test Page', parentId: 42 },
          req: adminReq,
        },
      )

      expect(validatorDataCaptures).toHaveLength(1)
      expect(validatorDataCaptures[0]).toEqual({ slug: 'test', title: 'Test Page', parentId: 42 })
    })

    it('validator receives id param with original doc.id during update', async () => {
      const db = makeFakeDb([
        { id: 7, parentId: 10, slug: 'original' },
      ])

      const idCaptures: Array<unknown> = []

      const collection: CollectionConfigLike = {
        slug: 'pages',
        fields: [
          {
            name: 'slug',
            type: 'text',
            validate: ((value: unknown, options: Record<string, unknown>) => {
              const { id } = options
              idCaptures.push(id)
              return true
            }) as never,
          },
        ],
        access: {
          create: ({ req }) => Boolean(req.user),
          update: ({ req }) => Boolean(req.user),
          delete: ({ req }) => Boolean(req.user),
          read: () => true,
        },
      }

      await updateDocument({ collection, db, id: 7, data: { slug: 'updated' }, req: adminReq })
      expect(idCaptures).toHaveLength(1)
      expect(idCaptures[0]).toBe(7)
    })
  })
})
