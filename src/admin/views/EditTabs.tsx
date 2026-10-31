'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { RESULTS_HASH, tabFromHash } from './results/resultsTabs'
import './edit-tabs.css'

type TabKey = 'edit' | 'results'

/**
 * Tab bar above an existing document's form: Edit (the form itself) and a
 * results tab. Only used on edit pages of documents that have a results tab -
 * see EditView.
 *
 * The edit panel is always mounted, only hidden while the results tab is
 * showing, so unsaved edits survive switching tabs. The results panel mounts
 * the first time it is opened and stays mounted after that, so its page of
 * data is not refetched each time. The selected tab lives in the URL hash
 * (`#results`); edit is the default and leaves the hash clear.
 */
export function EditTabs({
  editLabel = 'Edit',
  resultsLabel,
  edit,
  results,
  deniedReason,
}: {
  editLabel?: string
  resultsLabel: string
  edit: ReactNode
  results: ReactNode
  /** Set when the user may not open the results tab: the tab stays, marked unavailable, and its panel explains why. */
  deniedReason?: string
}) {
  const t = useAdminT()
  const [active, setActive] = useState<TabKey>('edit')
  const [resultsMounted, setResultsMounted] = useState(false)
  const editTab = useRef<HTMLButtonElement>(null)
  const resultsTab = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const sync = () => {
      const next = tabFromHash(window.location.hash)
      setActive(next)
      if (next === 'results') setResultsMounted(true)
    }
    // Deferred so the effect does not set state synchronously, and so the
    // server markup (edit selected) matches the first client render.
    const timer = window.setTimeout(sync, 0)
    window.addEventListener('hashchange', sync)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  const select = (tab: TabKey, focus = false) => {
    setActive(tab)
    if (tab === 'results') setResultsMounted(true)
    const hash = tab === 'results' ? `#${RESULTS_HASH}` : ''
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    if (focus) (tab === 'results' ? resultsTab : editTab).current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const order: TabKey[] = ['edit', 'results']
    const index = order.indexOf(active)
    let next: TabKey | null = null
    if (event.key === 'ArrowRight') next = order[(index + 1) % order.length]
    else if (event.key === 'ArrowLeft') next = order[(index + order.length - 1) % order.length]
    else if (event.key === 'Home') next = 'edit'
    else if (event.key === 'End') next = 'results'
    if (!next) return
    event.preventDefault()
    select(next, true)
  }

  const tabClass = (tab: TabKey) => `et-tab${active === tab ? ' et-tab--active' : ''}`

  return (
    <div className="et-root">
      <div aria-label={t('aria.docViews')} className="et-tablist" role="tablist">
        <button
          aria-controls="et-panel-edit"
          aria-selected={active === 'edit'}
          className={tabClass('edit')}
          id="et-tab-edit"
          onClick={() => select('edit')}
          onKeyDown={onKeyDown}
          ref={editTab}
          role="tab"
          tabIndex={active === 'edit' ? 0 : -1}
          type="button"
        >
          {editLabel}
        </button>
        <button
          aria-controls="et-panel-results"
          aria-disabled={deniedReason ? true : undefined}
          aria-selected={active === 'results'}
          className={`${tabClass('results')}${deniedReason ? ' et-tab--disabled' : ''}`}
          id="et-tab-results"
          onClick={() => select('results')}
          onKeyDown={onKeyDown}
          ref={resultsTab}
          role="tab"
          tabIndex={active === 'results' ? 0 : -1}
          title={deniedReason}
          type="button"
        >
          {resultsLabel}
          {deniedReason ? <span className="et-tab__lock"> (no access)</span> : null}
        </button>
      </div>

      <div aria-labelledby="et-tab-edit" className="et-panel" hidden={active !== 'edit'} id="et-panel-edit" role="tabpanel">
        {edit}
      </div>
      <div aria-labelledby="et-tab-results" className="et-panel" hidden={active !== 'results'} id="et-panel-results" role="tabpanel">
        {deniedReason ? <p className="et-warning" role="status">{deniedReason}</p> : resultsMounted ? results : null}
      </div>
    </div>
  )
}

export default EditTabs
