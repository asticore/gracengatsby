'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export type ReviewHistoryRow = {
  id: number | string
  action: 'submitted' | 'approved' | 'changes_requested' | 'comment' | 'published' | 'withdrawn'
  note: string | null
  /** The workflow step this event belongs to, when a workflow was active. */
  step?: string | null
  actorName: string | null
  createdAt: string | null
}

export type ReviewWorkflowInfo = {
  id: number
  name: string
  stepCount: number
  step: { index: number; name: string; approverRoles: string[]; approvalsNeeded: number; total: number } | null
  /** "Step 2 of 3 (Legal review), waiting on Legal." Only while in review. */
  awaiting: string | null
}

export type ReviewState = {
  enabled: boolean
  status: 'none' | 'in_review' | 'changes_requested' | 'approved'
  /** Approvals the current step needs (the global count when there is no workflow). */
  requiredApprovals: number
  /** The active approval workflow for this content type, with the step now awaited. */
  workflow?: ReviewWorkflowInfo | null
  requestedBy: { id: number; name: string } | null
  requestedAt: string | null
  approvals: Array<{ userId: number; name: string; at: string }>
  publishBlocked: string | null
  allowed: {
    submit: boolean
    withdraw: boolean
    approve: boolean
    approveAndPublish: boolean
    requestChanges: boolean
    comment: boolean
    publish: boolean
  }
  history: ReviewHistoryRow[]
}

export type ReviewAction = 'submit' | 'approve' | 'request_changes' | 'comment' | 'withdraw' | 'publish'

/**
 * The review state of one document, read from /api/admin-review, and the way to change it.
 * `token` is any value that changes when the document is saved (the panel passes savedAt), so the
 * state is read again after a save without the component setting state in an effect.
 */
export function useReviewState(collectionSlug: string, id: number | undefined, token: unknown) {
  const router = useRouter()
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<ReviewState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actError, setActError] = useState<string | null>(null)
  const [pending, setPending] = useState<ReviewAction | null>(null)

  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/admin-review?collection=${encodeURIComponent(collectionSlug)}&id=${id}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        const body = (await response.json().catch((): null => null)) as ReviewState | { error?: string } | null
        if (cancelled) return
        if (!response.ok || !body || !('status' in body)) {
          setState(null)
          setLoadError(body && 'error' in body && body.error ? body.error : 'Review status is not available.')
          return
        }
        setState(body)
        setLoadError(null)
      } catch {
        if (!cancelled) setLoadError('Review status is not available.')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [collectionSlug, id, version, token])

  const refresh = useCallback(() => setVersion((value) => value + 1), [])

  const act = useCallback(
    async (action: ReviewAction, extra: { note?: string; alsoPublish?: boolean } = {}): Promise<boolean> => {
      if (id === undefined) return false
      setPending(action)
      setActError(null)
      try {
        const response = await fetch('/api/admin-review', {
          body: JSON.stringify({ collection: collectionSlug, id, action, ...extra }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })
        const body = (await response.json().catch((): null => null)) as { error?: string } | null
        if (!response.ok) {
          setActError(body?.error || 'Could not update the review.')
          return false
        }
        refresh()
        router.refresh()
        return true
      } catch {
        setActError('Could not update the review - check your connection and try again.')
        return false
      } finally {
        setPending(null)
      }
    },
    [collectionSlug, id, refresh, router],
  )

  return { state, loadError, actError, pending, act, refresh }
}

export type UseReviewState = ReturnType<typeof useReviewState>
