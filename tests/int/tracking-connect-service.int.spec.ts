// @vitest-environment node
/**
 * The connection steps end to end, against an in-memory engine and a mocked
 * provider: start, finish, list, pick, disconnect, app credentials. Also checks
 * that tokens are written only to the encrypted fields and never reach the
 * status the screen gets, and the encryption hook round trip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyPick } from '@/features/google/picks'
import type { GoogleEngine } from '@/features/google/auth'
import { openConnectFlow } from '@/features/tracking/connect/oauthCookie'
import type { Fetcher } from '@/features/tracking/connect/http'
import { disconnect, finishConnect, listPixelChoices, pickPixel, saveAppCredentials, startConnect, type ServiceDeps } from '@/features/tracking/connect/service'
import { toTrackingConnectionStatus } from '@/features/tracking/connect/status'
import type { ConnectEngine } from '@/features/tracking/connect/store'
import { decryptSecretHook, encryptSecretHook } from '@/utilities/secretField'

const SECRET = 'test-engage-secret-value'
const NOW = 1_800_000_000_000
const ORIGIN = 'https://shop.example.com'

/** An in-memory stand-in for the engine's findGlobal and updateGlobal. Records every write. */
function memoryEngine(initial: Record<string, Record<string, unknown>>) {
  const docs: Record<string, Record<string, unknown>> = structuredClone(initial)
  const writes: { slug: string; data: Record<string, unknown> }[] = []
  const engine = {
    findGlobal: async ({ slug }: { slug: string }) => ({ ...(docs[slug] ?? {}) }),
    updateGlobal: async ({ slug, data }: { slug: string; data: Record<string, unknown> }) => {
      writes.push({ slug, data: structuredClone(data) })
      docs[slug] = { ...(docs[slug] ?? {}), ...data }
      return docs[slug]
    },
  }
  return { engine: engine as unknown as ConnectEngine & GoogleEngine, docs, writes }
}

/** A fake provider: route text in the URL decides the answer. Unknown URLs fail the test. */
function providerFetch(routes: [string, unknown, number?][]): Fetcher {
  return async (input) => {
    const hit = routes.find(([match]) => input.includes(match))
    if (!hit) throw new Error(`unmocked call: ${input}`)
    return new Response(JSON.stringify(hit[1]), { status: hit[2] ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
}

const META_CONNECTED = {
  metaAppId: '1234567890',
  metaAppSecretEnc: 'meta-app-secret-value',
  metaAccessTokenEnc: 'LONG-META-TOKEN',
  metaAccountName: 'Ada Owner',
  metaConnectedAt: '2026-10-01T00:00:00.000Z',
  metaTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  metaError: '',
}

const META_PIXELS: [string, unknown][] = [
  ['me/adaccounts', { data: [{ id: 'act_111', name: 'Shop' }] }],
  ['adspixels', { data: [{ id: '123456789012', name: 'Main pixel' }] }],
]

function deps(engine: ConnectEngine & GoogleEngine, fetchImpl: Fetcher, secret = SECRET): ServiceDeps {
  return { engine, fetchImpl, secret, now: () => NOW }
}

describe('start a sign-in', () => {
  it('refuses without ENGAGE_SECRET, and without a saved app', async () => {
    const { engine } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    expect(await startConnect(deps(engine, providerFetch([]), ''), 'meta', ORIGIN)).toEqual({ ok: false, reason: 'no-secret' })
    const bare = memoryEngine({})
    expect(await startConnect(deps(bare.engine, providerFetch([])), 'meta', ORIGIN)).toEqual({ ok: false, reason: 'no-app' })
  })

  it('sends the browser to the provider with a signed state cookie that matches it', async () => {
    const { engine } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    const result = await startConnect(deps(engine, providerFetch([])), 'meta', ORIGIN)
    if (!result.ok) throw new Error('expected a start')
    const state = new URL(result.location).searchParams.get('state')!
    expect(result.location).toContain('redirect_uri=https%3A%2F%2Fshop.example.com%2Fapi%2Ftracking-connect%2Fmeta%2Fcallback')
    expect(result.cookie.name).toBe('eg_tracking_oauth_meta')
    expect(result.cookie.maxAge).toBe(600)
    expect(openConnectFlow(SECRET, result.cookie.value, state, 'meta', NOW)).not.toBeNull()
    expect(openConnectFlow(SECRET, result.cookie.value, 'someone-else', 'meta', NOW)).toBeNull()
  })
})

describe('finish a sign-in', () => {
  async function started(engine: ConnectEngine & GoogleEngine, fetchImpl: Fetcher) {
    const result = await startConnect(deps(engine, fetchImpl), 'meta', ORIGIN)
    if (!result.ok) throw new Error('expected a start')
    return { state: new URL(result.location).searchParams.get('state')!, cookie: result.cookie.value }
  }

  it('stores the token only in the encrypted field and the account name and time in plain fields', async () => {
    const fetchImpl = providerFetch([
      ['grant_type=fb_exchange_token', { access_token: 'LONG-META-TOKEN', expires_in: 5184000 }],
      ['oauth/access_token', { access_token: 'short', expires_in: 3600 }],
      ['/me?', { id: '42', name: 'Ada Owner' }],
    ])
    const { engine, docs, writes } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    const flow = await started(engine, fetchImpl)
    const result = await finishConnect(deps(engine, fetchImpl), 'meta', ORIGIN, { code: 'code-1', stateParam: flow.state, cookie: flow.cookie })
    expect(result).toEqual({ ok: true })
    const saved = writes.find((w) => 'metaAccessTokenEnc' in w.data)!.data
    expect(saved.metaAccessTokenEnc).toBe('LONG-META-TOKEN')
    expect(saved.metaAccountName).toBe('Ada Owner')
    expect(saved.metaConnectedAt).toBe(new Date(NOW).toISOString())
    expect(saved.metaTokenExpiresAt).toBe(new Date(NOW + 5184000 * 1000).toISOString())
    expect(docs['tracking-connections'].metaError).toBe('')
  })

  it('rejects a callback whose state does not match, without calling the provider', async () => {
    const calls: string[] = []
    const fetchImpl: Fetcher = async (input) => {
      calls.push(input)
      return new Response('{}')
    }
    const { engine } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    const flow = await started(engine, providerFetch([]))
    const result = await finishConnect(deps(engine, fetchImpl), 'meta', ORIGIN, { code: 'c', stateParam: 'forged', cookie: flow.cookie })
    expect(result).toEqual({ ok: false, reason: 'state' })
    expect(calls).toHaveLength(0)
  })

  it('records a short reason when the provider refuses the code, and stores no token', async () => {
    const fetchImpl = providerFetch([['oauth/access_token', { error: { message: 'bad code' } }, 400]])
    const { engine, docs } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    const flow = await started(engine, providerFetch([]))
    const result = await finishConnect(deps(engine, fetchImpl), 'meta', ORIGIN, { code: 'c', stateParam: flow.state, cookie: flow.cookie })
    expect(result).toEqual({ ok: false, reason: 'refused' })
    expect(docs['tracking-connections'].metaError).toBe('refused')
    expect(docs['tracking-connections'].metaAccessTokenEnc).toBe('LONG-META-TOKEN')
  })
})

describe('list and pick a pixel', () => {
  it('lists pixels and refuses a pick that is not on the fresh list', async () => {
    const { engine } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    const fetchImpl = providerFetch(META_PIXELS)
    const listed = await listPixelChoices(deps(engine, fetchImpl), 'meta')
    expect(listed).toEqual({ ok: true, items: [{ value: '123456789012', label: 'Main pixel (123456789012) - Shop' }] })
    expect(await pickPixel(deps(engine, fetchImpl), 'meta', '999999999999')).toEqual({ ok: false, reason: 'not-listed' })
  })

  it('rejects a value that is not an ID shape before calling the provider', async () => {
    const { engine } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    const fetchImpl: Fetcher = async () => {
      throw new Error('should not be called')
    }
    expect(await pickPixel(deps(engine, fetchImpl), 'meta', 'not-an-id')).toEqual({ ok: false, reason: 'bad-value' })
  })

  it('saves the chosen pixel to Integrations, replaces the old ID and keeps the other settings', async () => {
    const { engine, docs } = memoryEngine({
      'tracking-connections': META_CONNECTED,
      integrations: { metaPixel: { enabled: false, consentCategory: 'analytics', pixelId: '111111111111' } },
    })
    const result = await pickPixel(deps(engine, providerFetch(META_PIXELS)), 'meta', '123456789012')
    expect(result).toEqual({ ok: true, pixelId: '123456789012', previous: '111111111111', replaced: true })
    expect(docs.integrations.metaPixel).toEqual({ enabled: false, consentCategory: 'analytics', pixelId: '123456789012' })
  })

  it('says the sign-in has expired instead of calling the provider with a lapsed token', async () => {
    const { engine } = memoryEngine({
      'tracking-connections': { ...META_CONNECTED, metaTokenExpiresAt: new Date(NOW - 1000).toISOString() },
    })
    const fetchImpl: Fetcher = async () => {
      throw new Error('should not be called')
    }
    expect(await listPixelChoices(deps(engine, fetchImpl), 'meta')).toEqual({ ok: false, reason: 'expired' })
  })

  it('needs a sign-in before it can list', async () => {
    const { engine } = memoryEngine({ 'tracking-connections': { metaAppId: '1234567890', metaAppSecretEnc: 'secret-value-here' } })
    expect(await listPixelChoices(deps(engine, providerFetch([])), 'meta')).toEqual({ ok: false, reason: 'not-connected' })
  })
})

describe('disconnect and app credentials', () => {
  it('revokes at Meta, deletes the token, keeps the app and the Integrations ID', async () => {
    const revoked: string[] = []
    const fetchImpl: Fetcher = async (input, init) => {
      if (init?.method === 'DELETE') revoked.push(input)
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    const { engine, docs } = memoryEngine({
      'tracking-connections': META_CONNECTED,
      integrations: { metaPixel: { pixelId: '123456789012' } },
    })
    const result = await disconnect(deps(engine, fetchImpl), 'meta')
    expect(result).toEqual({ ok: true, revokedAtProvider: true })
    expect(revoked).toHaveLength(1)
    const doc = docs['tracking-connections']
    expect(doc.metaAccessTokenEnc).toBe('')
    expect(doc.metaAccountName).toBe('')
    expect(doc.metaAppId).toBe('1234567890')
    expect(docs.integrations.metaPixel).toEqual({ pixelId: '123456789012' })
  })

  it('says so when a provider has no remote revoke (TikTok)', async () => {
    const { engine, docs } = memoryEngine({
      'tracking-connections': { tiktokAppId: '700', tiktokAppSecretEnc: 'tt-secret-value', tiktokAccessTokenEnc: 'TT-TOKEN', tiktokAccountName: 'x' },
    })
    expect(await disconnect(deps(engine, providerFetch([])), 'tiktok')).toEqual({ ok: true, revokedAtProvider: false })
    expect(docs['tracking-connections'].tiktokAccessTokenEnc).toBe('')
  })

  it('validates the app ID and secret shapes, keeps the secret when blank, and ends the sign-in when the app changes', async () => {
    const { engine, docs } = memoryEngine({ 'tracking-connections': META_CONNECTED })
    expect(await saveAppCredentials(deps(engine, providerFetch([])), 'meta', { appId: 'abc', appSecret: null })).toEqual({ ok: false, reason: 'bad-app' })
    expect(await saveAppCredentials(deps(engine, providerFetch([])), 'meta', { appId: '1234567890', appSecret: 'has space here' })).toEqual({ ok: false, reason: 'bad-app' })

    expect(await saveAppCredentials(deps(engine, providerFetch([])), 'meta', { appId: '1234567890', appSecret: null })).toEqual({ ok: true, signedOut: false })
    expect(docs['tracking-connections'].metaAppSecretEnc).toBe('meta-app-secret-value')

    expect(await saveAppCredentials(deps(engine, providerFetch([])), 'meta', { appId: '9999999999', appSecret: null })).toEqual({ ok: true, signedOut: true })
    expect(docs['tracking-connections'].metaAccessTokenEnc).toBe('')
    expect(docs['tracking-connections'].metaAppSecretEnc).toBe('meta-app-secret-value')
  })
})

describe('the status the screen gets', () => {
  it('reports connection facts and never a token or secret', () => {
    const status = toTrackingConnectionStatus(META_CONNECTED, { metaPixel: { pixelId: '123456789012' } })
    expect(status.meta).toMatchObject({ appId: '1234567890', hasAppSecret: true, connected: true, accountName: 'Ada Owner', currentPixelId: '123456789012' })
    expect(status.tiktok).toMatchObject({ connected: false, currentPixelId: '' })
    const json = JSON.stringify(status)
    expect(json).not.toContain('LONG-META-TOKEN')
    expect(json).not.toContain('meta-app-secret-value')
  })
})

describe('the encrypted token field', () => {
  beforeEach(() => {
    vi.stubEnv('ENGAGE_SECRET', SECRET)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('encrypts on write and decrypts on read, and fails closed for a different secret', () => {
    const stored = (encryptSecretHook as unknown as (a: { value: string }) => string)({ value: 'LONG-META-TOKEN' })
    expect(stored.startsWith('enc:v1:')).toBe(true)
    expect(stored).not.toContain('LONG-META-TOKEN')
    expect((decryptSecretHook as unknown as (a: { value: string }) => string)({ value: stored })).toBe('LONG-META-TOKEN')
    vi.stubEnv('ENGAGE_SECRET', 'a-different-secret-value')
    expect((decryptSecretHook as unknown as (a: { value: string }) => string)({ value: stored })).toBe('')
  })
})

describe('Google pick from the Tracking screen', () => {
  const GOOGLE_DOC = {
    clientId: '123456789012-abcdefgh.apps.googleusercontent.com',
    clientSecretEnc: 'GOCSPX-client-secret',
    refreshTokenEnc: 'google-refresh-token',
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      async (input: string) => {
        const url = String(input)
        const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
        if (url.includes('oauth2.googleapis.com/token')) return json({ access_token: 'g-access', expires_in: 3600 })
        if (url.includes('accountSummaries')) return json({ accountSummaries: [{ propertySummaries: [{ property: 'properties/555', displayName: 'Shop' }] }] })
        if (url.includes('properties/555/dataStreams')) return json({ dataStreams: [{ webStreamData: { measurementId: 'G-ABC123XYZ' } }] })
        throw new Error(`unmocked google call: ${url}`)
      },
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('replaces an existing GA4 ID on Integrations when the owner chose it here', async () => {
    const { engine, docs } = memoryEngine({
      'google-connection': GOOGLE_DOC,
      integrations: { google: { ga4MeasurementId: 'G-OLD000000', gtmContainerId: '' } },
    })
    const result = await applyPick(engine, { kind: 'ga4', value: '555' }, { fill: 'replace' })
    expect(result).toMatchObject({ ok: true })
    expect((docs.integrations.google as Record<string, unknown>).ga4MeasurementId).toBe('G-ABC123XYZ')
    expect((docs['google-connection'] as Record<string, unknown>).ga4PropertyId).toBe('555')
  })

  it('keeps an existing GA4 ID on the Google connection screen (blank-only fill)', async () => {
    const { engine, docs } = memoryEngine({
      'google-connection': GOOGLE_DOC,
      integrations: { google: { ga4MeasurementId: 'G-OLD000000' } },
    })
    const result = await applyPick(engine, { kind: 'ga4', value: '555' })
    expect(result.ok && result.notes[0]).toContain('left as it is')
    expect((docs.integrations.google as Record<string, unknown>).ga4MeasurementId).toBe('G-OLD000000')
  })
})
