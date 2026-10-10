/**
 * Cookie consent: the pure model, region rules, Consent Mode strings, the
 * gated-markup transform, settings normalisation, the consent-log route (with
 * the audit writer mocked), the CSP, and the banner / gate components.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h, type ReactElement } from 'react'

import {
  CONSENT_COOKIE_NAME,
  CONSENT_STORAGE_KEY,
  LEGACY_CONSENT_STORAGE_KEY,
  allChoices,
  createRecord,
  effectiveChoices,
  isCurrentRecord,
  makeChoices,
  migrateLegacyValue,
  parseRecord,
  readCookie,
  serialiseRecord,
  withCategory,
} from '@/features/consent/consent'
import { normaliseConsentConfig, scriptGate, type ConsentConfig } from '@/features/consent/config'
import { requireOptIn, normaliseCountry, isOptInCountry } from '@/features/consent/regions'
import { consentDefaultSnippet, consentModeSignals, consentUpdateSnippet } from '@/features/consent/googleConsentMode'
import { activateGatedMarkup, consentGateAttrs, gateHtml } from '@/features/consent/gate'
import { consentLogDetail, parseConsentLogBody } from '@/features/consent/log'
import { DEFAULT_CONTENT_SECURITY_POLICY, securityHeaders } from '@/features/security/headers'
import { DEFAULT_SECURITY_SETTINGS } from '@/features/security/settings'
import { ConsentManager, openCookieSettings } from '@/features/consent/ConsentManager'
import { ConsentGate } from '@/features/consent/ConsentGate'
import { getConsentState, resetConsentStoreForTests } from '@/features/consent/store'
import { syncAnalyticsTags } from '@/features/seo/components/AnalyticsLoader'

const { getEngine, audit, getSecuritySettings } = vi.hoisted(() => ({
  getEngine: vi.fn(),
  audit: vi.fn(),
  getSecuritySettings: vi.fn(),
}))

vi.mock('@/lib/engine', () => ({ getEngine }))
vi.mock('@/features/security/auditLog', () => ({ audit }))
vi.mock('@/features/security/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/security/settings')>()
  return { ...original, getSecuritySettings }
})

const cookieValue = (): string | null => readCookie(document.cookie, CONSENT_COOKIE_NAME)

const baseConfig = (overrides: Partial<ConsentConfig> = {}): ConsentConfig => ({
  ...normaliseConsentConfig(null, null),
  ...overrides,
})

describe('consent record', () => {
  it('round-trips through serialise and parse', () => {
    const record = createRecord({ analytics: true }, 3, 1_700_000_000_000, 'abcdef12-3456')
    const parsed = parseRecord(serialiseRecord(record))
    expect(parsed).toEqual(record)
    expect(parsed?.c).toEqual({ necessary: true, preferences: false, analytics: true, marketing: false })
  })

  it('rejects malformed, truncated or tampered values without throwing', () => {
    expect(parseRecord('not json')).toBeNull()
    expect(parseRecord('{"v":1}')).toBeNull()
    expect(parseRecord('{"v":"1","id":"abcdefgh","c":{"preferences":false,"analytics":true,"marketing":false},"t":1}')).toBeNull()
    expect(parseRecord('{"v":1,"id":"a b","c":{"preferences":false,"analytics":true,"marketing":false},"t":1}')).toBeNull()
    expect(parseRecord('{"v":1,"id":"abcdefgh","c":{"analytics":"yes"},"t":1}')).toBeNull()
    expect(parseRecord(null)).toBeNull()
  })

  it('migrates the old granted and denied values', () => {
    const granted = migrateLegacyValue('granted', 'legacy-0001')
    // Analytics on; marketing stays off, since the old banner did not separate them.
    expect(granted?.c).toEqual({ necessary: true, preferences: false, analytics: true, marketing: false })
    expect(granted?.v).toBe(1)
    const denied = migrateLegacyValue('denied', 'legacy-0002')
    expect(denied?.c).toEqual(makeChoices({}))
    expect(migrateLegacyValue('maybe')).toBeNull()
    expect(migrateLegacyValue(null)).toBeNull()
  })

  it('asks again when the policy version moves on', () => {
    const record = createRecord(allChoices(true), 2)
    expect(isCurrentRecord(record, 2)).toBe(true)
    expect(isCurrentRecord(record, 3)).toBe(false)
    expect(effectiveChoices(record, 3, false)).toEqual(allChoices(false))
    expect(effectiveChoices(record, 2, false)).toEqual(allChoices(true))
  })

  it('uses the default for a visitor with no answer, and never drops necessary', () => {
    expect(effectiveChoices(null, 1, false)).toEqual(allChoices(false))
    expect(effectiveChoices(null, 1, true)).toEqual(allChoices(true))
    expect(withCategory(allChoices(false), 'necessary', false).necessary).toBe(true)
  })

  it('reads a cookie from a header, decoding the value', () => {
    const header = `a=1; ${CONSENT_COOKIE_NAME}=${encodeURIComponent('{"v":1}')}; b=2`
    expect(readCookie(header, CONSENT_COOKIE_NAME)).toBe('{"v":1}')
    expect(readCookie(header, 'missing')).toBeNull()
    expect(readCookie('engage_consent=%E0%A4%A', CONSENT_COOKIE_NAME)).toBeNull()
  })
})

describe('regions', () => {
  it('opt-in everywhere asks every visitor', () => {
    expect(requireOptIn('US', 'opt-in-all')).toBe(true)
    expect(requireOptIn(null, 'opt-in-all')).toBe(true)
  })

  it('regional mode asks in the EU, EEA, UK and CH, and in unknown cases', () => {
    expect(requireOptIn('DE', 'opt-in-regional')).toBe(true)
    expect(requireOptIn('gb', 'opt-in-regional')).toBe(true)
    expect(requireOptIn('CH', 'opt-in-regional')).toBe(true)
    expect(requireOptIn('NO', 'opt-in-regional')).toBe(true)
    expect(requireOptIn('US', 'opt-in-regional')).toBe(false)
    expect(requireOptIn('AU', 'opt-in-regional')).toBe(false)
    expect(requireOptIn(null, 'opt-in-regional')).toBe(true)
    expect(requireOptIn('XX', 'opt-in-regional')).toBe(true)
    expect(requireOptIn('T1', 'opt-in-regional')).toBe(true)
  })

  it('notice only never asks', () => {
    expect(requireOptIn('DE', 'notice-only')).toBe(false)
    expect(requireOptIn(null, 'notice-only')).toBe(false)
  })

  it('normalises the country header', () => {
    expect(normaliseCountry(' de ')).toBe('DE')
    expect(normaliseCountry('XX')).toBeNull()
    expect(normaliseCountry('germany')).toBeNull()
    expect(isOptInCountry('FR')).toBe(true)
  })
})

describe('Google Consent Mode', () => {
  it('maps categories onto Google storage types and always grants security', () => {
    const signals = consentModeSignals(makeChoices({ analytics: true }))
    expect(signals.analytics_storage).toBe('granted')
    expect(signals.ad_storage).toBe('denied')
    expect(signals.functionality_storage).toBe('denied')
    expect(signals.security_storage).toBe('granted')
  })

  it('emits a default with every storage type denied and wait_for_update, before any tag', () => {
    const snippet = consentDefaultSnippet(allChoices(false))
    expect(snippet).toContain('gtag("consent","default",')
    expect(snippet).toContain('"wait_for_update":500')
    for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage', 'functionality_storage', 'personalization_storage']) {
      expect(snippet).toContain(`"${key}":"denied"`)
    }
    expect(snippet).toContain('"security_storage":"granted"')
  })

  it('emits an update that reflects the new choice', () => {
    const snippet = consentUpdateSnippet(makeChoices({ analytics: true, marketing: true }))
    expect(snippet).toContain('gtag("consent","update",')
    expect(snippet).toContain('"analytics_storage":"granted"')
    expect(snippet).toContain('"ad_storage":"granted"')
    expect(snippet).not.toContain('wait_for_update')
  })
})

describe('gated markup', () => {
  it('leaves necessary code untouched', () => {
    const html = '<script>window.x=1</script><img src="https://e.test/p.gif">'
    expect(gateHtml(html, 'necessary')).toBe(html)
  })

  it('turns scripts into inert text/plain and wraps other markup in templates', () => {
    const out = gateHtml('<img src="https://e.test/p.gif"><script src="https://e.test/a.js" async></script>', 'marketing')
    expect(out).toContain('<script type="text/plain" data-consent-category="marketing" src="https://e.test/a.js" async></script>')
    expect(out).toContain('<template data-consent-category="marketing"><img src="https://e.test/p.gif"></template>')
    expect(out).not.toMatch(/<script(?![^>]*type="text\/plain")/)
  })

  it('keeps the original script type so it can be restored', () => {
    const out = gateHtml('<script type="module">import "x"</script>', 'analytics')
    expect(out).toContain('data-consent-type="module"')
    expect(out).not.toMatch(/\stype="module"/)
  })

  it('gives a server element the attribute the activator looks for', () => {
    expect(consentGateAttrs('analytics')).toEqual({ 'data-consent-category': 'analytics' })
  })

  it('activates only granted categories and is idempotent', () => {
    const root = document.createElement('div')
    root.innerHTML = gateHtml('<span id="pixel">p</span><script>window.gated=true</script>', 'marketing')
    expect(activateGatedMarkup(root, makeChoices({ analytics: true }))).toBe(0)
    expect(root.querySelector('template')).not.toBeNull()

    expect(activateGatedMarkup(root, makeChoices({ marketing: true }))).toBe(2)
    expect(root.querySelector('template')).toBeNull()
    expect(root.querySelector('#pixel')).not.toBeNull()
    const script = root.querySelector('script')
    expect(script?.getAttribute('type')).toBeNull()
    expect(script?.textContent).toBe('window.gated=true')
    expect(activateGatedMarkup(root, makeChoices({ marketing: true }))).toBe(0)
  })

  it('custom code waits for its category unless consent is off', () => {
    expect(scriptGate(baseConfig({ headScriptCategory: 'marketing' }), 'head')).toBe('marketing')
    expect(scriptGate(baseConfig({ enabled: false, headScriptCategory: 'marketing' }), 'head')).toBe('necessary')
  })
})

describe('settings normalisation', () => {
  it('gives usable defaults on a fresh install with no integrations row', () => {
    const config = normaliseConsentConfig(null, null)
    expect(config).toMatchObject({ enabled: true, mode: 'opt-in-all', policyVersion: 1, position: 'bottom', theme: 'auto', logConsent: true, consentModeV2: true, geoLogging: false })
    expect(config.cookieList).toEqual([])
    expect(config.headScriptCategory).toBe('analytics')
  })

  it('keeps the legacy "hold back tracking" flag working when no mode is set', () => {
    expect(normaliseConsentConfig({}, { requireCookieConsent: false }).mode).toBe('notice-only')
    expect(normaliseConsentConfig({}, { requireCookieConsent: true }).mode).toBe('opt-in-all')
    expect(normaliseConsentConfig({ consent: { mode: 'opt-in-regional' } }, { requireCookieConsent: false }).mode).toBe('opt-in-regional')
  })

  it('drops colours and links that could not be safe in an attribute', () => {
    const config = normaliseConsentConfig(
      {
        consent: {
          bannerBackground: '#123456',
          bannerTextColor: 'red; background:url(x)',
          buttonColor: '#abc',
          privacyPolicyUrl: 'javascript:alert(1)',
        },
      },
      null,
    )
    expect(config.bannerBackground).toBe('#123456')
    expect(config.bannerTextColor).toBeNull()
    expect(config.buttonColor).toBe('#abc')
    expect(config.privacyPolicyUrl).toBeNull()
    expect(normaliseConsentConfig({ consent: { privacyPolicyUrl: '/privacy' } }, null).privacyPolicyUrl).toBe('/privacy')
  })

  it('reads the cookie list and falls back on an unknown category', () => {
    const config = normaliseConsentConfig(
      { consent: { cookieList: [{ category: 'bogus', name: '_ga', provider: 'Google', purpose: 'Measure', duration: '2 years' }, { name: '' }] } },
      null,
    )
    expect(config.cookieList).toEqual([{ category: 'analytics', name: '_ga', provider: 'Google', purpose: 'Measure', duration: '2 years' }])
  })

  it('bumps nothing when the policy version is missing or bad', () => {
    expect(normaliseConsentConfig({ consent: { policyVersion: 'x' } }, null).policyVersion).toBe(1)
    expect(normaliseConsentConfig({ consent: { policyVersion: 4 } }, null).policyVersion).toBe(4)
  })
})

describe('consent log', () => {
  it('accepts a valid body and rejects anything else', () => {
    const good = { id: 'abcdefgh-1234', v: 1, c: { preferences: false, analytics: true, marketing: false } }
    expect(parseConsentLogBody(good)).toEqual(good)
    expect(parseConsentLogBody({ ...good, id: 'short' })).toBeNull()
    expect(parseConsentLogBody({ ...good, id: 'has spaces here' })).toBeNull()
    expect(parseConsentLogBody({ ...good, v: 1.5 })).toBeNull()
    expect(parseConsentLogBody({ ...good, c: { analytics: 'yes', preferences: false, marketing: false } })).toBeNull()
    expect(parseConsentLogBody(['x'])).toBeNull()
    expect(parseConsentLogBody(null)).toBeNull()
  })

  it('keeps region only when given, and never a network identifier', () => {
    const body = { id: 'abcdefgh-1234', v: 2, c: { preferences: false, analytics: true, marketing: false } }
    const withRegion = JSON.parse(consentLogDetail(body, 'DE'))
    expect(withRegion).toEqual({ id: 'abcdefgh-1234', v: 2, c: body.c, region: 'DE' })
    expect(JSON.parse(consentLogDetail(body, null))).not.toHaveProperty('region')
    expect(consentLogDetail(body, null)).not.toMatch(/ip|agent/i)
  })
})

describe('consent-log route', () => {
  let POST: (request: Request) => Promise<Response>
  let ip = 0

  const request = (body: unknown, headers: Record<string, string> = {}): Request => {
    ip += 1
    return new Request('https://example.test/api/consent-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.0.0.${ip}`, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  }

  const good = { id: 'abcdefgh-1234', v: 1, c: { preferences: false, analytics: true, marketing: false } }

  beforeEach(async () => {
    audit.mockReset()
    getEngine.mockReset()
    getSecuritySettings.mockReset()
    getSecuritySettings.mockResolvedValue({ ...DEFAULT_SECURITY_SETTINGS, featureEnabled: true })
    getEngine.mockResolvedValue({
      findGlobal: vi.fn().mockResolvedValue({ consent: { logConsent: true, geoLogging: false } }),
    })
    POST = (await import('@/app/(engage)/api/consent-log/route')).POST
  })

  it('writes an anonymised consent.update entry and answers 204', async () => {
    const response = await POST(request(good, { 'cf-ipcountry': 'DE', 'user-agent': 'UA/1' }))
    expect(response.status).toBe(204)
    expect(audit).toHaveBeenCalledTimes(1)
    const [entry] = audit.mock.calls[0] as [{ action: string; ip?: unknown; userAgent?: unknown; detail: string }]
    expect(entry.action).toBe('consent.update')
    expect(entry.ip).toBeUndefined()
    expect(entry.userAgent).toBeUndefined()
    expect(JSON.parse(entry.detail)).not.toHaveProperty('region')
  })

  it('records the country only when geo logging is on', async () => {
    getEngine.mockResolvedValue({ findGlobal: vi.fn().mockResolvedValue({ consent: { logConsent: true, geoLogging: true } }) })
    await POST(request(good, { 'cf-ipcountry': 'DE' }))
    const [entry] = audit.mock.calls[0] as [{ detail: string }]
    expect(JSON.parse(entry.detail).region).toBe('DE')
  })

  it('writes nothing when logging is off, but still answers 204', async () => {
    getEngine.mockResolvedValue({ findGlobal: vi.fn().mockResolvedValue({ consent: { logConsent: false } }) })
    const response = await POST(request(good))
    expect(response.status).toBe(204)
    expect(audit).not.toHaveBeenCalled()
  })

  it('rejects an invalid body with 400 and writes nothing', async () => {
    expect((await POST(request({ ...good, id: 'x' }))).status).toBe(400)
    expect((await POST(request('{not json'))).status).toBe(400)
    expect(audit).not.toHaveBeenCalled()
  })

  it('requires a JSON content type', async () => {
    const response = await POST(request(good, { 'content-type': 'text/plain;charset=UTF-8' }))
    expect(response.status).toBe(415)
    expect(audit).not.toHaveBeenCalled()
  })

  it('accepts a JSON content type with parameters', async () => {
    expect((await POST(request(good, { 'content-type': 'application/json; charset=utf-8' }))).status).toBe(204)
  })

  it('answers 413 for a body over 2KB, however it is sent, and writes nothing', async () => {
    const padded = { ...good, pad: 'x'.repeat(3000) }
    expect((await POST(request(padded))).status).toBe(413)
    expect(audit).not.toHaveBeenCalled()
  })

  it('still answers 204 when the engine is unavailable', async () => {
    getEngine.mockRejectedValue(new Error('no db'))
    const response = await POST(request(good))
    expect(response.status).toBe(204)
  })

  it('rate-limits a single client', async () => {
    const same = { 'cf-connecting-ip': '203.0.113.9' }
    const statuses: number[] = []
    for (let i = 0; i < 32; i += 1) {
      statuses.push((await POST(new Request('https://example.test/api/consent-log', { method: 'POST', headers: { 'content-type': 'application/json', ...same }, body: JSON.stringify(good) }))).status)
    }
    expect(statuses.slice(0, 30).every((s) => s === 204)).toBe(true)
    expect(statuses[31]).toBe(429)
  })
})

describe('content security policy', () => {
  it('allows the analytics hosts in script-src and the GTM frame', () => {
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain('https://www.googletagmanager.com')
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain('https://www.clarity.ms')
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain('https://scripts.clarity.ms')
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain('https://connect.facebook.net')
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain("frame-src 'self' https://www.googletagmanager.com")
    expect(DEFAULT_CONTENT_SECURITY_POLICY).not.toContain('https://www.google.com')
  })

  it('reaches the response headers', () => {
    const headers = securityHeaders({ ...DEFAULT_SECURITY_SETTINGS, featureEnabled: true }, '/')
    expect(headers['Content-Security-Policy']).toContain('https://connect.facebook.net')
  })
})

describe('banner and gate components', () => {
  beforeEach(() => {
    cleanup()
    resetConsentStoreForTests()
    document.cookie = `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/`
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the banner, saves Accept all to the cookie and mirror, then shows the settings link', () => {
    const config = baseConfig({ bannerTitle: 'Our cookies', acceptLabel: 'Yes to all' })
    render(h(ConsentManager, { config, optIn: true, initialDecided: false }))

    expect(screen.getByRole('region', { name: 'Our cookies' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes to all' }))

    const saved = parseRecord(cookieValue())
    expect(saved?.c).toEqual(allChoices(true))
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Our cookies' })).toBeNull()
    expect(document.querySelector('[data-cookie-settings]')).not.toBeNull()
  })

  it('does not show the banner to a visitor whose cookie already answers this policy', () => {
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(serialiseRecord(createRecord(allChoices(false), 1)))}; Path=/`
    render(h(ConsentManager, { config: baseConfig(), optIn: true, initialDecided: true }))
    expect(screen.queryByRole('region', { name: 'Cookies on this site' })).toBeNull()
    expect(document.querySelector('[data-cookie-settings]')).not.toBeNull()
  })

  it('Escape closes the Customise dialog without refusing anything', () => {
    render(h(ConsentManager, { config: baseConfig(), optIn: true, initialDecided: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Customise' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(cookieValue()).toBeNull()
    expect(screen.getByRole('region', { name: 'Cookies on this site' })).toBeTruthy()
  })

  it('the settings link saves only what the visitor ticked', () => {
    render(h(ConsentManager, { config: baseConfig(), optIn: true, initialDecided: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Customise' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Marketing/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save choices' }))

    expect(parseRecord(cookieValue())?.c).toEqual(makeChoices({ marketing: true }))
  })

  it('openCookieSettings opens the dialog from outside the component', () => {
    render(h(ConsentManager, { config: baseConfig(), optIn: true, initialDecided: false }))
    act(() => openCookieSettings())
    expect(screen.getByRole('dialog', { name: 'Cookie settings' })).toBeTruthy()
  })

  it('renders nothing when consent is switched off', () => {
    const { container } = render(h(ConsentManager, { config: baseConfig({ enabled: false }), optIn: false, initialDecided: false }))
    expect(container.innerHTML).toBe('')
  })

  it('reads the old engage-cookie-consent value once and writes it back in the new format', () => {
    window.localStorage.setItem(LEGACY_CONSENT_STORAGE_KEY, 'granted')
    resetConsentStoreForTests()

    const record = getConsentState().record
    expect(record?.c).toEqual(makeChoices({ analytics: true }))
    expect(window.localStorage.getItem(LEGACY_CONSENT_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull()
    expect(parseRecord(cookieValue())?.c.analytics).toBe(true)
  })

  it('gate holds its children back until the category is granted, then shows them', () => {
    const { rerender } = render(h(ConsentGate, { category: 'marketing', children: h('div', { 'data-testid': 'embed' }, 'video') }))
    expect(screen.queryByTestId('embed')).toBeNull()
    expect(screen.getByRole('button', { name: 'Accept marketing' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Accept marketing' }))
    expect(parseRecord(cookieValue())?.c.marketing).toBe(true)
    rerender(h(ConsentGate, { category: 'marketing', children: h('div', { 'data-testid': 'embed' }, 'video') }))
    expect(screen.getByTestId('embed')).toBeTruthy()
  })

  it('Load once shows the embed without saving a choice', () => {
    render(h(ConsentGate, { category: 'analytics', children: h('div', { 'data-testid': 'embed' }, 'map') }))
    fireEvent.click(screen.getByRole('button', { name: 'Load once' }))
    expect(screen.getByTestId('embed')).toBeTruthy()
    expect(cookieValue()).toBeNull()
  })
})

describe('tag loader', () => {
  it('pushes the consent default before any Google tag, then loads only granted categories', () => {
    const ids = { gtmContainerId: 'GTM-TEST1', ga4MeasurementId: 'G-TEST1', metaPixelId: '123' }

    syncAnalyticsTags(ids, true, allChoices(false))
    const scripts = Array.from(document.head.querySelectorAll('script'))
    expect(scripts.some((s) => s.src.includes('googletagmanager.com/gtm.js'))).toBe(false)
    expect(scripts.some((s) => s.textContent?.includes('"consent","default"'))).toBe(true)
    expect(scripts.some((s) => s.src.includes('connect.facebook.net'))).toBe(false)

    syncAnalyticsTags(ids, true, makeChoices({ analytics: true, marketing: true }))
    const after = Array.from(document.head.querySelectorAll('script'))
    const defaultIndex = after.findIndex((s) => s.textContent?.includes('"consent","default"'))
    const gtmIndex = after.findIndex((s) => s.src.includes('googletagmanager.com/gtm.js'))
    expect(gtmIndex).toBeGreaterThan(defaultIndex)
    expect(after.some((s) => s.textContent?.includes('"analytics_storage":"granted"'))).toBe(true)
    expect(after.some((s) => s.src === '' && s.textContent?.includes('connect.facebook.net'))).toBe(true)
  })
})

describe('withdrawal reloads the page', () => {
  const originalLocation = window.location
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cleanup()
    resetConsentStoreForTests()
    document.cookie = `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/`
    window.localStorage.clear()
    reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } })
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('reloads when analytics that had been granted is withdrawn', () => {
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(serialiseRecord(createRecord(allChoices(true), 1)))}; Path=/`
    resetConsentStoreForTests()
    render(h(ConsentManager, { config: baseConfig(), optIn: true, initialDecided: true }))
    act(() => openCookieSettings())
    fireEvent.click(screen.getByRole('checkbox', { name: /Analytics/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save choices' }))

    expect(parseRecord(cookieValue())?.c.analytics).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on a first refusal, where nothing had been loaded', () => {
    render(h(ConsentManager, { config: baseConfig(), optIn: true, initialDecided: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }))
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('GTM without Consent Mode', () => {
  it('loads GTM only once both analytics and marketing are granted', async () => {
    vi.resetModules()
    document.head.innerHTML = ''
    const { syncAnalyticsTags } = await import('@/features/seo/components/AnalyticsLoader')
    const ids = { gtmContainerId: 'GTM-TEST2' }
    const gtmLoaded = () => Array.from(document.head.querySelectorAll('script')).some((s) => s.src.includes('googletagmanager.com/gtm.js'))

    syncAnalyticsTags(ids, false, makeChoices({ analytics: true }))
    expect(gtmLoaded()).toBe(false)

    syncAnalyticsTags(ids, false, makeChoices({ analytics: true, marketing: true }))
    expect(gtmLoaded()).toBe(true)
  })
})

const { seoContext } = vi.hoisted(() => ({
  seoContext: { value: { enabled: true, settings: {}, siteName: '', baseUrl: '' } as Record<string, unknown> },
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: (): undefined => undefined }) }))
vi.mock('@/features/seo/settings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/seo/settings')>()
  return { ...original, getSeoContext: async () => seoContext.value }
})

describe('consent banner with the SEO feature off', () => {
  // SeoScripts is an async server component; its consent branch is a nested async
  // component, so the test unwraps it once and renders the banner it returns.
  const renderConsentOnly = async (position: 'head' | 'bodyEnd' = 'head') => {
    const { SeoScripts } = await import('@/features/seo/components/SeoScripts')
    const element = (await SeoScripts({ position, country: 'DE' })) as unknown as { type: (p: unknown) => Promise<ReactElement>; props: unknown } | null
    return element ? await element.type(element.props) : null
  }

  beforeEach(() => {
    cleanup()
    resetConsentStoreForTests()
    document.cookie = `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/`
    window.localStorage.clear()
    seoContext.value = { enabled: false, settings: null, siteName: '', baseUrl: '' }
  })

  afterEach(() => {
    cleanup()
    seoContext.value = { enabled: true, settings: {}, siteName: '', baseUrl: '' }
  })

  it('still shows the banner when consent is on', async () => {
    getEngine.mockResolvedValue({ findGlobal: vi.fn().mockResolvedValue({ consent: { enabled: true, mode: 'opt-in-all' } }) })
    const inner = await renderConsentOnly('head')
    expect(inner).not.toBeNull()
    render(inner!)
    expect(screen.getByRole('region', { name: 'Cookies on this site' })).toBeTruthy()
  })

  it('shows nothing when consent is off, or at body end', async () => {
    getEngine.mockResolvedValue({ findGlobal: vi.fn().mockResolvedValue({ consent: { enabled: false } }) })
    expect(await renderConsentOnly('head')).toBeNull()
    getEngine.mockResolvedValue({ findGlobal: vi.fn().mockResolvedValue({ consent: { enabled: true } }) })
    expect(await renderConsentOnly('bodyEnd')).toBeNull()
  })
})
