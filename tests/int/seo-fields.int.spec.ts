import { describe, expect, it } from 'vitest'
import { seoFields } from '@/fields/seo'

describe('seoFields structure', () => {
  it('has exactly 10 fields in the correct order', () => {
    const fields = (seoFields.fields as Array<Record<string, unknown>> | undefined) || []
    const fieldNames = fields.map((f) => ('name' in f ? f.name : undefined))
    expect(fieldNames).toEqual([
      'metaTitle',
      'metaDescription',
      'canonicalUrl',
      'noIndex',
      'noFollow',
      'socialTitle',
      'socialDescription',
      'ogImage',
      'xCard',
      'xImage',
    ])
  })

  it('has no admin.position (moved from sidebar to middle)', () => {
    expect(seoFields.admin?.position).toBeUndefined()
  })

  it('xCard defaults to summary_large_image', () => {
    const fields = (seoFields.fields as Array<Record<string, unknown>> | undefined) || []
    const xCard = fields.find((f) => 'name' in f && f.name === 'xCard')
    expect(xCard?.defaultValue).toBe('summary_large_image')
  })

  it('has correct labels for each field', () => {
    const labels: Record<string, unknown> = {}
    const fields = (seoFields.fields as Array<Record<string, unknown>> | undefined) || []
    fields.forEach((f) => {
      if ('name' in f && 'label' in f) {
        labels[f.name as string] = f.label
      }
    })
    expect(labels['metaTitle']).toBe('Meta title')
    expect(labels['metaDescription']).toBe('Meta description')
    expect(labels['canonicalUrl']).toBe('Canonical URL')
    expect(labels['noIndex']).toBe('Hide from search engines (noindex)')
    expect(labels['noFollow']).toBe('Ask search engines not to follow links (nofollow)')
    expect(labels['socialTitle']).toBe('Social title')
    expect(labels['socialDescription']).toBe('Social description')
    expect(labels['ogImage']).toBe('Social image (shown when shared)')
    expect(labels['xCard']).toBe('X card type')
    expect(labels['xImage']).toBe('X image (optional)')
  })
})
