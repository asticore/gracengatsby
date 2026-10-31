import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'

const fieldState = vi.hoisted(() => ({ value: [] as unknown, setValue: null as null | ((v: unknown) => void) }))

vi.mock('@/engine/ui', () => ({
  useField: () => ({
    value: fieldState.value,
    setValue: (v: unknown) => {
      fieldState.setValue?.(v)
    },
  }),
}))

vi.mock('@/admin/i18n/AdminUiProvider', () => ({
  useAdminT: () => (key: string) => key,
}))

import { ConditionsField } from '@/features/siteTemplates/admin/ConditionsField'

const pages = [
  { id: 1, title: 'Home', slug: 'home' },
  { id: 2, title: 'About', slug: 'about' },
  { id: 3, title: '', slug: 'shop' },
]

describe('ConditionsField page and audience pickers', () => {
  let setValue: ReturnType<typeof vi.fn<(value: unknown) => void>>

  beforeEach(() => {
    setValue = vi.fn<(value: unknown) => void>()
    fieldState.setValue = (v: unknown) => setValue(v)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ docs: pages }) })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('offers the pages as a multi-select and shows the picked ones', async () => {
    fieldState.value = [[{ param: 'page', operator: 'equals', value: '2' }]]
    render(h(ConditionsField))
    const list = (await screen.findByLabelText('siteTemplates.pagesLabel')) as unknown as HTMLSelectElement
    expect(list.multiple).toBe(true)
    await waitFor(() => expect(list.options.length).toBe(3))
    expect(Array.from(list.options).map((o) => o.textContent)).toEqual(['Home', 'About', 'shop'])
    expect(Array.from(list.selectedOptions).map((o) => o.value)).toEqual(['2'])
    expect(screen.getByText('When page is "About".')).toBeTruthy()
  })

  it('stores several picked pages as one value', async () => {
    fieldState.value = [[{ param: 'page', operator: 'equals', value: '2' }]]
    render(h(ConditionsField))
    const list = (await screen.findByLabelText('siteTemplates.pagesLabel')) as unknown as HTMLSelectElement
    await waitFor(() => expect(list.options.length).toBe(3))
    list.options[0].selected = true
    fireEvent.change(list)
    expect(setValue).toHaveBeenLastCalledWith([[{ param: 'page', operator: 'equals', value: '1,2' }]])
  })

  it('offers members, guests and everyone for the audience rule', async () => {
    fieldState.value = [[{ param: 'audience', operator: 'equals', value: 'guests' }]]
    render(h(ConditionsField))
    const select = screen.getByLabelText('siteTemplates.audienceLabel') as unknown as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'members', 'guests', 'everyone'])
    expect(select.value).toBe('guests')
    fireEvent.change(select, { target: { value: 'members' } })
    expect(setValue).toHaveBeenLastCalledWith([[{ param: 'audience', operator: 'equals', value: 'members' }]])
  })
})
