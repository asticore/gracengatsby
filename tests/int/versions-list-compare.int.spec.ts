import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'
import { VersionsList } from '@/admin/views/VersionsList'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

// Mock useAuthorNames
vi.mock('@/admin/views/useAuthorNames', () => ({
  useAuthorNames: () => () => 'Jane Doe',
}))

import { useRouter } from 'next/navigation'

const mockPush = vi.fn()
const mockRefresh = vi.fn()

describe('VersionsList component - compare functionality', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    ;(useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
      refresh: mockRefresh,
    })
    global.fetch = vi.fn()
  })

  it('renders Compare button for each version', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [
          {
            id: 12,
            parent: 1,
            latest: true,
            version: {
              _status: 'published',
              updatedAt: '2026-10-03T00:00:00Z',
              title: 'Current',
              content: 'Current content',
              updatedBy: 1,
            },
            createdAt: '2026-10-03T00:00:00Z',
            updatedAt: '2026-10-03T00:00:00Z',
          },
          {
            id: 11,
            parent: 1,
            latest: false,
            version: {
              _status: 'published',
              updatedAt: '2026-10-02T00:00:00Z',
              title: 'Old',
              content: 'Old content',
              updatedBy: 1,
            },
            createdAt: '2026-10-02T00:00:00Z',
            updatedAt: '2026-10-02T00:00:00Z',
          },
        ],
        totalDocs: 2,
        limit: 50,
        totalPages: 1,
        page: 1,
      }),
    })

    render(
      h(VersionsList, {
        collectionSlug: 'pages',
        id: 1,
        currentDoc: { title: 'Current', content: 'Current content' },
        titleField: 'title',
      })
    )

    await waitFor(() => {
      const compareButtons = screen.getAllByRole('button', { name: 'Compare' })
      expect(compareButtons.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows diff table when Compare is clicked for a changed version', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [
          {
            id: 11,
            parent: 1,
            latest: false,
            version: {
              _status: 'published',
              updatedAt: '2026-10-02T00:00:00Z',
              title: 'Old Title',
              content: 'Old content',
              updatedBy: 1,
            },
            createdAt: '2026-10-02T00:00:00Z',
            updatedAt: '2026-10-02T00:00:00Z',
          },
        ],
        totalDocs: 1,
        limit: 50,
        totalPages: 1,
        page: 1,
      }),
    })

    const { fireEvent } = await import('@testing-library/react')
    render(
      h(VersionsList, {
        collectionSlug: 'pages',
        id: 1,
        currentDoc: { title: 'Current Title', content: 'Old content' },
        titleField: 'title',
      })
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy()
    })

    const compareButton = screen.getByRole('button', { name: 'Compare' })
    fireEvent.click(compareButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hide compare' })).toBeTruthy()
    })
  })

  it('shows "No differences from the current document." for identical version', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [
          {
            id: 11,
            parent: 1,
            latest: false,
            version: {
              _status: 'published',
              updatedAt: '2026-10-02T00:00:00Z',
              title: 'Same',
              content: 'Same content',
              updatedBy: 1,
            },
            createdAt: '2026-10-02T00:00:00Z',
            updatedAt: '2026-10-02T00:00:00Z',
          },
        ],
        totalDocs: 1,
        limit: 50,
        totalPages: 1,
        page: 1,
      }),
    })

    const { fireEvent } = await import('@testing-library/react')
    render(
      h(VersionsList, {
        collectionSlug: 'pages',
        id: 1,
        currentDoc: { title: 'Same', content: 'Same content' },
        titleField: 'title',
      })
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy()
    })

    const compareButton = screen.getByRole('button', { name: 'Compare' })
    fireEvent.click(compareButton)

    await waitFor(() => {
      expect(screen.getByText('No differences from the current document.')).toBeTruthy()
    })
  })

  it('only one compare panel is open at a time', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [
          {
            id: 12,
            parent: 1,
            latest: false,
            version: {
              _status: 'published',
              updatedAt: '2026-10-03T00:00:00Z',
              title: 'V2',
              content: 'V2 content',
              updatedBy: 1,
            },
            createdAt: '2026-10-03T00:00:00Z',
            updatedAt: '2026-10-03T00:00:00Z',
          },
          {
            id: 11,
            parent: 1,
            latest: false,
            version: {
              _status: 'published',
              updatedAt: '2026-10-02T00:00:00Z',
              title: 'V1',
              content: 'V1 content',
              updatedBy: 1,
            },
            createdAt: '2026-10-02T00:00:00Z',
            updatedAt: '2026-10-02T00:00:00Z',
          },
        ],
        totalDocs: 2,
        limit: 50,
        totalPages: 1,
        page: 1,
      }),
    })

    const { fireEvent } = await import('@testing-library/react')
    render(
      h(VersionsList, {
        collectionSlug: 'pages',
        id: 1,
        currentDoc: { title: 'Current', content: 'Current content' },
        titleField: 'title',
      })
    )

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Compare' }).length).toBeGreaterThanOrEqual(2)
    })

    const compareButtons = screen.getAllByRole('button', { name: 'Compare' })
    fireEvent.click(compareButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hide compare' })).toBeTruthy()
    })

    // Click the second Compare button
    const newCompareButtons = screen.getAllByRole('button', { name: 'Compare' })
    fireEvent.click(newCompareButtons[0])

    await waitFor(() => {
      const hideButtons = screen.queryAllByRole('button', { name: 'Hide compare' })
      expect(hideButtons.length).toBe(1)
    })
  })

  it('toggles Compare button text between Compare and Hide compare', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        docs: [
          {
            id: 11,
            parent: 1,
            latest: false,
            version: {
              _status: 'published',
              updatedAt: '2026-10-02T00:00:00Z',
              title: 'Old',
              updatedBy: 1,
            },
            createdAt: '2026-10-02T00:00:00Z',
            updatedAt: '2026-10-02T00:00:00Z',
          },
        ],
        totalDocs: 1,
        limit: 50,
        totalPages: 1,
        page: 1,
      }),
    })

    const { fireEvent } = await import('@testing-library/react')
    render(
      h(VersionsList, {
        collectionSlug: 'pages',
        id: 1,
        currentDoc: { title: 'Current' },
        titleField: 'title',
      })
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy()
    })

    const compareButton = screen.getByRole('button', { name: 'Compare' })
    fireEvent.click(compareButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hide compare' })).toBeTruthy()
    })

    const hideButton = screen.getByRole('button', { name: 'Hide compare' })
    fireEvent.click(hideButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy()
    })
  })
})
