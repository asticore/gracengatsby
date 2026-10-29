// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { hostFromHeader, normaliseHost } from '@/features/domains/host'
import { matchDomain, NO_OVERRIDES, normaliseDomains, primaryOf, type SiteDomain } from '@/features/domains/model'
import { domainAlternates, mergeAlternates } from '@/features/domains/alternates'
import { DEFAULT_MULTILINGUAL_SETTINGS } from '@/features/multilingual/settings'

const registry = vi.hoisted(() => ({ domains: [] as SiteDomain[] }))

vi.mock('@/features/domains/store', () => ({
  readDomainsFromD1: async () => registry.domains,
}))

vi.mock('@/features/multilingual/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/multilingual/settings')>()),
  readMultilingualSettingsFromD1: async () => ({
    ...DEFAULT_MULTILINGUAL_SETTINGS,
    enabled: true,
    defaultLocale: 'en-AU',
    activeLocales: ['en-AU', 'en-GB'],
  }),
}))

const site = (overrides: Partial<SiteDomain> & { host: string }): SiteDomain => ({
  overrides: NO_OVERRIDES,
  label: overrides.host,
  defaultLocale: null,
  currencyHint: null,
  isPrimary: false,
  status: 'active',
  redirectToPrimary: false,
  allowAdmin: true,
  ...overrides,
})

describe('normaliseHost', () => {
  it.each([
    ['Example.COM', 'example.com'],
    ['https://example.com.au/shop?x=1', 'example.com.au'],
    ['example.co.uk.', 'example.co.uk'],
    ['  shop.example.de  ', 'shop.example.de'],
    ['example.xn--p1ai', 'example.xn--p1ai'],
  ])('accepts %s as %s', (input, host) => {
    expect(normaliseHost(input)).toEqual({ ok: true, host })
  })

  it.each([
    '',
    'example.com:8080',
    '*.example.com',
    'localhost',
    '192.168.0.10',
    'user@example.com',
    'exa mple.com',
    'example',
    'bad_host.com',
    '-bad.example.com',
  ])('refuses %j', (input) => {
    expect(normaliseHost(input).ok).toBe(false)
  })
})

describe('hostFromHeader', () => {
  it('lower-cases and drops the port and a trailing dot', () => {
    expect(hostFromHeader('Example.com:443')).toBe('example.com')
    expect(hostFromHeader('example.com.')).toBe('example.com')
    expect(hostFromHeader(null)).toBe('')
  })
})

describe('normaliseDomains', () => {
  it('normalises a valid set and drops blank rows', () => {
    const { domains, errors } = normaliseDomains(
      [
        { host: 'Example.com', isPrimary: true, defaultLocale: 'en-AU', status: 'active' },
        { host: '', label: '' },
        { host: 'example.com.au', currencyHint: 'aud', defaultLocale: 'en-AU' },
      ],
      ['en-AU'],
    )
    expect(errors).toEqual([])
    expect(domains.map((d) => d.host)).toEqual(['example.com', 'example.com.au'])
    expect(domains[1].currencyHint).toBe('AUD')
    expect(domains[1].allowAdmin).toBe(true)
  })

  it('requires exactly one primary', () => {
    expect(normaliseDomains([{ host: 'a.com' }, { host: 'b.com' }]).errors).toContain('Choose exactly one primary domain.')
    expect(normaliseDomains([{ host: 'a.com', isPrimary: true }, { host: 'b.com', isPrimary: true }]).errors).toContain(
      'Choose exactly one primary domain.',
    )
  })

  it('requires the primary to be active', () => {
    const { errors } = normaliseDomains([{ host: 'a.com', isPrimary: true, status: 'disabled' }])
    expect(errors).toContain('The primary domain must be active.')
  })

  it('reports duplicates, unknown languages and bad currencies', () => {
    const { errors } = normaliseDomains(
      [
        { host: 'a.com', isPrimary: true, defaultLocale: 'fr-FR' },
        { host: 'A.com' },
        { host: 'b.com', currencyHint: 'DOLLARS' },
      ],
      ['en-AU'],
    )
    expect(errors.some((e) => e.includes('listed more than once'))).toBe(true)
    expect(errors.some((e) => e.includes('fr-FR'))).toBe(true)
    expect(errors.some((e) => e.includes('three-letter'))).toBe(true)
  })
})

describe('matching', () => {
  const domains = [site({ host: 'example.com', isPrimary: true }), site({ host: 'example.com.au' }), site({ host: 'old.example.com', status: 'disabled' })]

  it('matches only active hosts', () => {
    expect(matchDomain('example.com.au', domains)?.host).toBe('example.com.au')
    expect(matchDomain('old.example.com', domains)).toBeNull()
    expect(matchDomain('other.test', domains)).toBeNull()
    expect(primaryOf(domains)?.host).toBe('example.com')
  })
})

describe('domainAlternates', () => {
  const settings = { ...DEFAULT_MULTILINGUAL_SETTINGS, defaultLocale: 'en-AU', activeLocales: ['en-AU', 'en-GB'] }
  const domains = [
    site({ host: 'example.com', isPrimary: true, defaultLocale: 'en-US' }),
    site({ host: 'example.co.uk', defaultLocale: 'en-GB' }),
  ]

  it('lists each active domain with its own language and x-default on the primary', () => {
    expect(domainAlternates('/about', domains, settings)).toEqual([
      { hreflang: 'en-US', href: 'https://example.com/about' },
      { hreflang: 'en-GB', href: 'https://example.co.uk/about' },
      { hreflang: 'x-default', href: 'https://example.com/about' },
    ])
  })

  it('adds nothing with a single active domain', () => {
    expect(domainAlternates('/', [domains[0]], settings)).toEqual([])
  })

  it('merges with same-site alternates without losing the cross-domain x-default', () => {
    const merged = mergeAlternates(
      [{ hreflang: 'en-AU', href: 'https://example.com.au/' }, { hreflang: 'x-default', href: 'https://example.com.au/' }],
      domainAlternates('/', domains, settings),
    )
    expect(merged.find((a) => a.hreflang === 'x-default')?.href).toBe('https://example.com/')
    expect(merged.some((a) => a.href === 'https://example.com.au/')).toBe(true)
  })
})

describe('domainMiddleware', () => {
  beforeEach(() => {
    registry.domains = [
      site({ host: 'example.com', isPrimary: true }),
      site({ host: 'example.com.au', defaultLocale: null, redirectToPrimary: true }),
      site({ host: 'example.co.uk', defaultLocale: 'en-GB', allowAdmin: false }),
    ]
  })

  const call = async (url: string, init: { host?: string; headers?: Record<string, string>; cookie?: string } = {}) => {
    const { domainMiddleware } = await import('@/features/domains/middleware')
    const headers: Record<string, string> = { host: init.host ?? new URL(url).host, ...(init.headers ?? {}) }
    if (init.cookie) headers.cookie = init.cookie
    const request = new NextRequest(url, { headers })
    const seen: NextRequest[] = []
    const response = await domainMiddleware(request, async (routed) => {
      seen.push(routed)
      return new Response(null, { headers: { 'x-middleware-next': '1' } }) as unknown as import('next/server').NextResponse
    })
    return { response, seen: seen[0], request }
  }

  it('leaves unknown hosts alone and strips spoofed domain headers', async () => {
    const { seen, request } = await call('https://workers.example.test/about', { headers: { 'x-eg-domain': 'example.com' } })
    expect(seen.headers.has('x-eg-domain')).toBe(false)
    expect(seen).not.toBe(request)
    const plain = await call('https://workers.example.test/about')
    expect(plain.seen).toBe(plain.request)
  })

  it('redirects a redirecting domain to the primary, keeping path and query', async () => {
    const { response } = await call('https://example.com.au/shop/item?x=1', { host: 'example.com.au' })
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://example.com/shop/item?x=1')
  })

  it('does not redirect API paths', async () => {
    const { seen } = await call('https://example.com.au/api/hook', { host: 'example.com.au' })
    expect(seen.headers.get('x-eg-domain')).toBe('example.com.au')
  })

  it('sends admin on a domain with admin off to the primary, and never the primary', async () => {
    const off = await call('https://example.co.uk/admin/pages', { host: 'example.co.uk' })
    expect(off.response.headers.get('location')).toBe('https://example.com/admin/pages')
    const primary = await call('https://example.com/admin/pages', { host: 'example.com' })
    expect(primary.response.status).not.toBe(308)
    expect(primary.seen.headers.get('x-eg-domain')).toBe('example.com')
  })

  it('passes the domain language only when there is no locale cookie', async () => {
    const plain = await call('https://example.co.uk/about', { host: 'example.co.uk' })
    expect(plain.seen.headers.get('x-eg-domain-locale')).toBe('en-GB')
    const cookied = await call('https://example.co.uk/about', { host: 'example.co.uk', cookie: 'eg_locale=fr' })
    expect(cookied.seen.headers.get('x-eg-domain-locale')).toBeNull()
  })
})
