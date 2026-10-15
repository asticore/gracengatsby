import { describe, expect, it } from 'vitest'

import {
  addButton,
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
})
