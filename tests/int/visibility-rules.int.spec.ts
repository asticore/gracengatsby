import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { StyledBlock } from '@/components/blocks/StyledBlock'
import { asBlockStyle, hasVisibilityRules } from '@/lib/blockStyle'
import { groupModified, resetGroup, GROUP_KEYS } from '@/views/visualEditor/designHelpers'
import { cleanRoles, evaluateRules, isIsoDate, parseRules, rulesFromStyle, type VisContext } from '@/lib/visibilityRules'

const ctx = (o: Partial<VisContext> = {}): VisContext => ({ now: Date.UTC(2026, 5, 15, 12), loggedIn: false, roles: [], href: '/shop?ref=news', ...o })

describe('visibility rules: sanitiser', () => {
  it('keeps valid keys and drops bad ones', () => {
    const out = asBlockStyle({ showFrom: '2026-01-01', showUntil: '2026-02-30', showAuth: 'in', showRoles: 'Admin, bad slug!, editor, admin', showUrl: '/a"<b>' })
    expect(out.showFrom).toBe('2026-01-01')
    expect(out.showUntil).toBeUndefined()
    expect(out.showAuth).toBe('in')
    expect(out.showRoles).toBe('admin,editor')
    expect(out.showUrl).toBe('/ab')
    expect(asBlockStyle({ showAuth: 'any', showFrom: 5 }).showAuth).toBeUndefined()
  })
  it('caps lengths and role count', () => {
    expect(cleanRoles(Array.from({ length: 30 }, (_, i) => 'r' + i).join(','))).toHaveLength(10)
    expect(asBlockStyle({ showUrl: 'x'.repeat(500) }).showUrl).toHaveLength(120)
    expect(cleanRoles('a'.repeat(40))).toEqual([])
  })
  it('checks ISO dates', () => {
    expect(isIsoDate('2026-12-01T09:00')).toBe(true)
    expect(isIsoDate('2026-12-01T25:00')).toBe(false)
    expect(isIsoDate('12/01/2026')).toBe(false)
    expect(isIsoDate(20260101)).toBe(false)
  })
  it('is part of modified / reset', () => {
    const s = asBlockStyle({ showRoles: 'admin', hideOnMobile: true })
    expect(groupModified(s, GROUP_KEYS.conditions)).toBe(true)
    expect(hasVisibilityRules(s)).toBe(true)
    expect(resetGroup(s, GROUP_KEYS.conditions).showRoles).toBeUndefined()
    expect(hasVisibilityRules(asBlockStyle({ hideOnMobile: true }))).toBe(false)
  })
})

describe('visibility rules: emitted attribute', () => {
  const html = (style: unknown) => renderToStaticMarkup(createElement(StyledBlock as unknown as (p: { style: unknown; index: number }) => null, { style, index: 0 }, createElement('p', null, 'x')))
  it('gates visitor rules and leaves date-only visible', () => {
    const gated = html({ showAuth: 'in' })
    expect(gated).toContain('data-eg-cond=')
    expect(gated).toContain('data-eg-hold')
    const dated = html({ showFrom: '2026-01-01' })
    expect(dated).toContain('data-eg-cond=')
    expect(dated).not.toContain('data-eg-hold')
    expect(html({ hideOnMobile: true })).not.toContain('data-eg-cond')
  })
  it('round-trips the rules', () => {
    const r = rulesFromStyle(asBlockStyle({ showAuth: 'out', showRoles: 'a,b', showUrl: '?x=1', showUntil: '2026-01-01' }))
    expect(parseRules(JSON.stringify(r))).toEqual(r)
    expect(parseRules('{bad')).toBeNull()
    expect(parseRules('{"a":"x"}')).toBeNull()
  })
})

describe('visibility rules: evaluator', () => {
  it('date window edges', () => {
    expect(evaluateRules({ f: '2026-06-15' }, ctx())).toBe(true)
    expect(evaluateRules({ f: '2026-06-16' }, ctx())).toBe(false)
    expect(evaluateRules({ u: '2026-06-15' }, ctx({ now: Date.UTC(2026, 5, 15, 23, 59, 59) }))).toBe(true)
    expect(evaluateRules({ u: '2026-06-14' }, ctx())).toBe(false)
    expect(evaluateRules({ f: '2026-06-15T12:00:00Z' }, ctx())).toBe(true)
  })
  it('login state, unknown fails closed', () => {
    expect(evaluateRules({ a: 'in' }, ctx({ loggedIn: true }))).toBe(true)
    expect(evaluateRules({ a: 'in' }, ctx())).toBe(false)
    expect(evaluateRules({ a: 'out' }, ctx())).toBe(true)
    expect(evaluateRules({ a: 'out' }, ctx({ loggedIn: null }))).toBe(false)
  })
  it('roles need login and any match', () => {
    expect(evaluateRules({ r: ['editor'] }, ctx({ loggedIn: true, roles: ['Editor'] }))).toBe(true)
    expect(evaluateRules({ r: ['editor'] }, ctx({ loggedIn: true, roles: ['viewer'] }))).toBe(false)
    expect(evaluateRules({ r: ['editor'] }, ctx({ loggedIn: false, roles: ['editor'] }))).toBe(false)
  })
  it('url contains path or query, case-insensitive, and all rules combine', () => {
    expect(evaluateRules({ q: '?ref=NEWS' }, ctx())).toBe(true)
    expect(evaluateRules({ q: '/blog' }, ctx())).toBe(false)
    expect(evaluateRules({ q: '/shop', a: 'in' }, ctx())).toBe(false)
  })
})

describe('visibility rules: sources', () => {
  it('are ASCII with no backslash-u sequences', () => {
    for (const f of [
      'src/lib/visibilityRules.ts', 'src/lib/blockStyle.ts', 'src/components/blocks/VisibilityGate.tsx',
      'src/components/blocks/VisibilityGateLazy.tsx', 'src/components/blocks/StyledBlock.tsx', 'src/components/blocks/visibility.css',
      'src/views/visualEditor/DesignPanel.tsx', 'src/views/visualEditor/designHelpers.ts', 'src/app/(engage)/api/visibility-state/route.ts',
    ]) {
      const t = fs.readFileSync(f, 'utf8')
      expect(/[^\x00-\x7f]/.test(t), f).toBe(false)
      expect(t.includes(String.fromCharCode(92) + 'u'), f).toBe(false)
    }
  })
})
