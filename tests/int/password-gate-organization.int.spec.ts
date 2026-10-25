import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getDb: vi.fn(),
  getPasswordHash: vi.fn(),
  getAccessRule: vi.fn(),
  getGroup: vi.fn(),
  settings: vi.fn(),
  orgGateInfo: vi.fn(),
  cookieValue: undefined as string | undefined,
}))

vi.mock('@/cms/db/connect', () => ({ getDb: m.getDb }))
vi.mock('@/cms/db/contentPasswords', () => ({ getPasswordHash: m.getPasswordHash }))
vi.mock('@/cms/db/passwordGroups', () => ({ getAccessRule: m.getAccessRule, getGroup: m.getGroup }))
vi.mock('@/features/security/settings', () => ({ readSecuritySettingsFromD1: m.settings }))
vi.mock('@/features/organizations/visibility', () => ({
  orgGateLocked: async () => false,
  orgGateInfo: m.orgGateInfo,
  listOrgRestrictedIdsLive: async () => new Set<number>(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => (n === 'engage-token' && m.cookieValue ? { value: m.cookieValue } : undefined) }) }))

import { getGateOptions } from '@/features/visibility/gate'
import { PasswordGate } from '@/components/PasswordGate'

beforeEach(() => {
  vi.clearAllMocks()
  m.cookieValue = undefined
  m.getDb.mockResolvedValue({})
  m.getPasswordHash.mockResolvedValue(null)
  m.getAccessRule.mockResolvedValue(null)
  m.settings.mockResolvedValue({ passwordGroups: { enabled: true } })
  m.orgGateInfo.mockResolvedValue(null)
})

const render = async (offer?: { signIn: boolean; password: boolean; org?: { name: string } }) =>
  renderToStaticMarkup(await PasswordGate({ collection: 'posts', id: 5, currentPath: '/blog/x', offer }))

describe('password gate with an organisation restriction', () => {
  it('offers sign-in only, with the organisation name, while the restriction locks the visitor out', async () => {
    m.orgGateInfo.mockResolvedValue({ name: 'Acme' })
    m.getPasswordHash.mockResolvedValue('pbkdf2$100000$salt$0123456789abcdef0123456789abcdef')
    m.cookieValue = 'tok'
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: true, password: false, org: { name: 'Acme' } })
    expect(m.orgGateInfo).toHaveBeenCalledWith('posts', 5, 'tok')
  })

  it('falls back to the normal options once the restriction no longer locks, or when its lookup fails', async () => {
    m.getPasswordHash.mockResolvedValue('pbkdf2$100000$salt$0123456789abcdef0123456789abcdef')
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: false, password: true })
    m.orgGateInfo.mockRejectedValue(new Error('db down'))
    expect(await getGateOptions({ collection: 'posts', id: 5 })).toEqual({ signIn: false, password: true })
  })

  it('renders a members-only state without a password form', async () => {
    const html = await render({ signIn: true, password: false, org: { name: 'Acme' } })
    expect(html).toContain('Members of Acme only')
    expect(html).toContain('href="/account/sign-in?redirect=%2Fblog%2Fx"')
    expect(html).not.toContain('type="password"')
    expect(html).not.toContain('Unlock')
  })

  it('never shows a password form for an organisation page even if the offer says a password applies', async () => {
    const html = await render({ signIn: true, password: true, org: { name: 'Acme' } })
    expect(html).toContain('Members of Acme only')
    expect(html).not.toContain('type="password"')
  })

  it('keeps the password form for ordinary password pages', async () => {
    const html = await render({ signIn: false, password: true })
    expect(html).toContain('Password protected')
    expect(html).toContain('type="password"')
  })
})
