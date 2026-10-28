// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { adminLabel, adminLabelKey, loadStrings } from '@/features/uiStrings'

describe('adminLabel: config labels in the admin language', () => {
  it('returns the config label unchanged for English', async () => {
    const dict = await loadStrings('en')
    expect(adminLabel('collection', 'pages', 'Pages', { locale: 'en', dict })).toBe('Pages')
    expect(adminLabel('field', 'title', 'Headline', { locale: 'en', dict })).toBe('Headline')
  })

  it('returns the translation for a supported language', async () => {
    const dict = await loadStrings('de')
    expect(adminLabel('collection', 'pages', 'Pages', { locale: 'de', dict })).toBe('Seiten')
    expect(adminLabel('field', 'metaTitle', 'Meta title', { locale: 'de', dict })).toBe('Meta-Titel')
    expect(adminLabel('global', 'shop-settings', 'Shop', { locale: 'de', dict })).toBe('Shop')
  })

  it('falls back to the config label when the table has no key for the slug', async () => {
    const dict = await loadStrings('fr')
    expect(adminLabel('collection', 'redirects', 'Redirects', { locale: 'fr', dict })).toBe('Redirects')
    expect(adminLabelKey('collection', 'redirects')).toBeNull()
  })

  it('falls back to the config label when no dictionary is given', () => {
    expect(adminLabel('collection', 'pages', 'Pages')).toBe('Pages')
  })

  it('reads the base language of a regional tag', async () => {
    const dict = await loadStrings('es-MX')
    expect(adminLabel('collection', 'orders', 'Orders', { locale: 'es-MX', dict })).toBe('Pedidos')
  })
})
