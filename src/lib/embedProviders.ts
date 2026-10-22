import { EMBED_IFRAME_HOST } from '@/lib/embedHosts'

/**
 * Shared, pure parsing for the `embed` element (and the audio / video-playlist elements). Every iframe src is built
 * from a fixed template and ids that matched a strict pattern; the host the editor typed is never copied into a src.
 */

export const EMBED_PROVIDER_GROUPS = [
  { group: 'Video', providers: ['youtube', 'vimeo', 'tiktok'] },
  { group: 'Social', providers: ['instagram', 'x', 'facebook-post', 'facebook-video', 'facebook-page', 'pinterest', 'linkedin'] },
  { group: 'Audio', providers: ['spotify', 'soundcloud'] },
  { group: 'Other', providers: ['google-calendar', 'typeform', 'lottie', 'custom-iframe'] },
] as const

export const EMBED_PROVIDERS = EMBED_PROVIDER_GROUPS.flatMap((g) => g.providers) as unknown as readonly EmbedProvider[]
export type EmbedProvider =
  | 'youtube' | 'vimeo' | 'tiktok'
  | 'instagram' | 'x' | 'facebook-post' | 'facebook-video' | 'facebook-page' | 'pinterest' | 'linkedin'
  | 'spotify' | 'soundcloud'
  | 'google-calendar' | 'typeform' | 'lottie' | 'custom-iframe'

export const EMBED_NAME: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  x: 'X',
  'facebook-post': 'Facebook',
  'facebook-video': 'Facebook',
  'facebook-page': 'Facebook',
  pinterest: 'Pinterest',
  linkedin: 'LinkedIn',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  'google-calendar': 'Google Calendar',
  typeform: 'Typeform',
  lottie: 'LottieFiles',
  'custom-iframe': 'Embedded page',
}

export type EmbedTarget = { kind: 'iframe'; src: string } | { kind: 'link'; href: string } | { kind: 'error'; message: string }

/** Hosts an address may come from, per provider. */
const HOSTS: Record<EmbedProvider, string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'],
  vimeo: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'],
  'facebook-post': ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
  'facebook-video': ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'],
  'facebook-page': ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
  pinterest: ['pinterest.com', 'www.pinterest.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  spotify: ['open.spotify.com'],
  soundcloud: ['soundcloud.com', 'www.soundcloud.com'],
  'google-calendar': ['calendar.google.com'],
  typeform: ['form.typeform.com'],
  lottie: ['lottie.host', 'lottiefiles.com', 'www.lottiefiles.com', 'app.lottiefiles.com'],
  'custom-iframe': ['www.youtube-nocookie.com', 'youtube-nocookie.com', 'player.vimeo.com', 'calendar.google.com', 'form.typeform.com'],
}

/** Fixed size for providers whose embed is tall; the others use the aspect ratio the editor picked. */
const TALL: Partial<Record<EmbedProvider, { height: number; maxWidth: number }>> = {
  instagram: { height: 640, maxWidth: 540 },
  x: { height: 560, maxWidth: 550 },
  'facebook-post': { height: 560, maxWidth: 500 },
  'facebook-page': { height: 500, maxWidth: 500 },
  tiktok: { height: 740, maxWidth: 605 },
  pinterest: { height: 560, maxWidth: 400 },
  linkedin: { height: 570, maxWidth: 504 },
}

export type EmbedLayout = { height?: number; maxWidth?: number }

/** Default fixed height (and max width) for a resolved iframe, or {} when the aspect ratio should be used. */
export function embedLayout(provider: EmbedProvider, src: string): EmbedLayout {
  if (provider === 'spotify') return { height: /\/embed\/(?:track|episode)\//.test(src) ? 152 : 352 }
  if (provider === 'soundcloud') return { height: /%2Fsets%2F/i.test(src) ? 352 : 166 }
  return TALL[provider] ?? {}
}

const SLUG = /^[A-Za-z0-9_.-]{1,100}$/
const segments = (pathname: string) => pathname.split('/').filter(Boolean)

export function youtubeId(u: URL): string | null {
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null)
  if (u.hostname === 'youtu.be') return ok(u.pathname.slice(1).split('/')[0])
  if (u.pathname === '/watch') return ok(u.searchParams.get('v'))
  return ok(/^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(u.pathname)?.[1])
}

const H = EMBED_IFRAME_HOST

function facebookHref(u: URL, host: string): string {
  return `https://${host === 'fb.watch' ? 'fb.watch' : 'www.facebook.com'}${u.pathname}${u.search}`
}

/** Works out what to show for an address. Null for an empty address (nothing renders). */
export function resolveEmbed(provider: EmbedProvider, raw: string): EmbedTarget | null {
  const text = raw.trim()
  if (!text) return null
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return { kind: 'error', message: 'This is not a valid web address.' }
  }
  if (u.protocol !== 'https:') return { kind: 'error', message: 'Use an https:// address.' }
  if (u.username || u.password) return { kind: 'error', message: 'This address is not allowed.' }
  const host = u.hostname.toLowerCase()
  if (!(HOSTS[provider] ?? []).includes(host)) {
    return { kind: 'error', message: `This address is not from a host this embed allows for ${EMBED_NAME[provider]}.` }
  }
  const noId: EmbedTarget = { kind: 'error', message: 'No video or page ID was found in this address.' }
  const iframe = (src: string): EmbedTarget => ({ kind: 'iframe', src })
  const seg = segments(u.pathname)

  switch (provider) {
    case 'youtube': {
      const id = youtubeId(u)
      return id ? iframe(`https://${H.youtube}/embed/${id}`) : noId
    }
    case 'vimeo': {
      const m = /(?:^|\/)(\d{5,12})(?:\/|$)/.exec(u.pathname)
      return m ? iframe(`https://${H.vimeo}/video/${m[1]}?dnt=1`) : noId
    }
    case 'tiktok': {
      const m = /\/(?:video|embed\/v2)\/(\d{8,25})(?:\/|$)/.exec(u.pathname)
      return m ? iframe(`https://${H.tiktok}/embed/v2/${m[1]}`) : noId
    }
    case 'instagram': {
      const i = seg.findIndex((s) => s === 'p' || s === 'reel' || s === 'reels' || s === 'tv')
      const id = i >= 0 ? seg[i + 1] : undefined
      if (!id || !/^[A-Za-z0-9_-]{5,30}$/.test(id)) return noId
      const kind = seg[i] === 'p' ? 'p' : seg[i] === 'tv' ? 'tv' : 'reel'
      return iframe(`https://${H.instagram}/${kind}/${id}/embed`)
    }
    case 'x': {
      const m = /^\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status(?:es)?\/(\d{5,25})(?:\/|$)/.exec(u.pathname)
      return m ? iframe(`https://${H.x}/embed/Tweet.html?id=${m[1]}`) : noId
    }
    case 'facebook-post':
    case 'facebook-video':
    case 'facebook-page': {
      if (host === 'fb.watch' && provider !== 'facebook-video') return noId
      const href = facebookHref(u, host)
      const enc = encodeURIComponent(href)
      if (provider === 'facebook-page') {
        return seg.length === 1 && SLUG.test(seg[0]!) ? iframe(`https://${H.facebook}/plugins/page.php?href=${enc}&tabs=timeline`) : noId
      }
      if (provider === 'facebook-video') {
        const isVideo = host === 'fb.watch' ? seg.length >= 1 : /\/videos?\/|\/reel\/|^\/watch\/?$|\/share\/[vr]\//.test(u.pathname)
        return isVideo ? iframe(`https://${H.facebook}/plugins/video.php?href=${enc}&show_text=false`) : noId
      }
      const isPost = /\/(?:posts|photos|photo|permalink|share\/p|story)(?:\.php)?(?:\/|$)/.test(u.pathname) || u.pathname.startsWith('/permalink.php')
      return isPost ? iframe(`https://${H.facebook}/plugins/post.php?href=${enc}`) : noId
    }
    case 'pinterest': {
      const m = /^\/pin\/(\d{5,25})(?:\/|$)/.exec(u.pathname)
      if (m) return iframe(`https://${H.pinterest}/ext/embed.html?id=${m[1]}`)
      // Boards and profiles have no iframe form, so they become a link card.
      if (seg.length >= 1 && seg.length <= 2 && seg.every((s) => SLUG.test(s))) return { kind: 'link', href: `https://www.pinterest.com${u.pathname}` }
      return noId
    }
    case 'linkedin': {
      const m = /urn:li:(share|ugcPost|activity):(\d{10,25})/.exec(decodeURIComponent(u.pathname)) ?? /-(share|ugcPost|activity)-(\d{10,25})(?:-|\/|$)/.exec(u.pathname)
      return m ? iframe(`https://${H.linkedin}/embed/feed/update/urn:li:${m[1]}:${m[2]}`) : noId
    }
    case 'spotify': {
      const i = seg[0]?.startsWith('intl-') ? 1 : 0
      const type = seg[i]
      const id = seg[i + 1]
      if (!type || !id || !/^(?:track|album|playlist|artist|episode|show)$/.test(type) || !/^[A-Za-z0-9]{10,32}$/.test(id)) return noId
      return iframe(`https://${H.spotify}/embed/${type}/${id}`)
    }
    case 'soundcloud': {
      if (seg.length < 1 || seg.length > 4 || !seg.every((s) => SLUG.test(s))) return noId
      return iframe(`https://${H.soundcloud}/player/?url=${encodeURIComponent(`https://soundcloud.com${u.pathname}`)}&auto_play=false`)
    }
    case 'google-calendar':
      return u.pathname.startsWith('/calendar/embed')
        ? iframe(`https://${H['google-calendar']}${u.pathname}${u.search}`)
        : { kind: 'error', message: 'Use a Google Calendar embed address (calendar/embed).' }
    case 'typeform':
      return u.pathname.startsWith('/to/')
        ? iframe(`https://${H.typeform}${u.pathname}${u.search}`)
        : { kind: 'error', message: 'Use a Typeform address that starts with /to/.' }
    case 'lottie': {
      // Only lottie.host/embed/<uuid>/<id>.json is an iframe form; lottiefiles.com pages are not embeddable, so they become link cards.
      if (host === 'lottie.host') {
        return /^\/embed\/[A-Za-z0-9-]{8,64}\/[A-Za-z0-9_-]{4,64}\.json$/.test(u.pathname)
          ? iframe(`https://${H.lottie}${u.pathname}`)
          : { kind: 'error', message: 'Use a lottie.host embed address (lottie.host/embed/.../....json).' }
      }
      return { kind: 'link', href: u.toString() }
    }
    default:
      // Custom iframe: the host is already on the allowlist, so the src is rebuilt from it.
      return iframe(`https://${host}${u.pathname}${u.search}`)
  }
}

export type AudioEmbed = { kind: 'spotify' | 'soundcloud'; src: string }

/** A Spotify or SoundCloud address as an audio iframe source, else null. */
export function parseAudioEmbedUrl(raw: unknown): AudioEmbed | null {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return null
  for (const kind of ['spotify', 'soundcloud'] as const) {
    const t = resolveEmbed(kind, text)
    if (t?.kind === 'iframe') return { kind, src: t.src }
  }
  return null
}
