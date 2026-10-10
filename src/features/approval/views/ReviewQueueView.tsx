import React from 'react'
import { getAdminContext } from '@/admin/auth'
import { loadApprovalSettings } from '@/features/approval/settings'
import { loadReviewQueue, type ReviewEngine } from '@/features/approval/handlers'
import { viewerFromContext } from '@/features/approval/viewer'
import { ReviewQueueTable } from './ReviewQueueTable'

/** The whole review queue screen at /admin/review-queue. */
export async function ReviewQueueView() {
  const context = await getAdminContext()
  const viewer = viewerFromContext(context)
  const engine = context.engine as unknown as ReviewEngine
  const settings = await loadApprovalSettings(engine)

  const allowed = viewer !== null && (viewer.isAdmin || viewer.can('review', 'read'))
  const rows = allowed && settings.enabled && viewer ? await loadReviewQueue({ engine, viewer, settings, limit: 100 }) : []

  return (
    <div className="flex flex-col gap-[calc(var(--base)*1.25)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)] max-w-[1200px]">
      <header className="border-b border-[var(--theme-elevation-150)] pb-[calc(var(--base)*0.75)]">
        <h1 className="m-0 text-[calc(var(--base)*1.5)] leading-[1.2] font-semibold">Review queue</h1>
        <p className="mx-0 mb-0 mt-[calc(var(--base)*0.25)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-600)]">
          Changes waiting for approval. Open one to read the history, approve it or ask for changes.
        </p>
      </header>

      {!allowed ? (
        <p className="m-0 text-[calc(var(--base)*0.85)] text-[var(--theme-elevation-600)]">You do not have access to the review queue.</p>
      ) : !settings.enabled ? (
        <p className="m-0 text-[calc(var(--base)*0.85)] text-[var(--theme-elevation-600)]">
          Content approval is off. Turn it on under Settings &gt; Security.
        </p>
      ) : (
        <ReviewQueueTable rows={rows} />
      )}
    </div>
  )
}

export default ReviewQueueView
