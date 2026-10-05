import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { createElement as h } from 'react'
import type { Field } from '@/engine'

// Mock @/engine/ui FIRST before importing ParentPicker
vi.mock('@/engine/ui', () => {
  return {
    FieldLabel: ({ label }: any) => h('label', {}, label),
    useField: vi.fn(),
  }
})

// Now import ParentPicker and the mock after mocking
import { ParentPicker } from '@/fields/parentPicker/ParentPicker'
import { useField } from '@/engine/ui'

const useFieldMock = useField as any

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) =>
    h('a', { href, 'data-testid': `link-${href}` }, children),
}))

describe('ParentPicker component', () => {
  let setValueFn: any

  const mockField: Field = {
    name: 'parent',
    type: 'relationship',
    relationTo: 'pages',
    label: 'Parent',
  } as any

  const testPages = [
    {
      id: 1,
      title: 'Home',
      slug: 'home',
      parent: null,
      _status: 'published',
    },
    {
      id: 2,
      title: 'Services',
      slug: 'services',
      parent: null,
      _status: 'published',
    },
    {
      id: 3,
      title: 'Consulting',
      slug: 'consulting',
      parent: 2,
      _status: 'draft',
    },
    {
      id: 4,
      title: 'Deep',
      slug: 'deep',
      parent: 3,
      _status: 'published',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    setValueFn = vi.fn()

    // Setup default useField mock
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    // Mock global fetch
    ;(global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: testPages,
      }),
    })

    // Reset URL for tests that don't need special URLs
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/admin/collections/pages/create',
        href: 'http://localhost/admin/collections/pages/create',
      },
      writable: true,
    })
  })

  afterEach(() => {
    cleanup()
  })

  // Test 1: trigger shows 'None - top level page' when value undefined
  it('trigger shows "None - top level page" when value is undefined', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    expect(trigger).toBeTruthy()
  })

  // Test 2: with value 2 trigger text contains 'Services'
  it('trigger text contains page title when value is set', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: 2,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    // Wait for the component to fetch pages and display the parent title
    await waitFor(() => {
      const allButtons = screen.getAllByRole('button')
      const trigger = allButtons[0] // The trigger is the first button
      expect(trigger.textContent).toContain('Services')
    })
  })

  // Test 3: clicking trigger opens role=dialog with search input
  it('clicking trigger opens dialog with search input', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    fireEvent.click(trigger)

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText(/Search by page name or slug/)
    expect(searchInput).toBeTruthy()
  })

  // Test 4: typing 'consult' shows Consulting row and hides Home
  it('filters pages by title and slug search', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText(
      /Search by page name or slug/
    ) as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'consult' } })

    await waitFor(() => {
      // Should show Consulting
      const consultingRow = screen.getByText('Consulting')
      expect(consultingRow).toBeTruthy()

      // Should NOT show Home
      const rows = screen.getAllByText(/Home|Services|Deep|Consulting/)
      expect(rows.some(r => r.textContent === 'Home')).toBeFalsy()
    })
  })

  // Test 5: typing 'services/consulting' (path search) matches Consulting
  it('filters pages by full path search', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText(
      /Search by page name or slug/
    ) as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'services/consulting' } })

    await waitFor(() => {
      // Path search should match Consulting which is under Services
      const consultingRow = screen.getByText('Consulting')
      expect(consultingRow).toBeTruthy()
    })
  })

  // Test 6: clicking the Services row calls setValue with 2 and closes dialog
  it('clicking a page row calls setValue and closes dialog', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    const servicesTitle = screen.getByText('Services')
    fireEvent.click(servicesTitle)

    await waitFor(() => {
      expect(setValueFn).toHaveBeenCalledWith(2)
    })

    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeFalsy()
    })
  })

  // Test 7: clicking 'No parent (top level)' calls setValue(undefined)
  it('clicking "No parent (top level)" calls setValue with undefined', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: 2,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    // Wait for pages to load and find the trigger button
    await waitFor(() => {
      const allButtons = screen.getAllByRole('button')
      expect(allButtons[0].textContent).toContain('Services')
    })

    const allButtons = screen.getAllByRole('button')
    const trigger = allButtons[0] // The trigger is the first button
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    const noParentOption = screen.getByText('No parent (top level)')
    fireEvent.click(noParentOption)

    await waitFor(() => {
      expect(setValueFn).toHaveBeenCalledWith(undefined)
    })

    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeFalsy()
    })
  })

  // Test 8: when editing page 2 the dialog does NOT list Services, Consulting, Deep
  it('excludes current page and descendants from selection', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/admin/collections/pages/2',
        href: 'http://localhost/admin/collections/pages/2',
      },
      writable: true,
    })

    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    // Home should be available
    expect(screen.getByText('Home')).toBeTruthy()

    // Services (page 2), Consulting (child of 2), and Deep (grandchild of 2) should NOT be visible
    const allText = screen.getByRole('dialog').textContent || ''
    expect(allText).not.toContain('Services')
    expect(allText).not.toContain('Consulting')
    expect(allText).not.toContain('Deep')
  })

  // Test 9: Escape closes dialog
  it('pressing Escape closes dialog', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(h(ParentPicker, { field: mockField, path: 'parent' }))

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    const searchInput = screen.getByPlaceholderText(/Search by page name or slug/)
    fireEvent.keyDown(searchInput, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeFalsy()
    })
  })

  // Test 10: readOnly disables trigger
  it('disables trigger when readOnly is true', async () => {
    useFieldMock.mockImplementation((config: any) => ({
      value: undefined as any,
      setValue: setValueFn,
    }))

    render(
      h(ParentPicker, {
        field: mockField,
        path: 'parent',
        readOnly: true,
      })
    )

    const trigger = screen.getByRole('button', { name: /None - top level page/ })
    expect(trigger.hasAttribute('disabled')).toBeTruthy()

    // Clicking should not open dialog
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeFalsy()
    })
  })
})
