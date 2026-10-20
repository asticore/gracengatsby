import { describe, expect, it, vi } from 'vitest'

const loadForm = vi.fn()
let enabled = true

vi.mock('@/lib/engine', () => ({ getEngine: async (): Promise<object> => ({}) }))
vi.mock('@/features/forms/settings', () => ({
  formsEnabled: async () => enabled,
  getFormSettings: async () => ({}),
  resolveForForm: () => ({}),
  toPublicConfig: (doc: { id: number; title: string }) => ({ id: doc.id, title: doc.title, fields: [] as unknown[] }),
}))
vi.mock('@/features/forms/placesKey', () => ({ readPlacesBrowserKey: async (): Promise<null> => null }))
vi.mock('@/features/forms/server', () => ({ loadForm: (...a: unknown[]) => loadForm(...a) }))
vi.mock('@/features/forms/components/FormRenderer', () => ({ FormRenderer: (): null => null }))

import { FormBlockRenderer } from '@/features/forms/components/FormBlockRenderer'

type El = { props: { children?: unknown; className?: string } }
const texts = (node: unknown): string[] => {
  if (node == null || typeof node === 'boolean') return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(texts)
  return texts((node as El).props?.children)
}

describe('FormBlockRenderer', () => {
  it('renders nothing without a form, when forms are off, or for a draft', async () => {
    expect(await FormBlockRenderer({ form: null })).toBeNull()
    enabled = false
    expect(await FormBlockRenderer({ form: { id: 1, title: 'A' } as never })).toBeNull()
    enabled = true
    expect(await FormBlockRenderer({ form: { id: 1, title: 'A', formStatus: 'draft' } as never })).toBeNull()
  })

  it('renders a populated form object with its title', async () => {
    const out = await FormBlockRenderer({ form: { id: 3, title: 'Contact' } as never, intro: 'Hi' })
    expect(out).not.toBeNull()
    expect(texts(out)).toEqual(expect.arrayContaining(['Contact', 'Hi']))
  })

  it('loads the form by id when the relation is a bare id, and honours the heading override', async () => {
    loadForm.mockResolvedValueOnce({ id: 7, title: 'Signup' })
    const out = await FormBlockRenderer({ form: 7, heading: 'Join us' })
    expect(loadForm).toHaveBeenCalledWith(expect.anything(), 7)
    expect(texts(out)).toContain('Join us')
    expect(texts(out)).not.toContain('Signup')
  })

  it('renders nothing when the id no longer resolves', async () => {
    loadForm.mockResolvedValueOnce(null)
    expect(await FormBlockRenderer({ form: 99 })).toBeNull()
  })
})
