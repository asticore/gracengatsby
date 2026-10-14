/**
 * Shared types and limits for the WordPress (WXR) and CSV content import.
 * Plain module: no React and no server-only imports, so the client view can
 * read the constants and types too.
 */

export type ContentType = 'page' | 'post'
export type ItemStatus = 'published' | 'draft'
export type ConflictMode = 'skip' | 'overwrite-drafts-only' | 'create-with-suffix'
export type ImportFormat = 'wxr' | 'csv'

/** One page or post read from the file, before any checks against the site. */
export type ImportItem = {
  /** Plain-English reference used in messages, e.g. "post 12" or "row 3". */
  ref: string
  type: ContentType
  title: string
  /** Slug as written in the file; may be empty (the title is used then). */
  slug: string
  /** Body as HTML (plain text is wrapped into paragraphs by the CSV reader). */
  html: string
  excerpt: string
  status: ItemStatus
  /** ISO date-time or null. */
  date: string | null
  /** Pages only: slug of the parent page when it is in the same file. */
  parentSlug: string | null
  categories: string[]
  /** WXR only: WordPress post id, used to link pages to their parents. */
  sourceId?: string
  /** WXR only: WordPress parent id as written in the file. */
  parentRef?: string
}

export type ParseResult = {
  format: ImportFormat
  items: ImportItem[]
  /** Rows or entries that could not be read at all. */
  errors: string[]
  /** Things that were changed or left out, with the reason. */
  warnings: string[]
  /** Entries left out on purpose (attachments, menus, trash, revisions). */
  skipped: number
}

export const IMPORT_MAX_ITEMS = 500
export const IMPORT_MAX_BYTES = 6 * 1024 * 1024
export const PREVIEW_ROW_LIMIT = 50

export const CONFLICT_MODES: ConflictMode[] = ['skip', 'overwrite-drafts-only', 'create-with-suffix']

export const CONFLICT_LABELS: Record<ConflictMode, string> = {
  skip: 'Skip items whose address (slug) already exists',
  'overwrite-drafts-only': 'Replace existing drafts with the same address, skip published ones',
  'create-with-suffix': 'Create a copy with a new address (for example my-post-2)',
}
