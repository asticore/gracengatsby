import { describe, it, expect } from 'vitest'
import { buildSeoAnalysisInput, plainFormValues } from '@/admin/views/seoAnalysisInput'

describe('plainFormValues', () => {
  it('maps each form entry to its value and keeps missing entries as undefined', () => {
    const values = plainFormValues({
      title: { value: 'Hello' },
      'seo.metaTitle': { value: '' },
      slug: undefined,
    })
    expect(values).toEqual({ title: 'Hello', 'seo.metaTitle': '', slug: undefined })
  })

  it('returns an empty map for an empty form', () => {
    expect(plainFormValues({})).toEqual({})
  })
})

describe('buildSeoAnalysisInput', () => {
  it('reads the title, slug, meta fields and focus keyphrase from the dotted paths', () => {
    const input = buildSeoAnalysisInput({
      title: 'Blue widgets',
      slug: 'blue-widgets',
      'seo.metaTitle': 'Blue widgets for sale',
      'seo.metaDescription': 'Our blue widgets are made to last.',
      'seo.focusKeyphrase': 'blue widgets',
    })
    expect(input.title).toBe('Blue widgets')
    expect(input.slug).toBe('blue-widgets')
    expect(input.metaTitle).toBe('Blue widgets for sale')
    expect(input.metaDescription).toBe('Our blue widgets are made to last.')
    expect(input.keyphrase).toBe('blue widgets')
  })

  it('falls back to the document title when no meta title is set', () => {
    const input = buildSeoAnalysisInput({ title: 'About us', 'seo.metaTitle': '' })
    expect(input.metaTitle).toBe('About us')
  })

  it('uses the name field when a document has no title field', () => {
    const input = buildSeoAnalysisInput({ name: 'Summer sale' })
    expect(input.title).toBe('Summer sale')
    expect(input.metaTitle).toBe('Summer sale')
  })

  it('gives empty strings for missing or non-text values', () => {
    const input = buildSeoAnalysisInput({ title: 42, slug: null, 'seo.focusKeyphrase': undefined })
    expect(input.title).toBe('')
    expect(input.slug).toBe('')
    expect(input.keyphrase).toBe('')
    expect(input.metaDescription).toBe('')
  })

  it('returns no body text, headings, links or images for an empty document', () => {
    const input = buildSeoAnalysisInput({ title: 'Empty' })
    expect(input.text).toBe('')
    expect(input.headings).toEqual([])
    expect(input.links).toEqual([])
    expect(input.images).toEqual([])
  })
})
