import { describe, it, expect } from 'vitest'
import { resolveActiveTab, SETTINGS_PAGES } from '@/admin/settingsPages'

describe('resolveActiveTab', () => {
  const slugs = ['site-settings', 'integrations', 'language-settings']

  it('defaults to the first tab when there is no hash', () => {
    expect(resolveActiveTab('', slugs)).toBe('site-settings')
  })

  it('selects the tab named by the hash, with or without #', () => {
    expect(resolveActiveTab('#integrations', slugs)).toBe('integrations')
    expect(resolveActiveTab('language-settings', slugs)).toBe('language-settings')
  })

  it('falls back to the first tab for an unknown hash', () => {
    expect(resolveActiveTab('#nope', slugs)).toBe('site-settings')
    expect(resolveActiveTab('#', slugs)).toBe('site-settings')
  })

  it('decodes percent-encoded hashes and tolerates malformed ones', () => {
    expect(resolveActiveTab('#integr%61tions', slugs)).toBe('integrations')
    expect(resolveActiveTab('#%E0%A4%A', slugs)).toBe('site-settings')
  })

  it('returns an empty string when there are no tabs', () => {
    expect(resolveActiveTab('#anything', [])).toBe('')
  })
})

describe('Site settings page tabs config', () => {
  it('adds the cookie consent link after the integrations global', () => {
    const site = SETTINGS_PAGES.find((p) => p.key === 'site')!
    const idx = site.sections.findIndex((s) => s.kind === 'global' && s.slug === 'integrations')
    expect(site.sections[idx + 1]).toEqual({
      kind: 'link',
      label: 'Cookie consent',
      href: '/cookie-consent',
      type: 'view',
      description: 'Banner text, colours, preview and consent log',
    })
  })
})
