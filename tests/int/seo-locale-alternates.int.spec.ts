import { describe, expect, it } from 'vitest'

import type { MultilingualSettings } from '@/features/multilingual/settings'
import { hreflangAlternates, localeSeoFields, languagesMap, ogLocale, sitemapVariants } from '@/features/seo/localeSeo'
import { renderSitemapXml, type SitemapEntry } from '@/features/seo/sitemap'

const BASE = 'https://example.com'

const on: MultilingualSettings = {
  enabled: true,
  defaultLocale: 'en-AU',
  activeLocales: ['en-AU', 'fr', 'zh-Hans'],
  fallbackToDefault: true,
  requireReview: false,
  adminsBypassReview: true,
  translationRules: {},
  machine: { enabled: false, defaultProvider: null, overrides: {}, monthlyCharLimit: 0, autoDraft: false },
  showLanguageSwitcher: true,
  switcherPosition: 'header',
}
const off: MultilingualSettings = { ...on, enabled: false }
const single: MultilingualSettings = { ...on, activeLocales: ['en-AU'] }

describe('hreflangAlternates', () => {
  it('emits one alternate per active locale plus x-default on the default-locale URL', () => {
    expect(hreflangAlternates('/about', BASE, on)).toEqual([
      { hreflang: 'en-AU', href: `${BASE}/about` },
      { hreflang: 'fr', href: `${BASE}/fr/about` },
      { hreflang: 'zh-Hans', href: `${BASE}/zh-Hans/about` },
      { hreflang: 'x-default', href: `${BASE}/about` },
    ])
  })

  it('uses the root URL for the home page', () => {
    const alternates = hreflangAlternates('/', BASE, on) ?? []
    expect(alternates.find((a) => a.hreflang === 'fr')?.href).toBe(`${BASE}/fr`)
    expect(alternates.find((a) => a.hreflang === 'x-default')?.href).toBe(`${BASE}/`)
  })

  it('returns null while multilingual is off or only one language is active', () => {
    expect(hreflangAlternates('/about', BASE, off)).toBeNull()
    expect(hreflangAlternates('/about', BASE, single)).toBeNull()
  })

  it('maps to the languages shape Next expects', () => {
    const alternates = hreflangAlternates('/about', BASE, on) ?? []
    expect(languagesMap(alternates)['x-default']).toBe(`${BASE}/about`)
    expect(languagesMap(alternates).fr).toBe(`${BASE}/fr/about`)
  })
})

describe('localeSeoFields', () => {
  it('sets a self-referencing canonical for the request language', () => {
    const fields = localeSeoFields({ baseUrl: BASE, path: '/about', locale: 'fr', settings: on, explicitCanonical: false })
    expect(fields?.canonical).toBe(`${BASE}/fr/about`)
    expect(fields?.ogLocale).toBe('fr_FR')
    expect(fields?.ogAlternateLocales).toEqual(['en_AU', 'zh_CN'])
  })

  it('keeps the unprefixed canonical on the default locale', () => {
    const fields = localeSeoFields({ baseUrl: BASE, path: '/about', locale: 'en-AU', settings: on, explicitCanonical: false })
    expect(fields?.canonical).toBe(`${BASE}/about`)
    expect(fields?.ogLocale).toBe('en_AU')
  })

  it('leaves an explicit canonical override alone but still emits alternates', () => {
    const fields = localeSeoFields({ baseUrl: BASE, path: '/about', locale: 'fr', settings: on, explicitCanonical: true })
    expect(fields?.canonical).toBeUndefined()
    expect(fields?.alternates.length).toBe(4)
  })

  it('is null when multilingual does not apply', () => {
    expect(localeSeoFields({ baseUrl: BASE, path: '/a', locale: 'fr', settings: off, explicitCanonical: false })).toBeNull()
  })
})

describe('ogLocale', () => {
  it('uses the region when present, a default territory otherwise', () => {
    expect(ogLocale('en-AU')).toBe('en_AU')
    expect(ogLocale('fr')).toBe('fr_FR')
    expect(ogLocale('zh-Hans')).toBe('zh_CN')
    expect(ogLocale('xx')).toBe('xx')
  })
})

describe('sitemapVariants', () => {
  it('returns the single unprefixed URL with no alternates while multilingual is off', () => {
    expect(sitemapVariants('/about', BASE, off)).toEqual([{ url: `${BASE}/about` }])
    expect(sitemapVariants('/', BASE, off)).toEqual([{ url: `${BASE}/` }])
  })

  it('returns one variant per active locale, each carrying the full alternate set', () => {
    const variants = sitemapVariants('/about', BASE, on)
    expect(variants.map((v) => v.url)).toEqual([`${BASE}/about`, `${BASE}/fr/about`, `${BASE}/zh-Hans/about`])
    for (const variant of variants) expect(variant.alternates).toHaveLength(4)
  })
})

describe('renderSitemapXml', () => {
  const plain: SitemapEntry = { url: `${BASE}/about`, changeFrequency: 'weekly', priority: 0.8 }

  it('keeps the original single-language document unchanged', () => {
    const xml = renderSitemapXml([plain])
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url>\n    <loc>https://example.com/about</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n' +
        '</urlset>\n',
    )
    expect(xml).not.toContain('xhtml')
  })

  it('declares the xhtml namespace and lists every alternate for each locale entry', () => {
    const alternates = hreflangAlternates('/about', BASE, on) ?? []
    const xml = renderSitemapXml(
      sitemapVariants('/about', BASE, on).map((v) => ({ ...plain, url: v.url, alternates: v.alternates })),
    )
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml.match(/<url>/g)).toHaveLength(3)
    for (const alt of alternates) {
      expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${alt.href}" />`)
    }
    expect(xml).toContain('<loc>https://example.com/fr/about</loc>')
  })

  it('escapes alternate hrefs', () => {
    const xml = renderSitemapXml([{ ...plain, alternates: [{ hreflang: 'en', href: `${BASE}/a?b=1&c=2` }] }])
    expect(xml).toContain('href="https://example.com/a?b=1&amp;c=2"')
  })
})
