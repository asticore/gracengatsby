/**
 * Account portal search: the pure screen matcher, and the search box (account
 * screens on the page, site results from /api/search-suggest, failure and
 * empty states). Network is stubbed; nothing here calls a real endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement as h } from 'react'

import { PortalSearch } from '@/features/accounts/components/PortalSearch'
import { matchScreens, normaliseQuery, type ScreenLink } from '@/features/accounts/portalSearch'

const LINKS: ScreenLink[] = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/store-credit', label: 'Store credit' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/addresses', label: 'Addresses' },
]

describe('account screen matcher', () => {
  it('needs at least two letters', () => {
    expect(matchScreens(LINKS, '')).toEqual([])
    expect(matchScreens(LINKS, 'o')).toEqual([])
    expect(matchScreens(LINKS, '  o  ')).toEqual([])
  })

  it('matches labels case-insensitively and keeps the link order', () => {
    expect(matchScreens(LINKS, 'ORD')).toEqual([{ href: '/account/orders', label: 'Orders' }])
    expect(matchScreens(LINKS, 'ad').map((l) => l.label)).toEqual(['Addresses'])
    expect(matchScreens(LINKS, 'zz')).toEqual([])
  })

  it('collapses spaces and caps long queries', () => {
    expect(normaliseQuery('  store   credit ')).toBe('store credit')
    expect(normaliseQuery('a'.repeat(200))).toHaveLength(80)
  })
})

describe('PortalSearch', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const type = (value: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value } })

  it('lists matching account screens at once, without a network call', () => {
    render(h(PortalSearch, { links: LINKS }))
    type('ord')
    expect(screen.getByRole('link', { name: 'Orders' }).getAttribute('href')).toBe('/account/orders')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a hint and does not search for one letter', () => {
    render(h(PortalSearch, { links: LINKS }))
    type('o')
    expect(screen.getByText('Type at least 2 letters to search.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds published site results, skipping any URL that is not a same-site path', async () => {
    const results: Array<Record<string, string>> = [
      { title: 'Blue mug', url: '/shop/blue-mug', type: 'product', excerpt: '' },
      { title: 'Phishing', url: 'https://evil.example/login', type: 'page', excerpt: '' },
    ]
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results }) })
    render(h(PortalSearch, { links: LINKS }))
    type('mug')
    expect(await screen.findByRole('link', { name: 'Blue mug' })).toBeTruthy()
    expect(screen.queryByText('Phishing')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/search-suggest?q=mug', expect.anything())
    expect(screen.getByText('1 found.')).toBeTruthy()
  })

  it('keeps the account list when the site search fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(h(PortalSearch, { links: LINKS }))
    type('ord')
    expect(await screen.findByText('Site search is unavailable right now. Your account screens are still listed.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Orders' })).toBeTruthy()
  })

  it('says nothing was found when neither source matches', async () => {
    const none: Array<Record<string, string>> = []
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: none }) })
    render(h(PortalSearch, { links: LINKS }))
    type('zzzz')
    expect(await screen.findByText('Nothing found for "zzzz".')).toBeTruthy()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
