import { isAllowedOembedUrl } from './validate'

/**
 * Turns an allow-listed share link into an iframe src. Returns null for
 * anything else, so the preview never frames an arbitrary site.
 */
export function oembedEmbedUrl(input: string): string | null {
  if (!isAllowedOembedUrl(input)) return null
  const url = new URL(input)
  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean).pop() ?? ''
    return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null
  }
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part))
    return id ? `https://player.vimeo.com/video/${id}` : null
  }
  if (host === 'open.spotify.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    return parts.length >= 2 ? `https://open.spotify.com/embed/${parts[0]}/${parts[1]}` : null
  }
  if (host === 'soundcloud.com') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}`
  }
  return null
}
