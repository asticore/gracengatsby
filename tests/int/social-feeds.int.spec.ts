// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ADAPTERS, fetchPosts, redact, validFeedUrl, youtubeFeedUrl } from '@/features/socialFeeds/adapters'
import { CAPTION_MAX } from '@/features/socialFeeds/parse'
import { clearFeedCache, getFeed, publicAccountList } from '@/features/socialFeeds/service'
import type { SocialAccount } from '@/features/socialFeeds/types'
import { SITE_ELEMENT_TYPES } from '@/lib/elements/wave38Defs'
import { WAVE67_ELEMENTS } from '@/lib/elements/wave67Defs'
import { ELEMENTS } from '@/lib/elements/registry'
import { SocialFeedView, WAVE67_COMPONENTS } from '@/components/blocks/elements/Wave67Server'

const TOKEN = 'SECRET-TOKEN-123/abc+'
const acct = (over: Partial<SocialAccount> = {}): SocialAccount => ({ id: 'a1', provider: 'instagram', label: 'Shop', accountId: '1789', token: TOKEN, ...over })
const reply = (body: unknown, status = 200) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
const long = 'x'.repeat(500)

describe('social feed adapters', () => {
  it('parses instagram media, truncates captions and keeps only CDN images', async () => {
    const posts = await fetchPosts(acct(), 5, reply({ data: [
      { id: '1', caption: long, media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/a.jpg', permalink: 'https://www.instagram.com/p/1/', timestamp: '2024-01-02T03:04:05+0000', like_count: 7 },
      { id: '2', media_type: 'VIDEO', thumbnail_url: 'https://evil.example.com/t.jpg', permalink: 'https://www.instagram.com/p/2/' },
      { id: '3', media_type: 'IMAGE', media_url: 'https://x/y', permalink: 'javascript:alert(1)' },
    ] }))
    expect(posts).toHaveLength(2)
    expect(posts[0]!.caption.length).toBeLessThanOrEqual(CAPTION_MAX)
    expect(posts[0]!.likes).toBe(7)
    expect(posts[0]!.imageUrl).toContain('cdninstagram.com')
    expect(posts[1]!.imageUrl).toBe('')
    expect(posts[1]!.video).toBe(true)
  })

  it('parses facebook, pinterest and tiktok', async () => {
    const fb = await fetchPosts(acct({ provider: 'facebook' }), 5, reply({ data: [{ id: '9', message: 'hi', full_picture: 'https://scontent.xx.fbcdn.net/p.jpg', permalink_url: 'https://www.facebook.com/9', created_time: '2024-02-01T00:00:00+0000', reactions: { summary: { total_count: 4 } } }] }))
    expect(fb[0]).toMatchObject({ caption: 'hi', likes: 4 })
    const pin = await fetchPosts(acct({ provider: 'pinterest' }), 5, reply({ items: [{ id: '55', title: 'Pin', created_at: '2024-03-01T00:00:00', media: { media_type: 'image', images: { '600x': { url: 'https://i.pinimg.com/600x/a.jpg' } } } }] }))
    expect(pin[0]).toMatchObject({ url: 'https://www.pinterest.com/pin/55/', imageUrl: 'https://i.pinimg.com/600x/a.jpg' })
    const tt = await fetchPosts(acct({ provider: 'tiktok' }), 5, reply({ data: { videos: [{ id: 'v', video_description: 'clip', cover_image_url: 'https://p16.tiktokcdn.com/c.jpg', share_url: 'https://www.tiktok.com/@a/video/v', create_time: 1700000000, like_count: 3 }] } }))
    expect(tt[0]).toMatchObject({ video: true, likes: 3, caption: 'clip' })
    expect(tt[0]!.date.startsWith('2023-11')).toBe(true)
  })

  it('parses a YouTube Atom feed without a token', async () => {
    const xml = `<feed><entry><id>yt:video:abc</id><title>Hello &amp; welcome</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/><published>2024-04-01T10:00:00+00:00</published><media:group><media:thumbnail url="https://i2.ytimg.com/vi/abc/hqdefault.jpg" width="480"/><media:description>About us</media:description></media:group></entry></feed>`
    const posts = await fetchPosts(acct({ provider: 'youtube', accountId: 'UC' + 'a'.repeat(22), token: '' }), 5, reply(xml))
    expect(posts[0]).toMatchObject({ url: 'https://www.youtube.com/watch?v=abc', imageUrl: 'https://i2.ytimg.com/vi/abc/hqdefault.jpg', video: true })
    expect(posts[0]!.caption).toContain('Hello & welcome')
  })

  it('parses RSS, keeping images only from the feed site', async () => {
    const xml = `<rss><channel><item><title>Post</title><link>https://blog.example.com/p</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><description><![CDATA[<p>Body <img src="https://cdn.example.com/i.png"></p>]]></description></item><item><title>Other</title><link>https://blog.example.com/q</link><enclosure url="https://tracker.test/i.png" type="image/png"/></item></channel></rss>`
    const posts = await fetchPosts(acct({ provider: 'rss', accountId: 'https://blog.example.com/feed.xml', token: '' }), 5, reply(xml))
    expect(posts).toHaveLength(2)
    expect(posts[0]!.imageUrl).toBe('https://cdn.example.com/i.png')
    expect(posts[1]!.imageUrl).toBe('')
  })

  it('never puts the token in an error, even when the provider echoes it', async () => {
    const failing = async () => { throw new Error(`boom ${TOKEN} ${encodeURIComponent(TOKEN)}`) }
    const err = await fetchPosts(acct(), 5, failing).catch((e: Error) => e)
    expect((err as Error).message).not.toContain(TOKEN)
    expect((err as Error).message).not.toContain(encodeURIComponent(TOKEN))
    expect(redact(`a ${TOKEN}`, TOKEN)).toBe('a ***')
  })

  it('treats bad responses as errors or empty results', async () => {
    await expect(fetchPosts(acct(), 5, reply('nope', 500))).rejects.toThrow(/500/)
    expect(await fetchPosts(acct(), 5, reply('not json'))).toEqual([])
    expect(await fetchPosts(acct(), 5, reply({ data: 'x' }))).toEqual([])
    await expect(fetchPosts(acct({ token: '' }), 5, reply({}))).rejects.toThrow(/token/)
    await expect(fetchPosts(acct({ provider: 'rss', accountId: 'http://127.0.0.1/feed' }), 5, reply('<rss/>'))).rejects.toThrow()
  })

  it('validates feed and YouTube ids', () => {
    expect(validFeedUrl('https://example.com/feed')).toBeTruthy()
    for (const bad of ['http://example.com/f', 'https://localhost/f', 'https://10.0.0.1/f', 'https://u:p@example.com/f', 'file:///etc/passwd', 'https://printer.local/f']) expect(validFeedUrl(bad)).toBe('')
    expect(youtubeFeedUrl('UC' + 'a'.repeat(22))).toContain('channel_id=')
    expect(youtubeFeedUrl('PL' + 'a'.repeat(20))).toContain('playlist_id=')
    expect(youtubeFeedUrl('../x')).toBe('')
  })

  it('sends the instagram token in the query and pinterest in a header, only to allow-listed hosts', () => {
    const ig = ADAPTERS.instagram.buildRequest(acct(), 5)
    expect(new URL(ig.url).hostname).toBe('graph.instagram.com')
    expect(ADAPTERS.pinterest.buildRequest(acct({ provider: 'pinterest' }), 5).init.headers?.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(ADAPTERS.tiktok.buildRequest(acct({ provider: 'tiktok' }), 99).init.body).toContain('"max_count":20')
  })
})

describe('social feed cache', () => {
  beforeEach(() => clearFeedCache())
  const ok = { data: [{ id: '1', media_type: 'IMAGE', media_url: 'https://a.cdninstagram.com/a.jpg', permalink: 'https://www.instagram.com/p/1/' }] }

  it('reuses a fresh result and serves the last good copy when the provider fails', async () => {
    const fn = vi.fn(reply(ok))
    const t0 = 1_000_000
    expect(await getFeed(acct(), fn as never, t0)).toHaveLength(1)
    expect(await getFeed(acct(), fn as never, t0 + 60_000)).toHaveLength(1)
    expect(fn).toHaveBeenCalledTimes(1)
    const bad = vi.fn(reply('x', 500))
    expect(await getFeed(acct(), bad as never, t0 + 31 * 60_000)).toHaveLength(1)
    expect(bad).toHaveBeenCalledTimes(1)
  })

  it('returns an empty list when there is nothing cached and the provider fails', async () => {
    expect(await getFeed(acct({ id: 'z' }), reply('x', 500) as never)).toEqual([])
  })

  it('lists accounts by id and label only', () => {
    const list = publicAccountList([acct()])
    expect(JSON.stringify(list)).not.toContain(TOKEN)
    expect(list).toEqual([{ value: 'a1', label: 'Shop (instagram)' }])
  })
})

describe('social-feed element', () => {
  it('is registered as a server element with limits and defaults', () => {
    expect(WAVE67_ELEMENTS.map((e) => e.type)).toEqual(['social-feed'])
    expect(SITE_ELEMENT_TYPES.has('social-feed')).toBe(true)
    expect(ELEMENTS.some((e) => e.type === 'social-feed')).toBe(true)
    expect(WAVE67_COMPONENTS['social-feed']).toBeTypeOf('function')
    const limit = WAVE67_ELEMENTS[0]!.fields.find((f) => f.name === 'limit')!
    expect(limit.max).toBe(24)
    expect(WAVE67_ELEMENTS[0]!.fields.find((f) => f.name === 'account')!.optionsUrl).toBe('/api/admin-social-accounts')
  })

  it('renders cards that link out safely, honour the limit and carry no token', () => {
    const posts = Array.from({ length: 30 }, (_, i) => ({ id: String(i), url: `https://www.instagram.com/p/${i}/`, imageUrl: 'https://a.cdninstagram.com/a.jpg', caption: `c${i}`, date: '2024-01-02T03:04:05.000Z', likes: 2, video: false }))
    const html = renderToStaticMarkup(SocialFeedView({ posts, props: { limit: 99, showDate: true, showLikes: true } }) as never)
    expect(html.match(/<li /g)).toHaveLength(24)
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('2024-01-02')
    expect(html).toContain('2 likes')
  })

  it('renders nothing for no posts', () => {
    expect(SocialFeedView({ posts: [], props: {} })).toBeNull()
  })
})
