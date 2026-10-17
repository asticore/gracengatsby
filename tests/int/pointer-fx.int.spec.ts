import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { StyledBlock } from '@/components/blocks/StyledBlock'
import {
  asBlockStyle,
  blockFxClasses,
  blockFxVars,
  blockStyleToCss,
  hasKenBurnsLayer,
  kenBurnsLayer,
  type BlockStyle,
} from '@/lib/blockStyle'

describe('pointer, Ken Burns and border keys: enums', () => {
  it('keeps every value in the option tables', () => {
    expect(asBlockStyle({ pointerFx: 'spotlight' }).pointerFx).toBe('spotlight')
    expect(asBlockStyle({ pointerFx: 'tilt' }).pointerFx).toBe('tilt')
    expect(asBlockStyle({ pointerFx: 'magnetic' }).pointerFx).toBe('magnetic')
    expect(asBlockStyle({ pointerFx: 'none' }).pointerFx).toBe('none')
    expect(asBlockStyle({ kenBurns: 'zoom-in' }).kenBurns).toBe('zoom-in')
    expect(asBlockStyle({ kenBurns: 'zoom-out' }).kenBurns).toBe('zoom-out')
    expect(asBlockStyle({ kenBurns: 'pan' }).kenBurns).toBe('pan')
    expect(asBlockStyle({ borderFx: 'glow' }).borderFx).toBe('glow')
    expect(asBlockStyle({ borderFx: 'conic-spin' }).borderFx).toBe('conic-spin')
  })

  it('drops unknown enum values, including CSS injected through them', () => {
    const out = asBlockStyle({ pointerFx: 'laser', kenBurns: 'spin', borderFx: 'url(x)' })
    expect(out.pointerFx).toBeUndefined()
    expect(out.kenBurns).toBeUndefined()
    expect(out.borderFx).toBeUndefined()
    expect(asBlockStyle({ pointerFx: 42 }).pointerFx).toBeUndefined()
  })
})

describe('pointer, Ken Burns and border keys: numeric clamps', () => {
  it('clamps pointer strength to 0-100', () => {
    expect(asBlockStyle({ pointerFxStrength: 150 }).pointerFxStrength).toBe(100)
    expect(asBlockStyle({ pointerFxStrength: -5 }).pointerFxStrength).toBe(0)
    expect(asBlockStyle({ pointerFxStrength: 35 }).pointerFxStrength).toBe(35)
  })

  it('clamps Ken Burns duration to 5-60 seconds', () => {
    expect(asBlockStyle({ kenBurnsDuration: 1 }).kenBurnsDuration).toBe(5)
    expect(asBlockStyle({ kenBurnsDuration: 999 }).kenBurnsDuration).toBe(60)
  })

  it('clamps border width to 1-8 px and speed to 2-20 s', () => {
    expect(asBlockStyle({ borderFxWidth: 0 }).borderFxWidth).toBe(1)
    expect(asBlockStyle({ borderFxWidth: 20 }).borderFxWidth).toBe(8)
    expect(asBlockStyle({ borderFxSpeed: 1 }).borderFxSpeed).toBe(2)
    expect(asBlockStyle({ borderFxSpeed: 30 }).borderFxSpeed).toBe(20)
  })

  it('drops a non-numeric value for a numeric key', () => {
    const out = asBlockStyle({ pointerFxStrength: 'high', kenBurnsDuration: '20', borderFxWidth: null })
    expect(out.pointerFxStrength).toBeUndefined()
    expect(out.kenBurnsDuration).toBeUndefined()
    expect(out.borderFxWidth).toBeUndefined()
  })
})

describe('pointer, Ken Burns and border keys: safe colours', () => {
  it('keeps hex, rgb() and keyword colours', () => {
    const out = asBlockStyle({ spotlightColor: '#ffee00', borderFxColor: 'rgb(1, 2, 3)', borderFxColor2: 'transparent' })
    expect(out.spotlightColor).toBe('#ffee00')
    expect(out.borderFxColor).toBe('rgb(1, 2, 3)')
    expect(out.borderFxColor2).toBe('transparent')
  })

  it('drops colours that could break out of a style rule or load a resource', () => {
    const out = asBlockStyle({
      spotlightColor: 'red;}body{background:url(x)',
      borderFxColor: 'url(https://evil.example/x.png)',
      borderFxColor2: 42,
    })
    expect(out.spotlightColor).toBeUndefined()
    expect(out.borderFxColor).toBeUndefined()
    expect(out.borderFxColor2).toBeUndefined()
  })
})

describe('pointer, Ken Burns and border keys: class and variable emission', () => {
  it('emits no classes or vars for a block without the keys', () => {
    expect(blockFxClasses({})).toBe('')
    expect(blockFxVars({})).toEqual({})
    expect(blockFxClasses({ pointerFx: 'none', kenBurns: 'none', borderFx: 'none' })).toBe('')
  })

  it('adds a pointer class per mode, and the clip isolation only for spotlight', () => {
    expect(blockFxClasses({ pointerFx: 'tilt' })).toContain('be-fx-pointer-tilt')
    expect(blockFxClasses({ pointerFx: 'tilt' })).not.toContain('be-fx-clip')
    expect(blockFxClasses({ pointerFx: 'magnetic' })).toContain('be-fx-pointer-magnetic')
    expect(blockFxClasses({ pointerFx: 'spotlight' })).toContain('be-fx-pointer-spotlight')
    expect(blockFxClasses({ pointerFx: 'spotlight' })).toContain('be-fx-clip')
  })

  it('sets spotlight colour and radius vars only for spotlight', () => {
    const spot = blockFxVars({ pointerFx: 'spotlight', spotlightColor: '#ffee00', pointerFxStrength: 25 })
    expect(spot['--be-spot']).toBe('#ffee00')
    expect(spot['--be-spot-r']).toBe('170px')
    expect(blockFxVars({ pointerFx: 'spotlight' })['--be-spot-r']).toBe('220px')
    expect(blockFxVars({ pointerFx: 'tilt', spotlightColor: '#ffee00' })['--be-spot']).toBeUndefined()
  })

  it('adds the magnetic translate to the inline transition, and nothing else for other modes', () => {
    expect(blockStyleToCss({ pointerFx: 'magnetic' }).transition).toBe('translate 450ms cubic-bezier(.2,.8,.2,1)')
    expect(blockStyleToCss({ pointerFx: 'magnetic', tfRotate: 5 }).transition).toBe(
      'transform 250ms ease, translate 450ms cubic-bezier(.2,.8,.2,1)',
    )
    expect(blockStyleToCss({ pointerFx: 'tilt' }).transition).toBeUndefined()
    expect(blockStyleToCss({}).transition).toBeUndefined()
  })

  it('emits border classes and vars from colours, width and speed', () => {
    expect(blockFxClasses({ borderFx: 'conic-spin' })).toContain('be-fx-border-conic')
    expect(blockFxClasses({ borderFx: 'glow' })).toContain('be-fx-border-glow')
    const vars = blockFxVars({ borderFx: 'conic-spin', borderFxColor: '#111111', borderFxColor2: '#222222', borderFxWidth: 3, borderFxSpeed: 6 })
    expect(vars['--be-bc']).toBe('#111111')
    expect(vars['--be-bc2']).toBe('#222222')
    expect(vars['--be-bw']).toBe('3px')
    expect(vars['--be-bs']).toBe('6s')
  })

  it('emits no border vars when the border is off', () => {
    const vars = blockFxVars({ borderFx: 'none', borderFxWidth: 3, borderFxColor: '#111111' })
    expect(vars['--be-bw']).toBeUndefined()
    expect(vars['--be-bc']).toBeUndefined()
  })
})

describe('Ken Burns layer', () => {
  const image: BlockStyle = { bgType: 'image', bgImageUrl: '/media/a.jpg', kenBurns: 'pan', kenBurnsDuration: 30 }

  it('moves the image to its own layer and emits the cycle var', () => {
    expect(hasKenBurnsLayer(image)).toBe(true)
    expect(kenBurnsLayer(image)).toEqual({
      className: 'be-fx be-fx--kb be-fx--kb-pan',
      style: { backgroundImage: 'url(/media/a.jpg)' },
    })
    expect(blockFxVars(image)['--be-kb-t']).toBe('30s')
    expect(blockFxClasses(image)).toContain('be-fx-clip')
    expect(blockStyleToCss(image).backgroundImage).toBeUndefined()
  })

  it('has no layer without an image, with no effect, or under background parallax', () => {
    expect(kenBurnsLayer({ ...image, bgType: 'color' })).toBeNull()
    expect(kenBurnsLayer({ ...image, kenBurns: 'none' })).toBeNull()
    expect(kenBurnsLayer({ ...image, bgImageUrl: undefined })).toBeNull()
    expect(kenBurnsLayer({ ...image, parallax: 'background' })).toBeNull()
    expect(blockStyleToCss({ ...image, parallax: 'background' }).backgroundImage).toBeUndefined()
  })
})

describe('StyledBlock markup for the new keys', () => {
  it('renders the Ken Burns layer and the pointer class, and no pointer marker for a plain block', () => {
    const plainProps = { style: { bgType: 'image', bgImageUrl: '/media/a.jpg' }, index: 0, children: 'hi' }
    const plain = renderToStaticMarkup(createElement(StyledBlock, plainProps))
    expect(plain).not.toContain('be-fx-pointer-')
    expect(plain).not.toContain('be-fx--kb')

    const fxProps = {
      style: { bgType: 'image', bgImageUrl: '/media/a.jpg', kenBurns: 'zoom-in', pointerFx: 'tilt', borderFx: 'glow' },
      index: 1,
      children: 'hi',
    }
    const fx = renderToStaticMarkup(createElement(StyledBlock, fxProps))
    expect(fx).toContain('be-fx be-fx--kb be-fx--kb-zoom-in')
    expect(fx).toContain('be-fx-pointer-tilt')
    expect(fx).toContain('be-fx-border-glow')
  })
})
