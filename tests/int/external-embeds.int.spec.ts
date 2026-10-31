// @vitest-environment node
// External embeds (admin): the allow-list box, the row state of a form, and the hosted address and snippets.
import { describe, expect, it } from 'vitest'

import { embedOutputs, embedRowFrom, parseAllowedOrigins } from '@/features/forms/embedAdmin'

describe('parseAllowedOrigins', () => {
  it('takes one website per line, bare hosts as https, and drops duplicates', () => {
    const { origins, invalid } = parseAllowedOrigins('example.com\nhttps://Partner.example.org/\n\nexample.com')
    expect(origins).toEqual(['https://example.com', 'https://partner.example.org'])
    expect(invalid).toEqual([])
  })

  it('accepts a wildcard subdomain and reports addresses with a path', () => {
    const { origins, invalid } = parseAllowedOrigins('https://*.example.com\nexample.com/shop')
    expect(origins).toEqual(['https://*.example.com'])
    expect(invalid).toEqual(['example.com/shop'])
  })

  it('returns nothing for an empty box, meaning any website', () => {
    expect(parseAllowedOrigins('   \n ')).toEqual({ origins: [], invalid: [] })
  })
})

describe('embedRowFrom', () => {
  it('reads the embed switch and websites from the stored config, not webhooks', () => {
    const row = embedRowFrom({
      id: 4,
      title: 'Join',
      formStatus: 'published',
      embedKey: 'abc_123',
      formConfig: { embed: { enabled: false, allowedOrigins: ['https://example.com'] }, webhooks: [{ id: 'w', secret: 's' }] } as never,
    })
    expect(row).toEqual({ id: 4, title: 'Join', published: true, embedKey: 'abc_123', enabled: false, allowedOrigins: ['https://example.com'] })
    expect(JSON.stringify(row)).not.toContain('secret')
  })

  it('treats a form with no embed settings as enabled for any website, and a draft as not published', () => {
    const row = embedRowFrom({ id: 5, formStatus: 'draft', embedKey: null, formConfig: null })
    expect(row).toMatchObject({ title: 'Form #5', published: false, enabled: true, allowedOrigins: [], embedKey: null })
  })
})

describe('embedOutputs', () => {
  it('builds the hosted address and both snippets from the site origin and key', () => {
    const out = embedOutputs('abc_123', 'https://site.example/')
    expect(out.hostedUrl).toBe('https://site.example/embed/forms/abc_123')
    expect(out.scriptSnippet).toContain('src="https://site.example/embed/forms.js"')
    expect(out.scriptSnippet).toContain('data-form="abc_123"')
    expect(out.iframeSnippet).toContain('src="https://site.example/embed/forms/abc_123"')
  })
})
