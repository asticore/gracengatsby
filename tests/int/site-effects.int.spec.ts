import { describe, expect, it } from 'vitest'

import { siteEffectsFor } from '@/components/site/siteEffectsConfig'
import { SiteSettings } from '@/globals/SiteSettings'
import { PAGE_EFFECT_COLUMNS } from '@/migrations/20261106_100000_site_page_effects'

const on = { pageEffects: { enabled: true, cursor: 'ring', scrollProgress: true, revealOnScroll: false } }

describe('site effects', () => {
  it('is off by default and when nothing is chosen', () => {
    expect(siteEffectsFor(null, '/')).toBeNull()
    expect(siteEffectsFor({ pageEffects: { enabled: false, cursor: 'ring' } }, '/')).toBeNull()
    expect(siteEffectsFor({ pageEffects: { enabled: true, cursor: 'none' } }, '/')).toBeNull()
  })
  it('returns the chosen effects', () => {
    expect(siteEffectsFor(on, '/about')).toEqual({ cursor: 'ring', scrollProgress: true, revealOnScroll: false, hideNativeCursor: false })
    expect(siteEffectsFor({ pageEffects: { enabled: true, cursor: 'bogus', revealOnScroll: true } }, '/')?.cursor).toBe('none')
  })
  it('skips the editor canvas and admin', () => {
    expect(siteEffectsFor(on, '/visual-editor-canvas')).toBeNull()
    expect(siteEffectsFor(on, '/visual-editor-canvas/x')).toBeNull()
    expect(siteEffectsFor(on, '/admin/collections')).toBeNull()
    expect(siteEffectsFor(on, '/administration')).not.toBeNull()
  })
  it('declares the group with defaults off and matching migration columns', () => {
    const g = SiteSettings.fields.find((f) => (f as { name?: string }).name === 'pageEffects') as { fields: { name: string; defaultValue?: unknown }[] }
    expect(g.fields.map((f) => f.name)).toEqual(['enabled', 'cursor', 'scrollProgress', 'revealOnScroll'])
    expect(g.fields.find((f) => f.name === 'enabled')?.defaultValue).toBe(false)
    expect(PAGE_EFFECT_COLUMNS.map((c) => c[0])).toEqual([
      'page_effects_enabled', 'page_effects_cursor', 'page_effects_scroll_progress', 'page_effects_reveal_on_scroll',
    ])
  })
})
