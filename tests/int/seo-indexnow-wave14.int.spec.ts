import { describe, it, expect, vi } from 'vitest'
import { buildIndexNowPayload, sendIndexNow, INDEXNOW_ENDPOINT, INDEXNOW_MAX_URLS } from '@/features/seo/indexNowPayload'
import { indexNowKeyBeforeChange, isValidIndexNowKey, newIndexNowKey } from '@/features/seo/indexNowKey'

const KEY = '0123456789abcdef0123456789abcdef'
const HOST = 'example.com'

describe('buildIndexNowPayload', () => {
  it('keeps https URLs on the site host and points keyLocation at the key file', () => {
    const payload = buildIndexNowPayload(HOST, KEY, ['https://example.com/blog/hello', 'https://example.com/shop/mug'])
    expect(payload).toEqual({
      host: HOST,
      key: KEY,
      keyLocation: 'https://example.com/indexnow-key.txt',
      urlList: ['https://example.com/blog/hello', 'https://example.com/shop/mug'],
    })
  })

  it('drops other hosts, plain http, malformed URLs and duplicates', () => {
    const payload = buildIndexNowPayload(HOST, KEY, [
      'https://other.com/x',
      'http://example.com/http-only',
      'not a url',
      'https://example.com/a',
      'https://example.com/a',
    ])
    expect(payload?.urlList).toEqual(['https://example.com/a'])
  })

  it('caps the list at the per-request maximum', () => {
    const urls = Array.from({ length: INDEXNOW_MAX_URLS + 25 }, (_, i) => `https://example.com/p/${i}`)
    expect(buildIndexNowPayload(HOST, KEY, urls)?.urlList).toHaveLength(INDEXNOW_MAX_URLS)
  })

  it('returns null when there is nothing valid to send or the key is malformed', () => {
    expect(buildIndexNowPayload(HOST, KEY, [])).toBeNull()
    expect(buildIndexNowPayload(HOST, KEY, ['https://other.com/x'])).toBeNull()
    expect(buildIndexNowPayload(HOST, 'short', ['https://example.com/a'])).toBeNull()
    expect(buildIndexNowPayload('', KEY, ['https://example.com/a'])).toBeNull()
  })
})

describe('indexNowKeyBeforeChange', () => {
  it('creates a 32-character hex key when IndexNow is switched on with no key yet', () => {
    const data = indexNowKeyBeforeChange({ data: { indexNow: { enabled: true, key: null } }, originalDoc: null })
    const key = data?.indexNow?.key
    expect(isValidIndexNowKey(key)).toBe(true)
    expect(key).toMatch(/^[a-f0-9]{32}$/)
  })

  it('keeps an existing valid key and ignores a key sent in the request', () => {
    const data = indexNowKeyBeforeChange({
      data: { indexNow: { enabled: true, key: 'ffffffffffffffffffffffffffffffff' } },
      originalDoc: { indexNow: { enabled: true, key: KEY } },
    })
    expect(data?.indexNow?.key).toBe(KEY)
  })

  it('creates no key while IndexNow stays off', () => {
    const data = indexNowKeyBeforeChange({ data: { indexNow: { enabled: false } }, originalDoc: null })
    expect(data?.indexNow?.key).toBeNull()
  })

  it('replaces a stored key that is not valid when IndexNow is on', () => {
    const data = indexNowKeyBeforeChange({ data: { indexNow: { enabled: true } }, originalDoc: { indexNow: { key: 'bad' } } })
    expect(isValidIndexNowKey(data?.indexNow?.key)).toBe(true)
  })

  it('leaves data without an indexNow group alone', () => {
    const data = indexNowKeyBeforeChange({ data: { defaults: {} } as never, originalDoc: null })
    expect(data).toEqual({ defaults: {} })
  })

  it('generates keys that differ between calls', () => {
    expect(newIndexNowKey()).not.toBe(newIndexNowKey())
  })
})

describe('sendIndexNow', () => {
  const body = { enabled: true, key: KEY }
  const baseUrl = 'https://example.com'
  const urls = ['https://example.com/blog/hello']

  it('sends nothing when IndexNow is disabled', async () => {
    const fetchFn = vi.fn()
    const sent = await sendIndexNow({ enabled: false, key: KEY }, baseUrl, urls, fetchFn as unknown as typeof fetch)
    expect(sent).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('sends nothing when there is no key', async () => {
    const fetchFn = vi.fn()
    const sent = await sendIndexNow({ enabled: true, key: null }, baseUrl, urls, fetchFn as unknown as typeof fetch)
    expect(sent).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('posts one JSON request to the IndexNow endpoint when enabled', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const sent = await sendIndexNow(body, baseUrl, urls, fetchFn as unknown as typeof fetch)
    expect(sent).toBe(true)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe(INDEXNOW_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      host: HOST,
      key: KEY,
      keyLocation: 'https://example.com/indexnow-key.txt',
      urlList: urls,
    })
  })

  it('reports failure and never throws when the request fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(sendIndexNow(body, baseUrl, urls, fetchFn as unknown as typeof fetch)).resolves.toBe(false)
  })

  it('sends nothing when the site address is not a valid URL', async () => {
    const fetchFn = vi.fn()
    expect(await sendIndexNow(body, 'not a url', urls, fetchFn as unknown as typeof fetch)).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
