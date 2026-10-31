// @vitest-environment node
// Which pages use a form (the admin Forms screens) and the in-page edits to a form's layout.
import { describe, expect, it } from 'vitest'

import { collectFormRefs, pagesUsingForms } from '@/features/forms/pageUsage'
import { appendFormElement, listEditableRows, moveNode, removeNode, updateNodeProps } from '@/features/forms/layoutEdit'

const field = (id: string, elementType: string, props: Record<string, unknown> = {}) => ({ blockType: 'element', _id: id, elementType, props })

describe('collectFormRefs', () => {
  it('finds form blocks nested in sections and columns, as id or as a {id} reference', () => {
    const refs = new Set<string>()
    collectFormRefs(
      [
        { blockType: 'section', columns: [{ blocks: [{ blockType: 'form', form: 7 }] }, { blocks: [{ blockType: 'text', body: 'x' }] }] },
        { blockType: 'form', form: { id: 9, title: 'Other' } },
      ],
      refs,
    )
    expect([...refs].sort()).toEqual(['7', '9'])
  })

  it('finds a [form] shortcode paragraph in rich text, by id or key', () => {
    const refs = new Set<string>()
    collectFormRefs({ blockType: 'text', content: [{ type: 'paragraph', children: [{ text: '[form id="abc123"]' }] }] }, refs)
    expect([...refs]).toEqual(['abc123'])
  })

  it('ignores a form block without a reference and plain text', () => {
    const refs = new Set<string>()
    collectFormRefs([{ blockType: 'form', form: null }, { blockType: 'text', body: 'form 5' }], refs)
    expect(refs.size).toBe(0)
  })
})

describe('pagesUsingForms', () => {
  const forms = [
    { id: 1, embedKey: 'keyone' },
    { id: 2, embedKey: 'keytwo' },
  ]

  it('lists each page once per form, with its status and link', () => {
    const map = pagesUsingForms(forms, [
      { id: 10, title: 'Contact', status: 'published', liveHref: '/contact', blocks: [{ blockType: 'form', form: 1 }, { blockType: 'form', form: '1' }] },
      { id: 11, title: 'Draft page', status: 'draft', blocks: [{ blockType: 'section', columns: [{ blocks: [{ blockType: 'form', form: 1 }] }] }] },
      { id: 12, title: 'Shortcode', status: 'published', blocks: [{ blockType: 'text', content: [{ type: 'paragraph', children: [{ text: '[form key="keytwo"]' }] }] }] },
    ])
    expect(map.get('1')).toEqual([
      { id: 10, title: 'Contact', status: 'published', liveHref: '/contact' },
      { id: 11, title: 'Draft page', status: 'draft', liveHref: undefined },
    ])
    expect(map.get('2')).toEqual([{ id: 12, title: 'Shortcode', status: 'published', liveHref: undefined }])
  })

  it('returns nothing for a form no page uses', () => {
    const map = pagesUsingForms(forms, [{ id: 3, title: 'Plain', blocks: [{ blockType: 'text' }] }])
    expect(map.size).toBe(0)
  })
})

describe('form layout edits', () => {
  const layout = () => [
    field('a', 'ff-text', { label: 'Name', name: 'name' }),
    { blockType: 'section', _id: 's', columns: [{ blocks: [field('b', 'ff-email', { label: 'Email' }), field('c', 'ff-step', { title: 'Next' })] }] },
    field('d', 'ff-html', { html: '<p>Hi</p>' }),
  ]

  it('lists form elements in reading order with their depth', () => {
    const rows = listEditableRows(layout())
    expect(rows.map((r) => [r.id, r.elementType, r.depth])).toEqual([
      ['a', 'ff-text', 0],
      ['b', 'ff-email', 1],
      ['c', 'ff-step', 1],
      ['d', 'ff-html', 0],
    ])
  })

  it('moves a node only inside its own container and never past the edge', () => {
    const next = moveNode(layout(), 'c', -1)
    const rows = listEditableRows(next)
    expect(rows.filter((r) => r.depth === 1).map((r) => r.id)).toEqual(['c', 'b'])
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b', 'd'])
    const top = moveNode(layout(), 'a', -1)
    expect(listEditableRows(top).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('removes a field from wherever it sits and leaves the input untouched', () => {
    const original = layout()
    const next = removeNode(original, 'b')
    expect(listEditableRows(next).map((r) => r.id)).toEqual(['a', 'c', 'd'])
    expect(listEditableRows(original).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('updates props in place, and an undefined value drops the key', () => {
    const next = updateNodeProps(layout(), 'a', { label: 'Full name', required: true, placeholder: undefined })
    const row = listEditableRows(next)[0]!
    expect(row.props).toEqual({ label: 'Full name', name: 'name', required: true })
  })

  it('appends a new element with its default props at the top level', () => {
    const next = appendFormElement(layout(), 'ff-phone', 'new1')
    const last = next[next.length - 1] as { _id: string; elementType: string; props: Record<string, unknown> }
    expect(last._id).toBe('new1')
    expect(last.elementType).toBe('ff-phone')
    expect(last.props).toMatchObject({ width: 'full' })
  })

  it('does nothing for an unknown element type', () => {
    expect(appendFormElement(layout(), 'ff-nope', 'x')).toHaveLength(3)
  })
})
