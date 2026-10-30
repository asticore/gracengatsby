import { describe, expect, it } from 'vitest'

import { domainEditorUrl, isMultiDomain, normaliseAdminRoot, otherDomains, type TrackingDomainInfo } from '@/features/tracking/editor/domains'
import { tagPagePath } from '@/features/tracking/editor/tagPage'

const d = (host: string, extra: Partial<TrackingDomainInfo> = {}): TrackingDomainInfo => ({ host, label: host, allowAdmin: true, isPrimary: false, active: true, ...extra })

describe('tag editor multi-domain rules', () => {
  const domains = [d('shop.example.com'), d('example.com', { isPrimary: true }), d('old.example.com', { active: false })]

  it('lists the other active domains, primary first, and skips the current host and disabled ones', () => {
    expect(otherDomains(domains, 'shop.example.com').map((x) => x.host)).toEqual(['example.com'])
    expect(otherDomains(domains, 'EXAMPLE.com').map((x) => x.host)).toEqual(['shop.example.com'])
    expect(otherDomains(domains, null).map((x) => x.host)).toEqual(['example.com', 'shop.example.com'])
  })

  it('reports multi-domain only with more than one active domain', () => {
    expect(isMultiDomain(domains)).toBe(true)
    expect(isMultiDomain([d('example.com', { isPrimary: true })])).toBe(false)
    expect(isMultiDomain([d('a.com'), d('b.com', { active: false })])).toBe(false)
  })

  it('normalises the admin root', () => {
    expect(normaliseAdminRoot('/engage/')).toBe('/engage')
    expect(normaliseAdminRoot('secure')).toBe('/secure')
    expect(normaliseAdminRoot('')).toBe('/admin')
    expect(normaliseAdminRoot(null)).toBe('/admin')
  })

  it('builds the editor URL on another domain under its admin root', () => {
    expect(domainEditorUrl({ host: 'shop.example.com' }, '/engage', 'https:')).toBe('https://shop.example.com/engage/settings/tracking?tags=open')
    expect(domainEditorUrl({ host: 'shop.example.com' }, '', 'https')).toBe('https://shop.example.com/admin/settings/tracking?tags=open')
  })
})

describe('tag page for Open in editor', () => {
  it('uses the exact or starts-with path of a rule, without a language prefix', () => {
    expect(tagPagePath({ urlMatchMode: 'exact', urlMatch: '/shop/blue-mug/' })).toBe('/shop/blue-mug')
    expect(tagPagePath({ urlMatchMode: 'starts', urlMatch: '/shop' })).toBe('/shop')
  })

  it('falls back to the home page for any or contains rules and empty rules', () => {
    expect(tagPagePath({ urlMatchMode: 'any', urlMatch: null })).toBe('/')
    expect(tagPagePath({ urlMatchMode: 'contains', urlMatch: 'shop' })).toBe('/')
    expect(tagPagePath({ urlMatchMode: 'exact', urlMatch: '  ' })).toBe('/')
    expect(tagPagePath({ urlMatchMode: null, urlMatch: null })).toBe('/')
  })
})
