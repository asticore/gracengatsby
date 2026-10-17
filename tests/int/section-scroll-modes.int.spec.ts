// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SectionBlock } from '@/components/blocks/SectionBlock'
import { hscrollStyle, parseSectionLayout, stackStyle, stickyStepsClass, stickyStepsStyle } from '@/lib/sectionLayout'

const cols = (n: number) => Array.from({ length: n }, () => ({ blocks: [] as unknown[] }))

describe('scroll modes: parsing and clamps', () => {
  it('accepts the three new display modes and drops unknown ones', () => {
    expect(parseSectionLayout({ display: 'stack' })).toEqual({ display: 'stack' })
    expect(parseSectionLayout({ display: 'hscroll' })).toEqual({ display: 'hscroll' })
    expect(parseSectionLayout({ display: 'sticky-steps' })).toEqual({ display: 'sticky-steps' })
    expect(parseSectionLayout({ display: 'parallax' })).toBeUndefined()
  })

  it('clamps stack options into range and rounds them', () => {
    expect(parseSectionLayout({ display: 'stack', stackTop: 500, stackOffset: -5, stackMinHeight: 5 })).toEqual({
      display: 'stack',
      stackTop: 200,
      stackOffset: 0,
      stackMinHeight: 30,
    })
    expect(parseSectionLayout({ display: 'stack', stackTop: 40.6, stackOffset: 60, stackMinHeight: 100 })).toMatchObject({
      stackTop: 41,
      stackOffset: 60,
      stackMinHeight: 100,
    })
  })

  it('clamps horizontal scroll options and ignores non-numbers', () => {
    expect(parseSectionLayout({ display: 'hscroll', hscrollLength: 9999, hscrollColumnWidth: 10 })).toEqual({
      display: 'hscroll',
      hscrollLength: 600,
      hscrollColumnWidth: 40,
    })
    expect(parseSectionLayout({ display: 'hscroll', hscrollLength: '400', hscrollColumnWidth: NaN })).toEqual({ display: 'hscroll' })
  })

  it('validates sticky-steps side and clamps its numbers', () => {
    expect(parseSectionLayout({ display: 'sticky-steps', stickyStepsSide: 'right', stickyStepsTop: -3, stickyStepsGap: 999 })).toEqual({
      display: 'sticky-steps',
      stickyStepsSide: 'right',
      stickyStepsTop: 0,
      stickyStepsGap: 160,
    })
    expect(parseSectionLayout({ display: 'sticky-steps', stickyStepsSide: 'middle' })).toEqual({ display: 'sticky-steps' })
  })
})

describe('scroll modes: style variables and classes', () => {
  it('stack emits the defaults and the set values, and nothing for other modes', () => {
    expect(stackStyle({ display: 'stack' })).toEqual({ '--be-stack-top': '24px', '--be-stack-offset': '16px', '--be-stack-min': '70vh' })
    expect(stackStyle({ display: 'stack', stackTop: 80, stackOffset: 0, stackMinHeight: 50 })).toEqual({
      '--be-stack-top': '80px',
      '--be-stack-offset': '0px',
      '--be-stack-min': '50vh',
    })
    expect(stackStyle({ display: 'grid' })).toEqual({})
  })

  it('hscroll emits the scroll length (unitless vh count) and the column width', () => {
    expect(hscrollStyle({ display: 'hscroll' })).toEqual({ '--be-hs-n': '300', '--be-hs-col': '80vw' })
    expect(hscrollStyle({ display: 'hscroll', hscrollLength: 450, hscrollColumnWidth: 60 })).toEqual({ '--be-hs-n': '450', '--be-hs-col': '60vw' })
    expect(hscrollStyle({ display: 'tabs' })).toEqual({})
  })

  it('sticky-steps emits offset and gap, with the side as a class modifier', () => {
    expect(stickyStepsStyle({ display: 'sticky-steps' })).toEqual({ '--be-ss-top': '96px', '--be-ss-gap': '48px' })
    expect(stickyStepsClass({ display: 'sticky-steps' })).toBe('be-sticky-steps')
    expect(stickyStepsClass({ display: 'sticky-steps', stickyStepsSide: 'right' })).toBe('be-sticky-steps be-sticky-steps--right')
    expect(stickyStepsClass({ display: 'columns' })).toBe('')
    expect(stickyStepsStyle({ display: 'stack' })).toEqual({})
  })
})

describe('scroll modes: markup', () => {
  const render = (layout: Record<string, unknown>, n = 3) =>
    renderToString(React.createElement(SectionBlock, { columns: cols(n), renderNode: (): null => null, design: { layout }, scope: 'x' }))

  it('stack wraps every column as a card with its index and z-order inline', () => {
    const html = render({ display: 'stack', stackTop: 10 })
    expect(html).toContain('class="be-stack"')
    expect(html).toContain('--be-stack-top:10px')
    expect(html.match(/class="be-column/g)?.length).toBe(3)
    expect(html).toContain('--be-stack-i:0')
    expect(html).toContain('--be-stack-i:2')
    expect(html).toContain('z-index:3')
  })

  it('horizontal scroll renders a sticky viewport around one track holding every column', () => {
    const html = render({ display: 'hscroll', hscrollLength: 250 }, 2)
    expect(html).toContain('class="be-hscroll"')
    expect(html).toContain('--be-hs-n:250')
    expect(html).toContain('class="be-hscroll__sticky"')
    expect(html).toContain('class="be-hscroll__track"')
    expect(html.match(/class="be-column/g)?.length).toBe(2)
  })

  it('sticky steps puts the first column in the lead and the rest in the steps', () => {
    const html = render({ display: 'sticky-steps', stickyStepsSide: 'right' }, 3)
    expect(html).toContain('class="be-sticky-steps be-sticky-steps--right"')
    const lead = html.indexOf('class="be-sticky-steps__lead"')
    const steps = html.indexOf('class="be-sticky-steps__steps"')
    expect(lead).toBeGreaterThan(0)
    expect(steps).toBeGreaterThan(lead)
    expect(html.slice(steps).match(/class="be-column/g)?.length).toBe(2)
    expect(html.slice(lead, steps).match(/class="be-column/g)?.length).toBe(1)
  })

  it('a plain section is unchanged by the new modes', () => {
    const html = render({}, 2)
    expect(html).toContain('class="be-section"')
    expect(html).not.toContain('be-stack')
    expect(html).not.toContain('be-hscroll')
    expect(html).not.toContain('be-sticky-steps')
  })
})

describe('scroll modes: shipped CSS', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/components/blocks/tabs.css'), 'utf8').replace(/\s+/g, '')

  it('stack pins each card at top + index * offset', () => {
    expect(css).toContain('.be-stack>.be-column{position:sticky;top:calc(var(--be-stack-top,24px)+var(--be-stack-i,0)*var(--be-stack-offset,16px))')
  })

  it('horizontal scroll falls back to a native strip and only animates inside @supports with motion allowed', () => {
    expect(css).toContain('.be-hscroll__sticky{overflow-x:auto')
    const block = css.slice(css.indexOf('@supports(animation-timeline:view())'))
    expect(block.indexOf('@media(prefers-reduced-motion:no-preference)')).toBeGreaterThan(0)
    expect(block).toContain('animation-timeline:--be-hs')
    expect(block).toContain('translateX(calc(100vw-100%))')
  })

  it('sticky steps stacks on mobile and keeps the lead sticky on desktop', () => {
    expect(css).toContain('.be-sticky-steps__lead{position:sticky;top:var(--be-ss-top,96px)')
    expect(css).toContain('@media(max-width:768px){.be-sticky-steps,.be-sticky-steps--right{flex-direction:column')
  })
})
