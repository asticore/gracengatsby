// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { asBlockStyle, blockStyleCss, blockStyleToCss } from '@/lib/blockStyle'
import { GROUP_KEYS } from '@/views/visualEditor/designHelpers'

describe('hover / focus state keys: sanitising', () => {
  it('keeps valid keys', () => {
    const input = { hoverOpacity: 0.8, hoverTransform: 'lift', focusRing: '#ff0000' }
    expect(asBlockStyle(input)).toEqual(input)
  })

  it('drops bad values and clamps opacity', () => {
    const out = asBlockStyle({ hoverTransform: 'spin', focusRing: 'red;}x{', hoverOpacity: 5 })
    expect(out.hoverTransform).toBeUndefined()
    expect(out.focusRing).toBeUndefined()
    expect(out.hoverOpacity).toBe(1)
    expect(asBlockStyle({ hoverOpacity: 'a' }).hoverOpacity).toBeUndefined()
  })

  it('is part of the hover group keys', () => {
    for (const k of ['hoverOpacity', 'hoverTransform', 'focusRing']) expect(GROUP_KEYS.hover).toContain(k)
  })
})

describe('hover / focus state keys: css output', () => {
  it('emits opacity and a reduced-motion-guarded transform preset', () => {
    const css = blockStyleCss(asBlockStyle({ hoverOpacity: 0.5, hoverTransform: 'scale' }), 'b1')
    expect(css).toContain('#b1:hover{opacity:0.5 !important}')
    expect(css).toContain('prefers-reduced-motion:no-preference')
    expect(css).toContain('transform:scale(1.03)')
  })

  it('lets the Advanced hover transform win over the preset', () => {
    const css = blockStyleCss(asBlockStyle({ hoverTransform: 'lift', tfhRotate: 5 }), 'b1')
    expect(css).not.toContain('translateY(-4px)')
  })

  it('emits a focus-visible outline', () => {
    const css = blockStyleCss(asBlockStyle({ focusRing: '#00f' }), 'b1')
    expect(css).toContain('#b1:focus-visible,#b1 :focus-visible{outline:2px solid #00f')
  })

  it('adds a 150ms transition only when a hover key is set', () => {
    expect(blockStyleToCss(asBlockStyle({ hoverOpacity: 0.5 })).transition).toContain('opacity 150ms ease')
    expect(blockStyleToCss(asBlockStyle({ focusRing: '#00f' })).transition).toBeUndefined()
    expect(blockStyleToCss(asBlockStyle({ boxShadow: 'md' })).transition).toBeUndefined()
  })
})
