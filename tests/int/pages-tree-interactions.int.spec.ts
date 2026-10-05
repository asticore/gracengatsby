import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { createElement as h } from 'react'
import { PagesTreeClient } from '@/admin/views/PagesTreeClient'
import type { TreePage } from '@/features/pagesTree/plan'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => h('a', { href }, children as never),
}))

const page = (id: number, title: string, parent: number | null, sortOrder: number, extra: Partial<TreePage> = {}): TreePage => ({
  id,
  title,
  slug: title.toLowerCase(),
  parent,
  sortOrder,
  isHomepage: false,
  status: 'published',
  ...extra,
})

const pages = (): TreePage[] => [
  page(1, 'Home', null, 10, { isHomepage: true }),
  page(2, 'About', null, 20),
  page(3, 'Team', 2, 10),
  page(4, 'Contact', null, 30),
]

const rowTitles = () => screen.getAllByRole('treeitem').map((li) => within(li).getAllByRole('link')[0].textContent)
const contentOf = (title: string) => {
  const li = screen.getAllByRole('treeitem').find((el) => within(el).getAllByRole('link')[0].textContent === title)!
  return li.querySelector('.pages-tree__content') as HTMLElement
}
const press = (title: string, key: string) => fireEvent.keyDown(contentOf(title), { key, altKey: true })

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response

describe('PagesTreeClient interactions', () => {
  beforeEach(() => {
    refresh.mockClear()
    ;(globalThis as { fetch: unknown }).fetch = vi.fn()
  })
  afterEach(cleanup)

  it('Alt+ArrowDown moves a page below its next sibling and shows the changed pages', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    expect(rowTitles()).toEqual(['Home', 'About', 'Team', 'Contact'])
    press('About', 'ArrowDown')
    expect(rowTitles()).toEqual(['Home', 'Contact', 'About', 'Team'])
    // Contact and About swapped places; Home and Team are untouched.
    expect(screen.getByText('2 change(s)')).toBeTruthy()
  })

  it('Alt+ArrowUp moves a page above its previous sibling', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    press('Contact', 'ArrowUp')
    expect(rowTitles()).toEqual(['Home', 'Contact', 'About', 'Team'])
  })

  it('Alt+ArrowRight indents under the previous sibling and Alt+ArrowLeft outdents', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    press('Contact', 'ArrowRight')
    const contact = screen.getAllByRole('treeitem').find((el) => within(el).getAllByRole('link')[0].textContent === 'Contact')!
    expect(contact.getAttribute('aria-level')).toBe('2')
    press('Contact', 'ArrowLeft')
    const back = screen.getAllByRole('treeitem').find((el) => within(el).getAllByRole('link')[0].textContent === 'Contact')!
    expect(back.getAttribute('aria-level')).toBe('1')
  })

  it('rejects a move the planner refuses (homepage under another page) and leaves the tree unchanged', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    // Home is first; indenting needs a previous sibling, so move About above Home first is not allowed either way:
    // Alt+ArrowDown on Home then Alt+ArrowRight would nest the homepage under About.
    press('Home', 'ArrowDown')
    const after = rowTitles()
    expect(after[0]).toBe('About')
    press('Home', 'ArrowRight')
    expect(screen.getByRole('alert').textContent).toMatch(/homepage/i)
    expect(rowTitles()).toEqual(after)
  })

  it('Discard restores the original order and hides the bar', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    press('About', 'ArrowDown')
    fireEvent.click(screen.getByText('Discard'))
    expect(rowTitles()).toEqual(['Home', 'About', 'Team', 'Contact'])
    expect(screen.queryByText('Save changes')).toBeNull()
  })

  it('Save posts a preview, shows the confirm dialog, and Confirm commits with redirects on', async () => {
    const plan = {
      ok: true,
      changedCount: 1,
      moves: [
        { id: 4, title: 'Contact', oldPath: '/contact', newPath: '/about/contact', pathChanged: true, descendantCount: 0, descendants: [] as never[] },
      ],
    }
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    f.mockResolvedValueOnce(json(200, { plan }))
    f.mockResolvedValueOnce(json(200, { ok: true, applied: 1, redirects: { created: 1, skipped: [], available: true }, purged: 2 }))
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    press('Contact', 'ArrowRight')
    fireEvent.click(screen.getByText('Save changes'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('/contact → /about/contact')).toBeTruthy()
    const checkbox = within(dialog).getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    const previewBody = JSON.parse((f.mock.calls[0][1] as { body: string }).body)
    expect(previewBody.mode).toBe('preview')
    expect(previewBody.moves).toEqual([{ id: 4, parent: 2, sortOrder: expect.any(Number) }])

    fireEvent.click(within(dialog).getByText('Confirm and save'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const commitBody = JSON.parse((f.mock.calls[1][1] as { body: string }).body)
    expect(commitBody.mode).toBe('commit')
    expect(commitBody.createRedirects).toBe(true)
  })

  it('unticking the redirects box commits with createRedirects false', async () => {
    const plan = {
      ok: true,
      changedCount: 1,
      moves: [{ id: 4, title: 'Contact', oldPath: '/contact', newPath: '/about/contact', pathChanged: true, descendantCount: 0, descendants: [] as never[] }],
    }
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    f.mockResolvedValueOnce(json(200, { plan }))
    f.mockResolvedValueOnce(json(200, { ok: true, applied: 1, redirects: { created: 0, skipped: [], available: true }, purged: 0 }))
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    press('Contact', 'ArrowRight')
    fireEvent.click(screen.getByText('Save changes'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByText('Confirm and save'))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2))
    expect(JSON.parse((f.mock.calls[1][1] as { body: string }).body).createRedirects).toBe(false)
  })

  it('Escape closes the dialog without sending a commit', async () => {
    const plan = {
      ok: true,
      changedCount: 1,
      moves: [{ id: 4, title: 'Contact', oldPath: '/contact', newPath: '/about/contact', pathChanged: true, descendantCount: 0, descendants: [] as never[] }],
    }
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    f.mockResolvedValueOnce(json(200, { plan }))
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    press('Contact', 'ArrowRight')
    fireEvent.click(screen.getByText('Save changes'))
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(f).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Save changes')).toBeTruthy()
  })

  it('shows the server error and keeps pending changes when the preview is refused', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    f.mockResolvedValueOnce(json(400, { errors: [{ id: 4, message: 'Slug clash under About' }] }))
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    press('Contact', 'ArrowRight')
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Slug clash under About'))
    expect(screen.getByText('1 change(s)')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores Alt+arrow keys and renders no Save bar when read-only', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: false }))
    press('About', 'ArrowDown')
    expect(rowTitles()).toEqual(['Home', 'About', 'Team', 'Contact'])
    expect(screen.queryByText(/change\(s\)/)).toBeNull()
  })
})

describe('PagesTreeClient expand and collapse', () => {
  beforeEach(() => {
    ;(globalThis as { fetch: unknown }).fetch = vi.fn()
  })
  afterEach(cleanup)

  it('starts fully expanded, with correct aria-level and aria-expanded', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    const items = screen.getAllByRole('treeitem')
    expect(items).toHaveLength(4)
    const about = items.find((el) => within(el).getAllByRole('link')[0].textContent === 'About')!
    const team = items.find((el) => within(el).getAllByRole('link')[0].textContent === 'Team')!
    expect(about.getAttribute('aria-expanded')).toBe('true')
    expect(about.getAttribute('aria-level')).toBe('1')
    expect(team.getAttribute('aria-level')).toBe('2')
  })

  it('the toggle collapses a branch and expands it again', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    const about = () => screen.getAllByRole('treeitem').find((el) => within(el).getAllByRole('link')[0].textContent === 'About')!
    fireEvent.click(within(about()).getByLabelText('Collapse'))
    expect(about().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Team')).toBeNull()
    fireEvent.click(within(about()).getByLabelText('Expand'))
    expect(screen.getByText('Team')).toBeTruthy()
  })

  it('only pages with children get a toggle, and editors get drag handles', () => {
    render(h(PagesTreeClient, { pages: pages(), canEdit: true }))
    expect(screen.getAllByLabelText(/^Collapse$/)).toHaveLength(1)
    expect(screen.getAllByLabelText(/^Drag /)).toHaveLength(4)
  })
})
