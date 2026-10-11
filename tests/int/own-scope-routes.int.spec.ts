import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext } = vi.hoisted(() => ({ getAdminContext: vi.fn() }))
const setSchedule = vi.hoisted(() => vi.fn(async () => {}))
const setPasswordHash = vi.hoisted(() => vi.fn(async () => {}))
const deleteVersionRow = vi.hoisted(() => vi.fn(async () => 'deleted'))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: { D1: {} } }) }))
vi.mock('drizzle-orm/d1', () => ({ drizzle: () => ({}) }))
vi.mock('@/cms/db/scheduledPublishes', () => ({ getSchedule: vi.fn(async () => null), setSchedule, clearSchedule: vi.fn() }))
vi.mock('@/cms/db/connect', () => ({ getDb: vi.fn(async () => ({})) }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash: vi.fn(async () => null), setPasswordHash, clearPassword: vi.fn() }))
vi.mock('@/features/speed/purge', () => ({ purgeCache: vi.fn(async () => ({})) }))
vi.mock('@/cms/db/versionDelete', () => ({ deleteVersionRow, isVersionedCollection: () => true }))
vi.mock('@/utilities/previewToken', () => ({ signPreviewToken: vi.fn(async () => 'tok') }))

import { PUT as schedulePut } from '@/app/(engage)/api/admin-schedule/route'
import { POST as passwordPost } from '@/app/(engage)/api/admin-visibility-password/route'
import { DELETE as versionDelete } from '@/app/(engage)/api/admin-version-delete/route'
import { GET as previewLink } from '@/app/(engage)/api/preview-link/route'

const user = { id: 5, roles: [] as string[], customRolePermissions: {
  pages: { read: true, update: true, scope: 'own' },
  'admin-schedule': { update: true }, 'admin-visibility-password': { update: true },
  'admin-version-delete': { delete: true }, 'versions.delete': { delete: true }, 'preview-link': { create: true },
} }
const ctx = (createdBy: number) => ({
  isAdmin: false,
  user,
  can: () => true,
  engine: { findByID: async () => ({ id: 1, createdBy }) },
})

const future = new Date(Date.now() + 86_400_000).toISOString()

describe('own-scoped users on feature routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('schedule: other people\'s page is refused, own page works', async () => {
    const req = () => new Request('http://x/api/admin-schedule', { method: 'PUT', body: JSON.stringify({ collection: 'pages', id: 1, publishAt: future }) })
    getAdminContext.mockResolvedValue(ctx(9))
    expect((await schedulePut(req())).status).toBe(403)
    expect(setSchedule).not.toHaveBeenCalled()
    getAdminContext.mockResolvedValue(ctx(5))
    expect((await schedulePut(req())).status).toBe(200)
  })
  it('visibility password: other people\'s page is refused', async () => {
    const req = () => new Request('http://x/api/admin-visibility-password', { method: 'POST', body: JSON.stringify({ collection: 'pages', id: 1, password: 'secret1' }) })
    getAdminContext.mockResolvedValue(ctx(9))
    expect((await passwordPost(req())).status).toBe(403)
    expect(setPasswordHash).not.toHaveBeenCalled()
    getAdminContext.mockResolvedValue(ctx(5))
    expect((await passwordPost(req())).status).toBe(200)
  })
  it('version delete: other people\'s page is refused', async () => {
    const req = () => new Request('http://x/api/admin-version-delete?collection=pages&parent=1&id=2', { method: 'DELETE' })
    getAdminContext.mockResolvedValue(ctx(9))
    expect((await versionDelete(req())).status).toBe(403)
    expect(deleteVersionRow).not.toHaveBeenCalled()
    getAdminContext.mockResolvedValue(ctx(5))
    expect((await versionDelete(req())).status).toBe(200)
  })
  it('preview link: other people\'s page is refused', async () => {
    const req = () => new Request('http://x/api/preview-link?collection=pages&id=1')
    getAdminContext.mockResolvedValue(ctx(9))
    expect((await previewLink(req())).status).toBe(403)
    getAdminContext.mockResolvedValue(ctx(5))
    expect((await previewLink(req())).status).toBe(200)
  })
})
