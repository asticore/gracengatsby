import { answerFields } from '@/features/forms/csv'
import type { FormDoc } from '@/features/forms/types'

/**
 * Pure helpers behind the results tabs on an edit page: mapping API rows,
 * paging arithmetic and the RSVP CSV. No React and no engine imports, so the
 * admin routes and the client tabs share one definition and the tests run
 * without a database.
 */

export const RESULTS_PAGE_SIZE = 25

export type RsvpRow = {
  id: number | string
  name: string
  email: string
  guestCount: number
  notes: string
  createdAt: string
}

export type SubmissionColumn = { name: string; label: string }

export type SubmissionRow = {
  id: number | string
  submittedAt: string
  total: number | null
  paymentStatus: string
  values: Record<string, unknown>
}

export type PageInfo = {
  page: number
  limit: number
  totalDocs: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')

const idOf = (value: unknown): number | string => (typeof value === 'number' || typeof value === 'string' ? value : '')

/** A 1-based page number from a query string; anything unusable is page 1. */
export function parsePage(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/** A positive integer id from a query string, or null when it is not one. */
export function parseId(raw: string | null): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function pageInfo(page: number, limit: number, totalDocs: number): PageInfo {
  const total = Number.isFinite(totalDocs) && totalDocs > 0 ? totalDocs : 0
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return {
    page,
    limit,
    totalDocs: total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  }
}

export function mapRsvpRow(doc: Record<string, unknown>): RsvpRow {
  const guests = Number(doc.guestCount)
  return {
    id: idOf(doc.id),
    name: text(doc.name),
    email: text(doc.email),
    guestCount: Number.isFinite(guests) ? guests : 1,
    notes: text(doc.notes),
    createdAt: text(doc.createdAt),
  }
}

export function sumGuests(rows: RsvpRow[]): number {
  return rows.reduce((total, row) => total + row.guestCount, 0)
}

/** Answer fields only: presentational blocks (HTML, section, page break) and unnamed ones are not columns. */
export function submissionColumns(form: FormDoc): SubmissionColumn[] {
  return answerFields(form).map((field) => ({ name: field.name as string, label: field.label || (field.name as string) }))
}

export function mapSubmissionRow(doc: Record<string, unknown>, columns: SubmissionColumn[]): SubmissionRow {
  const stored = doc.values && typeof doc.values === 'object' ? (doc.values as Record<string, unknown>) : {}
  const values: Record<string, unknown> = {}
  for (const column of columns) values[column.name] = stored[column.name] ?? null
  return {
    id: idOf(doc.id),
    submittedAt: text(doc.submittedAt) || text(doc.createdAt),
    total: typeof doc.total === 'number' ? doc.total : null,
    paymentStatus: text(doc.paymentStatus) || 'none',
    values,
  }
}

/** Display text for one stored answer. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? '')).join('; ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const FORMULA_START = /^[=+\-@\t\r]/

/**
 * One CSV cell, safe to open in a spreadsheet. Text a visitor typed is read by
 * Excel and Sheets as a formula when it starts with = + - or @, so those get a
 * leading tab. Mirrors the rule in features/forms/csv.ts.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const safe = FORMULA_START.test(raw) ? `\t${raw}` : raw
  return /["\n\r,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function buildRsvpCsv(rows: RsvpRow[]): string {
  const header = ['Entry ID', 'Name', 'Email', 'Guests', 'Notes', 'Registered']
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push([row.id, row.name, row.email, row.guestCount, row.notes, row.createdAt].map(csvCell).join(','))
  }
  // A trailing newline: some tools treat a file without one as truncated.
  return `${lines.join('\r\n')}\r\n`
}

/** A filename that sorts by date and is safe in a Content-Disposition header. */
export function rsvpCsvFilename(eventTitle: string, now = new Date()): string {
  const slug = eventTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${slug || 'event'}-rsvps-${now.toISOString().slice(0, 10)}.csv`
}

/** Display text for a date, or '' when it does not parse. */
export function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/* -------------------------------------------------------------------------- */
/* Across every form / every event (the list page's Submissions and RSVPs tabs) */
/* -------------------------------------------------------------------------- */

export const PAYMENT_STATUSES = ['none', 'unpaid', 'paid'] as const

/** Search text from a query string: trimmed, capped, and never a wildcard-only string. */
export function parseSearch(raw: string | null): string {
  return (raw ?? '').trim().slice(0, 100)
}

/** The start of a `YYYY-MM-DD` day (UTC) as an ISO string, or null when it is not a date. */
export function dayStart(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(`${raw}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The last moment of a `YYYY-MM-DD` day (UTC) as an ISO string, or null when it is not a date. */
export function dayEnd(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(`${raw}T23:59:59.999Z`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

type Clause = Record<string, unknown>

/** A `createdAt` range clause list from `from` and `to` query values (either may be missing). */
function dateClauses(from: string | null, to: string | null): Clause[] {
  const clauses: Clause[] = []
  const start = dayStart(from)
  const end = dayEnd(to)
  if (start) clauses.push({ createdAt: { greater_than_equal: start } })
  if (end) clauses.push({ createdAt: { less_than_equal: end } })
  return clauses
}

/** The `where` for the all-submissions list: optional form, payment status, summary search and date range. */
/** Narrows a `where` to rows whose `field` is one of `ids` (an empty list matches nothing). */
export function restrictToIds(where: Record<string, unknown> | undefined, field: string, ids: Array<number | string>): Record<string, unknown> {
  const clause = { [field]: { in: ids.length ? ids : [-1] } }
  return where ? { and: [where, clause] } : clause
}

export function buildSubmissionsWhere(params: {
  form: number | null
  status: string | null
  q: string
  from: string | null
  to: string | null
}): Record<string, unknown> | undefined {
  const clauses: Clause[] = []
  if (params.form !== null) clauses.push({ form: { equals: params.form } })
  if (params.status && (PAYMENT_STATUSES as readonly string[]).includes(params.status)) {
    clauses.push({ paymentStatus: { equals: params.status } })
  }
  if (params.q) clauses.push({ summary: { contains: params.q } })
  clauses.push(...dateClauses(params.from, params.to))
  if (clauses.length === 0) return undefined
  return clauses.length === 1 ? clauses[0] : { and: clauses }
}

/** The `where` for the all-RSVPs list: optional event, name or email search and date range. */
export function buildRsvpsWhere(params: {
  event: number | null
  q: string
  from: string | null
  to: string | null
}): Record<string, unknown> | undefined {
  const clauses: Clause[] = []
  if (params.event !== null) clauses.push({ event: { equals: params.event } })
  if (params.q) clauses.push({ or: [{ name: { contains: params.q } }, { email: { contains: params.q } }] })
  clauses.push(...dateClauses(params.from, params.to))
  if (clauses.length === 0) return undefined
  return clauses.length === 1 ? clauses[0] : { and: clauses }
}

export type AllSubmissionRow = {
  id: number | string
  formId: number | string
  formTitle: string
  submittedAt: string
  summary: string
  paymentStatus: string
  total: number | null
}

/** A relationship value (id or populated object) as its id. */
export function relationId(value: unknown): number | string {
  if (value && typeof value === 'object') return idOf((value as { id?: unknown }).id)
  return idOf(value)
}

export function mapAllSubmissionRow(doc: Record<string, unknown>): AllSubmissionRow {
  const form = doc.form
  const formId = relationId(form)
  const title = form && typeof form === 'object' ? text((form as { title?: unknown }).title) : ''
  return {
    id: idOf(doc.id),
    formId,
    formTitle: title || (formId === '' ? 'Unknown form' : `Form #${formId}`),
    submittedAt: text(doc.submittedAt) || text(doc.createdAt),
    summary: text(doc.summary),
    paymentStatus: text(doc.paymentStatus) || 'none',
    total: typeof doc.total === 'number' ? doc.total : null,
  }
}

export function buildAllSubmissionsCsv(rows: AllSubmissionRow[]): string {
  const header = ['Entry ID', 'Form', 'Submitted', 'Summary', 'Payment', 'Total']
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push([row.id, row.formTitle, row.submittedAt, row.summary, row.paymentStatus, row.total ?? ''].map(csvCell).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

export type AllRsvpRow = RsvpRow & { eventId: number | string; eventTitle: string }

export function mapAllRsvpRow(doc: Record<string, unknown>): AllRsvpRow {
  const event = doc.event
  const eventId = relationId(event)
  const title = event && typeof event === 'object' ? text((event as { title?: unknown }).title) : ''
  return {
    ...mapRsvpRow(doc),
    eventId,
    eventTitle: title || (eventId === '' ? 'Unknown event' : `Event #${eventId}`),
  }
}

export function buildAllRsvpsCsv(rows: AllRsvpRow[]): string {
  const header = ['Entry ID', 'Event', 'Name', 'Email', 'Guests', 'Notes', 'Registered']
  const lines = [header.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push([row.id, row.eventTitle, row.name, row.email, row.guestCount, row.notes, row.createdAt].map(csvCell).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

export function allCsvFilename(kind: 'submissions' | 'rsvps', now = new Date()): string {
  return `all-${kind}-${now.toISOString().slice(0, 10)}.csv`
}
