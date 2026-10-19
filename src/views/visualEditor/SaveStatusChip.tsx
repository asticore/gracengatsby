'use client'

import React, { useEffect, useState } from 'react'

import './saveStatusChip.css'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'publishing' | 'published' | 'error'

const TICK_MS = 30_000

/**
 * Text for the save chip. Pure: `now` is passed in so the result is stable for a given input.
 * Returns null when there is nothing worth showing yet (no edits and nothing saved this visit).
 */
export function chipText(status: SaveStatus, dirty: boolean, savedAt: number | null, now: number): string | null {
  if (status === 'error') return 'Save failed - retry'
  if (status === 'saving') return 'Saving...'
  if (status === 'publishing') return 'Publishing...'
  if (dirty) return 'Unsaved changes'
  if (savedAt === null) return null
  const minutes = Math.floor(Math.max(0, now - savedAt) / 60_000)
  if (minutes < 1) return 'Saved just now'
  return `Saved ${minutes} min ago`
}

/** Small status chip beside the Save and Publish buttons. Ticks every 30 seconds so "min ago" stays current. */
export const SaveStatusChip: React.FC<{
  status: SaveStatus
  dirty: boolean
  savedAt: number | null
  onRetry: () => void
}> = ({ status, dirty, savedAt, onRetry }) => {
  const [now, setNow] = useState(0)

  // Until the first tick `now` is 0, which reads as "just now" for any save, so nothing looks stale.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const text = chipText(status, dirty, savedAt, now)
  if (text === null) return null

  const tone = status === 'error' ? 'error' : status === 'saving' || status === 'publishing' ? 'busy' : dirty ? 'dirty' : 'saved'
  return (
    <span className={`ve-save-chip ve-save-chip--${tone}`} role="status" aria-live="polite" data-testid="save-status-chip">
      {status === 'error' ? (
        <button type="button" className="ve-save-chip__retry" onClick={onRetry}>
          {text}
        </button>
      ) : (
        text
      )}
    </span>
  )
}

export default SaveStatusChip
