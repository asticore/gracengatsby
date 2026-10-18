import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { ELEMENTS } from '@/lib/elements/registry'

/**
 * Bootstrap-style consolidation: counter, progress-bar, alert and social-icons gained options (animate, shape,
 * placement, mode) that reuse the count-up, circle-progress, sticky-bar and share-buttons renderers. Those four
 * base widgets are hidden from the library, and their renderers stay so saved pages keep rendering.
 */

const render = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const html = (type: string, props: Record<string, unknown>) => render(renderElement(type, props))
const def = (type: string) => ELEMENTS.find((e) => e.type === type)

// Markup captured from the renderers before the options were added. Options unset must reproduce it exactly.
const BASELINE = {
  counterA: '<div class="el-counter el-align--center"><div class="el-counter__number">1,200<span>+</span></div><div class="el-counter__title">Happy customers</div></div>',
  counterB: '<div class="el-counter el-align--left"><div class="el-counter__number"><span>$</span>3.5</div></div>',
  counterEmpty: '<div class="el-counter el-align--center"><div class="el-counter__number">0</div></div>',
  progressA: '<div class="el-progress"><div class="el-progress__head"><span>Satisfaction</span><span>90%</span></div><div class="el-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="90" aria-label="Satisfaction"><div class="el-progress__fill" style="width:90%"></div></div></div>',
  progressB: '<div class="el-progress"><div class="el-progress__head"><span>Progress</span></div><div class="el-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40" aria-label="Progress"><div class="el-progress__fill" style="width:40%"></div></div></div>',
  progressEmpty: '<div class="el-progress"><div class="el-progress__head"><span>Progress</span><span>70%</span></div><div class="el-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="70" aria-label="Progress"><div class="el-progress__fill" style="width:70%"></div></div></div>',
  alertA: '<div class="el-alert el-alert--info" role="note"><strong class="el-alert__title">Good to know</strong><p>Orders placed before 2pm ship the same day.</p></div>',
  alertB: '<div class="el-alert el-alert--danger" role="alert"><p>x</p></div>',
  alertEmpty: '<div class="el-alert el-alert--info" role="note"></div>',
  socialA: '<ul class="el-social el-social--circle el-align--left"><li><a href="https://instagram.com/" aria-label="instagram" rel="noopener noreferrer" target="_blank"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="4.5"></rect><circle cx="12" cy="12" r="3.6"></circle><circle cx="16.6" cy="7.4" r=".6"></circle></svg></a></li><li><a href="mailto:/contact" aria-label="email" rel="noopener noreferrer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18v12H3z"></path><path d="M3 7l9 7 9-7"></path></svg></a></li></ul>',
  socialEmpty: '<ul class="el-social el-social--circle el-align--left"></ul>',
}

const UNSET: [keyof typeof BASELINE, string, Record<string, unknown>][] = [
  ['counterA', 'counter', { number: 1200, decimals: 0, suffix: '+', title: 'Happy customers', separator: true, align: 'center' }],
  ['counterB', 'counter', { number: 3.5, decimals: 1, prefix: '$', title: '', separator: false, align: 'left' }],
  ['counterEmpty', 'counter', {}],
  ['progressA', 'progress-bar', { title: 'Satisfaction', percent: 90, showPercent: true }],
  ['progressB', 'progress-bar', { percent: 40, showPercent: false }],
  ['progressEmpty', 'progress-bar', {}],
  ['alertA', 'alert', { kind: 'info', title: 'Good to know', text: 'Orders placed before 2pm ship the same day.' }],
  ['alertB', 'alert', { kind: 'danger', text: 'x' }],
  ['alertEmpty', 'alert', {}],
  ['socialA', 'social-icons', { items: [{ network: 'instagram', address: 'https://instagram.com/' }, { network: 'email', address: '/contact' }], shape: 'circle', size: 20, align: 'left' }],
  ['socialEmpty', 'social-icons', {}],
]

describe('options unset keep the old markup', () => {
  for (const [key, type, props] of UNSET) {
    it(`${type} (${key}) matches the captured markup`, () => {
      expect(html(type, props)).toBe(BASELINE[key])
    })
  }

  it('explicit defaults for the new selects match the old markup too', () => {
    expect(html('counter', { number: 1200, decimals: 0, suffix: '+', title: 'Happy customers', separator: true, align: 'center', animate: false })).toBe(BASELINE.counterA)
    expect(html('progress-bar', { title: 'Satisfaction', percent: 90, showPercent: true, shape: 'bar' })).toBe(BASELINE.progressA)
    expect(html('alert', { kind: 'info', title: 'Good to know', text: 'Orders placed before 2pm ship the same day.', placement: 'inline' })).toBe(BASELINE.alertA)
    expect(html('social-icons', { items: [{ network: 'instagram', address: 'https://instagram.com/' }, { network: 'email', address: '/contact' }], shape: 'circle', size: 20, align: 'left', mode: 'follow' })).toBe(BASELINE.socialA)
  })
})

describe('counter animate', () => {
  it('uses the count-up markup and CSS when animate is on', () => {
    const out = html('counter', { number: 1200, decimals: 0, suffix: '+', title: 'Happy customers', start: 0, duration: 2000, animate: true, align: 'center' })
    expect(out).toContain('be-el-43-count')
    expect(out).toContain('--be-el-43-to:1200')
    expect(out).toContain('--be-el-43-d:2000ms')
    expect(out).toContain('aria-label="1200+"')
    expect(out).toContain('Happy customers')
    expect(out).toContain('el-align--center')
    expect(out).not.toContain('el-counter__number')
  })

  it('clamps decimals to 2 when animated and keeps the start number', () => {
    const out = html('counter', { number: 3.14159, decimals: 4, start: 1, animate: true })
    expect(out).toContain('--be-el-43-from:100')
    expect(out).toContain('--be-el-43-to:314')
    expect(out).toContain('be-el-43-count__num--d2')
  })
})

describe('progress-bar ring', () => {
  it('draws the circle progress look when shape is ring', () => {
    const out = html('progress-bar', { title: 'Satisfaction', percent: 90, shape: 'ring' })
    expect(out).toContain('be-el-circle')
    expect(out).toContain('aria-valuenow="90"')
    expect(out).toContain('aria-label="Satisfaction"')
    expect(out).toContain('be-el-circle__label">Satisfaction<')
    expect(out).not.toContain('el-progress__track')
  })

  it('keeps the bar when shape is bar or unknown', () => {
    expect(html('progress-bar', { title: 'Satisfaction', percent: 90, showPercent: true, shape: 'bar' })).toBe(BASELINE.progressA)
    expect(html('progress-bar', { title: 'Satisfaction', percent: 90, showPercent: true, shape: 'donut' })).toBe(BASELINE.progressA)
  })
})

describe('alert placement', () => {
  it('fixed-top renders a full-width sticky bar with no close button', () => {
    const out = html('alert', { kind: 'warning', title: 'Sale', text: 'Ends tonight', placement: 'fixed-top' })
    expect(out).toContain('be-el-sticky be-el-sticky--fixed be-el-sticky--top')
    expect(out).toContain('Sale: Ends tonight')
    expect(out).not.toMatch(/<button|close|dismiss/i)
  })

  it('fixed-bottom uses the bottom edge', () => {
    const out = html('alert', { kind: 'info', text: 'Cookies notice', placement: 'fixed-bottom' })
    expect(out).toContain('be-el-sticky--fixed be-el-sticky--bottom')
    expect(out).not.toContain('be-el-sticky--top')
  })

  it('fixed bars take a safe button link', () => {
    const out = html('alert', { kind: 'info', text: 'Hi', placement: 'fixed-top', buttonText: 'Shop', buttonUrl: { url: 'https://shop.test/sale', newTab: true } })
    expect(out).toContain('be-el-sticky__btn')
    expect(out).toContain('href="https://shop.test/sale"')
  })

  it('an unsafe button link is dropped on fixed bars', () => {
    const out = html('alert', { kind: 'info', text: 'Hi', placement: 'fixed-top', buttonText: 'Shop', buttonUrl: 'javascript:alert(1)' })
    expect(out).not.toContain('be-el-sticky__btn')
    expect(out).not.toMatch(/javascript|href/i)
  })

  it('inline alerts take a safe button link', () => {
    const out = html('alert', { kind: 'info', text: 'Hi', buttonText: 'Read more', buttonUrl: 'https://example.test/more' })
    expect(out).toContain('class="el-alert__btn" href="https://example.test/more"')
    expect(out).toContain('>Read more</a>')
  })

  it('an unsafe link on an inline alert leaves no link', () => {
    const out = html('alert', { kind: 'info', text: 'Hi', buttonText: 'Read more', buttonUrl: 'data:text/html,hi' })
    expect(out).not.toContain('<a')
    expect(out).not.toContain('Read more')
  })
})

describe('social-icons share mode', () => {
  const items = [{ network: 'facebook', address: '' }, { network: 'x', address: '' }, { network: 'instagram', address: '' }]

  it('builds share links for the page address passed in', () => {
    const out = html('social-icons', { mode: 'share', items, title: 'Our shop', pageUrl: 'https://shop.test/p?x=1' })
    expect(out).toContain('be-el-share')
    expect(out).toContain('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fshop.test%2Fp%3Fx%3D1')
    expect(out).toContain('https://x.com/intent/post?')
    expect(out).toContain('url=https%3A%2F%2Fshop.test%2Fp%3Fx%3D1')
    expect(out.match(/be-el-share__link/g)?.length).toBe(2)
    expect(out).not.toContain('instagram')
  })

  it('leaves out the page-only networks when no page address is set', () => {
    const out = html('social-icons', { mode: 'share', items, title: 'Our shop' })
    expect(out).not.toContain('facebook.com')
    expect(out).toContain('https://x.com/intent/post?text=Our%20shop')
  })

  it('refuses an unsafe page address', () => {
    const out = html('social-icons', { mode: 'share', items: [{ network: 'facebook' }], pageUrl: 'javascript:alert(1)' })
    expect(out).toBe('')
  })

  it('renders nothing when no network is a share network', () => {
    expect(html('social-icons', { mode: 'share', items: [{ network: 'instagram', address: 'https://instagram.com/' }], pageUrl: 'https://shop.test/' })).toBe('')
  })
})

describe('library visibility', () => {
  it('hides the four superseded widgets and the reading progress bar', () => {
    for (const type of ['count-up', 'circle-progress', 'share-buttons', 'sticky-bar', 'reading-progress']) {
      expect(def(type), type).toBeDefined()
      expect(def(type)?.hidden, type).toBe(true)
    }
  })

  it('keeps the consolidated widgets visible', () => {
    for (const type of ['counter', 'progress-bar', 'alert', 'social-icons']) expect(def(type)?.hidden, type).toBeFalsy()
  })

  it('offers the new options as selects with the values the renderers read', () => {
    const values = (type: string, field: string) => def(type)?.fields.find((f) => f.name === field)?.options?.map((o) => o.value)
    expect(values('progress-bar', 'shape')).toEqual(['bar', 'ring'])
    expect(values('alert', 'placement')).toEqual(['inline', 'fixed-top', 'fixed-bottom'])
    expect(values('social-icons', 'mode')).toEqual(['follow', 'share'])
    expect(def('counter')?.fields.find((f) => f.name === 'animate')?.type).toBe('checkbox')
  })
})

describe('hidden widgets still render for saved pages', () => {
  it('renders the old base widgets with their default props', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['count-up', { start: 0, end: 500, label: 'Clients' }],
      ['circle-progress', { percent: 72, label: 'Complete' }],
      ['share-buttons', { title: 'Check this out', shareUrl: 'https://shop.test/', facebook: true, x: true }],
      ['sticky-bar', { text: 'Free delivery', buttonLabel: 'Shop', link: 'https://shop.test/' }],
      ['reading-progress', { height: 4 }],
    ]
    for (const [type, props] of cases) {
      const out = html(type, props)
      expect(out.length, type).toBeGreaterThan(0)
    }
    expect(html('circle-progress', { percent: 72, label: 'Complete' })).toContain('be-el-circle')
    expect(html('share-buttons', { title: 'Hi', shareUrl: 'https://shop.test/', x: true })).toContain('be-el-share')
    expect(html('sticky-bar', { text: 'Free delivery' })).toContain('be-el-sticky')
    expect(html('count-up', { start: 0, end: 500, label: 'Clients' })).toContain('be-el-43-count')
    expect(html('reading-progress', {})).toContain('be-el-progress')
  })
})
