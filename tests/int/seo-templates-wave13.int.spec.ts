import { describe, expect, it } from 'vitest'

import { resolveSeo } from '@/features/seo/resolve'
import type { SeoContext } from '@/features/seo/settings'
import {
  clampDescription,
  contentTemplatesFor,
  renderTemplate,
  TEMPLATE_DESCRIPTION_LIMIT,
} from '@/features/seo/templates'

const SITE = 'Grace & Gatsby'

const contextWith = (templates: Record<string, string> | null, defaults: Record<string, string> = {}): SeoContext => ({
  enabled: true,
  baseUrl: 'https://example.com',
  siteName: SITE,
  settings: {
    defaults: { titleTemplate: '%page% | %site%', ...defaults },
    templates,
  } as unknown as SeoContext['settings'],
})

describe('renderTemplate', () => {
  it('returns an empty string for a blank or missing template', () => {
    expect(renderTemplate('', { title: 'A' })).toBe('')
    expect(renderTemplate('   ', { title: 'A' })).toBe('')
    expect(renderTemplate(null, { title: 'A' })).toBe('')
    expect(renderTemplate(undefined, { title: 'A' })).toBe('')
  })

  it('fills the title, site and separator tokens', () => {
    expect(renderTemplate('%title% %sep% %site%', { title: 'Spring Lunch', site: SITE })).toBe('Spring Lunch | Grace & Gatsby')
  })

  it('fills excerpt, category, price and date tokens', () => {
    const tokens = { excerpt: 'Short summary', category: 'Food', price: 12, date: '2026-10-14' }
    expect(renderTemplate('%excerpt% / %category% / %price% / %date%', tokens)).toBe('Short summary / Food / 12 / 2026-10-14')
  })

  it('treats a zero price as a real value and a null price as empty', () => {
    expect(renderTemplate('Price %price%', { price: 0 })).toBe('Price 0')
    expect(renderTemplate('Price %price%', { price: null })).toBe('Price')
  })

  it('removes tokens it does not know', () => {
    expect(renderTemplate('%title% %bogus% %site%', { title: 'A', site: 'B' })).toBe('A B')
  })

  it('matches token names regardless of case', () => {
    expect(renderTemplate('%TITLE% %Site%', { title: 'A', site: 'B' })).toBe('A B')
  })

  it('collapses double spaces and newlines inside a value', () => {
    expect(renderTemplate('%title%    %site%', { title: 'Line one\n  line two', site: 'B' })).toBe('Line one line two B')
  })

  it('drops a separator left with nothing beside it when an optional token is empty', () => {
    expect(renderTemplate('%title% %sep% %category% %sep% %site%', { title: 'Spring Lunch', site: SITE })).toBe('Spring Lunch | Grace & Gatsby')
  })

  it('drops a leading separator when the first token is empty', () => {
    expect(renderTemplate('%category% %sep% %title%', { title: 'Spring Lunch' })).toBe('Spring Lunch')
  })

  it('leaves a single separator between two filled tokens alone', () => {
    expect(renderTemplate('%title% | %site%', { title: 'A', site: 'B' })).toBe('A | B')
  })
})

describe('clampDescription', () => {
  it('returns short text unchanged apart from whitespace', () => {
    expect(clampDescription('  A short   description. ')).toBe('A short description.')
  })

  it('keeps text of exactly the limit', () => {
    const text = 'a'.repeat(TEMPLATE_DESCRIPTION_LIMIT)
    expect(clampDescription(text)).toBe(text)
  })

  it('cuts at a word boundary inside the limit', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
    const result = clampDescription(words)
    expect(result.length).toBeLessThanOrEqual(TEMPLATE_DESCRIPTION_LIMIT)
    expect(words.startsWith(result)).toBe(true)
    expect(words[result.length]).toBe(' ')
  })

  it('cuts at the limit when there is no space to break on', () => {
    const text = 'x'.repeat(200)
    expect(clampDescription(text)).toBe('x'.repeat(TEMPLATE_DESCRIPTION_LIMIT))
  })

  it('drops trailing punctuation left by the cut', () => {
    // The cut lands on "ab," just before a space, so the comma must go.
    const text = `${'word '.repeat(31)}ab, cdefgh ijklmnopqrstuvwxyz`
    const result = clampDescription(text)
    expect(result.endsWith(',')).toBe(false)
    expect(result.endsWith('ab')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(TEMPLATE_DESCRIPTION_LIMIT)
  })
})

describe('contentTemplatesFor', () => {
  it('reads the title and description templates for a content type', () => {
    const settings = { templates: { postTitleTemplate: 'T', postDescriptionTemplate: 'D' } }
    expect(contentTemplatesFor(settings, 'post')).toEqual({ title: 'T', description: 'D' })
  })

  it('returns blanks when the group or the settings are missing', () => {
    expect(contentTemplatesFor(null, 'event')).toEqual({ title: '', description: '' })
    expect(contentTemplatesFor({}, 'event')).toEqual({ title: '', description: '' })
  })

  it('ignores values that are not strings', () => {
    expect(contentTemplatesFor({ templates: { pageTitleTemplate: 42 } }, 'page')).toEqual({ title: '', description: '' })
  })
})

describe('resolveSeo with content-type templates', () => {
  it('keeps the site title template when no content template is set', () => {
    const result = resolveSeo(contextWith({}), { title: 'Spring Lunch', contentType: 'post' })
    expect(result.title).toBe('Spring Lunch | Grace & Gatsby')
  })

  it('uses the content-type title template when the document has no SEO title', () => {
    const ctx = contextWith({ postTitleTemplate: '%title% %sep% %category% %sep% %site%' })
    const result = resolveSeo(ctx, { title: 'Spring Lunch', contentType: 'post', tokens: { category: 'Food' } })
    expect(result.title).toBe('Spring Lunch | Food | Grace & Gatsby')
    expect(result.rawTitle).toBe('Spring Lunch')
  })

  it('does not add the site name twice when a content title template already has it', () => {
    const ctx = contextWith({ productTitleTemplate: '%title% %sep% %site%' })
    const result = resolveSeo(ctx, { title: 'Mug', contentType: 'product' })
    expect(result.title).toBe('Mug | Grace & Gatsby')
  })

  it('lets the document SEO title beat the content-type title template', () => {
    const ctx = contextWith({ postTitleTemplate: '%title% %sep% %site%' })
    const result = resolveSeo(ctx, { title: 'Spring Lunch', contentType: 'post', seo: { metaTitle: 'Custom' } })
    expect(result.title).toBe('Custom | Grace & Gatsby')
  })

  it('falls back to the site title template when the content template is blank', () => {
    const ctx = contextWith({ postTitleTemplate: '   ' })
    const result = resolveSeo(ctx, { title: 'Spring Lunch', contentType: 'post' })
    expect(result.title).toBe('Spring Lunch | Grace & Gatsby')
  })

  it('uses the content-type description template when the document has no SEO description', () => {
    const ctx = contextWith({ eventDescriptionTemplate: '%excerpt%' })
    const result = resolveSeo(ctx, { title: 'Quiz night', contentType: 'event', tokens: { excerpt: 'Bring a team.' } })
    expect(result.description).toBe('Bring a team.')
  })

  it('lets the document SEO description beat the content-type description template', () => {
    const ctx = contextWith({ eventDescriptionTemplate: '%excerpt%' })
    const result = resolveSeo(ctx, {
      title: 'Quiz night',
      contentType: 'event',
      seo: { metaDescription: 'Mine' },
      tokens: { excerpt: 'Bring a team.' },
    })
    expect(result.description).toBe('Mine')
  })

  it('trims a long content-type description to 160 characters at a word boundary', () => {
    const excerpt = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ')
    const ctx = contextWith({ postDescriptionTemplate: '%excerpt%' })
    const result = resolveSeo(ctx, { title: 'Post', contentType: 'post', tokens: { excerpt } })
    expect(result.description!.length).toBeLessThanOrEqual(TEMPLATE_DESCRIPTION_LIMIT)
    expect(excerpt.startsWith(result.description!)).toBe(true)
    expect(excerpt[result.description!.length]).toBe(' ')
  })

  it('uses the caller description when the content description template is blank', () => {
    const ctx = contextWith({ postDescriptionTemplate: '' })
    const result = resolveSeo(ctx, { title: 'Post', contentType: 'post', description: 'Caller text' })
    expect(result.description).toBe('Caller text')
  })

  it('uses the site default description when nothing else is set', () => {
    const ctx = contextWith({}, { metaDescription: 'Site default' })
    const result = resolveSeo(ctx, { title: 'Post', contentType: 'post' })
    expect(result.description).toBe('Site default')
  })

  it('ignores templates when no content type is passed', () => {
    const ctx = contextWith({ pageTitleTemplate: '%title% %sep% Templated' })
    const result = resolveSeo(ctx, { title: 'Plain' })
    expect(result.title).toBe('Plain | Grace & Gatsby')
  })
})
