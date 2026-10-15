import { describe, expect, it } from 'vitest'

import {
  addButton,
  addPreset,
  applyPresetData,
  deletePreset,
  renamePreset,
  setGlobal,
  spaceScalePreview,
  validateBreakpoints,
  addColour,
  contrastRatio,
  moveColour,
  parseImport,
  removeButton,
  removeColour,
  removeTable,
  resetTab,
  uniqueSlug,
} from '@/admin/views/themeStyles/editorLogic'
import { DEFAULT_THEME_STYLES, LIMITS } from '@/features/themeStyles/types'

describe('theme styles editor logic', () => {
  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeGreaterThan(4.4)
    expect(contrastRatio('red', '#fff')).toBeNull()
  })

  it('adds custom colours with unique slugs and respects the limit', () => {
    let list = DEFAULT_THEME_STYLES.colours
    list = addColour(list, 'Sky')
    list = addColour(list, 'Sky')
    expect(list.slice(-2).map((c) => c.id)).toEqual(['sky', 'sky-2'])
    while (list.length < LIMITS.colours) list = addColour(list, 'More')
    expect(list).toHaveLength(LIMITS.colours)
    expect(addColour(list, 'Over')).toHaveLength(LIMITS.colours)
  })

  it('never removes or moves system colours', () => {
    const list = addColour(addColour(DEFAULT_THEME_STYLES.colours, 'A'), 'B')
    expect(removeColour(list, 'primary')).toHaveLength(list.length)
    expect(removeColour(list, 'a')).toHaveLength(list.length - 1)
    expect(moveColour(list, 'primary', 1)).toBe(list)
    const up = moveColour(list, 'b', -1)
    expect(up.slice(-2).map((c) => c.id)).toEqual(['b', 'a'])
    expect(moveColour(up, 'b', -1)).toBe(up)
  })

  it('adds buttons with unique slugs and protects system buttons', () => {
    let list = addButton(DEFAULT_THEME_STYLES.buttons, 'Primary')
    expect(list[2].id).toBe('primary-2')
    list = addButton(list, 'Primary')
    expect(list[3].id).toBe('primary-3')
    expect(removeButton(list, 'primary')).toHaveLength(list.length)
    expect(removeButton(list, 'primary-2')).toHaveLength(list.length - 1)
    expect(uniqueSlug('!!!', [])).toBe('item')
  })

  it('keeps default table valid when removing, and protects the system table', () => {
    const styles = { ...DEFAULT_THEME_STYLES, defaultTableId: 'striped' }
    expect(removeTable(styles, 'default')).toBe(styles)
    expect(removeTable(styles, 'striped').defaultTableId).toBe('default')
  })

  it('resets a tab to defaults', () => {
    const changed = { ...DEFAULT_THEME_STYLES, colours: addColour(DEFAULT_THEME_STYLES.colours, 'X') }
    expect(resetTab(changed, 'colours').colours).toEqual(DEFAULT_THEME_STYLES.colours)
  })

  it('validates imports', () => {
    expect(parseImport('nope').ok).toBe(false)
    expect(parseImport('[]').ok).toBe(false)
    expect(parseImport('{"version":2}').ok).toBe(false)
    expect(parseImport(JSON.stringify(DEFAULT_THEME_STYLES)).ok).toBe(true)
  })

  it('sets globals immutably', () => {
    const next = setGlobal(DEFAULT_THEME_STYLES, 'forms.fieldRadius', 20)
    expect(next.globals.forms.fieldRadius).toBe(20)
    expect(DEFAULT_THEME_STYLES.globals.forms.fieldRadius).toBe(8)
    expect(next.globals.links).toBe(DEFAULT_THEME_STYLES.globals.links)
    expect(setGlobal(DEFAULT_THEME_STYLES, 'customCss', 'a{}').globals.customCss).toBe('a{}')
    expect(setGlobal(DEFAULT_THEME_STYLES, 'forms.nope', 1)).toBe(DEFAULT_THEME_STYLES)
    expect(setGlobal(DEFAULT_THEME_STYLES, 'nope.x', 1)).toBe(DEFAULT_THEME_STYLES)
  })

  it('validates breakpoints', () => {
    expect(validateBreakpoints({ tablet: 1024, mobile: 640 })).toBeNull()
    expect(validateBreakpoints({ tablet: 800, mobile: 800 })).toMatch(/smaller/)
    expect(validateBreakpoints({ tablet: 700, mobile: 800 })).toMatch(/smaller/)
    expect(validateBreakpoints({ tablet: 500, mobile: 400 })).toMatch(/Tablet/)
    expect(validateBreakpoints({ tablet: 1000, mobile: 100 })).toMatch(/Mobile/)
  })

  it('previews the spacing scale', () => {
    expect(spaceScalePreview(4).map((s) => s.px)).toEqual([4, 8, 12, 16, 24, 32, 48, 64])
    expect(spaceScalePreview(4)[0].name).toBe('--eg-space-1')
    expect(spaceScalePreview(100)[7].px).toBe(256)
  })

  it('adds, renames, deletes and applies presets', () => {
    let styles = setGlobal(DEFAULT_THEME_STYLES, 'images.radius', 12)
    styles = addPreset(styles, 'Rounded')
    styles = addPreset(styles, 'Rounded')
    expect(styles.presets.map((p) => p.id)).toEqual(['rounded', 'rounded-2'])
    expect(addPreset(styles, '   ')).toBe(styles)
    expect(styles.presets[0].data.globals.images.radius).toBe(12)
    expect(JSON.stringify(styles.presets[0].data)).not.toContain('"presets"')
    styles = renamePreset(styles, 'rounded', 'Soft corners')
    expect(styles.presets[0].name).toBe('Soft corners')
    expect(styles.presets[0].id).toBe('rounded')
    const changed = setGlobal(styles, 'images.radius', 0)
    const applied = applyPresetData(changed, styles.presets[0].data)
    expect(applied.globals.images.radius).toBe(12)
    expect(applied.presets).toHaveLength(2)
    expect(applied.globals).not.toBe(styles.presets[0].data.globals)
    styles = deletePreset(styles, 'rounded')
    expect(styles.presets.map((p) => p.id)).toEqual(['rounded-2'])
    while (styles.presets.length < LIMITS.presets) styles = addPreset(styles, `P${styles.presets.length}`)
    expect(addPreset(styles, 'Over').presets).toHaveLength(LIMITS.presets)
  })

  it('imports old documents without globals or presets', () => {
    const { globals: _g, presets: _p, ...old } = DEFAULT_THEME_STYLES
    const result = parseImport(JSON.stringify(old))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.styles.globals).toEqual(DEFAULT_THEME_STYLES.globals)
      expect(result.styles.presets).toEqual([])
    }
    const partial = parseImport(JSON.stringify({ ...old, globals: { forms: { fieldRadius: 2 }, customCss: 'p{}' } }))
    expect(partial.ok && partial.styles.globals.forms.fieldRadius).toBe(2)
    expect(partial.ok && partial.styles.globals.forms.fieldBg).toBe('@surface')
    expect(partial.ok && partial.styles.globals.customCss).toBe('p{}')
    expect(partial.ok && partial.styles.globals.breakpoints).toEqual({ tablet: 1024, mobile: 640 })
  })

  it('resets the layout tab and leaves presets alone', () => {
    const changed = setGlobal(addPreset(DEFAULT_THEME_STYLES, 'Keep'), 'links.underline', 'always')
    expect(resetTab(changed, 'layout').globals.links.underline).toBe('hover')
    expect(resetTab(changed, 'layout').presets).toHaveLength(1)
    expect(resetTab(changed, 'presets')).toBe(changed)
  })
})
