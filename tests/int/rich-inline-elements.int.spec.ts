import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ButtonElement } from '@/components/blocks/elements/ButtonElement'
import { ListElement, QuoteElement } from '@/components/blocks/elements/TextElements'
import { applyInlineEdit, inlineCandidate, INLINE_PROPS } from '@/views/visualEditor/inlineEdit'
import { MARKS_NO_LINK, sanitizeInlineHtml } from '@/views/visualEditor/inlineFormat'

const h = (c: React.FC<any>, props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(c, props))
const el = (elementType: string, props: Record<string, unknown>) => ({ blockType: 'element', elementType, props }) as never

const EVIL = [
  '<script>alert(1)</script>x',
  '<strong onclick="x()">b</strong>',
  '<img src=x onerror=alert(1)>t',
  '<a href="javascript:alert(1)">l</a>',
  '<a href="  JaVaScRiPt:alert(1)">l</a>',
  '<a href="data:text/html,<script>1</script>">l</a>',
]
const bad = /<script|<img|<[^>]*\son\w+=|href="\s*(javascript|data):/i

describe('rich inline elements: rendering', () => {
  it('keeps plain legacy values byte-identical', () => {
    expect(h(QuoteElement, { text: 'Tom & Jerry' })).toContain('<p>Tom &amp; Jerry</p>')
    expect(h(ButtonElement, { text: 'Go <now>', url: '/x' })).toContain('>Go &lt;now&gt;</a>')
    expect(h(ListElement, { items: ['a & b'] })).toContain('<li>a &amp; b</li>')
  })
  it('renders allowed formats', () => {
    expect(h(QuoteElement, { text: 'a <strong>b</strong> <a href="/x">c</a>' })).toContain('<p>a <strong>b</strong> <a href="/x" rel="noopener">c</a></p>')
    expect(h(ListElement, { items: [{ text: '<em>i</em>' }] })).toContain('<li><span><em>i</em></span></li>')
  })
  it('button label drops links but keeps bold/italic', () => {
    const out = h(ButtonElement, { text: '<strong>Buy</strong> <a href="/y">now</a>', url: '/x' })
    expect(out).toContain('<strong>Buy</strong> now')
    expect(out.match(/<a /g)).toHaveLength(1)
  })
  it('linked list rows never nest links', () => {
    const out = h(ListElement, { items: [{ text: 'x <a href="/in">y</a>', href: '/out' }] })
    expect(out.match(/<a /g)).toHaveLength(1)
  })
  it.each(EVIL)('strips XSS on every element: %s', (evil) => {
    for (const out of [h(QuoteElement, { text: evil }), h(ButtonElement, { text: evil, url: '/x' }), h(ListElement, { items: [evil, { text: evil, href: '/u' }] })]) {
      expect(out).not.toMatch(bad)
    }
  })
})

describe('rich inline elements: editing', () => {
  it('marks quote, button and list as rich with per-element formats', () => {
    expect(INLINE_PROPS.quote.rich && INLINE_PROPS.list.rich && INLINE_PROPS.button.rich).toBe(true)
    expect(inlineCandidate(el('quote', { text: 'q' }))?.formats).toEqual(['bold', 'italic', 'link'])
    expect(inlineCandidate(el('button', { text: 'b' }))?.formats).toEqual(MARKS_NO_LINK)
    expect(inlineCandidate(el('list', { items: [{ text: 'a', href: '/h' }, { text: 'b' }] }), 0)?.formats).toEqual(['bold', 'italic'])
    expect(inlineCandidate(el('list', { items: [{ text: 'a', href: '/h' }, { text: 'b' }] }), 1)?.formats).toEqual(['bold', 'italic', 'link'])
    expect(inlineCandidate(el('icon-list', { items: [{ text: 'a' }] }))?.rich).toBe(false)
  })
  it('sanitises on write per element', () => {
    const btn = applyInlineEdit([el('button', { text: 'x' })], [0], { field: 'text' }, '<a href="/z"><strong>hi</strong></a><script>1</script>')
    expect((btn[0] as never as { props: { text: string } }).props.text).toBe('<strong>hi</strong>')
    const q = applyInlineEdit([el('quote', { text: 'x' })], [0], { field: 'text' }, '<b onclick=1>hi</b><a href="javascript:1">l</a>')
    expect((q[0] as never as { props: { text: string } }).props.text).toBe('<strong>hi</strong>l')
    const l = applyInlineEdit([el('list', { items: [{ text: 'x' }] })], [0], { field: 'items', itemIndex: 0 }, '<em>e</em><img src=x onerror=1>')
    expect((l[0] as never as { props: { items: { text: string }[] } }).props.items[0].text).toBe('<em>e</em>')
  })
  it('sanitiser honours a format subset and is idempotent', () => {
    const once = sanitizeInlineHtml('<strong>a</strong><em>b</em><a href="/x">c</a>', ['italic'])
    expect(once).toBe('a<em>b</em>c')
    expect(sanitizeInlineHtml(once, ['italic'])).toBe(once)
  })
})
