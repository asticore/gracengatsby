// @vitest-environment node
/**
 * The social login settings on a real engine and a real migrated D1: the group
 * saves and reads back, secrets are encrypted at rest, the switch is refused
 * server-side without credentials, and nothing is on by default.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveD1Binding } from '@/cms/db/connect'

import { consoleLogger } from '@/localapi/logger'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { createEngine, type Engine } from '@/localapi/engine'
import { readSocialConfig, usableProviders } from '@/features/socialLogin/settings'

describe('social login settings on a real engine', () => {
  let d1: D1Database
  let engine: Engine

  beforeAll(async () => {
    process.env.ENGAGE_SECRET = 'real-engine-social-secret'
    // The engine reads the app's own D1 binding, so migrate that one (idempotent).
    d1 = await resolveD1Binding()
    const outcome = await runInternalMigrate(d1, consoleLogger)
    expect(outcome.errorCount).toBe(0)
    engine = createEngine()
    // The local D1 persists between runs: start from a clean, switched-off state.
    await engine.updateGlobal({
      slug: 'security-settings',
      data: { socialLogin: { googleEnabled: false, googleClientId: '', googleClientSecret: '', appleClientId: '' } },
      overrideAccess: true,
    })
  }, 180_000)

  const save = (socialLogin: Record<string, unknown>) =>
    engine.updateGlobal({ slug: 'security-settings', data: { socialLogin }, overrideAccess: true })

  it('has every provider off by default, so nothing changes for an existing site', async () => {
    const config = await readSocialConfig(engine)
    expect(usableProviders(config)).toEqual([])
    expect(config.allowSignupViaSocial).toBe(true)
    expect(config.allowAdminSocialLogin).toBe(false)
  })

  it('refuses, on the server, to switch a provider on without its credentials and says what is missing', async () => {
    await expect(save({ googleEnabled: true })).rejects.toThrow(/Google sign-in cannot be switched on yet\. Save the client ID, client secret first\./)
    await expect(save({ googleEnabled: true, googleClientId: 'cid' })).rejects.toThrow(/client secret/)
    await expect(save({ appleEnabled: true, appleClientId: 'com.example' })).rejects.toThrow(/Team ID, Key ID, private key/)
    expect(usableProviders(await readSocialConfig(engine))).toEqual([])
  })

  it('saves credentials, then switches on; the secret is encrypted at rest and read back decrypted', async () => {
    await save({ googleClientId: 'cid-123', googleClientSecret: 'super-secret' })
    await save({ googleEnabled: true })
    const raw = (await d1.prepare('SELECT social_login_google_client_secret AS s, social_login_google_enabled AS e FROM eg_security_settings LIMIT 1').all()).results[0] as { s: string; e: number }
    expect(raw.s).toMatch(/^enc:v1:/)
    expect(raw.s).not.toContain('super-secret')
    expect(raw.e).toBe(1)
    const config = await readSocialConfig(engine)
    expect(config.providers.google.clientSecret).toBe('super-secret')
    expect(usableProviders(config).map((p) => p.id)).toEqual(['google'])
  })

  it('refuses a later save that would blank the secret of a provider that is on', async () => {
    await expect(save({ googleClientSecret: '' })).rejects.toThrow(/client secret/)
  })

  it('switching it off again is always allowed', async () => {
    await save({ googleEnabled: false })
    expect(usableProviders(await readSocialConfig(engine))).toEqual([])
  })
})
