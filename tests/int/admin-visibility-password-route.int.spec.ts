import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST, DELETE } from '@/app/(engage)/api/admin-visibility-password/route'

// Mock modules
vi.mock('@/admin/auth')
vi.mock('@/cms/db/connect')
vi.mock('@/cms/db/contentPasswords')
vi.mock('@/features/visibility/password')
vi.mock('@/features/speed/purge')

describe('admin-visibility-password route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls purgeCache after setting password', async () => {
    const { purgeCache } = await import('@/features/speed/purge')
    const { getAdminContext } = await import('@/admin/auth')
    const { getDb } = await import('@/cms/db/connect')
    const { setPasswordHash } = await import('@/cms/db/contentPasswords')

    vi.mocked(getAdminContext).mockResolvedValue({
      can: vi.fn(() => true),
      isAdmin: true,
      user: {},
      permissions: {},
      engine: {},
    } as any)
    vi.mocked(getDb).mockResolvedValue({} as any)
    vi.mocked(setPasswordHash).mockResolvedValue(undefined)
    vi.mocked(purgeCache).mockResolvedValue({
      ran: true,
      paths: ['/1'],
      edgeEvicted: ['/1'],
      revalidated: [],
      errors: [],
    })

    const req = new Request('http://localhost/api/admin-visibility-password', {
      method: 'POST',
      body: JSON.stringify({ collection: 'pages', id: 1, password: 'test1234' }),
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
    expect(purgeCache).toHaveBeenCalledWith('/1')
  })

  it('does not fail request when purgeCache throws', async () => {
    const { purgeCache } = await import('@/features/speed/purge')
    const { getAdminContext } = await import('@/admin/auth')
    const { getDb } = await import('@/cms/db/connect')
    const { setPasswordHash } = await import('@/cms/db/contentPasswords')

    vi.mocked(getAdminContext).mockResolvedValue({
      can: vi.fn(() => true),
      isAdmin: true,
      user: {},
      permissions: {},
      engine: {},
    } as any)
    vi.mocked(getDb).mockResolvedValue({} as any)
    vi.mocked(setPasswordHash).mockResolvedValue(undefined)
    vi.mocked(purgeCache).mockRejectedValue(new Error('Cache unavailable'))

    const req = new Request('http://localhost/api/admin-visibility-password', {
      method: 'POST',
      body: JSON.stringify({ collection: 'pages', id: 1, password: 'test1234' }),
    })

    const response = await POST(req)
    expect(response.status).toBe(200) // Still succeeds
  })

  it('calls purgeCache after clearing password', async () => {
    const { purgeCache } = await import('@/features/speed/purge')
    const { getAdminContext } = await import('@/admin/auth')
    const { getDb } = await import('@/cms/db/connect')
    const { clearPassword } = await import('@/cms/db/contentPasswords')

    vi.mocked(getAdminContext).mockResolvedValue({
      can: vi.fn(() => true),
      isAdmin: true,
      user: {},
      permissions: {},
      engine: {},
    } as any)
    vi.mocked(getDb).mockResolvedValue({} as any)
    vi.mocked(clearPassword).mockResolvedValue(undefined)
    vi.mocked(purgeCache).mockResolvedValue({
      ran: true,
      paths: ['/1'],
      edgeEvicted: ['/1'],
      revalidated: [],
      errors: [],
    })

    const req = new Request('http://localhost/api/admin-visibility-password?collection=pages&id=1', {
      method: 'DELETE',
    })

    const response = await DELETE(req)
    expect(response.status).toBe(200)
    expect(purgeCache).toHaveBeenCalledWith('/1')
  })
})
