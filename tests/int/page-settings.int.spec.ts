import { describe, expect, it } from 'vitest'

import {
  finalSlug,
  pageAvailability,
  pageSettingsPatch,
  readPageSettings,
  sanitiseSlug,
  titleHint,
  descriptionHint,
  validatePageSettings,
} from '@/views/visualEditor/pageSettings'

const doc = { title: 'Home', slug: 'home', _status: 'draft', seo: { metaTitle: 'T', metaDescription: 'D', ogImage: { id: 7 }, noIndex: true } }

describe('page settings helpers', () => {
  it('reads values from a doc, including populated media', () => {
    expect(readPageSettings(doc)).toEqual({ title: 'Home', slug: 'home', status: 'draft', metaTitle: 'T', metaDescription: 'D', ogImage: 7, noIndex: true })
    expect(readPageSettings(null).ogImage).toBeNull()
  })

  it('sanitises slugs', () => {
    expect(sanitiseSlug('Hello  World!')).toBe('hello-world-')
    expect(finalSlug('  Café -- Menu ')).toBe('cafe-menu')
  })

  it('builds a minimal patch', () => {
    const avail = pageAvailability(doc)
    const initial = readPageSettings(doc)
    expect(pageSettingsPatch(initial, initial, avail)).toEqual({})
    const next = { ...initial, title: ' New ', slug: 'new-', status: 'published' as const, ogImage: null as number | null, metaTitle: 'X' }
    expect(pageSettingsPatch(next, initial, avail)).toEqual({ title: 'New', slug: 'new', _status: 'published', seo: { metaTitle: 'X', ogImage: null } })
  })

  it('omits fields the doc does not have', () => {
    const avail = pageAvailability({ title: 'x' })
    const initial = readPageSettings({ title: 'x' })
    expect(pageSettingsPatch({ ...initial, slug: 'a', noIndex: true }, initial, avail)).toEqual({})
  })

  it('validates and hints', () => {
    const s = readPageSettings(doc)
    expect(validatePageSettings({ ...s, title: ' ', slug: 'Bad Slug' }, pageAvailability(doc))).toHaveLength(2)
    expect(titleHint('a'.repeat(61)).level).toBe('long')
    expect(descriptionHint('').level).toBe('empty')
    expect(descriptionHint('ok').level).toBe('ok')
  })
})
