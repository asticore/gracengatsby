import { describe, expect, it } from 'vitest'

import { MAX_TAG_INPUT, resolveTags } from '@/lib/dynamicTags'

const ctx = {
  post: { title: 'A <b>Tale</b> & "more"', date: '2026-10-20T10:00:00Z', excerpt: 'Short', author: 'Grace' },
  page: { title: 'Journal' },
  site: { name: 'Grace & Gatsby', year: 2026 },
  product: { title: 'Vase', price: 12.5 },
}

describe('resolveTags', () => {
  it('replaces all known tags', () => {
    expect(resolveTags('{{post.author}} on {{page.title}} at {{site.name}} {{site.year}} {{product.title}} {{post.excerpt}}', ctx))
      .toBe('Grace on Journal at Grace &amp; Gatsby 2026 Vase Short')
  })
  it('escapes values and literal text', () => {
    expect(resolveTags('<i>{{post.title}}</i>', ctx)).toBe('&lt;i&gt;A &lt;b&gt;Tale&lt;/b&gt; &amp; &quot;more&quot;&lt;/i&gt;')
  })
  it('drops unknown tags and never throws', () => {
    expect(resolveTags('a{{nope.x}}b{{post.title.x}}c', { post: { title: 'T' } })).toBe('abc')
    expect(resolveTags(undefined, ctx)).toBe('')
    expect(resolveTags('{{post.title}}', undefined as never)).toBe('')
  })
  it('does not nest or re-expand values', () => {
    expect(resolveTags('{{post.title}}', { post: { title: '{{site.name}}' }, site: { name: 'X' } })).toBe('{{site.name}}')
    expect(resolveTags('{{post.{{page.title}}}}', ctx)).toBe('{{post.Journal}}')
  })
  it('formats dates', () => {
    expect(resolveTags('{{post.date}}', { ...ctx, dateFormat: 'short' })).toBe('20/10/2026')
    expect(resolveTags('{{post.date}}', { ...ctx, dateFormat: 'long' })).toBe('20 October 2026')
    expect(resolveTags('{{post.date}}', { post: { date: 'garbage' } })).toBe('')
  })
  it('formats prices', () => {
    expect(resolveTags('{{product.price}}', ctx)).toBe('$12.50')
    expect(resolveTags('{{product.price}}', { product: { price: '$9' } })).toBe('$9')
  })
  it('missing context is empty, year defaults', () => {
    expect(resolveTags('[{{post.title}}]', {})).toBe('[]')
    expect(resolveTags('{{site.year}}', {})).toBe(String(new Date().getUTCFullYear()))
  })
  it('caps input length', () => {
    expect(resolveTags('x'.repeat(MAX_TAG_INPUT + 500), ctx).length).toBe(MAX_TAG_INPUT)
  })
})
