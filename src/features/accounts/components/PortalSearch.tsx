'use client'

import Link from 'next/link'
import React, { useEffect, useId, useState } from 'react'

import { parseSuggestions, type SuggestItem } from '@/components/blocks/elements/searchSuggestLogic'

import { matchScreens, normaliseQuery, PORTAL_SEARCH_MIN_CHARS, type ScreenLink } from '../portalSearch'
import { usePortalText } from './PortalText'

/** The settled answer from /api/search-suggest for one query. Results for an older query are ignored. */
type SiteResult = { query: string; items: SuggestItem[]; failed: boolean }

const SITE_DEBOUNCE_MS = 200
const SITE_MAX_RESULTS = 8

/**
 * Search box above the account screens. Account screens are matched at once
 * on the page; pages, products, posts and events come from the public
 * /api/search-suggest endpoint (published, not password protected). A failed
 * site search leaves the account list working.
 */
export function PortalSearch({ links }: { links: ScreenLink[] }) {
  const tx = usePortalText()
  const inputId = useId()
  const [value, setValue] = useState('')
  const [result, setResult] = useState<SiteResult | null>(null)
  const query = normaliseQuery(value)
  const hasQuery = query.length >= PORTAL_SEARCH_MIN_CHARS
  const screens = matchScreens(links, query)
  // A result counts only for the query it was asked for, so a slow answer never shows under a newer query.
  const settled = result && result.query === query ? result : null

  useEffect(() => {
    if (!hasQuery) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) throw new Error('search failed')
        setResult({ query, items: parseSuggestions(await res.json(), SITE_MAX_RESULTS), failed: false })
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setResult({ query, items: [], failed: true })
      }
    }, SITE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, hasQuery])

  const siteItems = settled && !settled.failed ? settled.items : []
  const count = screens.length + siteItems.length

  return (
    <div className="portal-search" role="search">
      <label className="portal-search__label" htmlFor={inputId}>
        {tx('search.label')}
      </label>
      <div className="portal-search__field">
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={tx('search.placeholder')}
          autoComplete="off"
        />
        {value ? (
          <button type="button" onClick={() => setValue('')} aria-label={tx('search.clear')}>
            &times;
          </button>
        ) : null}
      </div>
      {value && !hasQuery ? <p className="portal-search__hint">{tx('search.hint')}</p> : null}
      {hasQuery ? (
        <div className="portal-search__results">
          {screens.length ? (
            <section aria-label={tx('search.accountHeading')}>
              <h2 className="portal-search__heading">{tx('search.accountHeading')}</h2>
              <ul>
                {screens.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {settled ? (
            <section aria-label={tx('search.siteHeading')}>
              <h2 className="portal-search__heading">{tx('search.siteHeading')}</h2>
              {settled.failed ? <p>{tx('search.siteUnavailable')}</p> : null}
              {siteItems.length ? (
                <ul>
                  {siteItems.map((item) => (
                    <li key={`${item.url}-${item.title}`}>
                      <Link href={item.url}>{item.title}</Link>
                      {item.type ? <span className="portal-search__type"> {item.type}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          {settled && count === 0 ? <p>{tx('search.none', { query })}</p> : null}
          {settled ? (
            <p className="portal-search__status" aria-live="polite">
              {tx('search.status', { count })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
