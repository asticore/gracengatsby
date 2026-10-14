// Wave 11: design model v2 (Phase 1). Pure logic only: cascade, upgrade and guards.
// CSS emission, injection attempts and the v1 equivalence check are in design-v2-wave11-css.int.spec.ts.
import { describe, expect, it } from 'vitest'

import { resolveResponsive, resolveValue } from '@/lib/design/cascade'
import { isDesignError, isDesignV2Raw, upgradeDesign } from '@/lib/design/upgrade'
import { safeColor, safeLength, safeUrl, safeScopeId } from '@/lib/design/sanitize'
import type { Rs, UpgradeResult, DesignV2 } from '@/lib/design/types'

const rs = <T,>(desktop?: { normal?: T; hover?: T }, tablet?: { normal?: T; hover?: T }, mobile?: { normal?: T; hover?: T }): Rs<T> => ({
  ...(desktop ? { desktop } : {}),
  ...(tablet ? { tablet } : {}),
  ...(mobile ? { mobile } : {}),
})

describe('cascade: resolveValue', () => {
  it('a desktop value applies at every width', () => {
    const r = rs({ normal: 'A' })
    expect(resolveValue(r, 'desktop')).toBe('A')
    expect(resolveValue(r, 'tablet')).toBe('A')
    expect(resolveValue(r, 'mobile')).toBe('A')
  })

  it('a tablet value overrides desktop at tablet and mobile widths only', () => {
    const r = rs({ normal: 'A' }, { normal: 'B' })
    expect(resolveValue(r, 'desktop')).toBe('A')
    expect(resolveValue(r, 'tablet')).toBe('B')
    expect(resolveValue(r, 'mobile')).toBe('B')
  })

  it('a mobile value wins at mobile width and leaves tablet alone', () => {
    const r = rs({ normal: 'A' }, { normal: 'B' }, { normal: 'C' })
    expect(resolveValue(r, 'desktop')).toBe('A')
    expect(resolveValue(r, 'tablet')).toBe('B')
    expect(resolveValue(r, 'mobile')).toBe('C')
  })

  it('a missing narrower value falls back to the next wider one', () => {
    const r = rs({ normal: 'A' }, undefined, { normal: 'C' })
    expect(resolveValue(r, 'tablet')).toBe('A')
    expect(resolveValue(rs(undefined, undefined, { normal: 'C' }), 'tablet')).toBeUndefined()
  })

  it('returns undefined when nothing is set, or the input is missing', () => {
    expect(resolveValue(undefined, 'mobile')).toBeUndefined()
    expect(resolveValue({}, 'desktop')).toBeUndefined()
    expect(resolveValue(rs({ hover: 'H' }), 'desktop', 'normal')).toBeUndefined()
  })

  it('hover returns the hover value, and normal returns the normal value', () => {
    const r = rs({ normal: 'N', hover: 'H' })
    expect(resolveValue(r, 'desktop', 'normal')).toBe('N')
    expect(resolveValue(r, 'desktop', 'hover')).toBe('H')
  })

  it('hover falls back to normal at the same device when hover is not set', () => {
    expect(resolveValue(rs({ normal: 'N' }), 'desktop', 'hover')).toBe('N')
  })

  it('a mobile normal value beats a desktop hover value on mobile', () => {
    const r = rs({ normal: 'N', hover: 'H' }, undefined, { normal: 'M' })
    expect(resolveValue(r, 'mobile', 'hover')).toBe('M')
    expect(resolveValue(r, 'desktop', 'hover')).toBe('H')
  })

  it('a tablet hover value applies at mobile width when mobile has no value of its own', () => {
    const r = rs({ normal: 'N' }, { hover: 'T' })
    expect(resolveValue(r, 'mobile', 'hover')).toBe('T')
    expect(resolveValue(r, 'mobile', 'normal')).toBe('N')
  })

  it('resolveResponsive walks the same chain without states', () => {
    const r = { desktop: 1, mobile: 3 }
    expect(resolveResponsive(r, 'tablet')).toBe(1)
    expect(resolveResponsive(r, 'mobile')).toBe(3)
    expect(resolveResponsive(undefined, 'mobile')).toBeUndefined()
  })
})

describe('upgradeDesign: reading any stored value', () => {
  it('null, arrays and plain values read as an empty v2 design', () => {
    expect(upgradeDesign(null)).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign('nope')).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign(42)).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign([1, 2])).toEqual({ schemaVersion: 2 })
  })

  it('maps v1 paddings to desktop and mobile sides', () => {
    const out = upgradeDesign({ paddingTop: 12, paddingTopMobile: 4 }) as DesignV2
    expect(out.schemaVersion).toBe(2)
    expect(out.spacing?.padding?.top).toEqual({ desktop: { normal: { value: 12, unit: 'px' } }, mobile: { normal: { value: 4, unit: 'px' } } })
  })

  it('maps v1 colours, alignment and minimum height', () => {
    const out = upgradeDesign({ bgType: 'color', bgColor: '#123456', textColor: '#fff', textAlign: 'center', minHeight: 300 }) as DesignV2
    expect(out.background?.type).toBe('color')
    expect(out.background?.color?.desktop?.normal).toBe('#123456')
    expect(out.color?.text?.desktop?.normal).toBe('#fff')
    expect(out.typography?.align?.desktop?.normal).toBe('center')
    expect(out.size?.minHeight?.desktop?.normal).toEqual({ value: 300, unit: 'px' })
  })

  it('keeps v1 fields with no v2 equivalent under legacy, never dropping them', () => {
    const out = upgradeDesign({ width: 'wide', dividerTop: 'wave', bgImage: 7, futureField: { a: 1 } }) as DesignV2
    expect(out.legacy).toEqual({ width: 'wide', dividerTop: 'wave', bgImage: 7, futureField: { a: 1 } })
  })

  it('keeps a v1 field with the wrong type under legacy', () => {
    const out = upgradeDesign({ paddingTop: 'big' }) as DesignV2
    expect(out.spacing).toBeUndefined()
    expect(out.legacy).toEqual({ paddingTop: 'big' })
  })

  it('maps v1 border only when the width is above zero, with the v1 defaults', () => {
    const on = upgradeDesign({ borderWidth: 2, borderRadius: 6 }) as DesignV2
    expect(on.border?.style?.desktop?.normal).toBe('solid')
    expect(on.border?.color?.desktop?.normal).toBe('currentColor')
    expect(on.border?.radius?.desktop?.normal).toEqual({ value: 6, unit: 'px' })
    const off = upgradeDesign({ borderWidth: 0, borderStyle: 'dashed' }) as DesignV2
    expect(off.border).toBeUndefined()
    expect(off.legacy).toEqual({ borderWidth: 0, borderStyle: 'dashed' })
  })

  it('maps the v1 shadow presets to structured shadows, and none to no shadow', () => {
    const sm = upgradeDesign({ boxShadow: 'sm' }) as DesignV2
    expect(sm.boxShadow?.blur?.desktop?.normal).toEqual({ value: 3, unit: 'px' })
    expect(sm.boxShadow?.y?.desktop?.normal).toEqual({ value: 1, unit: 'px' })
    expect(sm.boxShadow?.color?.desktop?.normal).toBe('rgba(0, 0, 0, 0.12)')
    expect((upgradeDesign({ boxShadow: 'none' }) as DesignV2).boxShadow).toBeUndefined()
    expect((upgradeDesign({ boxShadow: 'none' }) as DesignV2).legacy).toBeUndefined()
  })

  it('v1 image backgrounds are cover-sized and centred, as v1 always drew them', () => {
    const out = upgradeDesign({ bgType: 'image', bgImageUrl: '/img/a.jpg', bgOverlay: 40 }) as DesignV2
    expect(out.background?.size?.desktop?.normal).toBe('cover')
    expect(out.background?.position?.desktop?.normal).toBe('center')
    expect(out.background?.overlay?.desktop?.normal).toBe(40)
  })

  it('maps v1 hide flags to visibility and the anchor to cssId', () => {
    const out = upgradeDesign({ hideOnMobile: true, hideOnDesktop: false, anchorId: 'pricing' }) as DesignV2
    expect(out.visibility).toEqual({ hideMobile: true })
    expect(out.cssId).toBe('pricing')
  })

  it('an unsafe custom class string stays under legacy in full', () => {
    const out = upgradeDesign({ customClass: 'hero good"bad' }) as DesignV2
    expect(out.cssClasses).toBeUndefined()
    expect(out.legacy).toEqual({ customClass: 'hero good"bad' })
    expect((upgradeDesign({ customClass: 'hero  promo' }) as DesignV2).cssClasses).toEqual(['hero', 'promo'])
  })

  it('upgrading twice gives the same result as upgrading once', () => {
    const v1 = { paddingTop: 10, bgType: 'gradient', bgGradientFrom: '#000', bgGradientTo: '#fff', width: 'full', hideOnMobile: true, boxShadow: 'lg' }
    const once = upgradeDesign(v1)
    const twice = upgradeDesign(once)
    expect(twice).toEqual(once)
    expect(upgradeDesign(twice)).toEqual(once)
  })

  it('a v2 value is returned as a copy that shares no references with the input', () => {
    const input = { schemaVersion: 2, opacity: { desktop: { normal: 0.5 } } }
    const out = upgradeDesign(input) as DesignV2
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
    expect(out.opacity).not.toBe(input.opacity)
  })

  it('a schemaVersion above 2 returns an error object, not a guessed design', () => {
    const result: UpgradeResult = upgradeDesign({ schemaVersion: 3, opacity: 1 })
    expect(isDesignError(result)).toBe(true)
    expect(result).toMatchObject({ error: 'unsupported-schema-version', version: 3 })
  })

  it('a schemaVersion that is not a number returns an error object', () => {
    expect(upgradeDesign({ schemaVersion: 'two' })).toMatchObject({ error: 'invalid-schema-version' })
    expect(upgradeDesign({ schemaVersion: 0 })).toMatchObject({ error: 'invalid-schema-version' })
  })

  it('never throws, even for a cyclic value', () => {
    const cyc: Record<string, unknown> = { schemaVersion: 2 }
    cyc.self = cyc
    expect(() => upgradeDesign(cyc)).not.toThrow()
    expect(upgradeDesign(cyc)).toMatchObject({ schemaVersion: 2 })
  })

  it('isDesignV2Raw is true only for schemaVersion 2 objects', () => {
    expect(isDesignV2Raw({ schemaVersion: 2 })).toBe(true)
    expect(isDesignV2Raw({ paddingTop: 1 })).toBe(false)
    expect(isDesignV2Raw(null)).toBe(false)
    expect(isDesignV2Raw([{ schemaVersion: 2 }])).toBe(false)
  })
})

describe('value guards used by the upgrade and the emitter', () => {
  it('safeColor accepts hex, rgb(a), hsl(a) and colour words only', () => {
    expect(safeColor('#fff')).toBe('#fff')
    expect(safeColor('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
    expect(safeColor('hsl(120, 50%, 40%)')).toBe('hsl(120, 50%, 40%)')
    expect(safeColor('currentColor')).toBe('currentColor')
    expect(safeColor('red;}body{')).toBeUndefined()
    expect(safeColor('url(x)')).toBeUndefined()
  })

  it('safeLength accepts px, %, em, rem, vw, vh and auto, and rejects other units and bad numbers', () => {
    for (const unit of ['px', '%', 'em', 'rem', 'vw', 'vh']) {
      expect(safeLength({ value: 3, unit })).toEqual({ value: 3, unit })
    }
    expect(safeLength({ value: 'auto', unit: 'px' })).toEqual({ value: 'auto', unit: 'px' })
    expect(safeLength({ value: 1, unit: 'pt' })).toBeUndefined()
    expect(safeLength({ value: Number.NaN, unit: 'px' })).toBeUndefined()
    expect(safeLength({ value: 1e9, unit: 'px' })).toBeUndefined()
  })

  it('safeUrl accepts http(s) and site-relative URLs and rejects script and protocol-relative URLs', () => {
    expect(safeUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
    expect(safeUrl('/img/a.jpg')).toBe('/img/a.jpg')
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl('//evil.example/x.jpg')).toBeUndefined()
    expect(safeUrl('/a.jpg")')).toBeUndefined()
  })

  it('safeScopeId only allows letters, digits, underscore and hyphen', () => {
    expect(safeScopeId('el-3')).toBe('el-3')
    expect(safeScopeId('x"]{color:red}')).toBeUndefined()
    expect(safeScopeId('')).toBeUndefined()
    expect(safeScopeId(12)).toBeUndefined()
  })
})

describe('upgrade results are the right shape for the emitter', () => {
  it('a v1 design upgrades to a design with no legacy keys when every field maps', () => {
    const out = upgradeDesign({ paddingTop: 8, bgColor: '#000', bgType: 'color' }) as DesignV2
    expect(out.legacy).toBeUndefined()
  })

  it('the upgrade output of v2 never carries schemaVersion other than 2', () => {
    for (const raw of [null, {}, { paddingTop: 1 }, { schemaVersion: 2 }]) {
      expect((upgradeDesign(raw) as DesignV2).schemaVersion).toBe(2)
    }
  })

  it('an error result is recognised by isDesignError and a design is not', () => {
    expect(isDesignError(upgradeDesign({ schemaVersion: 9 }))).toBe(true)
    expect(isDesignError(upgradeDesign({ schemaVersion: 2 }))).toBe(false)
    expect(isDesignError(upgradeDesign(null))).toBe(false)
  })
})
