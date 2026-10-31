// @vitest-environment node
// The admin Forms screen shows a read-only summary of the visual layout; it never edits fields.
import { describe, expect, it } from 'vitest'

import { summariseFormLayout } from '@/features/forms/layoutSummary'

const node = (id: string, elementType: string, props: Record<string, unknown>) => ({ _id: id, blockType: 'element', elementType, props })

describe('summariseFormLayout', () => {
  it('counts input fields, required ones and steps from the stored layout', () => {
    const layout = [
      node('a', 'ff-text', { label: 'Name', name: 'name', required: true }),
      node('h', 'ff-html', { html: '<p>Hi</p>' }),
      node('s', 'ff-step', { title: 'Next' }),
      node('e', 'ff-email', { label: 'Email', name: 'email', required: false }),
    ]
    const summary = summariseFormLayout({ id: 1, title: 'Join', layout, publishedLayout: layout } as never)
    expect(summary.inputs).toBe(2)
    expect(summary.required).toBe(1)
    expect(summary.steps).toBe(2)
    expect(summary.items).toEqual(['Name', 'Email'])
    expect(summary.unpublished).toBe(false)
  })

  it('reads a legacy form that has only the old field list', () => {
    const summary = summariseFormLayout({ id: 2, title: 'Old', fields: [{ type: 'text', label: 'Your name', name: 'name', required: true }] } as never)
    expect(summary.inputs).toBe(1)
    expect(summary.required).toBe(1)
    expect(summary.items).toEqual(['Your name'])
  })

  it('reports unpublished changes when the working copy differs from what is live', () => {
    const summary = summariseFormLayout({
      id: 3,
      title: 'Draft',
      layout: [node('a', 'ff-text', { label: 'Phone', name: 'phone' })],
      publishedLayout: [node('a', 'ff-text', { label: 'Name', name: 'name' })],
    } as never)
    expect(summary.unpublished).toBe(true)
  })

  it('is empty for a new form', () => {
    expect(summariseFormLayout(null)).toMatchObject({ inputs: 0, required: 0, items: [] })
  })
})
