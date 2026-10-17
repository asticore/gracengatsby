import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BgVideo } from '@/components/blocks/BgVideo'
import {
  MASK_SHAPE_OPTIONS,
  asBlockStyle,
  blockFxClasses,
  blockStyleToCss,
  isSafeMediaUrl,
} from '@/lib/blockStyle'

describe('isSafeMediaUrl', () => {
  it('accepts https and site-relative video paths', () => {
    expect(isSafeMediaUrl('https://cdn.example.com/hero.mp4', 'video')).toBe(true)
    expect(isSafeMediaUrl('/media/clip.webm', 'video')).toBe(true)
    expect(isSafeMediaUrl('https://cdn.example.com/hero.MP4?v=2', 'video')).toBe(true)
  })

  it('rejects javascript:, data:, protocol-relative, http and non-video extensions', () => {
    expect(isSafeMediaUrl('javascript:alert(1).mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl('data:video/mp4;base64,AAAA', 'video')).toBe(false)
    expect(isSafeMediaUrl('//evil.example.com/a.mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl('http://cdn.example.com/a.mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl('https://cdn.example.com/a.mov', 'video')).toBe(false)
    expect(isSafeMediaUrl('https://cdn.example.com/a.mp4.exe', 'video')).toBe(false)
  })

  it('rejects quotes, parentheses, whitespace, backslashes and non-ASCII', () => {
    expect(isSafeMediaUrl('/media/a");.mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl('/media/a).mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl('/media/a b.mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl('/media\\a.mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl('/media/café.mp4', 'video')).toBe(false)
    expect(isSafeMediaUrl(42, 'video')).toBe(false)
    expect(isSafeMediaUrl(null, 'video')).toBe(false)
  })

  it('validates poster images separately from video', () => {
    expect(isSafeMediaUrl('/media/poster.avif', 'image')).toBe(true)
    expect(isSafeMediaUrl('https://cdn.example.com/poster.jpeg', 'image')).toBe(true)
    expect(isSafeMediaUrl('https://cdn.example.com/poster.mp4', 'image')).toBe(false)
    expect(isSafeMediaUrl('javascript:x.png', 'image')).toBe(false)
  })
})

describe('asBlockStyle background video keys', () => {
  it('keeps a valid video url, poster and loop flag', () => {
    const s = asBlockStyle({
      bgType: 'video',
      bgVideoUrl: 'https://cdn.example.com/hero.mp4',
      bgVideoPoster: '/media/hero.jpg',
      bgVideoLoop: false,
    })
    expect(s.bgType).toBe('video')
    expect(s.bgVideoUrl).toBe('https://cdn.example.com/hero.mp4')
    expect(s.bgVideoPoster).toBe('/media/hero.jpg')
    expect(s.bgVideoLoop).toBe(false)
  })

  it('drops a javascript: or data: video url', () => {
    expect(asBlockStyle({ bgType: 'video', bgVideoUrl: 'javascript:alert(1)' }).bgVideoUrl).toBeUndefined()
    expect(asBlockStyle({ bgType: 'video', bgVideoUrl: 'data:video/mp4;base64,AAAA' }).bgVideoUrl).toBeUndefined()
  })

  it('drops a non-mp4/webm video url', () => {
    expect(asBlockStyle({ bgType: 'video', bgVideoUrl: 'https://cdn.example.com/hero.mov' }).bgVideoUrl).toBeUndefined()
  })

  it('drops an unsafe poster and a non-boolean loop', () => {
    const s = asBlockStyle({ bgType: 'video', bgVideoPoster: 'https://cdn.example.com/poster.mp4', bgVideoLoop: 'yes' })
    expect(s.bgVideoPoster).toBeUndefined()
    expect(s.bgVideoLoop).toBeUndefined()
  })
})

describe('asBlockStyle mask', () => {
  it('accepts every shape in the option table', () => {
    for (const option of MASK_SHAPE_OPTIONS) {
      expect(asBlockStyle({ maskShape: option.value }).maskShape).toBe(option.value)
    }
  })

  it('drops an unknown shape', () => {
    expect(asBlockStyle({ maskShape: 'star' }).maskShape).toBeUndefined()
    expect(asBlockStyle({ maskShape: 'url(#evil)' }).maskShape).toBeUndefined()
  })
})

describe('blockStyleToCss', () => {
  it('emits a literal clip-path for a mask, never a url() reference', () => {
    const css = blockStyleToCss({ maskShape: 'hexagon' })
    expect(css.clipPath).toMatch(/^polygon\(/)
    expect(String(css.clipPath)).not.toMatch(/url\(/)
  })

  it('emits a circle clip-path and nothing for none', () => {
    expect(blockStyleToCss({ maskShape: 'circle' }).clipPath).toBe('circle(50% at 50% 50%)')
    expect(blockStyleToCss({ maskShape: 'none' }).clipPath).toBeUndefined()
    expect(blockStyleToCss({}).clipPath).toBeUndefined()
  })

  it('uses the video poster as the wrapper background only when it is safe', () => {
    expect(blockStyleToCss({ bgType: 'video', bgVideoPoster: '/media/p.webp' }).backgroundImage).toBe('url(/media/p.webp)')
    expect(blockStyleToCss({ bgType: 'video', bgVideoPoster: 'javascript:x.png' }).backgroundImage).toBeUndefined()
    expect(blockStyleToCss({ bgType: 'image', bgVideoPoster: '/media/p.webp' }).backgroundImage).toBeUndefined()
  })

  it('isolates the video layer so it stays behind the content', () => {
    expect(blockFxClasses({ bgType: 'video', bgVideoUrl: '/media/a.mp4' })).toContain('be-fx-clip')
  })
})

describe('BgVideo markup', () => {
  it('renders a muted, looping, aria-hidden video with a source', () => {
    const html = renderToStaticMarkup(
      createElement(BgVideo, { src: '/media/a.mp4', poster: '/media/p.jpg', loop: true }),
    )
    expect(html).toContain('class="be-fx be-fx--video"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('preload="none"')
    expect(html).toContain('poster="/media/p.jpg"')
    expect(html).toContain('<source src="/media/a.mp4" type="video/mp4"')
  })

  it('renders nothing for an unsafe src', () => {
    expect(renderToStaticMarkup(createElement(BgVideo, { src: 'javascript:x.mp4' }))).toBe('')
  })

  it('omits loop when turned off and picks the webm type', () => {
    const html = renderToStaticMarkup(createElement(BgVideo, { src: '/media/a.webm', loop: false }))
    expect(html).not.toContain('loop=""')
    expect(html).toContain('type="video/webm"')
  })
})
