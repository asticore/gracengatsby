import { describe, expect, it } from 'vitest'
import { localizeHref } from '@/features/multilingual/localizeHref'

const settings = {
  defaultLocale: 'en',
  locales: ['en', 'fr'],
} as unknown as Parameters<typeof localizeHref>[2]

describe('rich-text link localisation helper', () => {
  it('prefixes internal page links on a non-default locale', () => {
    expect(localizeHref('/shop', 'fr', settings)).toBe('/fr/shop')
  })
  it('leaves default-locale and external links alone', () => {
    expect(localizeHref('/shop', 'en', settings)).toBe('/shop')
    expect(localizeHref('https://example.com/x', 'fr', settings)).toBe('https://example.com/x')
  })
})
