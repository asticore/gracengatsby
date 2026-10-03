import React, { useEffect, useRef, useState } from 'react'

export interface EditLockBannerProps {
  collectionSlug: string
  id?: number
  onLockedByOther?: (locked: boolean) => void
}

interface LockStatus {
  held: boolean
  by?: {
    userId: number
    label: string
  }
}

/**
 * Manages edit locks for a document. Shows warnings when another user is editing
 * and provides options to take over the lock.
 *
 * - On mount: POST acquire to claim/refresh the lock
 * - Every 20s: POST heartbeat to keep the lock alive
 * - On unmount/pagehide: POST release via sendBeacon or fetch keepalive
 * - When another user holds: show warning bar with "Take over" button
 * - Network errors: swallowed, retry on next tick
 */
export const EditLockBanner: React.FC<EditLockBannerProps> = ({
  collectionSlug,
  id,
  onLockedByOther,
}) => {
  const [lockedByOther, setLockedByOther] = useState(false)
  const [otherUserLabel, setOtherUserLabel] = useState<string | null>(null)
  const [takenOverByOther, setTakenOverByOther] = useState(false)
  const [takenOverLabel, setTakenOverLabel] = useState<string | null>(null)

  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  // Helper to make API calls
  const callApi = async (method: 'GET' | 'POST', action?: string): Promise<LockStatus | null> => {
    try {
      if (method === 'GET') {
        const response = await fetch(
          `/api/admin-edit-lock?collection=${collectionSlug}&id=${id}`,
          { method: 'GET' }
        )
        if (!response.ok) return null
        return (await response.json()) as LockStatus
      }

      if (method === 'POST' && action) {
        const response = await fetch('/api/admin-edit-lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection: collectionSlug,
            id,
            action,
          }),
        })
        if (!response.ok) return null
        return (await response.json()) as LockStatus
      }
    } catch (error) {
      // Swallow network errors - never break the editor
      console.debug('edit-lock network error:', error)
    }
    return null
  }

  // Acquire lock on mount
  useEffect(() => {
    if (!id) return

    const acquire = async () => {
      const status = await callApi('POST', 'acquire')
      if (isMountedRef.current && status) {
        if (status.held) {
          setLockedByOther(false)
          setTakenOverByOther(false)
          onLockedByOther?.(false)
        } else if (status.by) {
          setLockedByOther(true)
          setOtherUserLabel(status.by.label)
          onLockedByOther?.(true)
        }
      }
    }

    acquire()
  }, [id, collectionSlug, onLockedByOther])

  // Heartbeat every 20s
  useEffect(() => {
    if (!id) return

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
    }

    heartbeatIntervalRef.current = setInterval(async () => {
      const status = await callApi('POST', 'heartbeat')
      if (isMountedRef.current && status) {
        if (status.held) {
          // Still holding the lock
          if (takenOverByOther) {
            setTakenOverByOther(false)
            setTakenOverLabel(null)
          }
          setLockedByOther(false)
          onLockedByOther?.(false)
        } else if (status.by) {
          // Lock was taken from us
          if (!takenOverByOther) {
            setTakenOverByOther(true)
            setTakenOverLabel(status.by.label)
            onLockedByOther?.(true)
          }
        }
      }
    }, 20000)

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [id, collectionSlug, takenOverByOther, onLockedByOther])

  // Release on unmount and pagehide
  useEffect(() => {
    if (!id) return

    const release = async () => {
      // Try sendBeacon first (doesn't require await)
      const blob = new Blob(
        [JSON.stringify({ collection: collectionSlug, id, action: 'release' })],
        { type: 'application/json' }
      )
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/admin-edit-lock', blob)
      } else {
        // Fallback to fetch with keepalive
        try {
          await fetch('/api/admin-edit-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              collection: collectionSlug,
              id,
              action: 'release',
            }),
            keepalive: true,
          })
        } catch {
          // Swallow errors on release
        }
      }
    }

    const handleUnmount = () => {
      isMountedRef.current = false
      release()
    }

    const handlePagehide = () => {
      isMountedRef.current = false
      release()
    }

    window.addEventListener('pagehide', handlePagehide)
    return () => {
      handleUnmount()
      window.removeEventListener('pagehide', handlePagehide)
    }
  }, [id, collectionSlug])

  if (!id) return null

  // Show warning when another user holds the lock
  if (lockedByOther && !takenOverByOther) {
    return (
      <div className="edit-lock-banner edit-lock-banner--warning">
        <div className="edit-lock-banner__content">
          <span className="edit-lock-banner__text">
            Another user ({otherUserLabel}) is editing this document. Your changes could overwrite theirs.
          </span>
          <button
            className="edit-lock-banner__button"
            onClick={async () => {
              const status = await callApi('POST', 'takeover')
              if (isMountedRef.current && status?.held) {
                setLockedByOther(false)
                onLockedByOther?.(false)
              }
            }}
          >
            Take over editing
          </button>
        </div>
      </div>
    )
  }

  // Show "taken over" message when lock was stolen
  if (takenOverByOther) {
    return (
      <div className="edit-lock-banner edit-lock-banner--taken-over">
        <div className="edit-lock-banner__content">
          <span className="edit-lock-banner__text">
            Taken over by {takenOverLabel}
          </span>
          <button
            className="edit-lock-banner__button"
            onClick={async () => {
              const status = await callApi('POST', 'takeover')
              if (isMountedRef.current && status?.held) {
                setTakenOverByOther(false)
                setTakenOverLabel(null)
                onLockedByOther?.(false)
              }
            }}
          >
            Take back
          </button>
        </div>
      </div>
    )
  }

  // Nothing to show when lock is fine
  return null
}
