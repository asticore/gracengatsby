import { describe, expect, it } from 'vitest'

import { EMBED_IFRAME_HOST } from '@/lib/embedHosts'
import { resolveEmbed, type EmbedProvider } from '@/lib/embedProviders'
import { DEFAULT_CONTENT_SECURITY_POLICY, securityHeaders } from '@/features/security/headers'
import { DEFAULT_SECURITY_SETTINGS } from '@/features/security/settings'
import { parseVideoUrl, mapEmbedSrc } from '@/components/blocks/elements/elementUtil'

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''
const frame = directive(DEFAULT_CONTENT_SECURITY_POLICY, 'frame-src')

describe('csp frame-src', () => {
  it('keeps self and GTM', () => {
    expect(frame).toContain("'self'")
    expect(frame).toContain('https://www.googletagmanager.com')
  })

  it('allows every embed provider host', () => {
    for (const host of Object.values(EMBED_IFRAME_HOST)) expect(frame).toContain(`https://${host}`)
    for (const h of ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com', 'www.google.com', 'form.typeform.com', 'lottie.host',
      'www.instagram.com', 'platform.twitter.com', 'www.facebook.com', 'www.tiktok.com', 'assets.pinterest.com', 'www.linkedin.com', 'open.spotify.com', 'w.soundcloud.com'])
      expect(frame).toContain(`https://${h}`)
  })

  it('covers the iframe srcs the video and map elements generate', () => {
    const srcs = [
      parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src,
      parseVideoUrl('https://vimeo.com/123456789')?.src,
      mapEmbedSrc('10 Downing Street London'),
      mapEmbedSrc('51.5,-0.12'),
    ]
    for (const src of srcs) {
      expect(src).toBeTruthy()
      expect(frame).toContain(`https://${new URL(src as string).hostname}`)
    }
  })

  it('covers the iframe src every embed provider generates', () => {
    const samples: [EmbedProvider, string][] = [
      ['instagram', 'https://www.instagram.com/reel/Cabc123xyz/'],
      ['x', 'https://x.com/u/status/1234567890'],
      ['facebook-post', 'https://www.facebook.com/page/posts/123456'],
      ['facebook-video', 'https://www.facebook.com/page/videos/123456'],
      ['facebook-page', 'https://www.facebook.com/somepage'],
      ['tiktok', 'https://www.tiktok.com/@u/video/7234567890123456789'],
      ['pinterest', 'https://www.pinterest.com/pin/123456789/'],
      ['linkedin', 'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000000'],
      ['spotify', 'https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC'],
      ['soundcloud', 'https://soundcloud.com/artist/track'],
    ]
    for (const [p, url] of samples) {
      const t = resolveEmbed(p, url)
      expect(t?.kind, p).toBe('iframe')
      expect(frame, p).toContain(`https://${new URL((t as { src: string }).src).hostname}`)
    }
  })

  it('does not widen script-src', () => {
    expect(directive(DEFAULT_CONTENT_SECURITY_POLICY, 'script-src')).not.toMatch(/youtube|vimeo|typeform|lottie|google\.com\b(?!\/)/)
  })

  it('still uses an admin custom policy verbatim', () => {
    const custom = "default-src 'self'; frame-src 'self'"
    const h = securityHeaders({ ...DEFAULT_SECURITY_SETTINGS, featureEnabled: true, headers: { ...DEFAULT_SECURITY_SETTINGS.headers, contentSecurityPolicy: custom } }, '/')
    expect(h['Content-Security-Policy']).toBe(custom)
  })
})
