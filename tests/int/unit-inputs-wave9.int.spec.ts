// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { displayToCanonical, parseTyped, shownText, canonicalToDisplay } from '@/features/ecommerce/lib/unitInput'
import { cmToDisplay, displayToCm, displayToKg, kgToDisplay } from '@/features/ecommerce/lib/units'

describe('unit inputs: conversions round trip', () => {
  it('values typed in pounds and inches store the metric equivalent and show back unchanged', () => {
    for (const lb of [0.5, 2.2, 10, 100.25, 150]) {
      const kg = displayToCanonical('weight', lb, 'imperial')
      expect(canonicalToDisplay('weight', kg, 'imperial')).toBe(lb)
    }
    for (const inch of [1, 2.5, 12.75, 39.37, 60]) {
      const cm = displayToCanonical('dimension', inch, 'imperial')
      expect(canonicalToDisplay('dimension', cm, 'imperial')).toBe(inch)
    }
  })

  it('metric values are stored unchanged and show unchanged', () => {
    expect(displayToCanonical('weight', 2.5, 'metric')).toBe(2.5)
    expect(displayToCanonical('dimension', 12.5, 'metric')).toBe(12.5)
    expect(canonicalToDisplay('weight', 2.5, 'metric')).toBe(2.5)
    expect(canonicalToDisplay('dimension', 12.5, 'metric')).toBe(12.5)
  })

  it('a stored metric value survives a trip through the imperial box within one display step', () => {
    for (const kg of [0.25, 1.234, 4.5, 20]) {
      const shown = kgToDisplay(kg, 'imperial')
      const back = displayToKg(shown, 'imperial')
      expect(Math.abs(back - kg)).toBeLessThanOrEqual(0.0005)
    }
    for (const cm of [1, 10, 25.5, 80]) {
      const shown = cmToDisplay(cm, 'imperial')
      const back = displayToCm(shown, 'imperial')
      expect(Math.abs(back - cm)).toBeLessThanOrEqual(0.02)
    }
  })

  it('metric conversion helpers are identity apart from rounding', () => {
    expect(kgToDisplay(1.23456, 'metric')).toBe(1.235)
    expect(displayToKg(1.23456, 'metric')).toBe(1.2346)
    expect(cmToDisplay(10.126, 'metric')).toBe(10.13)
    expect(displayToCm(10.126, 'metric')).toBe(10.126)
  })
})

describe('unit inputs: parseTyped', () => {
  it('reads plain decimals and a trailing dot while typing', () => {
    expect(parseTyped('2')).toBe(2)
    expect(parseTyped('2.5')).toBe(2.5)
    expect(parseTyped(' .5 ')).toBe(0.5)
    expect(parseTyped('2.')).toBe(2)
  })

  it('rejects blanks, signs, commas and letters instead of guessing', () => {
    expect(parseTyped('')).toBeUndefined()
    expect(parseTyped('   ')).toBeUndefined()
    expect(parseTyped('-1')).toBeUndefined()
    expect(parseTyped('1,000')).toBeUndefined()
    expect(parseTyped('2kg')).toBeUndefined()
    expect(parseTyped('.')).toBeUndefined()
  })
})

describe('unit inputs: shownText', () => {
  it('shows the stored value converted into the chosen system when not typing', () => {
    expect(shownText('weight', 1, 'imperial', null)).toBe('2.205')
    expect(shownText('dimension', 2.54, 'imperial', null)).toBe('1')
    expect(shownText('weight', 1.5, 'metric', null)).toBe('1.5')
    expect(shownText('weight', undefined, 'metric', null)).toBe('')
  })

  it('keeps a half-typed value such as "2." while it still means the stored value', () => {
    const stored = displayToCanonical('weight', 2, 'imperial')
    expect(shownText('weight', stored, 'imperial', '2.')).toBe('2.')
    expect(shownText('weight', stored, 'imperial', '2')).toBe('2')
  })

  it('drops the typed text when the stored value changed from elsewhere', () => {
    expect(shownText('weight', 1, 'imperial', '2')).toBe('2.205')
  })

  it('keeps invalid or blank typing visible when nothing is stored', () => {
    expect(shownText('dimension', undefined, 'metric', 'abc')).toBe('abc')
    expect(shownText('dimension', undefined, 'metric', '')).toBe('')
  })
})
