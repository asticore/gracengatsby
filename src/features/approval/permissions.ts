import type { Action, Resource } from '@/features/roles/permissions'

/**
 * Who may do what with review, for one collection. The routes build a viewer from the admin
 * context (which includes custom role matrices); the notifier reads a user row and uses `can()`.
 */
export type ReviewViewer = {
  id: number
  name: string
  isAdmin: boolean
  can: (resource: Resource, action: Action) => boolean
}

export type ReviewPermissions = {
  /** Read the document itself. */
  canReadDocument: boolean
  /** See the review history and the queue. */
  canReadReview: boolean
  /** Submit for review and withdraw own work. */
  canSubmit: boolean
  /** Comment on a review. */
  canComment: boolean
  /** Approve and request changes. */
  canReview: boolean
  /** Publish, including an approved document. */
  canPublish: boolean
}

export function reviewPermissions(viewer: ReviewViewer, collection: string): ReviewPermissions {
  const can = viewer.can as (resource: string, action: string) => boolean
  if (viewer.isAdmin) {
    return { canReadDocument: true, canReadReview: true, canSubmit: true, canComment: true, canReview: true, canPublish: true }
  }
  return {
    canReadDocument: can(collection, 'read'),
    canReadReview: can('review', 'read'),
    canSubmit: can('review', 'update') && can(collection, 'update'),
    canComment: can('review', 'update') || can('review', 'publish'),
    canReview: can(collection, 'publish') && can('review', 'publish'),
    canPublish: can(collection, 'publish'),
  }
}
