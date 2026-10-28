import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MultilingualSettings } from '@/features/multilingual/settings'
import { isPortalPath, resolvePortalLocale } from '@/features/multilingual/portal'
import { portalText } from '@/features/multilingual/portalStrings'

const settingsState: { current: MultilingualSettings } = { current: undefined as unknown as MultilingualSettings }

vi.mock('@/features/multilingual/settings', () => ({
  readMultilingualSettingsFromD1: async () => settingsState.current,
}))

const { multilingualMiddleware } = await import('@/features/multilingual/middleware')

const on: MultilingualSettings = {
  enabled: true,
  defaultLocale: 'en',
  activeLocales: ['en', 'fr', 'de'],
  fallbackToDefault: true,
  machine: { enabled: false, defaultProvider: null, overrides: {}, monthlyCharLimit: 0, autoDraft: false },
  showLanguageSwitcher: true,
  switcherPosition: 'header',
  requireReview: false,
  adminsBypassReview: true,
  translationRules: {},
}
const off: MultilingualSettings = { ...on, enabled: false }
const single: MultilingualSettings = { ...on, activeLocales: ['en'] }

describe('isPortalPath', () => {
  it('covers every account screen, sign-in and register included', () => {
    expect(isPortalPath('/account')).toBe(true)
    expect(isPortalPath('/account/profile')).toBe(true)
    expect(isPortalPath('/account/sign-in')).toBe(true)
    expect(isPortalPath('/account/orders/12')).toBe(true)
  })

  it('covers enrolled lesson pages but not the public course catalogue', () => {
    expect(isPortalPath('/courses/intro/lesson-1')).toBe(true)
    expect(isPortalPath('/courses')).toBe(false)
    expect(isPortalPath('/courses/intro')).toBe(false)
  })

  it('matches whole segments only and recognises a locale-prefixed portal path', () => {
    expect(isPortalPath('/accounts-news')).toBe(false)
    expect(isPortalPath('/about')).toBe(false)
    expect(isPortalPath('/fr/account', ['en', 'fr'])).toBe(true)
    expect(isPortalPath('/fr/about', ['en', 'fr'])).toBe(false)
    expect(isPortalPath('/fr/account')).toBe(false)
  })
})

describe('resolvePortalLocale', () => {
  it('returns null while multilingual is off or has one language', () => {
    expect(resolvePortalLocale({ settings: off, preferred: 'fr' })).toBeNull()
    expect(resolvePortalLocale({ settings: single, preferred: 'fr' })).toBeNull()
  })

  it('takes the saved profile preference first', () => {
    expect(resolvePortalLocale({ settings: on, preferred: 'de', cookie: 'fr', acceptLanguage: 'fr' })).toEqual({
      locale: 'de',
      source: 'profile',
    })
  })

  it('then the cookie, then the browser, then the default', () => {
    expect(resolvePortalLocale({ settings: on, cookie: 'fr', acceptLanguage: 'de' })).toEqual({ locale: 'fr', source: 'cookie' })
    expect(resolvePortalLocale({ settings: on, acceptLanguage: 'de;q=0.9, fr;q=0.8' })).toEqual({ locale: 'de', source: 'header' })
    expect(resolvePortalLocale({ settings: on, acceptLanguage: 'ja' })).toEqual({ locale: 'en', source: 'default' })
    expect(resolvePortalLocale({ settings: on })).toEqual({ locale: 'en', source: 'default' })
  })

  it('ignores a saved preference that is no longer an active locale and falls through', () => {
    expect(resolvePortalLocale({ settings: on, preferred: 'it', cookie: 'fr' })).toEqual({ locale: 'fr', source: 'cookie' })
  })

  it('matches regional and base tags case-insensitively', () => {
    expect(resolvePortalLocale({ settings: on, preferred: 'FR-CA' })).toEqual({ locale: 'fr', source: 'profile' })
  })
})

describe('portalText', () => {
  it('returns the English source for any locale without its own entry', () => {
    expect(portalText('nav.orders', 'fr')).toBe('Orders')
    expect(portalText('nav.orders', null)).toBe('Orders')
  })
})

describe('middleware leaves the portal alone', () => {
  const handled: NextRequest[] = []
  const handle = async (request: NextRequest) => {
    handled.push(request)
    return NextResponse.next()
  }

  beforeEach(() => {
    handled.length = 0
    settingsState.current = on
  })

  it('does not redirect /en/account or strip /fr/account, and sets no locale cookie', async () => {
    const redirected = await multilingualMiddleware(new NextRequest('https://example.test/en/account'), handle)
    expect(redirected.status).not.toBe(308)
    expect(redirected.headers.get('location')).toBeNull()

    const prefixed = await multilingualMiddleware(new NextRequest('https://example.test/fr/account/orders'), handle)
    expect(prefixed.headers.get('x-middleware-rewrite')).toBeNull()
    expect(prefixed.cookies.get('eg_locale')).toBeUndefined()
    expect(handled[handled.length - 1]?.nextUrl.pathname).toBe('/fr/account/orders')
  })

  it('removes a client-sent locale header before the portal sees the request', async () => {
    await multilingualMiddleware(
      new NextRequest('https://example.test/account', { headers: { 'x-eg-locale': 'de' } }),
      handle,
    )
    expect(handled[handled.length - 1]?.headers.get('x-eg-locale')).toBeNull()
  })

  it('still strips the prefix on public pages', async () => {
    const out = await multilingualMiddleware(new NextRequest('https://example.test/fr/about'), handle)
    expect(out.headers.get('x-middleware-rewrite')).toBeTruthy()
    expect(handled[handled.length - 1]?.nextUrl.pathname).toBe('/about')
  })
})
