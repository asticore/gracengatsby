// Reading any stored design value: upgradeDesign and the guards it uses. Pure logic, no CSS.
import { describe, expect, it } from 'vitest'

import { isDesignError, isDesignV2Raw, upgradeDesign } from '@/lib/design/upgrade'
import type { DesignV2, UpgradeResult } from '@/lib/design/types'

describe('upgradeDesign: reading any stored value', () => {
  it('null, arrays and plain values read as an empty v2 design', () => {
    expect(upgradeDesign(null)).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign('nope')).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign(42)).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign([1, 2])).toEqual({ schemaVersion: 2 })
  })

  it('stores v1 paddings verbatim in the spacing group, desktop and mobile', () => {
    const out = upgradeDesign({ paddingTop: 12, paddingTopMobile: 4 }) as DesignV2
    expect(out.schemaVersion).toBe(2)
    expect(out.groups?.spacing).toEqual({ paddingTop: 12, paddingTopMobile: 4 })
  })

  it('stores v1 colours, alignment and minimum height in their groups', () => {
    const out = upgradeDesign({ bgType: 'color', bgColor: '#123456', textColor: '#fff', textAlign: 'center', minHeight: 300 }) as DesignV2
    expect(out.groups?.background).toEqual({ bgType: 'color', bgColor: '#123456' })
    expect(out.groups?.typography).toEqual({ textColor: '#fff', textAlign: 'center' })
    expect(out.groups?.size).toEqual({ minHeight: 300 })
  })

  it('keeps every v1 key, unknown keys under legacy', () => {
    const out = upgradeDesign({ width: 'wide', dividerTop: 'wave', bgImage: 7, futureField: { a: 1 } }) as DesignV2
    expect(out.groups?.size).toEqual({ width: 'wide' })
    expect(out.groups?.divider).toEqual({ dividerTop: 'wave' })
    expect(out.groups?.background).toEqual({ bgImage: 7 })
    expect(out.legacy).toEqual({ futureField: { a: 1 } })
  })

  it('stores a v1 field with the wrong type unchanged (the renderer sanitises it)', () => {
    const out = upgradeDesign({ paddingTop: 'big' }) as DesignV2
    expect(out.groups?.spacing).toEqual({ paddingTop: 'big' })
  })

  it('stores border fields exactly as v1 wrote them, with no defaults added', () => {
    const on = upgradeDesign({ borderWidth: 2, borderRadius: 6 }) as DesignV2
    expect(on.groups?.border).toEqual({ borderWidth: 2, borderRadius: 6 })
    expect(on.groups?.border?.borderStyle).toBeUndefined()
    const off = upgradeDesign({ borderWidth: 0, borderStyle: 'dashed' }) as DesignV2
    expect(off.groups?.border).toEqual({ borderWidth: 0, borderStyle: 'dashed' })
  })

  it('stores shadow presets as v1 names', () => {
    expect((upgradeDesign({ boxShadow: 'sm' }) as DesignV2).groups?.border).toEqual({ boxShadow: 'sm' })
    expect((upgradeDesign({ boxShadow: 'none' }) as DesignV2).groups?.border).toEqual({ boxShadow: 'none' })
  })

  it('stores image background fields verbatim (no cover or centre added)', () => {
    const out = upgradeDesign({ bgType: 'image', bgImageUrl: '/img/a.jpg', bgOverlay: 40 }) as DesignV2
    expect(out.groups?.background).toEqual({ bgType: 'image', bgImageUrl: '/img/a.jpg', bgOverlay: 40 })
  })

  it('stores hide flags and the anchor in their groups', () => {
    const out = upgradeDesign({ hideOnMobile: true, hideOnDesktop: false, anchorId: 'pricing' }) as DesignV2
    expect(out.groups?.visibility).toEqual({ hideOnMobile: true, hideOnDesktop: false })
    expect(out.groups?.meta).toEqual({ anchorId: 'pricing' })
  })

  it('stores a custom class string verbatim, so no class is ever dropped', () => {
    const out = upgradeDesign({ customClass: 'hero good"bad' }) as DesignV2
    expect(out.groups?.meta).toEqual({ customClass: 'hero good"bad' })
    expect(out.legacy).toBeUndefined()
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

describe('upgrade results are the right shape for the emitter', () => {
  it('a v1 design with only known keys has no legacy group', () => {
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
