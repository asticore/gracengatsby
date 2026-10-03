import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
}))

const { deleteVersionRow, isVersionedCollection } = vi.hoisted(() => ({
  deleteVersionRow: vi.fn(),
  isVersionedCollection: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/cms/db/versionDelete', () => ({
  deleteVersionRow,
  isVersionedCollection: (collection: string) => {
    // Call the mocked function to check
    return isVersionedCollection(collection)
  },
}))

import { DELETE } from '@/app/(engage)/api/admin-version-delete/route'

describe('DELETE /api/admin-version-delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not an admin', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: false })

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorised' })
    expect(deleteVersionRow).not.toHaveBeenCalled()
  })

  it('returns 400 when collection is unknown', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(false)

    const request = new Request('http://x/api/admin-version-delete?collection=unknown&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Unknown collection' })
    expect(deleteVersionRow).not.toHaveBeenCalled()
  })

  it('returns 400 when id is missing', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id or parent' })
  })

  it('returns 400 when id is zero', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=0', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id or parent' })
  })

  it('returns 400 when id is not an integer', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=abc', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id or parent' })
  })

  it('returns 400 when parent is missing', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)

    const request = new Request('http://x/api/admin-version-delete?collection=pages&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id or parent' })
  })

  it('returns 400 when parent is zero', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=0&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id or parent' })
  })

  it('returns 400 when parent is not an integer', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=xyz&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid id or parent' })
  })

  it('returns 200 with ok:true when deletion succeeds and calls deleteVersionRow with correct params', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)
    deleteVersionRow.mockResolvedValue('deleted')

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(deleteVersionRow).toHaveBeenCalledWith('pages', 7, 3)
  })

  it('returns 409 when result is is_latest', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)
    deleteVersionRow.mockResolvedValue('is_latest')

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'The latest version cannot be deleted' })
  })

  it('returns 404 when result is not_found', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)
    deleteVersionRow.mockResolvedValue('not_found')

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Version not found' })
  })

  it('returns 404 when result is wrong_parent', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)
    deleteVersionRow.mockResolvedValue('wrong_parent')

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Version not found' })
  })

  it('returns 500 when deleteVersionRow throws an error', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true })
    isVersionedCollection.mockReturnValue(true)
    deleteVersionRow.mockRejectedValue(new Error('Database error'))

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal server error' })
  })

  it('returns 500 when getAdminContext throws', async () => {
    getAdminContext.mockRejectedValue(new Error('Auth error'))

    const request = new Request('http://x/api/admin-version-delete?collection=pages&parent=3&id=7', {
      method: 'DELETE',
    })

    const response = await DELETE(request)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal server error' })
  })
})
