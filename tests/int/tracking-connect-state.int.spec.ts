// @vitest-environment node
/**
 * The signed OAuth state for the Meta and TikTok sign-ins: sealing, opening,
 * tampering, provider mismatch, expiry, and the PKCE challenge. Pure functions.
 */
import { describe, expect, it } from 'vitest'

import { CONNECT_STATE_MAX_AGE_MS, openConnectFlow, pkceChallengeFor, sealConnectFlow, type ConnectFlow } from '@/features/tracking/connect/oauthCookie'
import { connectRedirectUri, isConnectProvider, stateCookieName } from '@/features/tracking/connect/constants'

const SECRET = 'test-engage-secret-value'
const NOW = 1_800_000_000_000

const flow = (overrides: Partial<ConnectFlow> = {}): ConnectFlow => ({ p: 'meta', s: 'state-abc', v: 'verifier-xyz', r: 'tracking', iat: NOW, ...overrides })

describe('tracking connect state cookie', () => {
  it('opens a fresh cookie when the state parameter and provider match', () => {
    const cookie = sealConnectFlow(SECRET, flow())
    expect(openConnectFlow(SECRET, cookie, 'state-abc', 'meta', NOW + 1000)).toEqual(flow())
  })

  it('refuses a state parameter that differs from the stored one', () => {
    const cookie = sealConnectFlow(SECRET, flow())
    expect(openConnectFlow(SECRET, cookie, 'state-other', 'meta', NOW)).toBeNull()
  })

  it('refuses a cookie sealed for another provider', () => {
    const cookie = sealConnectFlow(SECRET, flow({ p: 'tiktok' }))
    expect(openConnectFlow(SECRET, cookie, 'state-abc', 'meta', NOW)).toBeNull()
  })

  it('refuses a cookie whose payload was edited, even if the state matches', () => {
    const cookie = sealConnectFlow(SECRET, flow())
    const [payload, signature] = cookie.split('.')
    const forged = Buffer.from(JSON.stringify({ ...flow(), v: 'attacker' })).toString('base64url')
    expect(forged).not.toBe(payload)
    expect(openConnectFlow(SECRET, `${forged}.${signature}`, 'state-abc', 'meta', NOW)).toBeNull()
  })

  it('refuses a cookie signed with a different secret', () => {
    const cookie = sealConnectFlow('some-other-secret-value', flow())
    expect(openConnectFlow(SECRET, cookie, 'state-abc', 'meta', NOW)).toBeNull()
  })

  it('refuses a flow older than ten minutes', () => {
    const cookie = sealConnectFlow(SECRET, flow())
    expect(openConnectFlow(SECRET, cookie, 'state-abc', 'meta', NOW + CONNECT_STATE_MAX_AGE_MS)).not.toBeNull()
    expect(openConnectFlow(SECRET, cookie, 'state-abc', 'meta', NOW + CONNECT_STATE_MAX_AGE_MS + 1)).toBeNull()
  })

  it('refuses a flow issued in the future and a missing cookie or secret', () => {
    const cookie = sealConnectFlow(SECRET, flow({ iat: NOW + 60_000 }))
    expect(openConnectFlow(SECRET, cookie, 'state-abc', 'meta', NOW)).toBeNull()
    expect(openConnectFlow(SECRET, null, 'state-abc', 'meta', NOW)).toBeNull()
    expect(openConnectFlow('', sealConnectFlow(SECRET, flow()), 'state-abc', 'meta', NOW)).toBeNull()
  })

  it('refuses to seal without a secret', () => {
    expect(() => sealConnectFlow('', flow())).toThrow('no-secret')
  })

  it('matches the RFC 7636 PKCE S256 test vector', () => {
    expect(pkceChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('builds per-provider cookie names and redirect addresses without a trailing slash', () => {
    expect(stateCookieName('meta')).toBe('eg_tracking_oauth_meta')
    expect(stateCookieName('tiktok')).toBe('eg_tracking_oauth_tiktok')
    expect(connectRedirectUri('https://shop.example.com/', 'meta')).toBe('https://shop.example.com/api/tracking-connect/meta/callback')
    expect(isConnectProvider('meta')).toBe(true)
    expect(isConnectProvider('google')).toBe(false)
  })
})
