// @vitest-environment node
/**
 * Token refresh and the Google GET wrapper, with fetch mocked. Checks that the
 * access token is cached, that a refused refresh is reported in plain English,
 * and that a failed call throws GoogleApiError with a readable message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearGoogleTokenCache, getGoogleAccessToken, type GoogleEngine } from '@/features/google/auth'
import { GoogleApiError, googleGet } from '@/features/google/fetchJson'

type Doc = Record<string, unknown>

const connectedDoc = (overrides: Doc = {}): Doc => ({
  clientId: '123-abc.apps.googleusercontent.com',
  clientSecretEnc: 'client-secret-plain',
  refreshTokenEnc: 'refresh-plain',
  ...overrides,
})

const engineWith = (doc: Doc | null) => {
  const updateGlobal = vi.fn(async () => ({}))
  const findGlobal = vi.fn(async () => doc)
  return { engine: { findGlobal, updateGlobal } as unknown as GoogleEngine, updateGlobal, findGlobal }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('Google access token', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearGoogleTokenCache()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearGoogleTokenCache()
  })

  it('reports not-connected when there is no refresh token', async () => {
    const { engine } = engineWith(connectedDoc({ refreshTokenEnc: '' }))
    const result = await getGoogleAccessToken(engine)
    expect(result).toMatchObject({ ok: false, reason: 'not-connected' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes once and reuses the cached token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'access-1', expires_in: 3600 }))
    const { engine } = engineWith(connectedDoc())

    const first = await getGoogleAccessToken(engine)
    const second = await getGoogleAccessToken(engine)

    expect(first).toEqual({ ok: true, token: 'access-1' })
    expect(second).toEqual({ ok: true, token: 'access-1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const sent = new URLSearchParams(String(init.body))
    expect(sent.get('grant_type')).toBe('refresh_token')
    expect(sent.get('refresh_token')).toBe('refresh-plain')
    expect(sent.get('client_secret')).toBe('client-secret-plain')
  })

  it('does not reuse a token once it is within a minute of expiry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'short-lived', expires_in: 30 }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'fresh', expires_in: 3600 }))
    const { engine } = engineWith(connectedDoc())
    await getGoogleAccessToken(engine)
    const again = await getGoogleAccessToken(engine)
    expect(again).toEqual({ ok: true, token: 'fresh' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('explains a revoked sign-in and records it on the screen', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400))
    const { engine, updateGlobal } = engineWith(connectedDoc())

    const result = await getGoogleAccessToken(engine)

    expect(result).toMatchObject({ ok: false, reason: 'refresh-failed' })
    expect((result as { message: string }).message).toContain('Connect with Google again')
    expect(updateGlobal).toHaveBeenCalledWith(expect.objectContaining({ slug: 'google-connection', data: expect.objectContaining({ lastError: expect.any(String) }) }))
  })

  it('reports a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const { engine } = engineWith(connectedDoc())
    const result = await getGoogleAccessToken(engine)
    expect(result).toMatchObject({ ok: false, reason: 'refresh-failed' })
  })

  it('never returns a token when the client secret is missing', async () => {
    const { engine } = engineWith(connectedDoc({ clientSecretEnc: '' }))
    const result = await getGoogleAccessToken(engine)
    expect(result).toMatchObject({ ok: false, reason: 'refresh-failed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('googleGet', () => {
  beforeEach(() => {
    clearGoogleTokenCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearGoogleTokenCache()
  })

  it('sends the bearer token and the query parameters', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com/token')) return jsonResponse({ access_token: 'tok', expires_in: 3600 })
      return jsonResponse({ siteEntry: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { engine } = engineWith(connectedDoc())

    const body = await googleGet(engine, 'https://www.googleapis.com/webmasters/v3/sites', { pageSize: 5, skip: undefined })

    expect(body).toEqual({ siteEntry: [] })
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('https://www.googleapis.com/webmasters/v3/sites?pageSize=5')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('throws GoogleApiError with Google\'s own message on a refused call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('https://oauth2.googleapis.com/token')) return jsonResponse({ access_token: 'tok', expires_in: 3600 })
        return jsonResponse({ error: { message: 'API has not been used in this project.' } }, 403)
      }),
    )
    const { engine } = engineWith(connectedDoc())
    const error = await googleGet(engine, 'https://adsense.googleapis.com/v2/accounts').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GoogleApiError)
    expect(error).toMatchObject({ status: 403, message: 'API has not been used in this project.' })
  })

  it('throws a 401 GoogleApiError when Google is not connected', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { engine } = engineWith(connectedDoc({ refreshTokenEnc: '' }))
    const error = await googleGet(engine, 'https://www.googleapis.com/webmasters/v3/sites').catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
