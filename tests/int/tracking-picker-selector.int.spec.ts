// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { bestSelector, escapeIdent, selectorCandidates } from '@/features/tracking/picker/selector'

const page = (html: string): Document => {
  const doc = document.implementation.createHTMLDocument('t')
  doc.body.innerHTML = html
  return doc
}

describe('visual picker selector', () => {
  it('prefers a unique id', () => {
    const doc = page('<div><button id="enquire">Enquire</button></div>')
    const el = doc.getElementById('enquire') as Element
    expect(bestSelector(el, doc)).toEqual({ selector: '#enquire', kind: 'id', matches: 1 })
  })

  it('uses a block data attribute when there is no id', () => {
    const doc = page('<section><a data-eg-block="hero-cta" href="/x">Go</a></section>')
    const el = doc.querySelector('a') as Element
    expect(bestSelector(el, doc)?.selector).toBe('a[data-eg-block="hero-cta"]')
  })

  it('skips generated class names', () => {
    const doc = page('<button class="css-1a2b3c4 btn primary">Buy</button>')
    const el = doc.querySelector('button') as Element
    const picked = selectorCandidates(el, doc).find((c) => c.kind === 'class')
    expect(picked?.selector).toBe('button.btn.primary')
  })

  it('falls back to a structural path when classes are shared', () => {
    const doc = page('<ul><li class="item">A</li><li class="item">B</li></ul>')
    const second = doc.querySelectorAll('li')[1] as Element
    const best = bestSelector(second, doc)
    expect(best?.matches).toBe(1)
    expect(doc.querySelectorAll(best!.selector)).toHaveLength(1)
    expect(doc.querySelector(best!.selector)).toBe(second)
  })

  it('never returns a selector that matches a different element', () => {
    const doc = page('<p class="x">one</p><p class="x">two</p>')
    const first = doc.querySelectorAll('p')[0] as Element
    for (const candidate of selectorCandidates(first, doc)) {
      expect(doc.querySelector(candidate.selector)).toBe(first)
    }
  })

  it('escapes unusual ids so the selector still parses', () => {
    expect(escapeIdent('a.b:c')).toBe('a\\.b\\:c')
    const doc = page('<span id="a.b">x</span>')
    const el = doc.getElementById('a.b') as Element
    expect(doc.querySelector(bestSelector(el, doc)!.selector)).toBe(el)
  })
})
