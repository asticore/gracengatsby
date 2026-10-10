import type { Field } from '@/engine'

/**
 * The review state every drafts collection with approval carries. Hidden from the generic form:
 * it changes only through the approval routes, and the publish guard restores it on every other
 * write (see src/features/roles/contentEditGuard.ts), so a client cannot set it by hand.
 *
 * Column names this produces (live table; versions get the `version_` prefix) are listed in
 * src/migrations/20261011_130000_content_approval.ts.
 */
export const REVIEW_STATUS_OPTIONS = [
  { label: 'Not in review', value: 'none' },
  { label: 'In review', value: 'in_review' },
  { label: 'Changes requested', value: 'changes_requested' },
  { label: 'Approved', value: 'approved' },
] as const

export const reviewFields: Field[] = [
  {
    name: 'reviewStatus',
    type: 'select',
    defaultValue: 'none',
    options: [...REVIEW_STATUS_OPTIONS],
    admin: { hidden: true, readOnly: true },
  },
  {
    name: 'reviewRequestedBy',
    type: 'relationship',
    relationTo: 'users',
    admin: { hidden: true, readOnly: true },
  },
  {
    name: 'reviewRequestedAt',
    type: 'date',
    admin: { hidden: true, readOnly: true },
  },
  {
    name: 'reviewApprovals',
    type: 'json',
    admin: { hidden: true, readOnly: true },
  },
]
