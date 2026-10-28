// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  ADMIN_UI_LOCALES,
  UI_STRING_SOURCE,
  loadRawStrings,
  type UiStringKey,
} from '@/features/uiStrings'

/**
 * Coverage guard for the admin UI reference table. Fails when a key has no
 * entry for a supported language, when a dictionary holds a key that does not
 * exist in the table (a typo, or a removed key left behind), or when a value is
 * empty.
 */
describe('admin UI reference table coverage', () => {
  const keys = Object.keys(UI_STRING_SOURCE) as UiStringKey[]

  it('has at least one key and an English source for every key', () => {
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(UI_STRING_SOURCE[key], key).toBeTruthy()
  })

  for (const locale of ADMIN_UI_LOCALES) {
    it(`has an entry for every key in ${locale}`, async () => {
      const dict = await loadRawStrings(locale)
      const missing = keys.filter(
        (key) => typeof dict[key] !== 'string' || dict[key]!.trim() === '',
      )
      expect(missing, `${locale} is missing keys`).toEqual([])
    })

    it(`holds no key in ${locale} that the table does not define`, async () => {
      const dict = await loadRawStrings(locale)
      const unknown = Object.keys(dict).filter((key) => !(key in UI_STRING_SOURCE))
      expect(unknown, `${locale} has unknown keys`).toEqual([])
    })
  }

  it('keeps interpolation-free strings free of stray placeholders', () => {
    for (const key of keys) expect(UI_STRING_SOURCE[key]).not.toMatch(/\{\{|\}\}/)
  })

  it('lists every supported locale exactly once', () => {
    expect(new Set(ADMIN_UI_LOCALES).size).toBe(ADMIN_UI_LOCALES.length)
    expect(ADMIN_UI_LOCALES).toEqual(
      expect.arrayContaining([
        'en',
        'es',
        'fr',
        'de',
        'pt',
        'it',
        'nl',
        'ja',
        'zh-Hans',
        'ko',
        'ar',
        'hi',
        'ru',
      ]),
    )
  })
})
