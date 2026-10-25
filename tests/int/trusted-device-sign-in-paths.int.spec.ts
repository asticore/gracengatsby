// A remembered device must stand in for the second-step code on every sign-in path that
// reaches the engine: password (covered in auth-slice-3), social login and passwordless.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const loginAsUser = vi.fn(async () => ({ token: 'session-token' }))

vi.mock('@/lib/engine', () => ({ getEngine: async () => ({ loginAsUser }) }))
vi.mock('@/features/accounts/auth', () => ({ verificationRequired: async () => false }))
vi.mock('@/features/accounts/emails', () => ({ sendLoginCodeEmail: vi.fn(), sendMagicLinkEmail: vi.fn() }))

import { passwordlessDepsFor } from '@/features/accounts/passwordlessWiring'
import { defaultRuntime } from '@/features/socialLogin/runtime'
import { TRUSTED_DEVICE_COOKIE } from '@/features/security/trustedDevices'

beforeEach(() => {
  loginAsUser.mockClear()
})

describe('remembered device on social and passwordless sign-in', () => {
  it('social login hands the device cookie to the engine', async () => {
    const runtime = await defaultRuntime()
    const request = new Request('https://site.test/api/social/github/callback', {
      headers: { cookie: `other=1; ${TRUSTED_DEVICE_COOKIE}=device.token; x=2`, 'user-agent': 'UA' },
    })
    await runtime.login(7, request)
    expect(loginAsUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, client: expect.objectContaining({ trustedDeviceToken: 'device.token', userAgent: 'UA' }) }),
    )
  })

  it('social login sends no token when the request has no device cookie', async () => {
    const runtime = await defaultRuntime()
    await runtime.login(7, new Request('https://site.test/api/social/github/callback'))
    const call = loginAsUser.mock.calls[0] as unknown as [{ client: { trustedDeviceToken: unknown } }]
    expect(call[0].client.trustedDeviceToken).toBeNull()
  })

  it('passwordless deps pass the device cookie into the engine sign-in', async () => {
    const deps = await passwordlessDepsFor({} as never, { ip: '203.0.113.5', userAgent: 'UA', trustedDeviceToken: 'device.token' })
    expect(deps.client).toEqual({ userAgent: 'UA', ip: '203.0.113.5', trustedDeviceToken: 'device.token' })
  })
})
