'use client'

import React, { useEffect, useState } from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import type { WorstPage } from '../worst'
import type { Strategy } from '../types'
import './pagespeed.css'
import './pagespeed-worst.css'

/**
 * "Slowest pages" card for the PageSpeed settings screen. Collapsed by default; the list is only fetched
 * once the strategy is known, and each row links to that page's edit screen.
 */

type Loaded = { strategy: Strategy; pages: WorstPage[] } | { strategy: Strategy; error: string }

const STRATEGY_LABEL: Record<Strategy, string> = { mobile: 'Mobile (phone)', desktop: 'Desktop (computer)' }

const dateText = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString()
}

export function WorstPagesCard() {
  const [strategy, setStrategy] = useState<Strategy>('mobile')
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin-pagespeed-worst?strategy=${strategy}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch((): null => null)) as { pages?: WorstPage[]; error?: string } | null
        if (!response.ok || !body?.pages) {
          const message = response.status === 401 ? 'You do not have access to PageSpeed results.' : 'The list could not be loaded. Try again.'
          setLoaded({ strategy, error: message })
          return
        }
        setLoaded({ strategy, pages: body.pages })
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === 'AbortError') return
        setLoaded({ strategy, error: 'The list could not be loaded. Try again.' })
      })
    return () => controller.abort()
  }, [strategy])

  const current = loaded && loaded.strategy === strategy ? loaded : null

  return (
    <CollapsibleCard id="pagespeed-worst" title="Slowest pages" className="ps-worst">
      <div className="ps-worst__body">
        <p className="ps__muted ps__help">
          The ten pages with the lowest scores in the latest test of each page. Scores are out of 100; 90 or more is good, under 50 is poor.
        </p>
        <label className="ps-worst__strategy">
          <span>Test type</span>
          <select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)} title="Mobile is what Google ranks on. Desktop shows the computer result.">
            {(['mobile', 'desktop'] as Strategy[]).map((value) => (
              <option key={value} value={value}>
                {STRATEGY_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        {!current && <p className="ps__muted">Loading...</p>}
        {current && 'error' in current && <p className="ps__muted">{current.error}</p>}
        {current && 'pages' in current && current.pages.length === 0 && (
          <p className="ps__muted">No pages have been tested yet. Open a page and use the PageSpeed card to run a test.</p>
        )}
        {current && 'pages' in current && current.pages.length > 0 && (
          <table className="ps__table ps-worst__table">
            <thead>
              <tr>
                <th scope="col">Score</th>
                <th scope="col">Page</th>
                <th scope="col">Last run</th>
                <th scope="col">Top problems</th>
              </tr>
            </thead>
            <tbody>
              {current.pages.map((page) => (
                <tr key={`${page.collection}-${page.docId}`}>
                  <td>
                    <span className={`ps-badge ps-band--${page.band ?? 'none'}`} title="Performance score out of 100 from the latest test.">
                      {page.score}
                    </span>
                  </td>
                  <td>
                    <a href={page.editHref} className="list-link" title="Open this page to edit it">
                      {page.title}
                    </a>
                    <div className="ps__muted ps-worst__url">{page.url}</div>
                  </td>
                  <td>{dateText(page.lastRun)}</td>
                  <td>
                    {page.failingAudits.length === 0 ? (
                      <span className="ps__muted">None stored</span>
                    ) : (
                      <ul className="ps-worst__audits">
                        {page.failingAudits.map((audit) => (
                          <li key={audit.id} title={audit.displayValue ?? undefined}>
                            {audit.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </CollapsibleCard>
  )
}

export default WorstPagesCard
