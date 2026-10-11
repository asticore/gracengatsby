import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h } from 'react'

import { cleanColour, cleanNumber, normaliseConsentConfig, readableTextOn } from '@/features/consent/config'
import { CATEGORY_COPY, CONSENT_COOKIE_NAME, readCookie } from '@/features/consent/consent'
import { ConsentManager, consentStyleVariables } from '@/features/consent/ConsentManager'
import { getConsentState, resetConsentStoreForTests } from '@/features/consent/store'
import { splitFieldSections } from '@/admin/views/EditForm'
import { revealConsentGroup } from '@/admin/views/cookieConsentFields'
import { Integrations } from '@/globals/Integrations'
import { regionsFor } from '@/admin/views/CookieConsentPreview'
import type { Field } from '@/engine'

const config = (consent: Record<string, unknown> = {}) => normaliseConsentConfig({ consent }, null)

afterEach(() => {
  cleanup()
  resetConsentStoreForTests()
  vi.restoreAllMocks()
})

describe('banner customisation defaults', () => {
  it('uses safe defaults on a fresh install', () => {
    const c = normaliseConsentConfig(null, null)
    expect(c).toMatchObject({
      showRejectButton: true,
      privacyPolicyLabel: 'Privacy policy',
      accentColor: null,
      borderRadius: null,
      fontSize: null,
      logoUrl: null,
    })
    expect(c.categoryCopy.analytics).toEqual(CATEGORY_COPY.analytics)
  })

  it('takes category names and descriptions, falling back when blank', () => {
    const c = config({ analyticsLabel: ' Statistics ', analyticsDescription: '   ', marketingLabel: 'Ads' })
    expect(c.categoryCopy.analytics).toEqual({ label: 'Statistics', description: CATEGORY_COPY.analytics.description })
    expect(c.categoryCopy.marketing.label).toBe('Ads')
  })

  it('only hides Reject all when explicitly switched off', () => {
    expect(config({ showRejectButton: false }).showRejectButton).toBe(false)
    expect(config({ showRejectButton: null }).showRejectButton).toBe(true)
  })

  it('clamps radius and font size, and ignores junk', () => {
    expect(config({ borderRadius: 500, fontSize: 2 })).toMatchObject({ borderRadius: 32, fontSize: 12 })
    expect(config({ borderRadius: 0 }).borderRadius).toBe(0)
    expect(config({ borderRadius: 'abc', fontSize: null })).toMatchObject({ borderRadius: null, fontSize: null })
    expect(cleanNumber('14', 12, 20)).toBe(14)
  })

  it('shows the logo only when switched on with a valid URL', () => {
    expect(config({ showLogo: true, logoUrl: '/logo.svg' }).logoUrl).toBe('/logo.svg')
    expect(config({ showLogo: false, logoUrl: '/logo.svg' }).logoUrl).toBeNull()
    expect(config({ showLogo: true, logoUrl: 'javascript:alert(1)' }).logoUrl).toBeNull()
    expect(config({ showLogo: true, logoUrl: '//evil.example/x.png' }).logoUrl).toBeNull()
  })

  it('takes the logo only from this site: a single leading slash, no other host', () => {
    expect(config({ showLogo: true, logoUrl: '/api/media/file/logo.png' }).logoUrl).toBe('/api/media/file/logo.png')
    expect(config({ showLogo: true, logoUrl: 'https://cdn.example.com/logo.png' }).logoUrl).toBeNull()
    expect(config({ showLogo: true, logoUrl: 'http://cdn.example.com/logo.png' }).logoUrl).toBeNull()
    expect(config({ showLogo: true, logoUrl: '/\\evil.example/x.png' }).logoUrl).toBeNull()
    expect(config({ showLogo: true, logoUrl: '/\t/evil.example/x.png' }).logoUrl).toBeNull()
    expect(config({ showLogo: true, logoUrl: 'logo.png' }).logoUrl).toBeNull()
  })
})

describe('colour safety', () => {
  it('accepts hex only', () => {
    expect(cleanColour('#abc')).toBe('#abc')
    expect(cleanColour('#A1B2C3')).toBe('#A1B2C3')
    for (const bad of ['red', 'url(x)', '#12', '#12345', 'expression(alert(1))', '#fff; background:url(//x)', '#fff"', null, 5]) {
      expect(cleanColour(bad)).toBeNull()
    }
  })

  it('never lets an unsafe colour reach the style variables', () => {
    const vars = consentStyleVariables(config({ bannerBackground: 'red;} body{display:none', accentColor: 'url(//x)', buttonColor: '#ffffff' })) as Record<string, string>
    expect(vars['--engage-consent-bg']).toBeUndefined()
    expect(vars['--engage-consent-accent']).toBeUndefined()
    expect(vars['--engage-consent-btn']).toBe('#ffffff')
    expect(vars['--engage-consent-btn-fg']).toBe('#111111')
  })

  it('picks readable button text', () => {
    expect(readableTextOn('#000000')).toBe('#ffffff')
    expect(readableTextOn('#fff')).toBe('#111111')
    expect(readableTextOn('nope')).toBeNull()
  })
})

describe('banner rendering with custom settings', () => {
  it('hides Reject all and uses the custom link text and category names', () => {
    render(
      h(ConsentManager, {
        config: config({ showRejectButton: false, privacyPolicyUrl: '/privacy', privacyPolicyLabel: 'Read more', analyticsLabel: 'Statistics' }),
        optIn: true,
        initialDecided: false,
      }),
    )
    expect(screen.queryByRole('button', { name: 'Reject all' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Read more' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Customise' }))
    expect(screen.getByText('Statistics')).toBeTruthy()
  })
})

describe('preview mode', () => {
  it('writes no cookie or storage, keeps nothing in the consent store and does not reload', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never)
    render(h(ConsentManager, { config: config(), optIn: true, initialDecided: false, previewMode: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Customise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save choices' }))
    expect(readCookie(document.cookie, CONSENT_COOKIE_NAME)).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getConsentState().record).toBeNull()
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows the banner even when the real one is switched off, and is contained, not fixed', () => {
    const { container } = render(h(ConsentManager, { config: config({ enabled: false }), optIn: true, initialDecided: true, previewMode: true }))
    expect(container.querySelector('.engage-consent')).toBeTruthy()
    expect(container.querySelector('.engage-consent-root--preview')).toBeTruthy()
  })

  it('shows the dialog and the settings link on request, and starts opt-out regions ticked', () => {
    const { rerender } = render(h(ConsentManager, { config: config(), optIn: false, initialDecided: false, previewMode: true, previewView: 'dialog' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((screen.getByLabelText('Analytics') as HTMLInputElement).checked).toBe(true)
    rerender(h(ConsentManager, { config: config(), optIn: true, initialDecided: false, previewMode: true, previewView: 'dialog' }))
    expect((screen.getByLabelText('Analytics') as HTMLInputElement).checked).toBe(false)
    rerender(h(ConsentManager, { config: config(), optIn: true, initialDecided: false, previewMode: true, previewView: 'link' }))
    expect(screen.getByRole('button', { name: 'Cookie settings' })).toBeTruthy()
  })

  it('applies the theme and narrow class', () => {
    const { container } = render(
      h(ConsentManager, { config: config(), optIn: true, initialDecided: false, previewMode: true, previewTheme: 'dark', previewNarrow: true }),
    )
    const root = container.querySelector('.engage-consent-root')
    expect(root?.getAttribute('data-theme')).toBe('dark')
    expect(root?.className).toContain('engage-consent-root--narrow')
  })

  it('offers the regions the consent mode produces', () => {
    expect(regionsFor('opt-in-all')).toEqual(['opt-in'])
    expect(regionsFor('notice-only')).toEqual(['opt-out'])
    expect(regionsFor('opt-in-regional')).toEqual(['opt-in', 'opt-out'])
  })
})

describe('consent group on the Integrations form', () => {
  const fields = Integrations.fields as Field[]
  const consentGroup = (list: Field[]) => list.find((f) => f.type === 'group' && 'name' in f && f.name === 'consent')

  it('is hidden from the generic Integrations sections, and the other groups stay', () => {
    const keys = splitFieldSections(fields).map((s) => s.key)
    expect(keys).not.toContain('consent')
    expect(keys).toEqual(expect.arrayContaining(['google', 'recaptcha', 'clarity', 'metaPixel', 'cloudflare', 'custom']))
  })

  it('is revealed for the cookie consent page, with every field intact', () => {
    const revealed = revealConsentGroup(fields)
    expect(splitFieldSections(revealed).map((s) => s.key)).toContain('consent')
    const before = consentGroup(fields) as { fields: unknown[] }
    const after = consentGroup(revealed) as { fields: unknown[] }
    expect(after.fields).toEqual(before.fields)
    // The original config is untouched.
    expect(splitFieldSections(fields).map((s) => s.key)).not.toContain('consent')
  })
})
