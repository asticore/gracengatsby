// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { revealTargets, siteEffectsFor } from '@/components/site/siteEffectsConfig'
import { resolveTags, TAG_NAMES } from '@/lib/dynamicTags'
import { blockContextFor, eventBlockContext, postAuthorName, postBlockContext, previewTextFor, productBlockContext } from '@/lib/blockContextFrom'
import { injectSiteFontAssets, parseSiteFontAssets } from '@/views/visualEditor/useSiteFonts'
import { VISUAL_EDITOR_CSS } from '@/views/visualEditor/visualEditor.styles'

const read = (p: string) => readFileSync(p, 'utf8')

describe('limit 1: hideNativeCursor', () => {
  const base = { pageEffects: { enabled: true, cursor: 'ring' } }
  it('defaults to false and reads true only when set', () => {
    expect(siteEffectsFor(base, '/')?.hideNativeCursor).toBe(false)
    expect(siteEffectsFor({ pageEffects: { ...base.pageEffects, hideNativeCursor: true } }, '/')?.hideNativeCursor).toBe(true)
    expect(siteEffectsFor({ pageEffects: { ...base.pageEffects, hideNativeCursor: 'yes' } }, '/')?.hideNativeCursor).toBe(false)
  })
  it('is wired through, scoped, and restores text inputs', () => {
    expect(read('src/components/site/SiteEffects.tsx')).toContain('hideNative={config.hideNativeCursor}')
    const css = read('src/components/blocks/elements/wave44.css')
    expect(css).toContain('html.be-cursor-hide input')
    expect(css).toMatch(/html\.be-cursor-hide textarea[\s\S]*cursor: text !important/)
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) and \(prefers-reduced-motion: no-preference\)[\s\S]*cursor: none/)
  })
})

describe('limit 2: reveal targets', () => {
  it('finds nested top-level sections and plain main children, not inner sections', () => {
    document.body.innerHTML = '<main><div id="w"><section id="a"><section id="in"></section></section><section id="b"></section></div><p id="p"></p><section id="c"></section></main>'
    expect(revealTargets(document).map((e) => e.id)).toEqual(['a', 'b', 'p', 'c'])
  })
  it('no-JS fallback: hiding only comes from a JS-added class', () => {
    const src = read('src/components/site/SiteEffects.tsx')
    expect(src).toContain('prefers-reduced-motion: no-preference')
    expect(src).not.toMatch(/<main[^>]*eg-reveal/)
  })
})

describe('limit 3: all installed fonts load in canvas', () => {
  const json = { fonts: [{ family: 'Lora' }], css: '@font-face{font-family:"Lora"}', stylesheets: ['https://fonts.googleapis.com/css2?family=Lora', 'https://evil.test/x.css'] }
  it('parses only Google stylesheets and injects idempotently', () => {
    const a = parseSiteFontAssets(json)
    expect(a.stylesheets).toEqual(['https://fonts.googleapis.com/css2?family=Lora'])
    const undo = injectSiteFontAssets(document, a)
    injectSiteFontAssets(document, a)
    expect(document.head.querySelectorAll('[data-ve-site-font]').length).toBe(1)
    expect(document.head.querySelectorAll('style[data-ve-site-font-css]').length).toBe(1)
    undo()
    expect(document.head.querySelectorAll('[data-ve-site-font], [data-ve-site-font-css]').length).toBe(0)
  })
  it('canvas uses the injector', () => {
    expect(read('src/views/visualEditor/CanvasFrame.tsx')).toContain('useInjectSiteFonts()')
  })
})

describe('limit 4: preview-as always visible and styled', () => {
  it('lives in the top bar, not the selection-dependent panel', () => {
    const src = read('src/views/VisualEditor.tsx')
    expect(src).toMatch(/ve-topbar__actions">\s*\{\/\*[^]*?\*\/\}\s*\{surface\?\.slug === 'site-templates' \? <PreviewAsPicker/)
    expect(src.match(/<PreviewAsPicker/g)?.length).toBe(1)
  })
  it('has CSS for the sample text and picker', () => {
    expect(VISUAL_EDITOR_CSS).toContain('.ve-sample-text {')
    expect(VISUAL_EDITOR_CSS).toContain('.ve-preview-as__select')
  })
})

describe('limit 5: product featured image', () => {
  const ctx = productBlockContext({ title: 'Mug', images: [{ url: '' }, { url: '/m.jpg', alt: 'Mug', filename: 'secret' }] }, '/shop/mug')
  it('uses the first image with a url, public fields only', () => {
    expect(ctx.product?.featuredImage).toEqual({ url: '/m.jpg', alt: 'Mug' })
    expect(previewTextFor('post-featured-image', {}, ctx)).toBe('Image: Mug')
  })
  it('is undefined with no images and by blockContextFor', () => {
    expect(productBlockContext({ title: 'x', images: [3] }, '/shop/x').product?.featuredImage).toBeUndefined()
    expect(blockContextFor('products', { slug: 'mug', images: [{ url: '/m.jpg' }] }).product?.featuredImage).toEqual({ url: '/m.jpg', alt: undefined })
  })
  it('widget reads the product image', () => {
    expect(read('src/components/blocks/elements/Wave63Server.tsx')).toContain('c.post?.featuredImage ?? c.product?.featuredImage')
  })
})

describe('limits 6: events', () => {
  const ev = { title: 'Gala', slug: 'gala', startDate: '2026-03-04T00:00:00Z', summary: 'Fun', location: { venueName: 'Hall', address: '1 St' }, email: 'x@y.z' }
  it('builds one shape for route and preview', () => {
    const c = eventBlockContext(ev, '/events/gala')
    expect(c).toEqual({ page: { title: 'Gala' }, event: { title: 'Gala', date: ev.startDate, location: 'Hall, 1 St', summary: 'Fun' }, path: '/events/gala' })
    expect(blockContextFor('events', ev)).toEqual(c)
  })
  it('route calls setBlockContext with it', () => {
    const src = read('src/app/(frontend)/events/[slug]/page.tsx')
    expect(src).toContain('setBlockContext(eventBlockContext(')
  })
  it('tags and preview text resolve event fields', () => {
    const c = eventBlockContext(ev, '/events/gala')
    expect(TAG_NAMES).toContain('event.location')
    expect(resolveTags('{{event.title}} @ {{event.location}} on {{event.date}}', { event: c.event, dateFormat: 'long' })).toBe('Gala @ Hall, 1 St on 4 March 2026')
    expect(previewTextFor('dynamic-text', { template: '{{event.title}} - {{event.summary}}' }, c)).toBe('Gala - Fun')
    expect(previewTextFor('post-title', {}, c)).toBe('Gala')
  })
})

describe('limit 7: post author', () => {
  it('prefers a name-like field, never email', () => {
    expect(postAuthorName({ name: 'Ann', email: 'ann@x.com' }, 'Site')).toBe('Ann')
    expect(postAuthorName({ displayName: 'Bo' }, 'Site')).toBe('Bo')
  })
  it('falls back to the site name', () => {
    expect(postAuthorName({ email: 'ann@x.com' }, 'Grace & Gatsby')).toBe('Grace & Gatsby')
    expect(postAuthorName(5, 'Site')).toBe('Site')
    expect(postAuthorName(null, undefined)).toBe('')
  })
  it('flows into the post context without leaking email', () => {
    const c = postBlockContext({ title: 'T', author: { email: 'ann@x.com' } }, '/blog/t', 'Site')
    expect(c.post?.author).toBe('Site')
    expect(JSON.stringify(c)).not.toContain('ann@x.com')
    expect(resolveTags('{{post.author}}', { post: c.post })).toBe('Site')
  })
})
