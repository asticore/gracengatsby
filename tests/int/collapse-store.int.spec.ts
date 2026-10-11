import { describe, expect, it } from 'vitest'
import type { Field } from '@/engine'
import {
  applyCardOp,
  collapseAll,
  expandAll,
  getOpenIds,
  registerCardId,
  sanitizeCardIds,
  setCardOpen,
  toggleCard,
} from '@/admin/components/collapseStore'
import { scopeGroupFields, splitFieldSections } from '@/admin/views/EditForm'

describe('sanitizeCardIds', () => {
  it('keeps valid unique ids and drops the rest', () => {
    expect(sanitizeCardIds(['settings', 'settings', 'bad id', 'outline:0.1', 3])).toEqual(['settings', 'outline:0.1'])
  })

  it('returns empty for non-array input', () => {
    expect(sanitizeCardIds(undefined)).toEqual([])
    expect(sanitizeCardIds('settings')).toEqual([])
  })

  it('caps at 100 ids', () => {
    expect(sanitizeCardIds(Array.from({ length: 120 }, (_, i) => `c${i}`))).toHaveLength(100)
  })
})

describe('applyCardOp', () => {
  it('adds and removes opened ids without mutating the input set', () => {
    const start = new Set(['a'])
    const opened = applyCardOp(start, { type: 'set', ids: ['b', 'c'], open: true })
    expect([...opened].sort()).toEqual(['a', 'b', 'c'])
    expect([...start]).toEqual(['a'])

    const closed = applyCardOp(opened, { type: 'set', ids: ['a', 'x'], open: false })
    expect([...closed].sort()).toEqual(['b', 'c'])
  })

  it('clear empties the set (every card closed)', () => {
    expect(applyCardOp(new Set(['a', 'b']), { type: 'clear' }).size).toBe(0)
  })
})

describe('card open state', () => {
  it('a card nobody opened is not in the opened set', () => {
    expect(getOpenIds()).not.toContain('never-touched-card')
  })

  it('toggleCard opens a closed card and closes an open one', () => {
    toggleCard('t-card')
    expect(getOpenIds()).toContain('t-card')
    toggleCard('t-card')
    expect(getOpenIds()).not.toContain('t-card')
  })

  it('setCardOpen true opens and false closes', () => {
    collapseAll(['t-card-2'])
    setCardOpen('t-card-2', true)
    expect(getOpenIds()).toContain('t-card-2')
    setCardOpen('t-card-2', false)
    expect(getOpenIds()).not.toContain('t-card-2')
  })

  it('collapseAll with ids closes only those cards', () => {
    setCardOpen('keep-open', true)
    setCardOpen('shut-me', true)
    collapseAll(['shut-me'])
    expect(getOpenIds()).toContain('keep-open')
    expect(getOpenIds()).not.toContain('shut-me')
    setCardOpen('keep-open', false)
  })

  it('expandAll opens every registered card and collapseAll() closes them again', () => {
    registerCardId('reg-a')
    registerCardId('reg-b')
    expandAll()
    expect(getOpenIds()).toEqual(expect.arrayContaining(['reg-a', 'reg-b']))
    collapseAll()
    expect(getOpenIds()).not.toContain('reg-a')
    expect(getOpenIds()).not.toContain('reg-b')
  })
})

const text = (name: string) => ({ type: 'text', name }) as Field
const group = (name: string, label?: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'group', name, label, fields: [text(`${name}Key`)], ...extra }) as Field

describe('splitFieldSections', () => {
  it('puts ungrouped fields in General and gives each group its own section, in config order', () => {
    const groupField = group('google', 'Google')
    const sections = splitFieldSections([text('siteName'), groupField, group('recaptcha'), text('tagline')])
    expect(sections.map((s) => [s.key, s.title])).toEqual([
      ['_general', 'General'],
      ['google', 'Google'],
      ['recaptcha', 'Recaptcha'],
    ])
    expect(sections[0].fields.map((f) => ('name' in f ? f.name : f.type))).toEqual(['siteName', 'tagline'])
    expect(sections[1].fields).toEqual([groupField])
    expect(sections[1].parentPath).toBe('')
  })

  it('adds no General section when every field is grouped', () => {
    const sections = splitFieldSections([group('a', 'A'), group('b', 'B')])
    expect(sections.map((s) => s.key)).toEqual(['a', 'b'])
  })

  it('returns no sections for no fields', () => {
    expect(splitFieldSections([])).toEqual([])
  })

  it('leaves out hidden groups', () => {
    const sections = splitFieldSections([group('shown', 'Shown'), group('secret', 'Secret', { admin: { hidden: true } })])
    expect(sections.map((s) => s.key)).toEqual(['shown'])
  })

  it('makes a card per named tab and sends unnamed tab fields to General', () => {
    const tabs = {
      type: 'tabs',
      tabs: [
        { label: 'Look', name: 'look', fields: [text('color')] },
        { label: 'Misc', fields: [text('misc')] },
      ],
    } as unknown as Field
    const sections = splitFieldSections([tabs])
    expect(sections.map((s) => [s.key, s.title, s.parentPath])).toEqual([
      ['_general', 'General', ''],
      ['look', 'Look', 'look'],
    ])
    expect(sections[0].fields.map((f) => ('name' in f ? f.name : f.type))).toEqual(['misc'])
  })
})

describe('scopeGroupFields', () => {
  const fields = [text('claudeApiKey'), group('google', 'Google'), group('clarity', 'Clarity')]

  it('returns the same array when no scope is given', () => {
    expect(scopeGroupFields(fields)).toBe(fields)
  })

  it('onlyGroups keeps only the named groups and drops ungrouped fields', () => {
    const scoped = scopeGroupFields(fields, { onlyGroups: ['clarity'] })
    expect(scoped.map((f) => ('name' in f ? f.name : f.type))).toEqual(['clarity'])
  })

  it('excludeGroups removes the named groups and keeps everything else', () => {
    const scoped = scopeGroupFields(fields, { excludeGroups: ['google'] })
    expect(scoped.map((f) => ('name' in f ? f.name : f.type))).toEqual(['claudeApiKey', 'clarity'])
  })
})
