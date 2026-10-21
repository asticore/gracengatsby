import { describe, expect, it } from 'vitest'

import { EMBED_IFRAME_HOST } from '@/lib/embedHosts'
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
    for (const h of ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com', 'www.google.com', 'form.typeform.com', 'lottie.host'])
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

  it('does not widen script-src', () => {
    expect(directive(DEFAULT_CONTENT_SECURITY_POLICY, 'script-src')).not.toMatch(/youtube|vimeo|typeform|lottie|google\.com\b(?!\/)/)
  })

  it('still uses an admin custom policy verbatim', () => {
    const custom = "default-src 'self'; frame-src 'self'"
    const h = securityHeaders({ ...DEFAULT_SECURITY_SETTINGS, featureEnabled: true, headers: { ...DEFAULT_SECURITY_SETTINGS.headers, contentSecurityPolicy: custom } }, '/')
    expect(h['Content-Security-Policy']).toBe(custom)
  })
})
