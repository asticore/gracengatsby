'use client'

import React, { useEffect, useState } from 'react'

export interface SchedulePanelProps {
  collectionSlug: string
  id?: number
  status?: string
  readOnly?: boolean
}

interface ScheduleData {
  publishAt: string | null
  unpublishAt: string | null
}

/**
 * A compact box for scheduling publish/unpublish actions on drafts.
 * Displays two datetime-local inputs (in the viewer's local time, sends ISO UTC).
 * Shows status line for scheduled documents.
 * Only enabled after the document is saved (requires id).
 */
export const SchedulePanel: React.FC<SchedulePanelProps> = ({ collectionSlug, id, status, readOnly = false }) => {
  const [schedule, setSchedule] = useState<ScheduleData>({ publishAt: null, unpublishAt: null })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const allowedCollections = ['pages', 'posts', 'events', 'courses', 'products']
  const isAllowed = allowedCollections.includes(collectionSlug)
  const isDisabled = !id || readOnly

  // Fetch current schedule when component mounts or id changes
  useEffect(() => {
    if (!isAllowed || !id) return

    const fetchSchedule = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/admin-schedule?collection=${collectionSlug}&id=${id}`)
        if (!response.ok) throw new Error('Failed to fetch schedule')
        const data: ScheduleData = await response.json()
        setSchedule(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load schedule')
      } finally {
        setLoading(false)
      }
    }

    fetchSchedule()
  }, [collectionSlug, id, isAllowed])

  const toLocalDateTime = (iso: string | null): string => {
    if (!iso) return ''
    const date = new Date(iso)
    // Format as datetime-local: YYYY-MM-DDTHH:mm
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const toISOString = (localDateTime: string): string => {
    if (!localDateTime) return ''
    const date = new Date(localDateTime)
    return date.toISOString()
  }

  const handleSaveSchedule = async () => {
    if (!id) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(false)

      const response = await fetch('/api/admin-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          collection: collectionSlug,
          id,
          publishAt: schedule.publishAt,
          unpublishAt: schedule.unpublishAt,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error((errorData as { error?: string }).error || 'Failed to save schedule')
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  const handleClearSchedule = async () => {
    if (!id) return

    try {
      setSaving(true)
      setError(null)

      const response = await fetch(`/api/admin-schedule?collection=${collectionSlug}&id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to clear schedule')
      }

      setSchedule({ publishAt: null, unpublishAt: null })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear schedule')
    } finally {
      setSaving(false)
    }
  }

  const formatLocalDate = (iso: string | null): string => {
    if (!iso) return ''
    const date = new Date(iso)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (!isAllowed) {
    return null
  }

  return (
    <div className="schedule-panel">
      <h4 className="schedule-panel__title">Schedule</h4>

      {isDisabled && (
        <p className="schedule-panel__disabled-message">Save the document first to enable scheduling.</p>
      )}

      {!isDisabled && (
        <>
          {loading && <p className="schedule-panel__loading">Loading schedule...</p>}

          {!loading && (
            <>
              <div className="schedule-panel__inputs">
                <div className="schedule-panel__input-group">
                  <label className="schedule-panel__label" htmlFor="publish-at">
                    Publish at
                  </label>
                  <input
                    id="publish-at"
                    type="datetime-local"
                    className="schedule-panel__input"
                    value={toLocalDateTime(schedule.publishAt)}
                    onChange={(e) => setSchedule({ ...schedule, publishAt: e.target.value ? toISOString(e.target.value) : null })}
                    disabled={saving}
                  />
                </div>

                <div className="schedule-panel__input-group">
                  <label className="schedule-panel__label" htmlFor="unpublish-at">
                    Unpublish at
                  </label>
                  <input
                    id="unpublish-at"
                    type="datetime-local"
                    className="schedule-panel__input"
                    value={toLocalDateTime(schedule.unpublishAt)}
                    onChange={(e) =>
                      setSchedule({ ...schedule, unpublishAt: e.target.value ? toISOString(e.target.value) : null })
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="schedule-panel__buttons">
                <button
                  className="schedule-panel__button schedule-panel__button--save"
                  onClick={handleSaveSchedule}
                  disabled={saving || !schedule.publishAt}
                  type="button"
                >
                  {saving ? 'Saving...' : 'Save schedule'}
                </button>
                <button
                  className="schedule-panel__button schedule-panel__button--clear"
                  onClick={handleClearSchedule}
                  disabled={saving || (!schedule.publishAt && !schedule.unpublishAt)}
                  type="button"
                >
                  Clear
                </button>
              </div>

              {error && <p className="schedule-panel__error">{error}</p>}
              {success && <p className="schedule-panel__success">Schedule saved successfully.</p>}

              {(schedule.publishAt || schedule.unpublishAt) && (
                <div className="schedule-panel__status">
                  {schedule.publishAt && (
                    <p className="schedule-panel__status-line">Scheduled to publish on {formatLocalDate(schedule.publishAt)}</p>
                  )}
                  {schedule.unpublishAt && (
                    <p className="schedule-panel__status-line">
                      Scheduled to unpublish on {formatLocalDate(schedule.unpublishAt)}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
