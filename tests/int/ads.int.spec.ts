import { describe, expect, it } from 'vitest'

import { ADAPTERS, adsTxtLineFor, sanitiseParams, validateParams } from '@/features/ads/adapters'
import { ADS_TXT_MARKER, adsCspAdditions, buildAdsTxtLines, buildPrebidAdUnit, buildPrebidSetConfig, buildPublicConfig, extendCsp, mergeAdsTxt, prebidConsentManagement, reservedSpace, safeJson } from '@/features/ads/builders'
import { DEFAULT_ADS_SETTINGS, normaliseAdsSettings, normaliseUnit, nestSettingsRow } from '@/features/ads/config'
import { inFeedPositions, planAfterParagraphs } from '@/features/ads/inject'
import { adsAllowed, planScripts } from '@/features/ads/loader'
import { isLikelyBot, parseRange, parseTrackBody, ctrOf } from '@/features/ads/track'
import { parsePrebidUrl, parseSizes, parseTargeting, validateAdUnit, validatePlacement } from '@/features/ads/validate'
import { BUILT_IN_ROLES, can, PERMISSION_CATEGORIES, RESOURCES } from '@/features/roles/permissions'
import { DEFAULT_FLAGS } from '@/features/registry'
import { makeChoices } from '@/features/consent/consent'

const settings = normaliseAdsSettings(
  {
    adsense: { enabled: true, publisherId: 'pub-1234567890123456' },
    gam: { enabled: true, networkCode: '12345678' },
    prebid: {
      enabled: true,
      scriptUrl: 'https://cdn.example.com/prebid.js',
      bidders: { rubicon: { enabled: true, sellerId: '9999', params: { accountId: 1, siteId: 2 } }, amazon: { enabled: true, sellerId: '77', params: { pubID: '77' } } },
    },
  },
  true,
)
const unit = normaliseUnit({ key: 'top', name: 'Top', network: 'gam', sizesDesktop: '728x90, 970x250', sizesMobile: '320x50', prebid: true, bidderParams: { rubicon: { zoneId: 5 } }, targeting: 'section=news', floorPrice: 0.5, refreshEnabled: true, refreshSeconds: 45 })!

describe('defaults', () => {
  it('feature flag is off and nothing renders on a fresh install', () => {
    expect(DEFAULT_FLAGS.ads).toBe(false)
    expect(DEFAULT_ADS_SETTINGS.enabled).toBe(false)
    expect(buildPublicConfig(normaliseAdsSettings(undefined, false), [])).toBeNull()
    expect(buildAdsTxtLines(normaliseAdsSettings(undefined, false))).toEqual([])
    expect(adsCspAdditions(DEFAULT_ADS_SETTINGS)).toEqual({ script: [], frame: [] })
  })
})

describe('validation', () => {
  it('parses sizes and rejects junk', () => {
    expect(parseSizes('300x250, 320x50').sizes).toEqual([[300, 250], [320, 50]])
    expect(parseSizes('300x250<script>').error).toBeTruthy()
    expect(parseSizes('99999x1').error).toBeTruthy()
  })
  it('parses targeting strictly', () => {
    expect(parseTargeting('a=b,c').pairs).toEqual([['a', ['b', 'c']]])
    expect(parseTargeting('x=</script>').errors.length).toBe(1)
  })
  it('validates units and placements', () => {
    expect(validateAdUnit({ key: 'a', name: 'A', network: 'gam', sizesDesktop: '300x250' })).toEqual([])
    expect(validateAdUnit({ key: 'A B', name: 'A', network: 'gam', sizesDesktop: '300x250' }).length).toBeGreaterThan(0)
    expect(validateAdUnit({ key: 'a', name: 'A', network: 'adsense', slotId: '123456', refreshEnabled: true }).join()).toMatch(/refresh/i)
    expect(validateAdUnit({ key: 'a', name: 'A', network: 'gam', gamPath: '/12/x"onload' , sizesDesktop: '1x1'}).length).toBeGreaterThan(0)
    expect(validatePlacement({ key: 'p', name: 'P', unit: 1, mode: 'after-paragraph', afterParagraph: 3, repeatEvery: 0, maxPerPage: 2 })).toEqual([])
    expect(validatePlacement({ key: 'p', name: 'P', unit: 1, mode: 'in-feed' }).length).toBeGreaterThan(0)
  })
  it('only accepts safe prebid urls', () => {
    expect(parsePrebidUrl('https://cdn.example.com/p.js')?.origin).toBe('https://cdn.example.com')
    expect(parsePrebidUrl('/prebid.js')?.origin).toBeNull()
    for (const bad of ['javascript:alert(1)', 'http://x.com/p.js', '//evil.com/p.js', 'https://u:p@x.com/p.js', 'https://x.com/p.js?a=1', '/../x.js']) expect(parsePrebidUrl(bad)).toBeNull()
  })
  it('validates bidder params', () => {
    expect(validateParams('rubicon', { accountId: 1, siteId: 2, zoneId: 3 }, { requireAll: true })).toEqual([])
    expect(validateParams('rubicon', { accountId: 'x"' }).length).toBeGreaterThan(0)
    expect(validateParams('rubicon', { evil: 1 }).length).toBeGreaterThan(0)
    expect(sanitiseParams('pubmatic', { publisherId: '<b>', adSlot: 'ok@1x1' })).toEqual({ adSlot: 'ok@1x1' })
  })
})

describe('builders', () => {
  it('safeJson cannot close a script element', () => {
    const out = safeJson({ a: '</script><!-- ' })
    expect(out).not.toContain('<')
    expect(JSON.parse(out).a).toBe('</script><!-- ')
  })
  it('builds public config with merged bidder params and TAM', () => {
    const cfg = buildPublicConfig(settings, [unit])!
    const u = cfg.units.top!
    expect(u.path).toBe('/12345678/top')
    expect(u.bids).toEqual([{ bidder: 'rubicon', params: { accountId: 1, siteId: 2, zoneId: 5 } }])
    expect(u.tam).toBe('77')
    expect(u.refresh).toEqual({ seconds: 45, viewable: true, max: 10 })
    expect(cfg.prebid?.url).toBe('https://cdn.example.com/prebid.js')
  })
  it('builds prebid config', () => {
    const cfg = buildPublicConfig(settings, [unit])!
    const set = buildPrebidSetConfig(cfg.prebid!, Object.values(cfg.units), prebidConsentManagement({ gdprApplies: true, hasTcfApi: true, timeout: 1500 }))
    expect(set.priceGranularity).toBe('medium')
    expect((set.floors as any).data.values.top).toBe(0.5)
    expect(set.consentManagement).toBeDefined()
    expect(prebidConsentManagement({ gdprApplies: true, hasTcfApi: false, timeout: 1 })).toBeUndefined()
    const au = buildPrebidAdUnit(cfg.units.top!, 'engage-ad-top-1', [[728, 90]])
    expect(au.code).toBe('engage-ad-top-1')
  })
  it('reserves the tallest size per breakpoint', () => {
    expect(reservedSpace(unit)).toMatchObject({ mobile: 50, desktop: 250, maxWidth: 970 })
  })
  it('generates ads.txt lines and merges without touching user lines', () => {
    const lines = buildAdsTxtLines(settings)
    expect(lines).toContain('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0')
    expect(lines).toContain('rubiconproject.com, 9999, DIRECT, 0bfd66d529a55807')
    expect(adsTxtLineFor('amazon', '77')).toBe('aps.amazon.com, 77, DIRECT')
    const user = '# mine\nGOOGLE.com,pub-1234567890123456,direct,f08c47fec0942fa0\nfoo.com, 1, RESELLER'
    const merged = mergeAdsTxt(user, lines)!
    expect(merged.startsWith(user)).toBe(true)
    expect(merged.match(/google\.com/gi)?.length).toBe(1)
    expect(merged).toContain(ADS_TXT_MARKER)
    expect(mergeAdsTxt('', [])).toBeNull()
    expect(mergeAdsTxt(user, [])).toBe(`${user}\n`)
  })
  it('extends CSP only for enabled networks', () => {
    const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src 'self'"
    const out = extendCsp(csp, adsCspAdditions(settings))
    expect(out).toContain('https://securepubads.g.doubleclick.net')
    expect(out).toContain('https://cdn.example.com')
    expect(out).toContain('https://c.amazon-adsystem.com')
    expect(out).toContain("default-src 'self'")
    expect(extendCsp(csp, adsCspAdditions(DEFAULT_ADS_SETTINGS))).toBe(csp)
  })
  it('reads a flat D1 row', () => {
    const s = normaliseAdsSettings(nestSettingsRow({ adsense_enabled: 1, adsense_publisher_id: 'ca-pub-1234567890', prebid_bidders: '{"ix":{"enabled":true,"sellerId":"5"}}' }), true)
    expect(s.adsense.enabled).toBe(true)
    expect(s.prebid.bidders.ix!.sellerId).toBe('5')
  })
  it('knows every adapter', () => expect(ADAPTERS.map((a) => a.code)).toEqual(['appnexus', 'rubicon', 'pubmatic', 'openx', 'ix', 'amazon']))
})

describe('placement injection', () => {
  const p = (t: string) => ({ type: 'paragraph', children: [{ text: t }] })
  const nodes = [p('1'), p('2'), p('3'), p('4'), p('5'), p('6')]
  it('inserts after paragraph N once', () => {
    const { segments, used } = planAfterParagraphs(nodes, [{ key: 'a', after: 2, repeatEvery: 0, max: 1 }], 5)
    expect(used).toBe(1)
    expect(segments.map((s) => s.type)).toEqual(['nodes', 'ad', 'nodes'])
    expect((segments[0] as any).nodes).toHaveLength(2)
  })
  it('repeats, respects max and budget, skips the end and empty paragraphs', () => {
    expect(planAfterParagraphs(nodes, [{ key: 'a', after: 2, repeatEvery: 2, max: 5 }], 9).used).toBe(2) // after 2 and 4 (6 is last)
    expect(planAfterParagraphs(nodes, [{ key: 'a', after: 2, repeatEvery: 2, max: 1 }], 9).used).toBe(1)
    expect(planAfterParagraphs(nodes, [{ key: 'a', after: 2, repeatEvery: 2, max: 5 }], 1).used).toBe(1)
    expect(planAfterParagraphs([p('1'), p('2')], [{ key: 'a', after: 2, repeatEvery: 0, max: 1 }], 5).used).toBe(0)
    const blank = { type: 'paragraph', children: [] as unknown[] }
    expect(planAfterParagraphs([p('1'), blank, p('2'), p('3')], [{ key: 'a', after: 2, repeatEvery: 0, max: 1 }], 5).segments[0]).toMatchObject({ nodes: [expect.anything(), blank, expect.anything()] })
  })
  it('in-feed positions', () => {
    expect(inFeedPositions(10, 3)).toEqual([2, 5, 8])
    expect(inFeedPositions(3, 3)).toEqual([])
    expect(inFeedPositions(10, 1)).toEqual([])
  })
})

describe('consent gating', () => {
  const cfg = buildPublicConfig(settings, [unit])!
  it('loads nothing without marketing consent', () => {
    expect(planScripts(cfg, makeChoices({ analytics: true, preferences: true }))).toEqual([])
    expect(adsAllowed(makeChoices({}))).toBe(false)
  })
  it('loads scripts with marketing, but not on no-ads pages', () => {
    const granted = makeChoices({ marketing: true })
    expect(planScripts(cfg, granted).map((s) => s.id)).toEqual(['engage-ads-prebid', 'engage-ads-apstag', 'engage-ads-gpt', 'engage-ads-adsense'.replace('engage-ads-adsense', 'engage-ads-adsense')])
    expect(planScripts(cfg, granted, { noAds: true })).toEqual([])
    expect(planScripts(cfg, granted, { needs: { gam: false, adsense: false } })).toEqual([])
    expect(planScripts(null, granted)).toEqual([])
  })
})

describe('tracking and report input', () => {
  it('accepts only the fixed shape', () => {
    expect(parseTrackBody({ u: 'top', e: 'v', b: 'd' })).toEqual({ unit: 'top', event: 'v', bp: 'd' })
    expect(parseTrackBody({ u: 'top', e: 'v', b: 'd', x: 1 })).toBeNull()
    expect(parseTrackBody({ u: 'T O P', e: 'v', b: 'd' })).toBeNull()
    expect(parseTrackBody([])).toBeNull()
  })
  it('flags bots and computes honest CTR', () => {
    expect(isLikelyBot('Googlebot/2.1')).toBe(true)
    expect(isLikelyBot(null)).toBe(true)
    expect(isLikelyBot('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe(false)
    expect(ctrOf(100, 0)).toBeNull()
    expect(ctrOf(100, 2)).toBe(0.02)
  })
  it('bounds report ranges', () => {
    const now = new Date('2026-10-11T00:00:00Z')
    expect(parseRange(undefined, undefined, now)).toEqual({ from: '2026-09-12', to: '2026-10-11' })
    expect(parseRange('2020-01-01', '2026-10-11', now).from).toBe('2025-10-11')
    expect(parseRange('junk', 'junk', now).to).toBe('2026-10-11')
  })
})

describe('permissions', () => {
  it('registers ad resources once, admin only by default', () => {
    for (const r of ['ad-units', 'ad-placements', 'ad-reports', 'settings:ad-settings'] as const) {
      expect(RESOURCES).toContain(r)
      expect(PERMISSION_CATEGORIES.flatMap((c) => c.rows).filter((x) => x.resource === r)).toHaveLength(1)
      expect(can({ roles: ['admin'] }, r, 'read')).toBe(true)
      expect(can({ roles: ['editor'] }, r, 'read')).toBe(false)
      expect(BUILT_IN_ROLES.editor![r]).toBeUndefined()
    }
  })
})

describe('ads settings permission copy', () => {
  it('says the settings permission is admin-equivalent', () => {
    const row = PERMISSION_CATEGORIES.flatMap((c) => c.rows).find((r) => r.resource === 'settings:ad-settings')
    expect(row?.label).toMatch(/admin-equivalent/i)
    expect(row?.description).toMatch(/third-party/i)
  })
})
