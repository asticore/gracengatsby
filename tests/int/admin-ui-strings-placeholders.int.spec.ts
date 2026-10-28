// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  ADMIN_UI_LOCALES,
  UI_STRING_SOURCE,
  interpolate,
  loadRawStrings,
  loadStrings,
  t,
  type UiStringKey,
} from '@/features/uiStrings'

/** Names of the `{name}` placeholders in a string, sorted and unique. */
const placeholdersOf = (text: string): string[] =>
  [...new Set([...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]!))].sort()

describe('admin UI placeholders', () => {
  it('fills named placeholders and leaves unknown ones visible', () => {
    expect(interpolate('Page {page} of {total}', { page: 2, total: 5 })).toBe('Page 2 of 5')
    expect(interpolate('Hello {name}, {missing}', { name: 'Ana' })).toBe('Hello Ana, {missing}')
    expect(interpolate('No vars {x}')).toBe('No vars {x}')
  })

  it('keeps English output identical to the text it replaced', () => {
    expect(t('list.perPage', 'en', { count: 25 })).toBe('25 per page')
    expect(t('list.pageOf', 'en', { page: 1, total: 3 })).toBe('Page 1 of 3')
    expect(t('list.total', 'en', { total: 42 })).toBe('Total: 42')
    expect(t('toast.duplicated', 'en', { title: 'Spring' })).toBe('Duplicated as Spring')
    expect(t('edit.editedOn', 'en', { name: 'Ana', date: 'Jan 1' })).toBe('Ana on Jan 1')
  })

  it('reads a translated placeholder string with the value filled in', async () => {
    await loadStrings('fr')
    expect(t('list.perPage', 'fr', { count: 50 })).toBe('50 par page')
  })

  for (const locale of ADMIN_UI_LOCALES) {
    it(`uses the same placeholders as English in ${locale}`, async () => {
      const dict = await loadRawStrings(locale)
      const mismatched: string[] = []
      for (const key of Object.keys(UI_STRING_SOURCE) as UiStringKey[]) {
        const expected = placeholdersOf(UI_STRING_SOURCE[key])
        const actual = placeholdersOf(dict[key] ?? '')
        if (JSON.stringify(expected) !== JSON.stringify(actual)) mismatched.push(key)
      }
      expect(mismatched, `${locale} placeholders differ from English`).toEqual([])
    })
  }
})
