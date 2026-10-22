import { describe, expect, it } from 'vitest'

import type { SectionNode } from '@/lib/sectionTree'
import { applyInlineEdit, inlineCandidate } from '@/views/visualEditor/inlineEdit'
import { applyFormat, clearFormat, htmlToText, safeHref, sanitizeInlineHtml, shortcutMark, textToHtml } from '@/views/visualEditor/inlineFormat'

describe('sanitizeInlineHtml', () => {
  it('keeps the allowlist', () => {
    expect(sanitizeInlineHtml('a <strong>b</strong> <em>c</em><br>d')).toBe('a <strong>b</strong> <em>c</em><br>d')
  })
  it('strips scripts, handlers and unknown tags', () => {
    expect(sanitizeInlineHtml('<script>alert(1)</script>x<img src=x onerror=alert(1)><b onclick="e()">y</b>')).toBe('x<strong>y</strong>')
    expect(sanitizeInlineHtml('<div><span style="x">hi</span></div>')).toBe('hi')
  })
  it('only allows safe hrefs and forces rel=noopener', () => {
    expect(sanitizeInlineHtml('<a href="https://x.com/a?b=1&amp;c=2" target="_blank" onclick="x">l</a>')).toBe('<a href="https://x.com/a?b=1&amp;c=2" rel="noopener">l</a>')
    expect(sanitizeInlineHtml('<a href="javascript:alert(1)">l</a>')).toBe('l')
    expect(sanitizeInlineHtml('<a href=" jav&#x61;script:alert(1)">l</a>')).toBe('l')
    expect(sanitizeInlineHtml('<a href="data:text/html,x">l</a>')).toBe('l')
    expect(sanitizeInlineHtml('<a href="//evil.com">l</a>')).toBe('l')
    expect(sanitizeInlineHtml('<a href="mailto:a@b.c">m</a><a href="tel:+1">t</a><a href="/about">r</a>')).toContain('href="/about"')
  })
  it('escapes stray markup and is idempotent', () => {
    const out = sanitizeInlineHtml('1 < 2 & <b>3</b> &lt;script&gt;')
    expect(out).toBe('1 &lt; 2 &amp; <strong>3</strong> &lt;script&gt;')
    expect(sanitizeInlineHtml(out)).toBe(out)
  })
  it('rejects non-strings and safeHref garbage', () => {
    expect(sanitizeInlineHtml(undefined as never)).toBe('')
    expect(safeHref('java\nscript:x')).toBeNull()
    expect(safeHref('https://ok.com')).toBe('https://ok.com')
  })
})

describe('format helpers', () => {
  it('wraps and toggles bold / italic over a range', () => {
    const b = applyFormat('hello world', 6, 11, 'bold')
    expect(b).toBe('hello <strong>world</strong>')
    expect(applyFormat(b, 6, 11, 'bold')).toBe('hello world')
    expect(applyFormat('abc', 0, 3, 'italic')).toBe('<em>abc</em>')
  })
  it('splits runs and nests marks', () => {
    expect(applyFormat('<strong>abcd</strong>', 1, 3, 'italic')).toBe('<strong>a</strong><strong><em>bc</em></strong><strong>d</strong>')
  })
  it('links with safe urls only, and clears', () => {
    expect(applyFormat('go here', 3, 7, 'link', 'https://a.com')).toBe('go <a href="https://a.com" rel="noopener">here</a>')
    expect(applyFormat('go here', 3, 7, 'link', 'javascript:x')).toBe('go here')
    const linked = applyFormat('<strong>go</strong> here', 0, 7, 'link', '/x')
    expect(clearFormat(linked, 0, 7)).toBe('go here')
    expect(clearFormat('<em>a</em> <strong>b</strong>')).toBe('a b')
  })
  it('empty range is a no-op and reversed ranges work', () => {
    expect(applyFormat('abc', 1, 1, 'bold')).toBe('abc')
    expect(applyFormat('abc', 3, 0, 'bold')).toBe('<strong>abc</strong>')
  })
  it('text round trips', () => {
    expect(textToHtml('a<b\nc')).toBe('a&lt;b<br>c')
    expect(htmlToText('a&lt;b<br>c')).toBe('a<b\nc')
  })
  it('shortcuts', () => {
    expect(shortcutMark({ key: 'b', ctrlKey: true })).toBe('bold')
    expect(shortcutMark({ key: 'I', metaKey: true })).toBe('italic')
    expect(shortcutMark({ key: 'k', ctrlKey: true })).toBe('link')
    expect(shortcutMark({ key: 'k' })).toBeNull()
  })
})

describe('rich gating', () => {
  const heading = { blockType: 'element', elementType: 'icon-list', props: { items: [{ text: 'Hi' }] } } as unknown as SectionNode
  const rich = { blockType: 'element', elementType: 'heading', props: { text: 'Hi' } } as unknown as SectionNode
  it('icon-list stays plain (its rows are "text | link" lines)', () => {
    expect(inlineCandidate(heading)?.rich).toBe(false)
    expect(inlineCandidate(rich)?.rich).toBe(true)
  })
  it('plain props are written verbatim, not sanitised', () => {
    const next = applyInlineEdit([heading], [0], { field: 'items', itemIndex: 0 }, 'a <b>c</b>')
    expect((next[0] as unknown as { props: { items: { text: string }[] } }).props.items[0].text).toBe('a <b>c</b>')
  })
})