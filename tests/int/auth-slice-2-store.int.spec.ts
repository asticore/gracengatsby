// @vitest-environment node
// The D1 SQL behind email verification tokens, against the local D1 with the migration applied.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import {
  consumeVerificationToken,
  latestVerificationSentAt,
  storeVerificationToken,
  voidVerificationTokens,
} from '@/features/security/emailVerificationStore'

const USER = 987654
const future = () => new Date(Date.now() + 3_600_000).toISOString()

describe('emailVerificationStore (D1)', { timeout: 60_000 }, () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy>>

  beforeAll(async () => {
    proxy = await getPlatformProxy()
    const mod = await import('@/migrations/20261121_100000_auth_slice_2')
    const { drizzle } = await import('drizzle-orm/d1')
    // eg_security_settings may not exist here; the migration skips columns when it is absent.
    await mod.up({ db: drizzle((proxy.env as { D1: D1Database }).D1) as never, engine: { logger: consoleLogger } } as never)
  })
  afterAll(async () => {
    await (proxy.env as { D1: D1Database }).D1.prepare('DELETE FROM `eg_email_verifications` WHERE user_id = ?').bind(USER).run()
    await proxy.dispose()
  })

  it('spends a token exactly once', async () => {
    await storeVerificationToken(USER, 'a@x.test', 'hash-once', future())
    expect(await consumeVerificationToken('hash-once')).toEqual({ userId: USER, email: 'a@x.test' })
    expect(await consumeVerificationToken('hash-once')).toBeNull()
  })

  it('refuses an expired token and an unknown one', async () => {
    await storeVerificationToken(USER, 'a@x.test', 'hash-expired', new Date(Date.now() - 1000).toISOString())
    expect(await consumeVerificationToken('hash-expired')).toBeNull()
    expect(await consumeVerificationToken('nope')).toBeNull()
    expect(await consumeVerificationToken('')).toBeNull()
  })

  it('a new token ends the older unused one, and the newest send time is readable', async () => {
    await storeVerificationToken(USER, 'a@x.test', 'hash-old', future(), new Date(Date.now() - 5000))
    await storeVerificationToken(USER, 'a@x.test', 'hash-new', future())
    expect(await consumeVerificationToken('hash-old')).toBeNull()
    const sentAt = await latestVerificationSentAt(USER)
    expect(Date.now() - Date.parse(sentAt as string)).toBeLessThan(10_000)
    expect(await consumeVerificationToken('hash-new')).not.toBeNull()
  })

  it('voiding ends every unused link for the account', async () => {
    await storeVerificationToken(USER, 'a@x.test', 'hash-void', future())
    await voidVerificationTokens(USER)
    expect(await consumeVerificationToken('hash-void')).toBeNull()
  })
})
