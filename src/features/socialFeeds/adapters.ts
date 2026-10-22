import { count, isoDate, parseFeed, parseJson, safeHttpUrl, str, truncate } from './parse'
import type { SocialAccount, SocialAdapter, SocialPost, SocialProvider } from './types'

/**
 * One adapter per provider: how to build the request, which hosts it may talk to, and how to turn the answer into
 * SocialPost[]. X (Twitter) is deliberately absent: its API is paid-only.
 */

const enc = encodeURIComponent
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

const instagram: SocialAdapter = {
  provider: 'instagram',
  hosts: ['graph.instagram.com'],
  imageHosts: ['.cdninstagram.com', '.fbcdn.net'],
  buildRequest: (a, limit) => ({
    url: `https://graph.instagram.com/${enc(a.accountId || 'me')}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count&limit=${limit}&access_token=${enc(a.token)}`,
    init: { method: 'GET' },
  }),
  parse: (body) =>
    arr(parseJson(body).data).map((m): SocialPost => {
      const video = str(m.media_type) === 'VIDEO'
      return {
        id: str(m.id),
        url: safeHttpUrl(m.permalink),
        imageUrl: safeHttpUrl(video ? m.thumbnail_url : m.media_url),
        caption: truncate(str(m.caption)),
        date: isoDate(m.timestamp),
        likes: count(m.like_count),
        video,
      }
    }),
}

const facebook: SocialAdapter = {
  provider: 'facebook',
  hosts: ['graph.facebook.com'],
  imageHosts: ['.fbcdn.net', '.facebook.com'],
  buildRequest: (a, limit) => ({
    url: `https://graph.facebook.com/v19.0/${enc(a.accountId)}/posts?fields=id,message,full_picture,permalink_url,created_time,reactions.summary(true).limit(0)&limit=${limit}&access_token=${enc(a.token)}`,
    init: { method: 'GET' },
  }),
  parse: (body) =>
    arr(parseJson(body).data).map((m): SocialPost => ({
      id: str(m.id),
      url: safeHttpUrl(m.permalink_url),
      imageUrl: safeHttpUrl(m.full_picture),
      caption: truncate(str(m.message)),
      date: isoDate(m.created_time),
      likes: count(obj(obj(m.reactions).summary).total_count),
      video: false,
    })),
}

const pinterest: SocialAdapter = {
  provider: 'pinterest',
  hosts: ['api.pinterest.com'],
  imageHosts: ['.pinimg.com'],
  buildRequest: (a, limit) => ({
    url: `https://api.pinterest.com/v5/boards/${enc(a.accountId)}/pins?page_size=${limit}`,
    init: { method: 'GET', headers: { Authorization: `Bearer ${a.token}` } },
  }),
  parse: (body) =>
    arr(parseJson(body).items).map((p): SocialPost => {
      const images = obj(obj(p.media).images)
      const img = obj(images['600x'] ?? images['400x300'] ?? Object.values(images)[0])
      return {
        id: str(p.id),
        url: str(p.id) ? `https://www.pinterest.com/pin/${enc(str(p.id))}/` : '',
        imageUrl: safeHttpUrl(img.url),
        caption: truncate(str(p.title) || str(p.description)),
        date: isoDate(p.created_at),
        likes: null,
        video: str(obj(p.media).media_type) === 'video',
      }
    }),
}

const tiktok: SocialAdapter = {
  provider: 'tiktok',
  hosts: ['open.tiktokapis.com'],
  imageHosts: ['.tiktokcdn.com', '.tiktokcdn-us.com', '.tiktokv.com', '.tiktokv.us'],
  buildRequest: (a, limit) => ({
    url: 'https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,cover_image_url,share_url,create_time,like_count',
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: Math.min(limit, 20) }),
    },
  }),
  parse: (body) =>
    arr(obj(parseJson(body).data).videos).map((v): SocialPost => ({
      id: str(v.id),
      url: safeHttpUrl(v.share_url),
      imageUrl: safeHttpUrl(v.cover_image_url),
      caption: truncate(str(v.video_description) || str(v.title)),
      date: isoDate(v.create_time),
      likes: count(v.like_count),
      video: true,
    })),
}

/** A YouTube channel ID (UC...) or playlist ID (PL, UU, FL, OL...). Anything else is refused. */
export const youtubeFeedUrl = (id: string): string => {
  const v = id.trim()
  if (/^UC[\w-]{20,30}$/.test(v)) return `https://www.youtube.com/feeds/videos.xml?channel_id=${enc(v)}`
  if (/^(PL|UU|FL|OL|LL)[\w-]{10,60}$/.test(v)) return `https://www.youtube.com/feeds/videos.xml?playlist_id=${enc(v)}`
  return ''
}

const youtube: SocialAdapter = {
  provider: 'youtube',
  hosts: ['www.youtube.com'],
  imageHosts: ['.ytimg.com'],
  buildRequest: (a) => ({ url: youtubeFeedUrl(a.accountId), init: { method: 'GET' } }),
  parse: (body) => parseFeed(body).map((p) => ({ ...p, video: true })),
}

/** Public https feed URL on a real hostname: no credentials, no IP literals, no local names. */
export function validFeedUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    const h = u.hostname.toLowerCase()
    if (u.protocol !== 'https:' || u.username || u.password) return ''
    if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return ''
    if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return ''
    return u.toString()
  } catch {
    return ''
  }
}

const rss: SocialAdapter = {
  provider: 'rss',
  hosts: [],
  imageHosts: [],
  buildRequest: (a) => ({ url: validFeedUrl(a.accountId), init: { method: 'GET' } }),
  parse: (body) => parseFeed(body),
}

export const ADAPTERS: Record<SocialProvider, SocialAdapter> = { instagram, facebook, pinterest, tiktok, youtube, rss }

export const needsToken = (p: SocialProvider): boolean => p !== 'youtube' && p !== 'rss'

const hostMatches = (host: string, allowed: string[]): boolean =>
  allowed.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h))

/** The two last labels of a hostname, so an RSS feed on feeds.example.com may show images from cdn.example.com. */
const site = (host: string): string => host.split('.').slice(-2).join('.')

/** Keeps an image URL only when it comes from the provider's CDN (or, for RSS, the feed's own site) over https. */
export function allowedImage(adapter: SocialAdapter, account: SocialAccount, url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return ''
    const host = u.hostname.toLowerCase()
    if (adapter.provider === 'rss') {
      const feed = new URL(validFeedUrl(account.accountId))
      return site(host) === site(feed.hostname.toLowerCase()) ? url : ''
    }
    return hostMatches(host, adapter.imageHosts) ? url : ''
  } catch {
    return ''
  }
}

const TIMEOUT_MS = 6000
const MAX_BYTES = 1_500_000

/** Replaces the token (and its URL-encoded form) so nothing that reaches a log or response can carry it. */
export const redact = (text: string, token: string): string => (token ? text.split(token).join('***').split(enc(token)).join('***') : text)

export type FetchLike = (url: string, init: Record<string, unknown>) => Promise<Response>

/**
 * Fetches and parses posts for one account. Server-side only. Throws an Error whose message never contains the
 * token or the request URL. Hosts are checked against the provider allow-list before any request is made.
 */
export async function fetchPosts(account: SocialAccount, limit: number, fetchImpl: FetchLike = fetch as never): Promise<SocialPost[]> {
  const adapter = ADAPTERS[account.provider]
  if (!adapter) throw new Error('Unsupported provider')
  if (needsToken(account.provider) && !account.token) throw new Error('No access token saved for this account')
  const n = Math.max(1, Math.min(24, Math.floor(limit) || 12))
  const req = adapter.buildRequest(account, n)
  let host = ''
  try {
    const u = new URL(req.url)
    host = u.hostname.toLowerCase()
    if (u.protocol !== 'https:') host = ''
  } catch {
    host = ''
  }
  if (!host) throw new Error('This account has no valid address')
  if (adapter.provider !== 'rss' && !hostMatches(host, adapter.hosts)) throw new Error('Host is not allowed')

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(req.url, { ...req.init, signal: ctl.signal, redirect: 'error', headers: { Accept: '*/*', 'User-Agent': 'SiteSocialFeed/1.0', ...(req.init.headers || {}) } })
    if (!res.ok) throw new Error(`The provider answered with status ${res.status}`)
    const body = (await res.text()).slice(0, MAX_BYTES)
    return adapter
      .parse(body, account)
      .filter((p) => p.url)
      .slice(0, n)
      .map((p) => ({ ...p, imageUrl: allowedImage(adapter, account, p.imageUrl) }))
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Request failed'
    const message = ctl.signal.aborted ? 'The provider took too long to answer' : redact(raw, account.token)
    throw new Error(message.slice(0, 200))
  } finally {
    clearTimeout(timer)
  }
}
