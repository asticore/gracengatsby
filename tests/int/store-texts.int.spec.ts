import { describe, expect, it } from 'vitest'

import { UI_STRING_SOURCE, type UiDictionary } from '@/features/uiStrings/keys'
import { loadStrings, translateWith } from '@/features/uiStrings'
import {
  STORE_STRING_KEYS,
  overrideFor,
  parseInterfaceOverrides,
  storeDictionary,
} from '@/features/uiStrings/storeTexts'

describe('storefront interface text', () => {
  it('has store.* keys in the reference table, all English-sourced', () => {
    expect(STORE_STRING_KEYS.length).toBeGreaterThan(0)
    for (const key of STORE_STRING_KEYS) expect(typeof UI_STRING_SOURCE[key]).toBe('string')
  })

  it('returns the built-in English for every key when there are no overrides', async () => {
    const dict = await loadStrings(null)
    const out = storeDictionary(dict, [], null)
    for (const key of STORE_STRING_KEYS) expect(out[key]).toBe(UI_STRING_SOURCE[key])
  })

  it('applies an override for its locale over the built-in translation', async () => {
    const dict = await loadStrings('de')
    const out = storeDictionary(dict, [{ key: 'store.addToCart', locale: 'de', value: 'Jetzt kaufen' }], 'de')
    expect(out['store.addToCart']).toBe('Jetzt kaufen')
    expect(out['store.checkout']).toBe(translateWith(dict as Partial<UiDictionary>, 'store.checkout'))
  })

  it('prefers the exact locale, then the base language, and ignores other locales', () => {
    const list = [
      { key: 'store.total', locale: 'de', value: 'Summe' },
      { key: 'store.total', locale: 'de-AT', value: 'Gesamtsumme' },
    ]
    expect(overrideFor(list, 'store.total', 'de-AT')).toBe('Gesamtsumme')
    expect(overrideFor(list, 'store.total', 'de-CH')).toBe('Summe')
    expect(overrideFor(list, 'store.total', 'fr')).toBeUndefined()
  })

  it('drops malformed or non-storefront entries', () => {
    const parsed = parseInterfaceOverrides([
      { key: 'store.total', locale: 'de', value: '  Summe  ' },
      { key: 'admin.save', locale: 'de', value: 'Sichern' },
      { key: 'store.total', locale: 'de', value: '   ' },
      { key: 'store.total', locale: 'de' },
      'not an object',
    ])
    expect(parsed).toEqual([{ key: 'store.total', locale: 'de', value: 'Summe' }])
    expect(parseInterfaceOverrides('[{"key":"store.tax","locale":"fr","value":"TVA"}]')).toEqual([
      { key: 'store.tax', locale: 'fr', value: 'TVA' },
    ])
    expect(parseInterfaceOverrides('not json')).toEqual([])
  })
})
