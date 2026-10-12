import { describe, expect, it, vi } from 'vitest'
import { actionRefusal, applyCategory, parseBulkRequest, patchFor, runBulk, summariseResults, type BulkPermissions } from '@/features/editScreens/bulk'
import { seoEditGuard, trashGuard } from '@/features/editScreens/guards'
import { readingMinutes } from '@/features/editScreens/readingTime'
import { mapText } from '@/features/editScreens/textFields'
import { isEligibleAuthor } from '@/features/editScreens/authors'
import { parseTiers } from '@/features/editScreens/tiers'

const perms = (o: Partial<BulkPermissions> = {}): BulkPermissions => ({ isAdmin: false, update: true, publish: true, delete: true, editOthers: false, ...o })

describe('parseBulkRequest', () => {
  it('validates collection, action and ids', () => {
    expect('error' in parseBulkRequest({ collection: 'users', ids: [1], action: 'publish' })).toBe(true)
    expect('error' in parseBulkRequest({ collection: 'pages', ids: [], action: 'publish' })).toBe(true)
    expect('error' in parseBulkRequest({ collection: 'pages', ids: [1], action: 'nuke' })).toBe(true)
    expect('error' in parseBulkRequest({ collection: 'pages', ids: [1, 'x'], action: 'publish' })).toBe(true)
    expect('error' in parseBulkRequest({ collection: 'pages', ids: Array.from({ length: 101 }, (_, i) => i + 1), action: 'publish' })).toBe(true)
    expect('error' in parseBulkRequest({ collection: 'pages', ids: [1], action: 'changeAuthor' })).toBe(true)
    expect('error' in parseBulkRequest({ collection: 'pages', ids: [1], action: 'changeCategory', category: { name: 'a', mode: 'add' } })).toBe(true)
    const ok = parseBulkRequest({ collection: 'posts', ids: [1, 1, '2'], action: 'changeCategory', category: { name: ' News ', mode: 'add' } })
    expect('request' in ok && ok.request.ids).toEqual([1, 2])
  })
})

describe('actionRefusal', () => {
  it('needs publish, delete or edit-others as appropriate', () => {
    expect(actionRefusal('publish', perms({ publish: false }))).not.toBeNull()
    expect(actionRefusal('trash', perms({ delete: false }))).not.toBeNull()
    expect(actionRefusal('changeAuthor', perms())).not.toBeNull()
    expect(actionRefusal('changeAuthor', perms({ editOthers: true }))).toBeNull()
    expect(actionRefusal('changeAuthor', perms({ isAdmin: true, update: true }))).toBeNull()
  })
})

describe('runBulk', () => {
  it('handles each row on its own and reports refusals', async () => {
    const update = vi.fn(async ({ id }: { id: number }) => {
      if (id === 2) throw new Error('Forbidden')
      return {}
    })
    const results = await runBulk({ findByID: vi.fn(), update, delete: vi.fn() } as never, { id: 1 }, { collection: 'pages', ids: [1, 2, 3], action: 'trash' })
    expect(results.map((r) => r.ok)).toEqual([true, false, true])
    expect(update.mock.calls[0][0]).toMatchObject({ overrideAccess: false, data: { _status: 'draft' } })
    expect(summariseResults(results)).toBe('2 updated, 1 refused.')
  })

  it('sets createdBy and the byline for posts', async () => {
    const update = vi.fn(async (_args: Record<string, unknown>) => ({}))
    await runBulk({ findByID: vi.fn(), update, delete: vi.fn() } as never, {}, { collection: 'posts', ids: [1], action: 'changeAuthor', author: 9 })
    expect(update.mock.calls[0][0]).toMatchObject({ data: { createdBy: 9, author: 9 } })
  })

  it('edits categories', () => {
    expect(applyCategory([{ name: 'A' }], { name: 'B', mode: 'add' })).toEqual([{ name: 'A' }, { name: 'B' }])
    expect(applyCategory([{ name: 'A' }, { name: 'b' }], { name: 'B', mode: 'remove' })).toEqual([{ name: 'A' }])
    expect(applyCategory([{ name: 'A' }], { name: 'B', mode: 'replace' })).toEqual([{ name: 'B' }])
    expect(patchFor('restore')).toEqual({ trashedAt: null })
  })
})

describe('guards', () => {
  it('forces a trashed document to draft and refuses trashing the homepage', async () => {
    const data: Record<string, unknown> = { trashedAt: 'x', _status: 'published' }
    await trashGuard({ data, originalDoc: {}, req: { user: { roles: ['admin'] } }, collection: { slug: 'pages' } } as never)
    expect(data._status).toBe('draft')
    await expect(
      trashGuard({ data: { trashedAt: 'x' }, originalDoc: { isHomepage: true }, req: { user: { roles: ['admin'] } }, collection: { slug: 'pages' } } as never),
    ).rejects.toBeTruthy()
  })

  it('keeps the stored SEO for a user without editSeo, and lets admins edit', async () => {
    const data: Record<string, unknown> = { seo: { metaTitle: 'new' } }
    const user = { roles: ['viewer'] }
    await seoEditGuard({ data, originalDoc: { seo: { metaTitle: 'old', ogImage: { id: 4 } } }, req: { user }, operation: 'update' } as never)
    expect(data.seo).toEqual({ metaTitle: 'old', ogImage: 4 })
    const adminData = { seo: { metaTitle: 'new' } }
    await seoEditGuard({ data: adminData, originalDoc: { seo: { metaTitle: 'old' } }, req: { user: { roles: ['admin'] } }, operation: 'update' } as never)
    expect(adminData.seo.metaTitle).toBe('new')
  })
})

describe('review fixes', () => {
  it('bulk publish refuses trashed docs and delete needs trash and not homepage', async () => {
    const docs: Record<number, any> = { 1: { trashedAt: 'x' }, 2: {}, 3: { trashedAt: 'x', isHomepage: true }, 4: { trashedAt: 'x' } }
    const engine = {
      findByID: vi.fn(async ({ id }: any) => docs[id] ?? null),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    }
    const pub = await runBulk(engine, {}, { collection: 'pages', ids: [1, 2], action: 'publish' } as never)
    expect(pub.map((r) => r.ok)).toEqual([false, true])
    const del = await runBulk(engine, {}, { collection: 'pages', ids: [2, 3, 4], action: 'delete' } as never)
    expect(del.map((r) => r.ok)).toEqual([false, false, true])
    expect(engine.delete).toHaveBeenCalledTimes(1)
  })

  it('trashGuard refuses publishing a trashed doc and a trashed homepage', async () => {
    await expect(
      trashGuard({ data: { _status: 'published' }, originalDoc: { trashedAt: 'x' }, req: { user: { roles: ['admin'] } }, collection: { slug: 'pages' } } as never),
    ).rejects.toBeTruthy()
    await expect(
      trashGuard({ data: { isHomepage: true }, originalDoc: { trashedAt: 'x' }, req: { user: { roles: ['admin'] } }, collection: { slug: 'pages' } } as never),
    ).rejects.toBeTruthy()
  })

  it('seoEditGuard falls back to the original doc when the latest draft cannot be read', async () => {
    const data: Record<string, unknown> = { seo: { metaTitle: 'new' } }
    await seoEditGuard({ data, originalDoc: { id: 9, seo: { metaTitle: 'old' } }, req: { user: { roles: ['viewer'] } }, operation: 'update', collection: { slug: 'pages' } } as never)
    expect(data.seo).toEqual({ metaTitle: 'old' })
  })
})

describe('helpers', () => {
  it('computes reading time from rich text', () => {
    const words = Array.from({ length: 450 }, () => 'word').join(' ')
    expect(readingMinutes({ root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: words }] }] } })).toBe(3)
    expect(readingMinutes(null)).toBeNull()
  })

  it('replaces only text keys', () => {
    const { value, changed } = mapText({ heading: 'Hello cat', url: '/cat', blockType: 'cat' }, (t) => t.replace(/cat/g, 'dog'))
    expect(value).toEqual({ heading: 'Hello dog', url: '/cat', blockType: 'cat' })
    expect(changed).toBe(1)
  })

  it('knows eligible authors and parses tiers', () => {
    expect(isEligibleAuthor({ roles: ['editor'] })).toBe(true)
    expect(isEligibleAuthor({ roles: ['customer'] })).toBe(false)
    expect(parseTiers([{ name: 'VIP', price: '25' }, { name: '' }, 5])).toEqual([{ name: 'VIP', description: '', price: 25, capacity: null, salesEnd: null }])
  })
})
