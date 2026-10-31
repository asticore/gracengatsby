// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { embedShortLinksBeforeChange, embedShortLinksFor } from '@/features/embeds/hooks'
import { isForbiddenHost, MAX_HOPS, resolveEmbedShortLinks, resolveShortEmbedUrl, shortLinkProvider } from '@/features/embeds/shortLinks'
import { isShortLinkForProvider, resolveEmbedUrlForEditor } from '@/views/visualEditor/embedUrlResolve'

const redirect = (location: string, status = 301) => new Response(null, { status, headers: { location } })
const page = (status = 200) => new Response('<html></html>', { status, headers: { 'content-type': 'text/html' } })

/** A fetch mock that answers each call from a queue, and records the URLs it was asked for. */
function queueFetch(...answers: Array<Response | Error | ((signal: AbortSignal) => Promise<Response>)>) {
  const calls: string[] = []
  const init: Array<RequestInit | undefined> = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    calls.push(String(input))
    init.push(options)
    const next = answers.shift()
    if (!next) throw new Error('unexpected fetch')
    if (typeof next === 'function') return next(options?.signal as AbortSignal)
    if (next instanceof Error) throw next
    return next
  }) as unknown as typeof fetch
  return { fetchImpl, calls, init }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shortLinkProvider', () => {
  it('maps the three short-link hosts to their provider and ignores everything else', () => {
    expect(shortLinkProvider('https://vm.tiktok.com/ZSabc123/')).toBe('tiktok')
    expect(shortLinkProvider('https://vt.tiktok.com/ZSabc123/')).toBe('tiktok')
    expect(shortLinkProvider('https://pin.it/4Qx9Zs')).toBe('pinterest')
    expect(shortLinkProvider('https://on.soundcloud.com/AbC123')).toBe('soundcloud')
    expect(shortLinkProvider('https://www.tiktok.com/@user/video/7234567890123456789')).toBeNull()
    expect(shortLinkProvider('not a url')).toBeNull()
    expect(shortLinkProvider(42)).toBeNull()
  })
})

describe('isForbiddenHost', () => {
  it('refuses IP literals, localhost and internal names', () => {
    for (const host of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '192.168.1.1', '0x7f000001', '[::1]', 'localhost', 'a.localhost', 'printer.local', 'db.internal']) {
      expect(isForbiddenHost(host), host).toBe(true)
    }
    expect(isForbiddenHost('www.tiktok.com')).toBe(false)
    expect(isForbiddenHost('pin.it')).toBe(false)
  })
})

describe('resolveShortEmbedUrl: successful chains', () => {
  it('follows a TikTok short link through two redirects to the video address', async () => {
    const { fetchImpl, calls, init } = queueFetch(
      redirect('https://www.tiktok.com/t/ZSabc123/'),
      redirect('https://www.tiktok.com/@creator/video/7234567890123456789?lang=en', 302),
    )
    const result = await resolveShortEmbedUrl('https://vm.tiktok.com/ZSabc123/', { fetchImpl })
    expect(result).toEqual({ ok: true, url: 'https://www.tiktok.com/@creator/video/7234567890123456789', changed: true })
    expect(calls).toEqual(['https://vm.tiktok.com/ZSabc123/', 'https://www.tiktok.com/t/ZSabc123/'])
    expect(init[0]?.redirect).toBe('manual')
  })

  it('resolves a pin.it link to the pin address', async () => {
    const { fetchImpl } = queueFetch(redirect('https://www.pinterest.com/pin/123456789012/'))
    const result = await resolveShortEmbedUrl('https://pin.it/4Qx9Zs', { fetchImpl })
    expect(result).toEqual({ ok: true, url: 'https://www.pinterest.com/pin/123456789012/', changed: true })
  })

  it('resolves an on.soundcloud.com link to the track address', async () => {
    const { fetchImpl } = queueFetch(redirect('https://soundcloud.com/artist-name/track-name', 302))
    const result = await resolveShortEmbedUrl('https://on.soundcloud.com/AbC123', { fetchImpl })
    expect(result).toEqual({ ok: true, url: 'https://soundcloud.com/artist-name/track-name', changed: true })
  })

  it('returns a non-short-link address unchanged without any request', async () => {
    const { fetchImpl } = queueFetch()
    const result = await resolveShortEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { fetchImpl })
    expect(result).toEqual({ ok: true, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', changed: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('resolveShortEmbedUrl: SSRF guard', () => {
  it('refuses a plain http short link without any request', async () => {
    const { fetchImpl } = queueFetch()
    const result = await resolveShortEmbedUrl('http://vm.tiktok.com/ZSabc123/', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a short link with credentials or a non-default port', async () => {
    const { fetchImpl } = queueFetch()
    expect((await resolveShortEmbedUrl('https://user:pw@vm.tiktok.com/ZS/', { fetchImpl })).ok).toBe(false)
    expect((await resolveShortEmbedUrl('https://vm.tiktok.com:8443/ZS/', { fetchImpl })).ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('stops at a redirect to a host outside the allowlist', async () => {
    const { fetchImpl, calls } = queueFetch(redirect('https://evil.example.com/steal'))
    const result = await resolveShortEmbedUrl('https://vm.tiktok.com/ZSabc123/', { fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'The link leads to a host that is not allowed for this embed.' })
    expect(calls).toHaveLength(1)
  })

  it('stops at a redirect to the cloud metadata address or a private address', async () => {
    const meta = queueFetch(redirect('http://169.254.169.254/latest/meta-data/'))
    expect((await resolveShortEmbedUrl('https://pin.it/4Qx9Zs', { fetchImpl: meta.fetchImpl })).ok).toBe(false)
    expect(meta.calls).toHaveLength(1)

    const priv = queueFetch(redirect('https://10.0.0.7/admin'))
    expect((await resolveShortEmbedUrl('https://on.soundcloud.com/AbC123', { fetchImpl: priv.fetchImpl })).ok).toBe(false)
    expect(priv.calls).toHaveLength(1)
  })

  it('refuses a redirect to a plain http address on an allowed host', async () => {
    const { fetchImpl } = queueFetch(redirect('http://www.tiktok.com/t/ZSabc123/'))
    const result = await resolveShortEmbedUrl('https://vm.tiktok.com/ZSabc123/', { fetchImpl })
    expect(result.ok).toBe(false)
  })

  it('refuses a redirect that has no Location header', async () => {
    const { fetchImpl } = queueFetch(new Response(null, { status: 301 }))
    const result = await resolveShortEmbedUrl('https://vm.tiktok.com/ZSabc123/', { fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'The link did not redirect to a page.' })
  })

  it('caps the number of hops', async () => {
    const answers = Array.from({ length: MAX_HOPS + 3 }, (_, i) => redirect(`https://www.tiktok.com/t/hop${i}/`))
    const { fetchImpl, calls } = queueFetch(...answers)
    const result = await resolveShortEmbedUrl('https://vm.tiktok.com/ZSabc123/', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(calls.length).toBeLessThanOrEqual(MAX_HOPS)
  })

  it('does not store anything when the final page is not embeddable', async () => {
    const { fetchImpl } = queueFetch(page(200))
    const result = await resolveShortEmbedUrl('https://vm.tiktok.com/ZSabc123/', { fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'The link did not lead to a page this embed can show.' })
  })

  it('gives up after the timeout', async () => {
    const hang = (signal: AbortSignal) =>
      new Promise<Response>((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    const { fetchImpl } = queueFetch(hang)
    const result = await resolveShortEmbedUrl('https://vm.tiktok.com/ZSabc123/', { fetchImpl, timeoutMs: 20 })
    expect(result).toEqual({ ok: false, reason: 'The link took too long to resolve.' })
  })

  it('reports a network error without throwing', async () => {
    const { fetchImpl } = queueFetch(new TypeError('network down'))
    const result = await resolveShortEmbedUrl('https://pin.it/4Qx9Zs', { fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'The link could not be resolved.' })
  })
})

describe('resolveEmbedShortLinks: blocks on save', () => {
  it('rewrites only the short-link embed elements, including nested ones, and does not mutate the input', async () => {
    const input = [
      { blockType: 'element', elementType: 'embed', props: { provider: 'tiktok', url: 'https://vm.tiktok.com/ZSabc123/', ratio: '16:9' } },
      {
        blockType: 'section',
        columns: [{ elements: [{ blockType: 'element', elementType: 'embed', props: { provider: 'soundcloud', url: 'https://on.soundcloud.com/AbC123' } }] }],
      },
      { blockType: 'element', elementType: 'embed', props: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' } },
      { blockType: 'element', elementType: 'embed', props: { provider: 'youtube', url: 'https://vm.tiktok.com/ZSabc123/' } },
    ]
    const snapshot = JSON.stringify(input)
    const { fetchImpl } = queueFetch(
      redirect('https://www.tiktok.com/@creator/video/7234567890123456789'),
      redirect('https://soundcloud.com/artist/track'),
    )
    const { value, resolved, failed } = await resolveEmbedShortLinks(input, { fetchImpl })
    const out = value as typeof input
    expect(resolved).toBe(2)
    expect(failed).toEqual([])
    expect((out[0]!.props as { url: string }).url).toBe('https://www.tiktok.com/@creator/video/7234567890123456789')
    expect(((out[1]!.columns as Array<{ elements: Array<{ props: { url: string } }> }>)[0]!.elements[0]!).props.url).toBe('https://soundcloud.com/artist/track')
    expect((out[2]!.props as { url: string }).url).toBe('https://youtu.be/dQw4w9WgXcQ')
    // A TikTok link on a YouTube element is a provider mismatch: left as typed, and no request for it.
    expect((out[3]!.props as { url: string }).url).toBe('https://vm.tiktok.com/ZSabc123/')
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('keeps the typed link and reports the reason when a resolution fails', async () => {
    const { fetchImpl } = queueFetch(redirect('https://evil.example.com/'))
    const input = [{ blockType: 'element', elementType: 'embed', props: { provider: 'tiktok', url: 'https://vm.tiktok.com/ZSabc123/' } }]
    const { value, resolved, failed } = await resolveEmbedShortLinks(input, { fetchImpl })
    expect(resolved).toBe(0)
    expect(failed).toHaveLength(1)
    expect(((value as typeof input)[0]!.props as { url: string }).url).toBe('https://vm.tiktok.com/ZSabc123/')
  })
})

describe('embedShortLinksBeforeChange', () => {
  it('returns the data with the resolved blocks', async () => {
    const data = { title: 'Gig', blocks: [{ blockType: 'element', elementType: 'embed', props: { provider: 'tiktok', url: 'https://vm.tiktok.com/ZSabc123/' } }] }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirect('https://www.tiktok.com/@c/video/7234567890123456789'))
    const out = (await embedShortLinksBeforeChange({ data })) as typeof data
    expect(out.title).toBe('Gig')
    expect((out.blocks[0]!.props as { url: string }).url).toBe('https://www.tiktok.com/@c/video/7234567890123456789')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the document has no blocks', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const data = { title: 'Plain' }
    expect(await embedShortLinksBeforeChange({ data })).toBe(data)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('embedShortLinksFor', () => {
  const tiktokBlock = (url: string) => ({ blockType: 'element', elementType: 'embed', props: { provider: 'tiktok', url } })
  const canonical = 'https://www.tiktok.com/@c/video/7234567890123456789'

  it.each(['introBlocks', 'layout', 'content'])('resolves short links in the %s field', async (field) => {
    const data = { title: 'Doc', [field]: [tiktokBlock('https://vm.tiktok.com/ZSabc123/')] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirect(canonical))
    const out = (await embedShortLinksFor(field)({ data })) as Record<string, unknown>
    expect(((out[field] as Array<{ props: { url: string } }>)[0]!.props).url).toBe(canonical)
    expect(out.title).toBe('Doc')
  })

  it('leaves other block fields alone', async () => {
    const other = [tiktokBlock('https://vm.tiktok.com/ZSabc123/')]
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const out = (await embedShortLinksFor('introBlocks')({ data: { blocks: other } })) as { blocks: unknown }
    expect(out.blocks).toBe(other)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps the link as typed when resolution fails', async () => {
    const link = 'https://vm.tiktok.com/ZSabc123/'
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'))
    const out = (await embedShortLinksFor('layout')({ data: { layout: [tiktokBlock(link)] } })) as { layout: Array<{ props: { url: string } }> }
    expect(out.layout[0]!.props.url).toBe(link)
  })
})

describe('isShortLinkForProvider', () => {
  it('matches a short link only for its own provider', () => {
    expect(isShortLinkForProvider('https://vm.tiktok.com/ZSabc123/', 'tiktok')).toBe(true)
    expect(isShortLinkForProvider('https://pin.it/abc', 'pinterest')).toBe(true)
    expect(isShortLinkForProvider('https://vm.tiktok.com/ZSabc123/', 'pinterest')).toBe(false)
    expect(isShortLinkForProvider('https://www.tiktok.com/@c/video/1', 'tiktok')).toBe(false)
    expect(isShortLinkForProvider(undefined, 'tiktok')).toBe(false)
  })
})

describe('resolveEmbedUrlForEditor', () => {
  const link = 'https://vm.tiktok.com/ZSabc123/'
  const canonical = 'https://www.tiktok.com/@c/video/7234567890123456789'
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('returns the canonical address the server resolved', async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true, url: canonical, changed: true }))
    expect(await resolveEmbedUrlForEditor(link, fetchImpl as unknown as typeof fetch)).toBe(canonical)
    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/admin-embed-resolve')
    expect(JSON.parse(String(init.body))).toEqual({ url: link })
  })

  it('returns null when the server did not change the address', async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true, url: canonical, changed: false }))
    expect(await resolveEmbedUrlForEditor(canonical, fetchImpl as unknown as typeof fetch)).toBeNull()
  })

  it('stays silent on refusal, failure or network error', async () => {
    expect(await resolveEmbedUrlForEditor(link, vi.fn(async () => json({ ok: false, error: 'x' }, 422)) as unknown as typeof fetch)).toBeNull()
    expect(await resolveEmbedUrlForEditor(link, vi.fn(async () => json({ ok: false }, 403)) as unknown as typeof fetch)).toBeNull()
    expect(await resolveEmbedUrlForEditor(link, vi.fn(async () => { throw new TypeError('network') }) as unknown as typeof fetch)).toBeNull()
  })
})

