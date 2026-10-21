// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SITE_ELEMENT_TYPES } from '@/lib/elements/wave38Defs'
import { WAVE66_ELEMENTS } from '@/lib/elements/wave66Defs'
import { ELEMENTS } from '@/lib/elements/registry'
import { setBlockContext } from '@/lib/blockContext'
import { ProductRatingElement, WAVE66_COMPONENTS } from '@/components/blocks/elements/Wave66Server'

describe('wave66 shop elements', () => {
  it('registers three server elements', () => {
    for (const e of WAVE66_ELEMENTS) {
      expect(SITE_ELEMENT_TYPES.has(e.type)).toBe(true)
      expect(ELEMENTS.some((x) => x.type === e.type)).toBe(true)
      expect(WAVE66_COMPONENTS[e.type]).toBeTypeOf('function')
    }
  })
  it('renders nothing without a rating', async () => {
    setBlockContext({ product: { id: 1, ratingCount: 0 } })
    expect(await ProductRatingElement({})).toBeNull()
  })
  it('exposes defaults', () => {
    expect(WAVE66_ELEMENTS.map((e) => e.type)).toEqual(['add-to-cart', 'cart-link', 'product-rating'])
    expect(WAVE66_ELEMENTS[1]!.defaultProps().showCount).toBe(true)
  })
})
