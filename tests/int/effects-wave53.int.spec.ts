import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BgNoise, BgSlideshow } from '@/components/blocks/BgSlideshow'
import { pageEffectsCss, pageEffectsOf, enabledPageEffects } from '@/components/blocks/elements/Wave44Elements'
import { StyledBlock } from '@/components/blocks/StyledBlock'
import { WAVE44_ELEMENTS } from '@/lib/elements/wave44Defs'
import {
  asBlockStyle,
  blockFxClasses,
  blockStyleToCss,
  maskClipPath,
  noiseLayer,
  slideshowLayer,
  type BlockStyle,
} from '@/lib/blockStyle'

const ROOT = process.cwd()
const SOURCES = [
  'src/components/blocks/effects53.css',
  'src/components/blocks/BgSlideshow.tsx',
  'src/components/blocks/elements/CursorFx.tsx',
  'src/components/blocks/elements/CursorFxLazy.tsx',
  'src/components/blocks/elements/wave44.css',
  'src/lib/elements/wave44Defs.ts',
  'src/lib/blockStyle.ts',
].map((p) => path.join(ROOT, p))

const A = '/media/a.jpg'
const B = 'https://example.com/b.png'
const C = '/media/c.webp'

describe('wave 53: slideshow sanitisation', () => {
  it('keeps safe image URLs, caps at 6, drops the rest', () => {
    const urls = [A, B, C, '/m/4.jpg', '/m/5.jpg', '/m/6.jpg', '/m/7.jpg']
    expect(asBlockStyle({ bgSlides: urls }).bgSlides).toEqual(urls.slice(0, 6))
    expect(asBlockStyle({ bgSlides: [A, 'javascript:alert(1)', '//evil.com/x.jpg', 'https://x.com/a.jpg")', 42, null] }).bgSlides).toEqual([A])
    expect(asBlockStyle({ bgSlides: ['javascript:alert(1)'] }).bgSlides).toBeUndefined()
    expect(asBlockStyle({ bgSlides: 'nope' }).bgSlides).toBeUndefined()
    expect(asBlockStyle({ bgSlideIds: [1, 2.5, -3, 'x', 4] }).bgSlideIds).toEqual([1, 4])
  })

  it('clamps interval and validates the transition', () => {
    expect(asBlockStyle({ slideInterval: 0 }).slideInterval).toBe(2)
    expect(asBlockStyle({ slideInterval: 999 }).slideInterval).toBe(30)
    expect(asBlockStyle({ slideInterval: 'x' }).slideInterval).toBeUndefined()
    expect(asBlockStyle({ slideTransition: 'slide' }).slideTransition).toBe('slide')
    expect(asBlockStyle({ slideTransition: 'url(x)' }).slideTransition).toBeUndefined()
  })
})

describe('wave 53: slideshow output', () => {
  const base: BlockStyle = { bgType: 'slideshow', bgSlides: [A, B, C], slideInterval: 4, slideTransition: 'zoom' }

  it('uses the first slide as the wrapper background (static fallback)', () => {
    const css = blockStyleToCss(asBlockStyle(base))
    expect(css.backgroundImage).toBe(`url(${A})`)
    expect(css.backgroundSize).toBe('cover')
  })

  it('builds one staggered layer per slide', () => {
    const layer = slideshowLayer(asBlockStyle(base))
    expect(layer?.slides).toHaveLength(3)
    expect(layer?.slides.map((s) => s.style.animationDelay)).toEqual(['0s', '4s', '8s'])
    expect(layer?.slides[0].style.animationName).toBe('be-ss-zoom-3')
    expect((layer?.style as Record<string, string>)['--be-ss-t']).toBe('12s')
    expect(layer?.className).toContain('be-ss--zoom')
  })

  it('renders nothing for one slide or another background type', () => {
    expect(slideshowLayer(asBlockStyle({ bgType: 'slideshow', bgSlides: [A] }))).toBeNull()
    expect(slideshowLayer(asBlockStyle({ bgType: 'image', bgSlides: [A, B] }))).toBeNull()
    expect(blockStyleToCss(asBlockStyle({ bgType: 'image', bgSlides: [A, B] })).backgroundImage).toBeUndefined()
  })

  it('renders through StyledBlock and isolates the layers', () => {
    const html = renderToStaticMarkup(React.createElement(StyledBlock, { style: base, index: 0 } as React.ComponentProps<typeof StyledBlock>, 'x'))
    expect(html).toContain('be-fx--ss')
    expect((html.match(/be-ss__s/g) ?? []).length).toBe(3)
    expect(blockFxClasses(asBlockStyle(base))).toContain('be-fx-clip')
    expect(renderToStaticMarkup(React.createElement(BgSlideshow, { design: { bgType: 'slideshow', bgSlides: [A] } }))).toBe('')
  })

  it('has keyframes for 2 to 6 slides in all transitions, and CSS motion is reduced-motion guarded', () => {
    const css = fs.readFileSync(SOURCES[0], 'utf8')
    for (const n of [2, 3, 4, 5, 6]) for (const m of ['fade', 'slide', 'zoom']) expect(css).toContain(`@keyframes be-ss-${m}-${n}{`)
    const guarded = css.split('@media (prefers-reduced-motion:no-preference){')[1] ?? ''
    expect(guarded).toContain('.be-ss__s{animation-duration')
    expect(css.split('@media (prefers-reduced-motion:no-preference){')[0]).not.toMatch(/animation:|animation-name/)
    expect(css).toContain('.be-ss__s:first-child{opacity:1}')
  })
})

describe('wave 53: blob morph', () => {
  it('is an allowed mask shape with no clip-path, plus a speed enum', () => {
    expect(asBlockStyle({ maskShape: 'blob-morph' }).maskShape).toBe('blob-morph')
    expect(maskClipPath('blob-morph')).toBeUndefined()
    expect(blockStyleToCss(asBlockStyle({ maskShape: 'blob-morph' })).clipPath).toBeUndefined()
    expect(asBlockStyle({ blobMorphSpeed: 'fast' }).blobMorphSpeed).toBe('fast')
    expect(asBlockStyle({ blobMorphSpeed: 'warp' }).blobMorphSpeed).toBeUndefined()
    expect(asBlockStyle({ maskShape: 'blob-morphx' }).maskShape).toBeUndefined()
  })

  it('adds classes and keeps old shapes unchanged', () => {
    const cls = blockFxClasses(asBlockStyle({ maskShape: 'blob-morph', blobMorphSpeed: 'slow' }))
    expect(cls).toContain('be-fx-blobmorph')
    expect(cls).toContain('be-fx-blobmorph-slow')
    expect(blockFxClasses(asBlockStyle({ maskShape: 'circle' }))).not.toContain('blobmorph')
    expect(maskClipPath('circle')).toBe('circle(50% at 50% 50%)')
  })

  it('animates border-radius only under no-preference', () => {
    const css = fs.readFileSync(SOURCES[0], 'utf8')
    expect(css).toContain('@keyframes be-blob-morph')
    expect(css.split('@media (prefers-reduced-motion:no-preference){')[0]).not.toContain('be-blob-morph 14s')
  })
})

describe('wave 53: noise', () => {
  it('clamps to 0-100 and rejects junk', () => {
    expect(asBlockStyle({ noise: 150 }).noise).toBe(100)
    expect(asBlockStyle({ noise: -4 }).noise).toBe(0)
    expect(asBlockStyle({ noise: 'lots' }).noise).toBeUndefined()
  })

  it('emits an encoded ASCII feTurbulence data URI layer, over gradients too', () => {
    const style = asBlockStyle({ bgType: 'gradient', bgGradientFrom: '#000', bgGradientTo: '#fff', noise: 40 })
    const layer = noiseLayer(style)
    expect(layer?.style.opacity).toBe(0.4)
    const bg = String(layer?.style.backgroundImage)
    expect(bg.startsWith('url(data:image/svg+xml,')).toBe(true)
    expect(bg).toContain('feTurbulence')
    expect(bg).not.toMatch(/[<>"' ]/)
    expect(bg).toMatch(/^[\x21-\x7e]+$/)
    expect(blockStyleToCss(style).backgroundImage).toContain('linear-gradient')
    expect(blockFxClasses(style)).toContain('be-fx-clip')
    expect(renderToStaticMarkup(React.createElement(BgNoise, { design: style }))).toContain('be-fx--noise')
  })

  it('is off at 0 or unset', () => {
    expect(noiseLayer(asBlockStyle({ noise: 0 }))).toBeNull()
    expect(noiseLayer(asBlockStyle({ bgType: 'color', bgColor: '#fff' }))).toBeNull()
  })
})

describe('wave 53: page-effects cursor', () => {
  it('defaults to off and emits no CSS or markup', () => {
    const e = pageEffectsOf({})
    expect(e.cursor).toBe('none')
    expect(e.cursorHideNative).toBe(false)
    expect(pageEffectsCss({})).toBe('')
    expect(enabledPageEffects({})).toEqual([])
  })

  it('reads and clamps cursor props, rejecting bad values', () => {
    expect(pageEffectsOf({ cursor: 'ring' }).cursor).toBe('ring')
    expect(pageEffectsOf({ cursor: 'dot-ring' }).cursor).toBe('dot-ring')
    expect(pageEffectsOf({ cursor: 'laser' }).cursor).toBe('none')
    expect(pageEffectsOf({ cursorSize: 5 }).cursorSize).toBe(16)
    expect(pageEffectsOf({ cursorSize: 500 }).cursorSize).toBe(80)
    expect(pageEffectsOf({ cursorColor: 'red;}body{display:none' }).cursorColor).toBe('#2e3192')
    expect(pageEffectsOf({ cursorColor: 'url(x)' }).cursorColor).toBe('#2e3192')
    expect(pageEffectsOf({ cursorColor: '#00a9ff' }).cursorColor).toBe('#00a9ff')
  })

  it('writes only the variables, never cursor:none inline, and lists the effect', () => {
    const p = { cursor: 'ring', cursorSize: 40, cursorColor: '#ff0066', cursorHideNative: true }
    const css = pageEffectsCss(p)
    expect(css).toBe('.be-el-44{--be-cur-c:#ff0066;--be-cur-s:40px}')
    expect(css).not.toContain('cursor:none')
    expect(enabledPageEffects(p)[0]).toContain('Custom cursor')
  })

  it('hides the native cursor only behind the toggle class, fine pointer and no-preference guards', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src/components/blocks/elements/wave44.css'), 'utf8')
    const hide = css.match(/@media[^{]*\{\s*html\.be-cursor-hide[\s\S]*?cursor:\s*none/)
    expect(hide?.[0]).toContain('(pointer: fine)')
    expect(hide?.[0]).toContain('prefers-reduced-motion: no-preference')
    expect(css.match(/cursor:\s*none/g)).toHaveLength(1)
    const js = fs.readFileSync(path.join(ROOT, 'src/components/blocks/elements/CursorFx.tsx'), 'utf8')
    expect(js).toContain('prefers-reduced-motion: reduce')
    expect(js).toContain('(pointer: fine)')
    expect(css).toContain('(pointer: coarse)')
  })

  it('has the cursor fields in the element def', () => {
    const def = WAVE44_ELEMENTS.find((d) => d.type === 'page-effects')
    const names = def?.fields.map((f) => f.name) ?? []
    for (const n of ['cursor', 'cursorSize', 'cursorColor', 'cursorHideNative']) expect(names).toContain(n)
    expect(def?.defaultProps?.().cursor).toBe('none')
  })
})

describe('wave 53: sources', () => {
  it('are ASCII with no backslash-u sequences', () => {
    for (const file of SOURCES) {
      const text = fs.readFileSync(file, 'utf8')
       
      expect(/[^\x00-\x7f]/.test(text), file).toBe(false)
      expect(text.includes(String.fromCharCode(92) + 'u'), file).toBe(false)
    }
  })
})
