// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { domainBrand, domainSocials, domainTagline } from '@/features/domains/brand'
import { NO_OVERRIDES, normaliseDomains, type SiteDomain } from '@/features/domains/model'

const base = (overrides: Partial<SiteDomain['overrides']> = {}, socials: Partial<SiteDomain['overrides']['socials']> = {}): SiteDomain => ({
  host: 'example.com.au',
  label: 'Australia',
  defaultLocale: null,
  currencyHint: null,
  isPrimary: false,
  status: 'active',
  redirectToPrimary: false,
  allowAdmin: true,
  overrides: { ...NO_OVERRIDES, ...overrides, socials: { ...NO_OVERRIDES.socials, ...socials } },
})

describe('per-domain overrides on save', () => {
  it('reads and trims the override fields', () => {
    const { domains, errors } = normaliseDomains([
      {
        host: 'example.com',
        isPrimary: true,
        siteName: '  Grace & Gatsby AU ',
        tagline: '',
        logoUrl: '/logo-au.svg',
        contactEmail: 'hello@example.com',
        contactPhone: '+61 2 0000 0000',
        instagramUrl: 'https://instagram.com/gg',
      },
    ])
    expect(errors).toEqual([])
    expect(domains[0].overrides.siteName).toBe('Grace & Gatsby AU')
    expect(domains[0].overrides.tagline).toBeNull()
    expect(domains[0].overrides.socials.instagram).toBe('https://instagram.com/gg')
  })

  it('refuses bad URLs and emails, naming the host', () => {
    const { errors } = normaliseDomains([
      { host: 'example.com', isPrimary: true, logoUrl: 'javascript:alert(1)', contactEmail: 'nope', facebookUrl: 'http://insecure.example' },
    ])
    expect(errors.some((e) => e.includes('example.com') && e.includes('logo'))).toBe(true)
    expect(errors.some((e) => e.includes('contact email'))).toBe(true)
    expect(errors.some((e) => e.includes('Facebook'))).toBe(true)
  })
})

describe('domainBrand', () => {
  it('uses the domain name and logo when set, otherwise the site-wide values', () => {
    const site = { siteName: 'Grace & Gatsby', logo: { url: '/site.svg' } }
    expect(domainBrand(site, base({ siteName: 'G&G Australia' }))).toEqual({ siteName: 'G&G Australia', logo: { url: '/site.svg' } })
    expect(domainBrand(site, base({ logoUrl: '/au.svg' }))).toEqual({ siteName: 'Grace & Gatsby', logo: { url: '/au.svg' } })
    expect(domainBrand(site, null)).toBe(site)
  })
})

describe('domainSocials', () => {
  it('keeps the site list unless the domain sets a social link', () => {
    const site = { show: true, links: [{ platform: 'instagram', url: 'https://instagram.com/site' }] }
    expect(domainSocials(site, base())).toBe(site)
    expect(domainSocials(site, base({}, { x: 'https://x.com/au' }))).toEqual({ show: true, links: [{ platform: 'x', url: 'https://x.com/au' }] })
  })
})

describe('domainTagline', () => {
  it('falls back to the site tagline', () => {
    expect(domainTagline('Site tagline', base({ tagline: 'Australia tagline' }))).toBe('Australia tagline')
    expect(domainTagline('Site tagline', base())).toBe('Site tagline')
  })
})
