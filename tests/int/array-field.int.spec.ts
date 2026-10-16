import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let current: unknown[] | undefined
vi.mock('@/engine/ui', () => ({
  FieldLabel: ({ label }: { label: string }) => h('label', {}, label),
  useField: () => ({ value: current, setValue: vi.fn() }),
}))
vi.mock('@/admin/fields/array-field.css', () => ({}))

import { ArrayFieldRenderer } from '@/admin/fields/ArrayField'

const field = {
  name: 'repos',
  type: 'array',
  label: 'Repositories',
  labels: { singular: 'Repository', plural: 'Repositories' },
  fields: [{ name: 'label', type: 'text', label: 'Name' }],
} as never

describe('ArrayFieldRenderer', () => {
  it('shows an add button and empty-state sentence when empty', () => {
    current = []
    const html = renderToStaticMarkup(h(ArrayFieldRenderer, { field, path: 'repos' }))
    expect(html).toContain('+ Add repository')
    expect(html).toContain('No repositories yet. Add one below.')
  })

  it('shows the add button, remove and collapse controls with rows', () => {
    current = [{ label: 'A' }]
    const html = renderToStaticMarkup(h(ArrayFieldRenderer, { field, path: 'repos' }))
    expect(html).toContain('+ Add repository')
    expect(html).toContain('aria-label="Remove repository 1"')
    expect(html).toContain('aria-expanded="true"')
  })

  it('hides the add button when read only', () => {
    current = []
    const html = renderToStaticMarkup(h(ArrayFieldRenderer, { field, path: 'repos', readOnly: true }))
    expect(html).not.toContain('Add repository')
  })
})
