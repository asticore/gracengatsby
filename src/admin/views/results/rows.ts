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
