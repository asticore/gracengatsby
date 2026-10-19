import { describe, expect, it } from 'vitest'

import { cssColour } from '@/components/blocks/elements/elementUtil'
import { linkedTokenName } from '@/admin/fields/ColorPickerField'

describe('cssColour sanitiser', () => {
  it('accepts a theme colour token', () => {
    expect(cssColour('var(--eg-c-primary)')).toBe('var(--eg-c-primary)')
    expect(cssColour('  var(--eg-c-accent-2_dark)  ')).toBe('var(--eg-c-accent-2_dark)')
  })

  it('still accepts literal colours', () => {
    expect(cssColour('#1a2b3c')).toBe('#1a2b3c')
    expect(cssColour('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
    expect(cssColour('hsl(120, 50%, 40%)')).toBe('hsl(120, 50%, 40%)')
  })

  it('rejects anything that is not a literal colour or a token', () => {
    expect(cssColour('var(--x);evil')).toBe('')
    expect(cssColour('var(--x)')).toBe('')
    expect(cssColour('var(--eg-c-primary);color:red')).toBe('')
    expect(cssColour('var(--eg-c-Primary)')).toBe('')
    expect(cssColour('var(--eg-c-)')).toBe('')
    expect(cssColour('var(--eg-c-a b)')).toBe('')
    expect(cssColour('url(https://example.com/x.png)')).toBe('')
    expect(cssColour('url()')).toBe('')
    expect(cssColour('expression(alert(1))')).toBe('')
    expect(cssColour(undefined)).toBe('')
    expect(cssColour({ value: '#fff' })).toBe('')
  })
})

describe('linkedTokenName (colour field)', () => {
  it('returns the token name for a linked value', () => {
    expect(linkedTokenName('var(--eg-c-primary)')).toBe('--eg-c-primary')
  })

  it('returns null for plain colours, objects and malformed tokens', () => {
    expect(linkedTokenName('#ff0000')).toBeNull()
    expect(linkedTokenName({ value: '#ff0000' })).toBeNull()
    expect(linkedTokenName('var(--x);evil')).toBeNull()
    expect(linkedTokenName(undefined)).toBeNull()
  })
})
