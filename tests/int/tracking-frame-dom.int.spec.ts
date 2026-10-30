// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { defaultTrigger, describeElement, isActionElement, linkOf, matchingElements } from '@/features/tracking/editor/frameDom'
import { suggestFor } from '@/features/tracking/editor/frameDom'

const page = (html: string): Document => {
  const doc = document.implementation.createHTMLDocument('t')
  doc.body.innerHTML = html
  return doc
}

describe('tag editor frame helpers', () => {
  it('describes a link by its text and href', () => {
    const doc = page('<a href="/checkout">Go</a>')
    expect(describeElement(doc.querySelector('a') as Element)).toMatchObject({ kind: 'link', href: '/checkout', text: 'Go' })
    expect(suggestFor(doc.querySelector('a') as Element)?.option).toBe('checkoutStarted')
  })

  it('describes a button inside a form and reads the form fields', () => {
    const doc = page('<form action="/search"><input type="search" name="q"><button type="submit">Find</button></form>')
    const button = doc.querySelector('button') as Element
    expect(describeElement(button)).toMatchObject({ kind: 'button', hasSearchField: true, formAction: '/search' })
    expect(suggestFor(button)?.option).toBe('search')
    expect(defaultTrigger(button)).toBe('submit')
  })

  it('reads the email and password fields of a sign-up form', () => {
    const doc = page('<form><input type="email" name="e"><input type="password" name="p"><button>Go</button></form>')
    const form = doc.querySelector('form') as Element
    expect(suggestFor(form)?.option).toBe('signUp')
    expect(suggestFor(doc.querySelector('input[type=email]') as Element)).toBeNull()
  })

  it('treats a plain button as an action, and a link as navigation', () => {
    const doc = page('<a href="/shop"><span>Shop</span></a><button id="add">Add to cart</button>')
    expect(isActionElement(doc.getElementById('add') as Element)).toBe(true)
    expect(isActionElement(doc.querySelector('span') as Element)).toBe(false)
    expect(linkOf(doc.querySelector('span') as Element)?.getAttribute('href')).toBe('/shop')
  })

  it('finds selector matches in the framed document and survives a bad selector', () => {
    const doc = page('<button class="buy">A</button><button class="buy">B</button>')
    expect(matchingElements(doc, 'button.buy')).toHaveLength(2)
    expect(matchingElements(doc, 'button[')).toEqual([])
  })

  it('uses a click for a non-form element', () => {
    const doc = page('<a href="#">x</a>')
    expect(defaultTrigger(doc.querySelector('a') as Element)).toBe('click')
  })
})
