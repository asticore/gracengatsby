import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ELEMENT_COMPONENTS } from '@/components/blocks/elements/elementComponents'
import { HeadingElement } from '@/components/blocks/elements/HeadingElement'
import { asBlockStyle, blockFxClasses, blockFxVars } from '@/lib/blockStyle'
import { getElementDef } from '@/lib/elements/registry'
import { libraryCards } from '@/views/visualEditor/blockSchemas'

const render = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length

describe('heading effect markup', () => {
  it('renders the plain heading unchanged when the effect is unset or none', () => {
    expect(render(React.createElement(HeadingElement, { text: 'Hi' }))).toBe('<h2 style="text-align:left;margin:0">Hi</h2>')
    expect(render(React.createElement(HeadingElement, { text: 'Hi', effect: 'none', tag: 'h1', align: 'center' }))).toBe(
      '<h1 style="text-align:center;margin:0">Hi</h1>',
    )
    expect(render(React.createElement(HeadingElement, {}))).toBe('<h2 style="text-align:left;margin:0">New heading</h2>')
  })

  it('falls back to the plain heading for an unknown effect or an effect with nothing to show', () => {
    expect(render(React.createElement(HeadingElement, { text: 'Hi', effect: 'rainbow' as never }))).not.toContain('be-heading-fx')
    expect(render(React.createElement(HeadingElement, { text: 'Hi', effect: 'rotate', words: '' }))).toBe('<h2 style="text-align:left;margin:0">Hi</h2>')
    expect(render(React.createElement(HeadingElement, { text: '', effect: 'split' }))).toContain('New heading')
  })

  it('keeps the link wrapper around an effect heading', () => {
    const html = render(React.createElement(HeadingElement, { text: 'Hi', effect: 'split', link: { url: 'https://example.com/' } }))
    expect(html.startsWith('<a href="https://example.com/"')).toBe(true)
    expect(html).toContain('be-heading-fx--split')
  })

  it('two-tone: second part in its own span with the chosen colour, at the chosen tag', () => {
    const html = render(
      React.createElement(HeadingElement, { text: 'Crafted', secondText: 'by hand', secondColour: '#2e3192', effect: 'two-tone', tag: 'h4' }),
    )
    expect(html).toContain('class="be-heading-fx be-heading-fx--two-tone"')
    expect(html).toContain('<h4 ')
    expect(html).toContain('be-el-dual')
    expect(html).toContain('<span class="be-el-dual__second" style="color:#2e3192">by hand</span>')
    expect(html).toContain('Crafted ')
  })

  it('two-tone: an unsafe colour is dropped, not written into the style', () => {
    const html = render(React.createElement(HeadingElement, { text: 'A', secondText: 'B', secondColour: 'red;background:url(x)', effect: 'two-tone' }))
    expect(html).not.toContain('url(x)')
    expect(html).not.toContain('be-el-dual__second" style=')
  })

  it('rotate: one word element per word, with the fade animation and the speed multiplier', () => {
    const html = render(React.createElement(HeadingElement, { text: 'We build', words: 'websites\nbrands\nexperiences', effect: 'rotate', speed: 'fast' }))
    expect(count(html, /be-el-rotor__word/g)).toBe(3)
    expect(html).toContain('be-el-rotor--fade')
    expect(html).toContain('--be-el-n:3')
    expect(html).toContain('We build websites')
    expect(html).toContain('--be-heading-speed:2')
    expect(render(React.createElement(HeadingElement, { text: 'x', effect: 'rotate', words: 'a', speed: 'slow' }))).toContain('--be-heading-speed:0.5')
  })

  it('split: word or letter pieces, with the chosen animation', () => {
    const words = render(React.createElement(HeadingElement, { text: 'one two three', effect: 'split', splitBy: 'word', animation: 'fade-up' }))
    expect(count(words, /be-el-43-split__item/g)).toBe(3)
    expect(words).toContain('be-el-43-split--fade-up')
    const letters = render(React.createElement(HeadingElement, { text: 'Hi', effect: 'split', splitBy: 'letter', animation: 'blur' }))
    expect(count(letters, /be-el-43-split__item/g)).toBe(2)
    expect(letters).toContain('be-el-43-split--blur')
    expect(letters).toContain('<h2 ')
  })

  it('highlight: marks the phrase inside the text with the marker style and colour', () => {
    const html = render(
      React.createElement(HeadingElement, {
        text: 'Our work is hand made in batches',
        markerPhrase: 'hand made',
        markerStyle: 'circle',
        markerColour: '#f5a623',
        effect: 'highlight',
      }),
    )
    expect(html).toContain('<h2 class="be-el-43-hl-text">')
    expect(html).toContain('be-el-43-hl be-el-43-hl--circle be-el-43-hl--view')
    expect(html).toContain('>hand made</span>')
    expect(html).toContain('Our work is ')
    expect(html).toContain(' in batches')
    expect(html).toContain('--be-el-43-c:#f5a623')
  })

  it('highlight: a phrase that is not in the text leaves the text unmarked', () => {
    const html = render(React.createElement(HeadingElement, { text: 'Plain sentence', markerPhrase: 'missing', effect: 'highlight' }))
    expect(html).toContain('Plain sentence')
    expect(html).not.toContain('be-el-43-hl ')
  })

  it('highlight: matches the phrase ignoring case', () => {
    const html = render(React.createElement(HeadingElement, { text: 'Hand Made here', markerPhrase: 'hand made', effect: 'highlight' }))
    expect(html).toContain('>Hand Made</span>')
  })
})

describe('block text effects (textFx)', () => {
  it('drops unknown enum values and clamps the numbers', () => {
    expect(asBlockStyle({ textFx: 'rainbow' }).textFx).toBeUndefined()
    const s = asBlockStyle({ textFx: 'outline', textFxAngle: 720, textFxStroke: 0, textFxAnimated: 'yes' })
    expect(s.textFx).toBe('outline')
    expect(s.textFxAngle).toBe(360)
    expect(s.textFxStroke).toBe(1)
    expect(s.textFxAnimated).toBeUndefined()
    expect(asBlockStyle({ textFxStroke: 9 }).textFxStroke).toBe(6)
    expect(asBlockStyle({ textFxAngle: -5 }).textFxAngle).toBe(0)
  })

  it('drops colours that are not safe to put in a style value', () => {
    const s = asBlockStyle({ textFx: 'gradient', textFxColor: 'red;}body{', textFxColor2: '#00ff00' })
    expect(s.textFxColor).toBeUndefined()
    expect(s.textFxColor2).toBe('#00ff00')
  })

  it('emits a class per effect, with the animation class only for an animated gradient', () => {
    expect(blockFxClasses({ textFx: 'gradient', textFxAnimated: true })).toContain('be-fx--textfx-gradient be-fx--textfx-anim')
    expect(blockFxClasses({ textFx: 'gradient' })).not.toContain('be-fx--textfx-anim')
    expect(blockFxClasses({ textFx: 'outline', textFxAnimated: true })).toContain('be-fx--textfx-outline')
    expect(blockFxClasses({ textFx: 'outline', textFxAnimated: true })).not.toContain('be-fx--textfx-anim')
    expect(blockFxClasses({ textFx: 'shadow-glow' })).toContain('be-fx--textfx-shadow-glow')
    expect(blockFxClasses({ textFx: 'none' })).not.toContain('textfx')
    expect(blockFxClasses({})).not.toContain('textfx')
  })

  it('emits the colour, angle and stroke as CSS vars only when the effect is on', () => {
    const v = blockFxVars({ textFx: 'gradient', textFxColor: '#ff0000', textFxColor2: '#00ff00', textFxAngle: 360, textFxStroke: 3 })
    expect(v['--be-tfx-c']).toBe('#ff0000')
    expect(v['--be-tfx-c2']).toBe('#00ff00')
    expect(v['--be-tfx-a']).toBe('360deg')
    expect(v['--be-tfx-sw']).toBe('3px')
    expect(Object.keys(blockFxVars({ textFxColor: '#ff0000' })).some((k) => k.startsWith('--be-tfx'))).toBe(false)
    expect(Object.keys(blockFxVars({ textFx: 'none', textFxColor: '#ff0000' })).some((k) => k.startsWith('--be-tfx'))).toBe(false)
  })

  it('effects.css targets headings and paragraphs, and keeps the drift under reduced-motion guard', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/components/blocks/effects.css'), 'utf8')
    expect(css).toContain('.be-fx--textfx-gradient :is(h1,h2,h3,h4,h5,h6,p,li)')
    expect(css).toContain('-webkit-background-clip:text')
    expect(css).toContain('.be-fx--textfx-outline :is(h1,h2,h3,h4,h5,h6,p,li)')
    expect(css).toContain('-webkit-text-stroke:')
    const guarded = css.indexOf('@media (prefers-reduced-motion:no-preference){\n  .be-fx--textfx-anim')
    const drift = css.indexOf('animation:be-tfx-shift')
    expect(guarded).toBeGreaterThan(-1)
    expect(drift).toBeGreaterThan(guarded)
    expect(css.slice(guarded, drift)).not.toContain('}\n')
  })
})

describe('hidden library flags', () => {
  const WIDGETS = ['dual-heading', 'animated-headline', 'split-text', 'highlight-text', 'gradient-text', 'outline-text']

  it('hides the replaced widgets from the library but keeps their definitions and renderers', () => {
    const slugs = new Set(libraryCards().map((c) => c.slug))
    for (const t of WIDGETS) {
      expect(getElementDef(t)?.hidden, t).toBe(true)
      expect(ELEMENT_COMPONENTS[t], t).toBeDefined()
      expect(slugs.has(`element:${t}`), t).toBe(false)
    }
  })

  it('leaves the heading and other elements in the library', () => {
    const slugs = new Set(libraryCards().map((c) => c.slug))
    expect(slugs.has('element:heading')).toBe(true)
    expect(slugs.has('element:count-up')).toBe(true)
    expect(getElementDef('table')?.hidden).toBeFalsy()
  })

  it('heading effect field offers the five effects, with unset defaulting to none', () => {
    const def = getElementDef('heading')!
    const effect = def.fields.find((f) => f.name === 'effect')!
    expect(effect.options?.map((o) => o.value)).toEqual(['none', 'two-tone', 'rotate', 'split', 'highlight'])
    expect(def.defaultProps()).toMatchObject({ effect: 'none' })
  })
})
