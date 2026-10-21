import { describe, expect, it } from 'vitest'

import { FORM_PRESETS } from '@/views/visualEditor/formPresets'
import { filterFormPresetCards, formPresetCards, formPresetNode } from '@/views/visualEditor/libraryFormPresets'

describe('library form presets', () => {
  it('lists one card per preset', () => {
    expect(formPresetCards().map((c) => c.id)).toEqual(FORM_PRESETS.map((p) => p.id))
  })

  it('builds a form block with the preset fields pre-filled', () => {
    for (const preset of FORM_PRESETS) {
      const node = formPresetNode(preset.id)
      expect(node?.blockType).toBe('form')
      expect(node?.preset).toBe(preset.id)
      expect(node?.fields).toEqual(preset.fields)
      expect(node?.settings).toEqual(preset.settings)
    }
  })

  it('deep-copies fields so edits do not leak into the preset', () => {
    const node = formPresetNode('contact')!
    ;(node.fields as { props: { label: string } }[])[0].props.label = 'changed'
    expect(FORM_PRESETS.find((p) => p.id === 'contact')!.fields[0].props?.label).toBe('Name')
  })

  it('returns null for an unknown id', () => {
    expect(formPresetNode('nope')).toBeNull()
  })

  it('filters by label, description and group name', () => {
    const cards = formPresetCards()
    expect(filterFormPresetCards(cards, '')).toHaveLength(cards.length)
    expect(filterFormPresetCards(cards, 'forms')).toHaveLength(cards.length)
    expect(filterFormPresetCards(cards, 'newsletter').map((c) => c.id)).toEqual(['newsletter-signup'])
    expect(filterFormPresetCards(cards, 'zzz')).toEqual([])
  })
})
