import { describe, expect, it } from 'vitest'

import { ELEMENTS } from '@/lib/elements/registry'
import { isFieldVisible, type EditorField } from '@/lib/elements/fieldTypes'

const field = (showIf?: EditorField['showIf']): EditorField => ({ name: 'target', label: 'Target', type: 'text', showIf })

describe('isFieldVisible', () => {
  it('is always visible without a showIf rule', () => {
    expect(isFieldVisible(field(), {})).toBe(true)
    expect(isFieldVisible(field(), { media: 'none' })).toBe(true)
  })

  it('matches equals as a string', () => {
    const f = field({ field: 'media', equals: 'icon' })
    expect(isFieldVisible(f, { media: 'icon' })).toBe(true)
    expect(isFieldVisible(f, { media: 'image' })).toBe(false)
    expect(isFieldVisible(f, {})).toBe(false)
  })

  it('compares boolean equals through String()', () => {
    const f = field({ field: 'enabled', equals: true })
    expect(isFieldVisible(f, { enabled: true })).toBe(true)
    expect(isFieldVisible(f, { enabled: 'true' })).toBe(true)
    expect(isFieldVisible(f, { enabled: false })).toBe(false)
    expect(isFieldVisible(field({ field: 'enabled', equals: false }), { enabled: false })).toBe(true)
  })

  it('matches any value listed in "in"', () => {
    const f = field({ field: 'effect', in: ['rotate', 'split'] })
    expect(isFieldVisible(f, { effect: 'rotate' })).toBe(true)
    expect(isFieldVisible(f, { effect: 'split' })).toBe(true)
    expect(isFieldVisible(f, { effect: 'none' })).toBe(false)
  })

  it('requires both equals and in when both are set', () => {
    const f = field({ field: 'effect', equals: 'split', in: ['rotate'] })
    expect(isFieldVisible(f, { effect: 'split' })).toBe(false)
    expect(isFieldVisible(f, { effect: 'rotate' })).toBe(false)
  })
})

describe('showIf references in element defs', () => {
  const defs = ELEMENTS.filter((def) => def.fields.some((f) => f.showIf))

  it('includes the heading and card defs', () => {
    expect(defs.map((d) => d.type)).toEqual(expect.arrayContaining(['heading', 'card']))
  })

  it('names an existing field in the same def for every showIf', () => {
    const problems: string[] = []
    for (const def of ELEMENTS) {
      const names = new Set(def.fields.map((f) => f.name))
      for (const f of def.fields) {
        if (f.showIf && !names.has(f.showIf.field)) problems.push(`${def.type}.${f.name} -> ${f.showIf.field}`)
      }
    }
    expect(problems).toEqual([])
  })
})
