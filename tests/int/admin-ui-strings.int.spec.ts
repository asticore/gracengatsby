// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  ADMIN_UI_LOCALES,
  UI_STRING_SOURCE,
  directionFor,
  fallbackChain,
  loadStrings,
  matchAcceptLanguage,
  resolveAdminUiLocale,
  t,
  translateWith,
  type UiStringKey,
} from '@/features/uiStrings'
import { portalText } from '@/features/multilingual/portalStrings'
import { isPortalPath, resolvePortalLocale } from '@/features/multilingual/portal'
import { DEFAULT_MULTILINGUAL_SETTINGS } from '@/features/multilingual/settings'

describe('fallbackChain', () => {
  it('uses the exact supported locale, then English', () => {
    expect(fallbackChain('fr')).toEqual(['fr', 'en'])
    expect(fallbackChain('zh-Hans')).toEqual(['zh-Hans', 'en'])
    expect(fallbackChain('ZH-HANS')).toEqual(['zh-Hans', 'en'])
  })

  it('falls back from a regional tag to its base language', () => {
    expect(fallbackChain('fr-CA')).toEqual(['fr', 'en'])
    expect(fallbackChain('de-AT')).toEqual(['de', 'en'])
  })

  it('ends at English for unsupported or empty input', () => {
    expect(fallbackChain('sv')).toEqual(['en'])
    expect(fallbackChain('')).toEqual(['en'])
    expect(fallbackChain(null)).toEqual(['en'])
  })
})

describe('t() fallback chain', () => {
  it('returns the loaded locale text', async () => {
    await loadStrings('fr')
    expect(t('common.save', 'fr')).toBe('Enregistrer')
  })

  it('reads English for a locale that was never loaded', () => {
    expect(t('common.save', 'ja')).toBe(UI_STRING_SOURCE['common.save'])
  })

  it('reads English for unsupported locales and null', () => {
    expect(t('common.cancel', 'sv')).toBe('Cancel')
    expect(t('common.cancel', null)).toBe('Cancel')
  })

  it('falls back per key to English when a dictionary entry is missing', () => {
    expect(translateWith({ 'common.save': 'Speichern' }, 'common.save')).toBe('Speichern')
    expect(translateWith({}, 'common.save')).toBe('Save')
    expect(translateWith(null, 'common.save')).toBe('Save')
  })

  it('never returns a raw key for a valid key', async () => {
    const dict = await loadStrings('ko')
    for (const key of Object.keys(UI_STRING_SOURCE) as UiStringKey[]) {
      expect(dict[key], key).toBeTruthy()
      expect(t(key, 'ko')).not.toBe(key)
    }
  })

  it('loads the regional request through its base language', async () => {
    const dict = await loadStrings('fr-CA')
    expect(dict['common.save']).toBe('Enregistrer')
  })
})

describe('Accept-Language auto pick', () => {
  it('picks the best supported match, honouring q-weights', () => {
    expect(matchAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de')
    expect(matchAcceptLanguage('ja;q=0.4,fr;q=0.9')).toBe('fr')
    expect(matchAcceptLanguage('xx,fr-CA;q=0.5')).toBe('fr')
  })

  it('maps Simplified and mainland Chinese to zh-Hans, but not Traditional', () => {
    expect(matchAcceptLanguage('zh-CN')).toBe('zh-Hans')
    expect(matchAcceptLanguage('zh-Hans-HK')).toBe('zh-Hans')
    expect(matchAcceptLanguage('zh-TW')).toBeNull()
    expect(matchAcceptLanguage('zh-Hant')).toBeNull()
  })

  it('returns null when nothing is supported', () => {
    expect(matchAcceptLanguage('sv-SE,fi;q=0.8')).toBeNull()
    expect(matchAcceptLanguage('')).toBeNull()
    expect(matchAcceptLanguage('*')).toBeNull()
  })

  it('falls back to English with source default when there is no header', () => {
    expect(resolveAdminUiLocale({ acceptLanguage: null })).toEqual({
      locale: 'en',
      source: 'default',
    })
  })

  it('uses the browser when the user has not chosen (automatic)', () => {
    expect(resolveAdminUiLocale({ stored: null, acceptLanguage: 'es-MX,es;q=0.9' })).toEqual({
      locale: 'es',
      source: 'browser',
    })
    expect(resolveAdminUiLocale({ stored: 'auto', acceptLanguage: 'it' })).toEqual({
      locale: 'it',
      source: 'browser',
    })
  })
})

describe('user setting beats the browser', () => {
  it('a saved choice wins over Accept-Language', () => {
    expect(resolveAdminUiLocale({ stored: 'nl', acceptLanguage: 'fr' })).toEqual({
      locale: 'nl',
      source: 'user',
    })
  })

  it('a saved value that is no longer supported falls through to the browser', () => {
    expect(resolveAdminUiLocale({ stored: 'xx', acceptLanguage: 'ko' })).toEqual({
      locale: 'ko',
      source: 'browser',
    })
  })
})

describe('right-to-left direction', () => {
  it('Arabic is rtl and everything else is ltr', () => {
    expect(directionFor('ar')).toBe('rtl')
    for (const locale of ADMIN_UI_LOCALES.filter((code) => code !== 'ar')) {
      expect(directionFor(locale), locale).toBe('ltr')
    }
  })
})

describe('customer portal still resolves as before', () => {
  it('portalText returns English for an unsupported or missing locale', () => {
    for (const locale of ['xx', null]) {
      expect(portalText('nav.orders', locale)).toBe('Orders')
      expect(portalText('profile.languageAuto', locale)).toBe('Automatic (match my browser)')
    }
  })

  it('portalText returns the translated portal strings for the translated locales', async () => {
    for (const locale of ADMIN_UI_LOCALES) await loadStrings(locale)
    expect(portalText('nav.orders', 'fr')).toBe('Commandes')
    expect(portalText('nav.orders', 'de')).toBe('Bestellungen')
    expect(portalText('profile.languageSave', 'ja')).toBe('言語を保存')
    expect(portalText('nav.overview', 'ar')).toBe('نظرة عامة')
    expect(portalText('nav.overview', 'zh-Hans')).toBe('概览')
  })

  it('every portal key is translated in every non-English dictionary', async () => {
    const portalKeys = Object.keys(UI_STRING_SOURCE).filter((key) => key.startsWith('portal.'))
    for (const locale of ADMIN_UI_LOCALES.filter((code) => code !== 'en')) {
      await loadStrings(locale)
      for (const key of portalKeys) {
        expect(t(key as never, locale), `${locale} ${key}`).not.toBe(UI_STRING_SOURCE[key as never])
      }
    }
  })

  it('portal keys live in the shared table under portal.*', () => {
    expect(UI_STRING_SOURCE['portal.nav.overview']).toBe('Overview')
    expect(UI_STRING_SOURCE['portal.profile.languageSave']).toBe('Save language')
  })

  it('portal locale resolution is unchanged by the admin table', () => {
    const settings = {
      ...DEFAULT_MULTILINGUAL_SETTINGS,
      enabled: true,
      defaultLocale: 'en',
      activeLocales: ['en', 'fr'],
    }
    expect(resolvePortalLocale({ settings, preferred: 'fr' })).toEqual({
      locale: 'fr',
      source: 'profile',
    })
    expect(resolvePortalLocale({ settings, acceptLanguage: 'fr-CA,en;q=0.5' })).toEqual({
      locale: 'fr',
      source: 'header',
    })
    expect(isPortalPath('/account/orders')).toBe(true)
  })
})
