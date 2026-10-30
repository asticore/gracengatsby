// @vitest-environment node
/**
 * The Meta and TikTok provider clients, with the provider's answers mocked. No
 * test calls the live APIs. Each test checks the request shape and the mapping
 * of the answer, and that the access token never travels in a URL.
 */
import { describe, expect, it } from 'vitest'

import { ProviderError, clientFor } from '@/features/tracking/connect/providers'
import { mapAdAccounts, mapAdsPixels } from '@/features/tracking/connect/providers/meta'
import { mapAdvertisers, mapTikTokPixels } from '@/features/tracking/connect/providers/tiktok'
import type { Fetcher } from '@/features/tracking/connect/http'

type Reply = { status?: number; body: unknown } | { throws: true }
type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined }

/** A fake fetch: the first route whose match text appears in the URL answers. Every call is recorded. */
function fakeFetch(routes: [string, Reply][]): { fetchImpl: Fetcher; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl: Fetcher = async (input, init) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    calls.push({ url: input, method: init?.method ?? 'GET', headers, body: typeof init?.body === 'string' ? init.body : undefined })
    const hit = routes.find(([match]) => input.includes(match))
    if (!hit) throw new Error(`unmocked call: ${input}`)
    const reply = hit[1]
    if ('throws' in reply) throw new TypeError('network down')
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
  return { fetchImpl, calls }
}

const REDIRECT = 'https://shop.example.com/api/tracking-connect/meta/callback'

describe('Meta client', () => {
  const meta = clientFor('meta')

  it('builds a read-only Facebook login address with the state and no secret', () => {
    const url = meta.authorizeUrl({ appId: '1234567890', redirectUri: REDIRECT, state: 'st-1' })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth')
    expect(parsed.searchParams.get('client_id')).toBe('1234567890')
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(parsed.searchParams.get('state')).toBe('st-1')
    expect(parsed.searchParams.get('scope')).toBe('business_management,ads_read')
    expect(url).not.toMatch(/client_secret/)
  })

  it('exchanges the code, swaps to a long-lived token and reads the account name', async () => {
    const { fetchImpl, calls } = fakeFetch([
      ['grant_type=fb_exchange_token', { body: { access_token: 'long-token', expires_in: 5184000 } }],
      ['oauth/access_token', { body: { access_token: 'short-token', expires_in: 3600 } }],
      ['/me?', { body: { id: '42', name: 'Ada Owner' } }],
    ])
    const tokens = await meta.exchangeCode({ appId: '1234567890', appSecret: 'shh-secret-value', code: 'code-1', redirectUri: REDIRECT, fetchImpl })
    expect(tokens).toEqual({ accessToken: 'long-token', expiresInSeconds: 5184000, accountName: 'Ada Owner' })
    expect(calls[0].url).toContain('code=code-1')
    expect(calls[0].url).toContain('client_secret=shh-secret-value')
    // The /me call sends the token as a header, never in the address.
    const me = calls.find((c) => c.url.includes('/me?'))!
    expect(me.headers.Authorization).toBe('Bearer long-token')
    expect(me.url).not.toContain('long-token')
  })

  it('keeps the short-lived token when the long-lived swap is refused', async () => {
    const { fetchImpl } = fakeFetch([
      ['grant_type=fb_exchange_token', { status: 400, body: { error: { message: 'nope' } } }],
      ['oauth/access_token', { body: { access_token: 'short-token', expires_in: 3600 } }],
      ['/me?', { body: { id: '42', name: 'Ada' } }],
    ])
    const tokens = await meta.exchangeCode({ appId: '1', appSecret: 'shh-secret-value', code: 'c', redirectUri: REDIRECT, fetchImpl })
    expect(tokens.accessToken).toBe('short-token')
    expect(tokens.expiresInSeconds).toBe(3600)
  })

  it('maps a refused code to a refused reason and a dropped connection to a network reason', async () => {
    const refused = fakeFetch([['oauth/access_token', { status: 400, body: { error: { message: 'bad code' } } }]])
    await expect(meta.exchangeCode({ appId: '1', appSecret: 's', code: 'c', redirectUri: REDIRECT, fetchImpl: refused.fetchImpl })).rejects.toMatchObject({ reason: 'refused' })
    const down = fakeFetch([['oauth/access_token', { throws: true }]])
    await expect(meta.exchangeCode({ appId: '1', appSecret: 's', code: 'c', redirectUri: REDIRECT, fetchImpl: down.fetchImpl })).rejects.toMatchObject({ reason: 'network' })
  })

  it('lists pixels across ad accounts, de-duplicated, and sends the token as a header', async () => {
    const { fetchImpl, calls } = fakeFetch([
      ['me/adaccounts', { body: { data: [{ id: 'act_111', name: 'Shop' }, { id: 'act_222', name: 'Other' }] } }],
      ['act_111/adspixels', { body: { data: [{ id: '123456789012', name: 'Main pixel' }] } }],
      ['act_222/adspixels', { body: { data: [{ id: '123456789012', name: 'Main pixel' }, { id: '987654321098', name: 'Blog' }] } }],
    ])
    const items = await meta.listPixels({ appId: '1', accessToken: 'long-token', fetchImpl })
    expect(items).toEqual([
      { value: '123456789012', label: 'Main pixel (123456789012) - Shop' },
      { value: '987654321098', label: 'Blog (987654321098) - Other' },
    ])
    expect(calls.every((c) => !c.url.includes('long-token'))).toBe(true)
  })

  it('reports no-access when the account has no pixels', async () => {
    const { fetchImpl } = fakeFetch([
      ['me/adaccounts', { body: { data: [{ id: 'act_111', name: 'Shop' }] } }],
      ['adspixels', { body: { data: [] } }],
    ])
    await expect(meta.listPixels({ appId: '1', accessToken: 't', fetchImpl })).rejects.toMatchObject({ reason: 'no-access' })
  })

  it('revokes the sign-in with a DELETE on the permissions edge', async () => {
    const { fetchImpl, calls } = fakeFetch([['me/permissions', { body: { success: true } }]])
    expect(await meta.revoke({ appId: '1', appSecret: 's', accessToken: 'long-token', fetchImpl })).toBe(true)
    expect(calls[0].method).toBe('DELETE')
    expect(calls[0].headers.Authorization).toBe('Bearer long-token')
  })

  it('maps Graph answers defensively: bad IDs and non-list data are ignored', () => {
    expect(mapAdAccounts({ data: [{ id: 'act_1', name: 'A' }, { id: 'nope', name: 'B' }, 'junk'] })).toEqual([{ id: 'act_1', name: 'A' }])
    expect(mapAdAccounts({ data: 'not a list' })).toEqual([])
    expect(mapAdsPixels({ data: [{ id: 'abc', name: 'x' }, { id: '12345', name: '' }] }, '')).toEqual([{ value: '12345', label: 'Pixel (12345)' }])
  })
})

describe('TikTok client', () => {
  const tiktok = clientFor('tiktok')

  it('builds the TikTok for Business authorize address with the state and no secret', () => {
    const url = tiktok.authorizeUrl({ appId: '7000000000000000000', redirectUri: 'https://shop.example.com/api/tracking-connect/tiktok/callback', state: 'st-2' })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://business-api.tiktok.com/portal/auth')
    expect(parsed.searchParams.get('app_id')).toBe('7000000000000000000')
    expect(parsed.searchParams.get('state')).toBe('st-2')
    expect(url).not.toMatch(/secret/)
    expect(tiktok.codeParam).toBe('auth_code')
  })

  it('exchanges auth_code for a token and summarises the advertiser accounts', async () => {
    const { fetchImpl, calls } = fakeFetch([
      ['oauth2/access_token', { body: { code: 0, message: 'OK', data: { access_token: 'tt-token', advertiser_ids: ['111', '222'] } } }],
    ])
    const tokens = await tiktok.exchangeCode({ appId: '700', appSecret: 'tt-secret-value', code: 'auth-1', redirectUri: 'x', fetchImpl })
    expect(tokens).toEqual({ accessToken: 'tt-token', expiresInSeconds: null, accountName: '2 TikTok advertiser accounts' })
    expect(calls[0].method).toBe('POST')
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ app_id: '700', secret: 'tt-secret-value', auth_code: 'auth-1' })
  })

  it('treats a non-zero TikTok code as a refusal', async () => {
    const { fetchImpl } = fakeFetch([['oauth2/access_token', { body: { code: 40100, message: 'invalid code', data: {} } }]])
    await expect(tiktok.exchangeCode({ appId: '700', appSecret: 's', code: 'c', redirectUri: 'x', fetchImpl })).rejects.toMatchObject({ reason: 'refused' })
  })

  it('lists de-duplicated pixel codes per advertiser, with the token in a header only', async () => {
    const { fetchImpl, calls } = fakeFetch([
      ['oauth2/advertiser/get', { body: { code: 0, data: { list: [{ advertiser_id: '111', advertiser_name: 'Shop' }] } } }],
      ['pixel/list', { body: { code: 0, data: { pixels: [{ pixel_code: 'C1ABCDEF', name: 'Main' }, { pixel_code: 'C1ABCDEF', name: 'Main' }] } } }],
    ])
    const items = await tiktok.listPixels({ appId: '700', accessToken: 'tt-token', fetchImpl })
    expect(items).toEqual([{ value: 'C1ABCDEF', label: 'Main (C1ABCDEF) - Shop' }])
    expect(calls.every((c) => !c.url.includes('tt-token') && c.headers['Access-Token'] === 'tt-token')).toBe(true)
  })

  it('accepts the list-shaped pixel answer too, and rejects malformed codes', () => {
    expect(mapTikTokPixels({ code: 0, data: { list: [{ pixel_id: 'D2XYZ123', name: 'Blog' }] } }, '')).toEqual([{ value: 'D2XYZ123', label: 'Blog (D2XYZ123)' }])
    expect(mapTikTokPixels({ code: 0, data: { pixels: [{ pixel_code: 'x' }, { pixel_code: 'bad code!' }] } }, '')).toEqual([])
    expect(mapAdvertisers({ data: { list: [{ advertiser_id: 'a', advertiser_name: 'x' }] } })).toEqual([])
  })

  it('reports no-access when no advertiser has pixels, and cannot revoke remotely', async () => {
    const { fetchImpl } = fakeFetch([
      ['oauth2/advertiser/get', { body: { code: 0, data: { list: [{ advertiser_id: '111', advertiser_name: 'Shop' }] } } }],
      ['pixel/list', { body: { code: 0, data: { pixels: [] } } }],
    ])
    await expect(tiktok.listPixels({ appId: '700', accessToken: 't', fetchImpl })).rejects.toBeInstanceOf(ProviderError)
    await expect(tiktok.listPixels({ appId: '700', accessToken: 't', fetchImpl })).rejects.toMatchObject({ reason: 'no-access' })
    expect(await tiktok.revoke({ appId: '1', appSecret: 's', accessToken: 't', fetchImpl })).toBe(false)
  })
})
