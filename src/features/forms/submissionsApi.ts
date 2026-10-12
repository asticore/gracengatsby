import { SUBMISSIONS_SLUG } from './slugs'

/**
 * Helpers for the entries inbox: parsing filters from a query string, checking
 * an inbox edit, and applying it to many entries at once. The list screen
 * (built separately) and the CSV export both use them, so a filter means the
 * same thing in both.
 *
 * The data model: every entry has `status` (new, read, spam, archived),
 * `assignee` (a user), and `notes` (private text) - see FormSubmissions.ts.
 * Everything here validates on the server; nothing is taken on trust from the
 * browser.
 */

export const SUBMISSION_STATUSES = ['new', 'read', 'spam', 'archived'] as const
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]

export const isSubmissionStatus = (value: unknown): value is SubmissionStatus =>
  typeof value === 'string' && (SUBMISSION_STATUSES as readonly string[]).includes(value)

export type SubmissionFilters = {
  form?: number
  status?: SubmissionStatus | 'open'
  /** A user id, or 'none' for unassigned. */
  assignee?: number | 'none'
  /** Inclusive day bounds, YYYY-MM-DD. */
  from?: string
  to?: string
  /** Text searched in the entry summary. */
  q?: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const posInt = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,12}$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : undefined
}

export function parseSubmissionFilters(params: URLSearchParams | Record<string, string | undefined>): SubmissionFilters {
  const get = (key: string): string | undefined => (params instanceof URLSearchParams ? params.get(key) ?? undefined : params[key])
  const filters: SubmissionFilters = {}
  const form = posInt(get('form'))
  if (form) filters.form = form
  const status = get('status')
  if (isSubmissionStatus(status) || status === 'open') filters.status = status
  const assignee = get('assignee')
  if (assignee === 'none') filters.assignee = 'none'
  else if (posInt(assignee)) filters.assignee = posInt(assignee)
  const from = get('from')
  const to = get('to')
  if (from && DAY.test(from)) filters.from = from
  if (to && DAY.test(to)) filters.to = to
  const q = get('q')?.trim()
  if (q) filters.q = q.slice(0, 100)
  return filters
}

/** The engine `where` for a set of filters. "open" means everything not archived or spam. */
export function submissionsWhere(filters: SubmissionFilters): Record<string, unknown> {
  const and: Record<string, unknown>[] = []
  if (filters.form) and.push({ form: { equals: filters.form } })
  if (filters.status === 'open') and.push({ status: { in: ['new', 'read'] } })
  else if (filters.status) and.push({ status: { equals: filters.status } })
  if (filters.assignee === 'none') and.push({ assignee: { exists: false } })
  else if (filters.assignee) and.push({ assignee: { equals: filters.assignee } })
  if (filters.from) and.push({ createdAt: { greater_than_equal: `${filters.from}T00:00:00.000Z` } })
  if (filters.to) and.push({ createdAt: { less_than_equal: `${filters.to}T23:59:59.999Z` } })
  if (filters.q) and.push({ summary: { like: filters.q } })
  return and.length ? { and } : {}
}

export type InboxPatch = { status?: SubmissionStatus; assignee?: number | null; notes?: string }

/** Only status, assignee and notes may be changed from the inbox; anything else in the body is ignored. */
export function parseInboxPatch(body: unknown): { patch?: InboxPatch; error?: string } {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const patch: InboxPatch = {}
  if ('status' in source) {
    if (!isSubmissionStatus(source.status)) return { error: 'Status must be new, read, spam or archived.' }
    patch.status = source.status
  }
  if ('assignee' in source) {
    if (source.assignee === null || source.assignee === '' || source.assignee === 'none') patch.assignee = null
    else {
      const id = posInt(source.assignee)
      if (!id) return { error: 'Choose a person to assign this to.' }
      patch.assignee = id
    }
  }
  if ('notes' in source) {
    if (typeof source.notes !== 'string') return { error: 'Notes must be text.' }
    patch.notes = source.notes.slice(0, 5000)
  }
  if (Object.keys(patch).length === 0) return { error: 'Nothing to change.' }
  return { patch }
}

type BulkEngine = { update: (args: Record<string, unknown>) => Promise<unknown> }

/** Applies one inbox patch to up to `MAX_BULK` entries. Returns the ids changed and the ones that failed. */
export const MAX_BULK = 100

export async function applyInboxPatch(
  engine: BulkEngine,
  ids: unknown,
  patch: InboxPatch,
  user?: unknown,
): Promise<{ changed: number[]; failed: number[] }> {
  const list = Array.isArray(ids) ? ids.map(posInt).filter((id): id is number => id !== undefined) : []
  const unique = Array.from(new Set(list)).slice(0, MAX_BULK)
  const changed: number[] = []
  const failed: number[] = []
  for (const id of unique) {
    try {
      await engine.update({ collection: SUBMISSIONS_SLUG, id, data: patch, user })
      changed.push(id)
    } catch {
      failed.push(id)
    }
  }
  return { changed, failed }
}
