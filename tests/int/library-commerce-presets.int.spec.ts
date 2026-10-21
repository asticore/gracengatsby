import { describe, expect, it } from 'vitest'

import { commercePresetCards, commercePresetNode, filterCommercePresetCards } from '@/views/visualEditor/libraryCommercePresets'

describe('library commerce presets', () => {
  it('lists the three presets', () => {
    expect(commercePresetCards().map((c) => c.label)).toEqual(['Product grid (3 col)', 'Featured product', 'Mini cart button'])
  })
  it('builds sections, fresh each time', () => {
    for (const c of commercePresetCards()) {
      const a = commercePresetNode(c.id)!
      expect(a.blockType).toBe('section')
      expect(commercePresetNode(c.id)).not.toBe(a)
    }
    expect(commercePresetNode('nope')).toBeNull()
  })
  it('filters by query', () => {
    expect(filterCommercePresetCards(commercePresetCards(), 'cart')).toHaveLength(1)
    expect(filterCommercePresetCards(commercePresetCards(), 'shop')).toHaveLength(3)
  })
})
