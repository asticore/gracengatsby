'use client'

import React, { useState } from 'react'
import '../edit-tabs.css'
import '../list-section-tabs.css'

export type ResultsFilterValues = {
  /** Id of the chosen form or event, '' for all. */
  owner: string
  /** Payment status, '' for all (submissions only). */
  status: string
  q: string
  from: string
  to: string
}

export const EMPTY_FILTERS: ResultsFilterValues = { owner: '', status: '', q: '', from: '', to: '' }

/** The query string for the filters that are set (no leading ?). */
export function filtersToQuery(filters: ResultsFilterValues, ownerParam: 'form' | 'event'): string {
  const params = new URLSearchParams()
  if (filters.owner) params.set(ownerParam, filters.owner)
  if (filters.status) params.set('status', filters.status)
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params.toString()
}

export type OwnerOption = { id: number | string; title: string }

/**
 * The filter row above an all-submissions or all-RSVPs table. Changes are held
 * until "Apply" (or Enter), so typing in the search box does not fire a request
 * per keystroke.
 */
export function AllResultsFilters({
  applied,
  onApply,
  ownerLabel,
  owners,
  showStatus,
}: {
  applied: ResultsFilterValues
  onApply: (next: ResultsFilterValues) => void
  ownerLabel: string
  owners: OwnerOption[]
  showStatus: boolean
}) {
  const [draft, setDraft] = useState<ResultsFilterValues>(applied)
  const set = (patch: Partial<ResultsFilterValues>) => setDraft((current) => ({ ...current, ...patch }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)

  return (
    <form
      aria-label="Filters"
      className="lst-filters"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(draft)
      }}
    >
      <label className="lst-filter">
        {ownerLabel}
        <select onChange={(event) => set({ owner: event.target.value })} value={draft.owner}>
          <option value="">{`All ${ownerLabel.toLowerCase()}s`}</option>
          {owners.map((owner) => (
            <option key={owner.id} value={String(owner.id)}>
              {owner.title}
            </option>
          ))}
        </select>
      </label>
      {showStatus && (
        <label className="lst-filter">
          Payment
          <select onChange={(event) => set({ status: event.target.value })} value={draft.status}>
            <option value="">Any</option>
            <option value="none">Not a paid form</option>
            <option value="unpaid">Awaiting payment</option>
            <option value="paid">Paid</option>
          </select>
        </label>
      )}
      <label className="lst-filter">
        Search
        <input
          onChange={(event) => set({ q: event.target.value })}
          placeholder={showStatus ? 'Words in the answers' : 'Name or email'}
          type="search"
          value={draft.q}
        />
      </label>
      <label className="lst-filter">
        From
        <input onChange={(event) => set({ from: event.target.value })} type="date" value={draft.from} />
      </label>
      <label className="lst-filter">
        To
        <input onChange={(event) => set({ to: event.target.value })} type="date" value={draft.to} />
      </label>
      <button className="et-button" disabled={!dirty} type="submit">
        Apply
      </button>
      <button
        className="et-button"
        disabled={JSON.stringify(applied) === JSON.stringify(EMPTY_FILTERS) && !dirty}
        onClick={() => {
          setDraft(EMPTY_FILTERS)
          onApply(EMPTY_FILTERS)
        }}
        type="button"
      >
        Clear
      </button>
    </form>
  )
}
