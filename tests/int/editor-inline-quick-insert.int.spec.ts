import { describe, expect, it } from 'vitest'

import type { SectionNode } from '@/lib/sectionTree'
import { applyInlineEdit, inlineCandidate, inlineReducer, inlineResult, listInlineTargets, neighbourTarget, startInline } from '@/views/visualEditor/inlineEdit'
import { filterQuickInsert, moveHighlight, quickInsertTarget } from '@/views/visualEditor/quickInsert'
import { plainTextToLexical } from '@/views/visualEditor/richTextUtil'

const el = (elementType: string, props: Record<string, unknown>) => ({ blockType: 'element', elementType, props }) as unknown as SectionNode
const lexical = { root: { type: 'root', version: 1, children: [{ type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Hi', version: 1 }] }] } }

describe('inline editable props', () => {
  it('heading, button and quote expose their text', () => {
    expect(inlineCandidate(el('heading', { text: 'Hello' }))?.value).toBe('Hello')
    expect(inlineCandidate(el('button', { text: 'Go' }))?.field).toBe('text')
    expect(inlineCandidate(el('quote', { text: 'Q' }))?.multiline).toBe(true)
  })
  it('list items are addressed by index', () => {
    const list = el('list', { items: [{ text: 'a' }, { text: 'b' }] })
    expect(inlineCandidate(list, 1)).toMatchObject({ field: 'items', itemIndex: 1, value: 'b' })
    expect(inlineCandidate(list, 5)).toBeNull()
  })
  it('rich text stays read-only unless it is plain', () => {
    expect(inlineCandidate(el('text-editor', { content: lexical }))).toBeNull()
    expect(inlineCandidate(el('text-editor', { content: plainTextToLexical('Plain') }))?.value).toBe('Plain')
  })
  it('other elements and non-strings are not editable', () => {
    expect(inlineCandidate(el('image', { src: 'x' }))).toBeNull()
    expect(inlineCandidate(el('heading', { text: 5 }))).toBeNull()
  })
})

describe('applyInlineEdit', () => {
  const blocks = [{ blockType: 'section', columns: [{ blocks: [el('heading', { text: 'A', tag: 'h2' }), el('list', { items: [{ text: 'x', link: 'l' }, { text: 'y' }] })] }] } as unknown as SectionNode]
  it('writes nested text and keeps siblings', () => {
    const next = applyInlineEdit(blocks, [0, 0, 0], { field: 'text' }, 'B')
    expect((next[0].columns![0].blocks![0] as unknown as { props: { text: string; tag: string } }).props).toEqual({ text: 'B', tag: 'h2' })
    expect(next[0].columns![0].blocks![1]).toBe(blocks[0].columns![0].blocks![1])
  })
  it('writes a list item only', () => {
    const next = applyInlineEdit(blocks, [0, 0, 1], { field: 'items', itemIndex: 0 }, 'z')
    expect((next[0].columns![0].blocks![1] as unknown as { props: { items: unknown[] } }).props.items).toEqual([{ text: 'z', link: 'l' }, { text: 'y' }])
  })
  it('returns the same tree for no change, columns, or rich content', () => {
    expect(applyInlineEdit(blocks, [0, 0, 0], { field: 'text' }, 'A')).toBe(blocks)
    expect(applyInlineEdit(blocks, [0, 0], { field: 'text' }, 'q')).toBe(blocks)
    const rich = [el('text-editor', { content: lexical })]
    expect(applyInlineEdit(rich, [0], { field: 'content' }, 'overwrite')).toBe(rich)
  })
  it('lists targets in order, skipping locked nodes, and finds neighbours', () => {
    const all = listInlineTargets(blocks)
    expect(all.map((t) => `${t.path.join('.')}/${t.itemIndex ?? ''}`)).toEqual(['0.0.0/', '0.0.1/0', '0.0.1/1'])
    expect(listInlineTargets(blocks, { '0.0.1': { blocked: true } })).toHaveLength(1)
    expect(neighbourTarget(all, all[0], 'next')).toEqual(all[1])
    expect(neighbourTarget(all, all[0], 'prev')).toBeNull()
  })
})

describe('inline session reducer', () => {
  it('commit with a change yields the draft', () => {
    const s = inlineReducer(inlineReducer(startInline('a'), { type: 'change', value: 'b' }), { type: 'commit' })
    expect(inlineResult(s)).toBe('b')
  })
  it('commit without a change, or cancel, writes nothing', () => {
    expect(inlineResult(inlineReducer(startInline('a'), { type: 'commit' }))).toBeNull()
    const c = inlineReducer(inlineReducer(startInline('a'), { type: 'change', value: 'b' }), { type: 'cancel' })
    expect(inlineResult(c)).toBeNull()
  })
  it('ignores a blur commit after cancel', () => {
    const s = [{ type: 'change', value: 'b' }, { type: 'cancel' }, { type: 'commit' }].reduce((st, a) => inlineReducer(st, a as never), startInline('a'))
    expect(s.done).toBe('cancel')
    expect(inlineResult(s)).toBeNull()
  })
})

describe('quick insert filter', () => {
  const cards = [
    { slug: 'element:heading', label: 'Heading', description: 'A title line' },
    { slug: 'element:button', label: 'Button', description: 'A link styled as a button' },
    { slug: 'element:text-editor', label: 'Text editor', description: 'Rich text' },
    { slug: 'element:dual-heading', label: 'Dual heading', description: 'Two tones' },
  ]
  it('empty query puts recents first', () => {
    expect(filterQuickInsert(cards, '', ['element:button']).map((c) => c.label)).toEqual(['Button', 'Heading', 'Text editor', 'Dual heading'])
  })
  it('ranks prefix over word-prefix over substring over description', () => {
    expect(filterQuickInsert(cards, 'head').map((c) => c.label)).toEqual(['Heading', 'Dual heading'])
    expect(filterQuickInsert(cards, 'butt')[0].label).toBe('Button')
    expect(filterQuickInsert(cards, 'tones')[0].label).toBe('Dual heading')
    expect(filterQuickInsert(cards, 'zzz')).toEqual([])
  })
  it('limits and wraps the highlight', () => {
    expect(filterQuickInsert(cards, '', [], 2)).toHaveLength(2)
    expect(moveHighlight(0, -1, 3)).toBe(2)
    expect(moveHighlight(2, 1, 3)).toBe(0)
  })
  it('target is after the selected block, end of a column, or end of page', () => {
    const blocks = [{ blockType: 'section', columns: [{ blocks: [el('heading', { text: 'A' })] }] } as unknown as SectionNode]
    expect(quickInsertTarget(blocks, [0, 0, 0])).toEqual({ containerPath: [0, 0], at: 1 })
    expect(quickInsertTarget(blocks, [0, 0])).toEqual({ containerPath: [0, 0], at: 1 })
    expect(quickInsertTarget(blocks, null)).toEqual({ containerPath: [], at: 1 })
  })
})
