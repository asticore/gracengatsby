import { describe, it, expect, vi } from 'vitest'
import { fetchAllPages, pageUrl } from '@/fields/parentPicker/fetchAllPages'

const BASE = '/api/pages?limit=1000&depth=0'

function docsFor(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: from + i, title: `Page ${from + i}` }))
}

describe('pageUrl', () => {
  it('keeps the base URL for page 1 and adds page=N after it', () => {
    expect(pageUrl(BASE, 1)).toBe(BASE)
    expect(pageUrl(BASE, 3)).toBe(`${BASE}&page=3`)
    expect(pageUrl('/api/pages', 2)).toBe('/api/pages?page=2')
  })
})

describe('fetchAllPages', () => {
  it('follows hasNextPage across several pages and returns every doc in order', async () => {
    const pages: Record<string, unknown> = {
      [BASE]: { docs: docsFor(1, 2), hasNextPage: true, page: 1 },
      [`${BASE}&page=2`]: { docs: docsFor(3, 2), hasNextPage: true, page: 2 },
      [`${BASE}&page=3`]: { docs: docsFor(5, 1), hasNextPage: false, page: 3 },
    }
    const fetchJson = vi.fn(async (url: string) => pages[url])
    const all = await fetchAllPages(fetchJson, BASE, 2)
    expect(all.map((d: any) => d.id)).toEqual([1, 2, 3, 4, 5])
    expect(fetchJson).toHaveBeenCalledTimes(3)
    expect(fetchJson.mock.calls.map((c) => c[0])).toEqual([BASE, `${BASE}&page=2`, `${BASE}&page=3`])
  })

  it('without hasNextPage, keeps asking while pages are full and stops on a short page', async () => {
    const pages: Record<string, unknown> = {
      [BASE]: { docs: docsFor(1, 3) },
      [`${BASE}&page=2`]: { docs: docsFor(4, 3) },
      [`${BASE}&page=3`]: { docs: docsFor(7, 1) },
    }
    const fetchJson = vi.fn(async (url: string) => pages[url])
    const all = await fetchAllPages(fetchJson, BASE, 3)
    expect(all).toHaveLength(7)
    expect(fetchJson).toHaveBeenCalledTimes(3)
  })

  it('stops after one request when the first page is short', async () => {
    const fetchJson = vi.fn(async () => ({ docs: docsFor(1, 2) }))
    const all = await fetchAllPages(fetchJson, BASE, 1000)
    expect(all).toHaveLength(2)
    expect(fetchJson).toHaveBeenCalledTimes(1)
  })

  it('accepts a bare array as one complete page', async () => {
    const fetchJson = vi.fn(async () => docsFor(1, 4))
    const all = await fetchAllPages(fetchJson, BASE, 1000)
    expect(all).toHaveLength(4)
    expect(fetchJson).toHaveBeenCalledTimes(1)
  })

  it('stops on an empty page even when hasNextPage says more', async () => {
    const fetchJson = vi.fn(async () => ({ docs: [], hasNextPage: true }))
    const all = await fetchAllPages(fetchJson, BASE, 1000)
    expect(all).toEqual([])
    expect(fetchJson).toHaveBeenCalledTimes(1)
  })

  it('respects the page cap so a server that always says more cannot loop forever', async () => {
    const fetchJson = vi.fn(async () => ({ docs: docsFor(1, 1), hasNextPage: true }))
    const all = await fetchAllPages(fetchJson, BASE, 1000, 4)
    expect(all).toHaveLength(4)
    expect(fetchJson).toHaveBeenCalledTimes(4)
  })

  it('throws when a page fails, so the caller can keep the list it already has', async () => {
    const fetchJson = vi.fn(async (url: string) => {
      if (url.endsWith('page=2')) throw new Error('Failed to fetch pages')
      return { docs: docsFor(1, 2), hasNextPage: true }
    })
    await expect(fetchAllPages(fetchJson, BASE, 2)).rejects.toThrow('Failed to fetch pages')
  })

  it('throws on a null body', async () => {
    const fetchJson = vi.fn(async () => null)
    await expect(fetchAllPages(fetchJson, BASE, 2)).rejects.toThrow()
  })
})
