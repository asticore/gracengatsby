// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { scanPage } from '@/features/tracking/editor/scan'
import { tagsOnPageStatus, onThisPage, type TagRow } from '@/features/tracking/tagRows'

const page = (html: string): Document => {
  const doc = document.implementation.createHTMLDocument('t')
  doc.body.innerHTML = html
  return doc
}

const tag = (over: Partial<TagRow>): TagRow => ({
  id: 1,
  name: 'Tag',
  platformEvent: 'Custom',
  triggerType: 'click',
  selector: '#x',
  urlMatchMode: 'exact',
  urlMatch: '/shop',
  value: null,
  currency: null,
  enabled: true,
  ...over,
})

describe('page scan for suggestions', () => {
  const doc = page(`
    <button id="add">Add to cart</button>
    <a href="/checkout">Checkout</a>
    <a href="/cart">View cart</a>
    <a href="tel:+1555">Call</a>
    <a href="mailto:hi@example.com">Email</a>
    <a href="/files/guide.pdf">Guide</a>
    <a href="/book">Book now</a>
    <a href="/about">About us</a>
    <form action="/subscribe"><input type="email"><button>Subscribe</button></form>
    <form><input type="email" name="email"><button>Get in touch</button></form>
    <form><input type="password"><button>Sign up</button></form>
    <form action="/search"><input type="search" name="q"></form>
    <button type="button">Menu</button>
  `)

  it('finds the likely tags and skips links with no known intent', () => {
    const rows = scanPage(doc, [], '/shop')
    const options = rows.map((r) => r.suggestion.option)
    expect(options).toContain('addToCart')
    expect(options).toContain('checkoutStarted')
    expect(options).toContain('viewCart')
    expect(options).toContain('phone')
    expect(options).toContain('email')
    expect(options).toContain('download')
    expect(options).toContain('bookNow')
    expect(options).toContain('newsletter')
    expect(options).toContain('lead')
    expect(options).toContain('signUp')
    expect(options).toContain('search')
    expect(rows.find((r) => r.text === 'About us')).toBeUndefined()
    expect(rows.find((r) => r.text === 'Menu')).toBeUndefined()
  })

  it('lists a form once, not its submit button as well', () => {
    const rows = scanPage(doc, [], '/shop')
    expect(rows.filter((r) => r.element.tagName === 'BUTTON' && r.element.closest('form'))).toHaveLength(0)
    expect(rows.filter((r) => r.suggestion.option === 'newsletter')).toHaveLength(1)
  })

  it('gives each row a selector that matches its element, a trigger, and the element text', () => {
    const rows = scanPage(doc, [], '/shop')
    const add = rows.find((r) => r.suggestion.option === 'addToCart')!
    expect(add.selector).toBe('#add')
    expect(add.matches).toBe(1)
    expect(add.trigger).toBe('click')
    expect(add.text).toBe('Add to cart')
    const newsletter = rows.find((r) => r.suggestion.option === 'newsletter')!
    expect(newsletter.trigger).toBe('submit')
  })

  it('marks a row as added when a saved tag on this page already matches its element', () => {
    const rows = scanPage(doc, [tag({ id: 5, selector: '#add', urlMatchMode: 'exact', urlMatch: '/shop' })], '/shop')
    expect(rows.find((r) => r.suggestion.option === 'addToCart')?.added).toBe(true)
    expect(rows.find((r) => r.suggestion.option === 'checkoutStarted')?.added).toBe(false)
  })

  it('ignores a tag whose rule does not cover this page', () => {
    const rows = scanPage(doc, [tag({ selector: '#add', urlMatch: '/other' })], '/shop')
    expect(rows.find((r) => r.suggestion.option === 'addToCart')?.added).toBe(false)
  })

  it('numbers rows in order from zero', () => {
    const rows = scanPage(doc, [], '/shop')
    expect(rows.map((r) => r.key)).toEqual(rows.map((_, i) => i))
  })
})

describe('tags matching a page and their status', () => {
  const doc = page('<button id="buy">Buy</button>')

  it('lists every tag whose URL rule matches the page, ignoring the language prefix', () => {
    const tags = [
      tag({ id: 1, urlMatch: '/shop' }),
      tag({ id: 2, urlMatch: '/other' }),
      tag({ id: 3, urlMatchMode: 'any', urlMatch: null, selector: '#buy' }),
    ]
    expect(onThisPage(tags[0]!, '/fr/shop/')).toBe(true)
    const list = tagsOnPageStatus(tags, '/fr/shop', doc).map((s) => s.tag.id)
    expect(list).toEqual([1, 3])
  })

  it('flags a tag whose selector no longer finds an element', () => {
    const tags = [tag({ id: 1, selector: '#buy', urlMatch: '/shop' }), tag({ id: 2, selector: '#gone', urlMatch: '/shop' })]
    const status = tagsOnPageStatus(tags, '/shop', doc)
    expect(status.find((s) => s.tag.id === 1)).toMatchObject({ found: true, count: 1 })
    expect(status.find((s) => s.tag.id === 2)).toMatchObject({ found: false, count: 0 })
  })

  it('reports every tag as not found when there is no document yet', () => {
    const status = tagsOnPageStatus([tag({ id: 1, selector: '#buy', urlMatch: '/shop' })], '/shop', null)
    expect(status[0]).toMatchObject({ found: false, count: 0 })
  })

  it('a tag with no selector never matches a page', () => {
    expect(onThisPage(tag({ selector: null }), '/shop')).toBe(false)
  })
})
