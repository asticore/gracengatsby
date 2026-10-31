import { describe, expect, it } from 'vitest'

import { EMBED_IFRAME_HOSTS } from '@/lib/embedHosts'
import { type EmbedProvider, embedLayout, parseAudioEmbedUrl, resolveEmbed } from '@/lib/embedProviders'

const src = (p: EmbedProvider, url: string) => {
  const t = resolveEmbed(p, url)
  return t?.kind === 'iframe' ? t.src : t
}

describe('embed providers: valid addresses', () => {
  it.each<[EmbedProvider, string, string]>([
    ['instagram', 'https://www.instagram.com/p/Cabc123xyz/?utm=1', 'https://www.instagram.com/p/Cabc123xyz/embed'],
    ['instagram', 'https://instagram.com/reel/Cabc123xyz/', 'https://www.instagram.com/reel/Cabc123xyz/embed'],
    ['x', 'https://twitter.com/jack/status/20', 'noid'],
    ['x', 'https://x.com/jack/status/1234567890?s=20', 'https://platform.twitter.com/embed/Tweet.html?id=1234567890'],
    ['tiktok', 'https://www.tiktok.com/@user.name/video/7234567890123456789', 'https://www.tiktok.com/embed/v2/7234567890123456789'],
    ['pinterest', 'https://www.pinterest.com/pin/123456789012/', 'https://assets.pinterest.com/ext/embed.html?id=123456789012'],
    ['linkedin', 'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000000/', 'https://www.linkedin.com/embed/feed/update/urn:li:share:7000000000000000000'],
    ['linkedin', 'https://www.linkedin.com/posts/someone_hello-activity-7000000000000000000-AbCd', 'https://www.linkedin.com/embed/feed/update/urn:li:activity:7000000000000000000'],
    ['spotify', 'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=x', 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
    ['soundcloud', 'https://soundcloud.com/artist/track-name', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack-name&auto_play=false'],
    ['facebook-post', 'https://www.facebook.com/page/posts/123456', 'https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Fpage%2Fposts%2F123456'],
    ['facebook-video', 'https://www.facebook.com/page/videos/123456', 'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fpage%2Fvideos%2F123456&show_text=false'],
    ['facebook-page', 'https://www.facebook.com/somepage', 'https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2Fsomepage&tabs=timeline'],
  ])('%s %s', (provider, url, expected) => {
    if (expected === 'noid') expect(resolveEmbed(provider, url)?.kind).toBe('error')
    else expect(src(provider, url)).toBe(expected)
  })

  it('turns Pinterest boards and profiles into link cards', () => {
    expect(resolveEmbed('pinterest', 'https://www.pinterest.com/someone/board-name/')).toEqual({ kind: 'link', href: 'https://www.pinterest.com/someone/board-name/' })
    expect(resolveEmbed('pinterest', 'https://pinterest.com/someone/')?.kind).toBe('link')
  })

  it('keeps every generated iframe host on the CSP list', () => {
    const urls: [EmbedProvider, string][] = [
      ['instagram', 'https://www.instagram.com/p/Cabc123xyz/'], ['x', 'https://x.com/a/status/1234567890'],
      ['tiktok', 'https://www.tiktok.com/@a/video/7234567890123456789'], ['pinterest', 'https://www.pinterest.com/pin/123456789/'],
      ['spotify', 'https://open.spotify.com/show/4uLU6hMCjMI75M1A2tKUQC'], ['soundcloud', 'https://soundcloud.com/a/b'],
    ]
    for (const [p, u] of urls) expect(EMBED_IFRAME_HOSTS).toContain(new URL(src(p, u) as string).hostname)
  })

  it('picks sensible default sizes', () => {
    expect(embedLayout('spotify', 'https://open.spotify.com/embed/track/abc').height).toBe(152)
    expect(embedLayout('spotify', 'https://open.spotify.com/embed/playlist/abc').height).toBe(352)
    expect(embedLayout('instagram', '').height).toBeGreaterThan(500)
    expect(embedLayout('youtube', '')).toEqual({})
  })

  it('parses audio embeds for the audio and playlist elements', () => {
    expect(parseAudioEmbedUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')?.kind).toBe('spotify')
    expect(parseAudioEmbedUrl('https://soundcloud.com/a/b')?.kind).toBe('soundcloud')
    expect(parseAudioEmbedUrl('https://example.com/a.mp3')).toBeNull()
    expect(parseAudioEmbedUrl('javascript:alert(1)')).toBeNull()
    expect(parseAudioEmbedUrl(42)).toBeNull()
  })
})

describe('embed providers: malicious or wrong addresses', () => {
  const providers: EmbedProvider[] = ['instagram', 'x', 'facebook-post', 'facebook-video', 'facebook-page', 'tiktok', 'pinterest', 'linkedin', 'spotify', 'soundcloud']

  it('rejects javascript:, data:, http and credentials for every provider', () => {
    for (const p of providers) {
      for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'http://www.instagram.com/p/Cabc123xyz/', 'https://user:pw@open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'not a url']) {
        expect(resolveEmbed(p, bad)?.kind, `${p} ${bad}`).toBe('error')
      }
    }
  })

  it('rejects other hosts and look-alike hosts', () => {
    const lookalikes = ['https://evil.example/p/Cabc123xyz/', 'https://www.instagram.com.evil.example/p/Cabc123xyz/', 'https://evilinstagram.com/p/Cabc123xyz/', 'https://open.spotify.com.evil.example/track/4uLU6hMCjMI75M1A2tKUQC']
    for (const p of providers) for (const u of lookalikes) expect(resolveEmbed(p, u)?.kind, `${p} ${u}`).toBe('error')
  })

  it('rejects ids with quotes, markup or path tricks', () => {
    expect(resolveEmbed('instagram', 'https://www.instagram.com/p/abc"onload=alert(1)/')?.kind).toBe('error')
    expect(resolveEmbed('instagram', 'https://www.instagram.com/p/abc%22%3E%3Cscript%3E/')?.kind).toBe('error')
    expect(resolveEmbed('spotify', 'https://open.spotify.com/track/abc"><script>')?.kind).toBe('error')
    expect(resolveEmbed('spotify', 'https://open.spotify.com/track/../../x')?.kind).toBe('error')
    expect(resolveEmbed('x', 'https://x.com/a/status/12345"x')?.kind).toBe('error')
    expect(resolveEmbed('tiktok', 'https://www.tiktok.com/@a/video/123"456789')?.kind).toBe('error')
    expect(resolveEmbed('soundcloud', 'https://soundcloud.com/a/b"c')?.kind).toBe('error')
    expect(resolveEmbed('pinterest', 'https://www.pinterest.com/pin/12345"6/')?.kind).toBe('error')
    expect(resolveEmbed('linkedin', 'https://www.linkedin.com/feed/update/urn:li:share:123"456')?.kind).toBe('error')
  })

  it('never copies attacker text into a src', () => {
    const t = resolveEmbed('soundcloud', 'https://soundcloud.com/a/b?x=1&autoplay=true#frag')
    expect(t).toEqual({ kind: 'iframe', src: 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb&auto_play=false' })
    const f = resolveEmbed('facebook-page', 'https://www.facebook.com/page?x="><script>')
    expect(f?.kind === 'iframe' ? f.src : '').not.toMatch(/[<>"]/)
  })

  it('returns null for empty input', () => {
    expect(resolveEmbed('spotify', '  ')).toBeNull()
  })
})

describe('embed providers: short links and boards', () => {
  it.each<[EmbedProvider, string, string]>([
    ['tiktok', 'https://vm.tiktok.com/ZMabc123/', 'https://vm.tiktok.com/ZMabc123'],
    ['pinterest', 'https://pin.it/4xYzAb', 'https://pin.it/4xYzAb'],
    ['soundcloud', 'https://on.soundcloud.com/AbCdEf', 'https://on.soundcloud.com/AbCdEf'],
  ])('turns the %s short link %s into a link card', (provider, url, href) => {
    expect(resolveEmbed(provider, url)).toEqual({ kind: 'link', href })
  })

  it('refuses a short link on the wrong provider', () => {
    expect(resolveEmbed('pinterest', 'https://vm.tiktok.com/ZMabc123/')?.kind).toBe('error')
  })

  it('refuses a short link with no path', () => {
    expect(resolveEmbed('pinterest', 'https://pin.it/')?.kind).toBe('error')
  })

  it('still embeds full addresses on the same hosts', () => {
    expect(src('tiktok', 'https://www.tiktok.com/@user/video/7234567890123456789')).toBe('https://www.tiktok.com/embed/v2/7234567890123456789')
  })
})
