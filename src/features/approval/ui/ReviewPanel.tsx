'use client'

import React, { useState } from 'react'
import type { ReviewState, UseReviewState } from './useReviewState'

/**
 * The review parts of the document side panel: the status pill, the buttons that move a document
 * through review, and the history with a comment box. Everything the buttons may do comes from the
 * server (`allowed` in /api/admin-review), so this file repeats none of the rules.
 */

export const STATUS_LABELS: Record<ReviewState['status'], string> = {
  none: 'Not in review',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
}

const ACTION_LABELS: Record<ReviewState['history'][number]['action'], string> = {
  submitted: 'Sent for review',
  approved: 'Approved',
  changes_requested: 'Asked for changes',
  comment: 'Comment',
  published: 'Published',
  withdrawn: 'Withdrawn',
}

/** True when this collection needs review before it can publish. */
export const isGated = (state: ReviewState | null | undefined): boolean => Boolean(state?.enabled && state.requiredApprovals > 0)

/**
 * True when the ordinary Update/Publish button must not be shown. That is when this user may not
 * publish directly, or when the document is approved: an ordinary save of an approved document
 * takes it back to review, so publishing it goes through "Publish approved" instead.
 */
export const publishHidden = (state: ReviewState | null | undefined): boolean =>
  isGated(state) && (state?.publishBlocked != null || state?.status === 'approved')

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export const ReviewStatusPill: React.FC<{ state: ReviewState | null | undefined }> = ({ state }) => {
  if (!isGated(state) || !state) return null
  const label =
    state.status === 'approved' || state.status === 'in_review'
      ? `${STATUS_LABELS[state.status]} (${state.approvals.length}/${state.requiredApprovals})`
      : STATUS_LABELS[state.status]
  return <span className={state.status === 'none' ? 'pill' : 'pill pill--accent'}>{label}</span>
}

/** Buttons for the Publish box. Renders nothing when review is not required for this collection. */
export const ReviewActions: React.FC<{
  review: UseReviewState
  isPublished: boolean
  modified: boolean
  busy: boolean
  onSaveDraft: () => Promise<boolean>
}> = ({ review, isPublished, modified, busy, onSaveDraft }) => {
  const [askingChanges, setAskingChanges] = useState(false)
  const [changesNote, setChangesNote] = useState('')
  const state = review.state
  if (!isGated(state) || !state) return null

  const allowed = state.allowed
  const pending = review.pending

  return (
    <div className="doc-review-actions">
      {state.status === 'in_review' && allowed.approve && (
        <div className="doc-buttons">
          <button className="btn btn--primary" disabled={busy || pending !== null} onClick={() => void review.act('approve')} type="button">
            {pending === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          {allowed.approveAndPublish && (
            <button className="btn" disabled={busy || pending !== null} onClick={() => void review.act('approve', { alsoPublish: true })} type="button">
              Approve and publish
            </button>
          )}
          <button className="btn" disabled={busy || pending !== null} onClick={() => setAskingChanges((value) => !value)} type="button">
            Request changes
          </button>
        </div>
      )}

      {state.status === 'in_review' && allowed.approve && askingChanges && (
        <div className="doc-review-note">
          <textarea
            aria-label="What needs to change"
            onChange={(event) => setChangesNote(event.target.value)}
            placeholder="What needs to change?"
            rows={3}
            style={{ width: '100%', font: 'inherit' }}
            value={changesNote}
          />
          <button
            className="btn"
            disabled={changesNote.trim() === '' || pending !== null}
            onClick={async () => {
              if (await review.act('request_changes', { note: changesNote.trim() })) {
                setChangesNote('')
                setAskingChanges(false)
              }
            }}
            type="button"
          >
            Send back with changes
          </button>
        </div>
      )}

      {state.status === 'approved' && allowed.publish && (
        <div className="doc-buttons">
          <button className="btn btn--primary" disabled={busy || pending !== null} onClick={() => void review.act('publish')} type="button">
            {pending === 'publish' ? 'Publishing…' : 'Publish approved'}
          </button>
        </div>
      )}
      {state.status === 'approved' && modified && <p className="doc-muted">Publishes the saved version. Save or discard your changes first if they should be included.</p>}

      {(state.status === 'none' || state.status === 'changes_requested') && allowed.submit && !isPublished && (
        <div className="doc-buttons">
          <button
            className="btn btn--primary"
            disabled={busy || pending !== null}
            onClick={async () => {
              if (modified && !(await onSaveDraft())) return
              void review.act('submit')
            }}
            type="button"
          >
            {pending === 'submit' ? 'Sending…' : modified ? 'Save and submit for review' : 'Submit for review'}
          </button>
        </div>
      )}

      {state.status === 'in_review' && allowed.withdraw && (
        <p className="doc-secondary">
          <button className="doc-link" disabled={pending !== null} onClick={() => void review.act('withdraw')} type="button">
            Withdraw from review
          </button>
        </p>
      )}

      {isPublished && state.status === 'none' && publishHidden(state) && (
        <p className="doc-muted">This is live. To change it, switch to draft first, then submit the change for review.</p>
      )}
      {!isPublished && state.publishBlocked && state.status !== 'approved' && (
        <p className="doc-muted">{state.publishBlocked}</p>
      )}
      {review.actError && <p className="doc-error">{review.actError}</p>}
    </div>
  )
}

/** The Review box body: who sent it, approvals so far, the history and a comment box. */
export const ReviewBox: React.FC<{ review: UseReviewState }> = ({ review }) => {
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const state = review.state

  if (review.loadError) return <p className="doc-muted">{review.loadError}</p>
  if (!state) return <p className="doc-muted">Loading…</p>
  if (!state.enabled) return <p className="doc-muted">Content approval is off. Turn it on under Settings &gt; Security.</p>

  return (
    <>
      <p className="doc-line">
        <ReviewStatusPill state={state} /> {isGated(state) ? '' : 'Not required for this content type.'}
      </p>
      {state.requestedBy && state.status !== 'none' && (
        <p className="doc-muted">
          Sent by {state.requestedBy.name} on {formatDate(state.requestedAt)}
        </p>
      )}
      {isGated(state) && state.status === 'in_review' && (
        <p className="doc-muted">
          Approvals: {state.approvals.length} of {state.requiredApprovals}
          {state.approvals.length > 0 && `: ${state.approvals.map((approval) => approval.name).join(', ')}`}
        </p>
      )}

      {state.history.length > 0 && (
        <ol className="doc-review-history" style={{ listStyle: 'none', margin: '0.5rem 0', padding: 0 }}>
          {state.history.map((event) => (
            <li key={String(event.id)} style={{ marginBottom: '0.5rem' }}>
              <div>
                <strong>{ACTION_LABELS[event.action]}</strong> {event.actorName ? `by ${event.actorName}` : ''}
              </div>
              <div className="doc-muted">{formatDate(event.createdAt)}</div>
              {event.note && <div style={{ whiteSpace: 'pre-wrap' }}>{event.note}</div>}
            </li>
          ))}
        </ol>
      )}

      {state.allowed.comment && (
        <div className="doc-review-note">
          <textarea
            aria-label="Add a comment"
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a comment for the review"
            rows={2}
            style={{ width: '100%', font: 'inherit' }}
            value={comment}
          />
          <button
            className="btn"
            disabled={comment.trim() === '' || posting}
            onClick={async () => {
              setPosting(true)
              const ok = await review.act('comment', { note: comment.trim() })
              setPosting(false)
              if (ok) setComment('')
            }}
            type="button"
          >
            {posting ? 'Adding…' : 'Add comment'}
          </button>
        </div>
      )}
    </>
  )
}
